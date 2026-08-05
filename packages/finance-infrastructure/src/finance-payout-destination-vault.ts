import { createHash } from "node:crypto";

import type {
  FinancePayoutDestinationVaultPort,
  FinancePrivateObjectStoragePort,
  PayoutDestinationKind,
  PayoutDestinationSealInput,
  SealedPayoutDestinationSnapshot
} from "@elevenhouse/domain/finance-core";
import { hasAsciiControlCharacter } from "@elevenhouse/domain/finance-core";

type Locator = Readonly<{
  privateObjectKey: string;
  privateObjectVersion: string;
  envelopeKeyVersion: string;
}>;

type StoredDestination = Readonly<{
  kind: "elevenhouse_payout_destination";
  payoutMethodId: string;
  payoutMethodVersion: number;
  astrologerUserId: string;
  destinationKind: PayoutDestinationKind;
  recipientName: string;
  bankName: string;
  destinationValue: string;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const destinationKinds = new Set<PayoutDestinationKind>(["bank_card", "bank_account"]);

/**
 * Immutable KMS-backed storage for beneficiary data. PostgreSQL stores only a sealed locator,
 * a cryptographic fingerprint and a redacted display string; plain details are never returned
 * from a sealing operation.
 */
export function createFinancePayoutDestinationVault(
  storage: FinancePrivateObjectStoragePort
): FinancePayoutDestinationVaultPort {
  return Object.freeze({
    async sealPayoutDestination(input) {
      const destination = normalizeSealInput(input);
      const payload = storedDestination(destination);
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      const expectedSha256Digest = digest(bytes);
      const receipt = await storage.writeImmutable({
        artifactId: `payout-destination:${destination.payoutMethodId}:v${destination.payoutMethodVersion}`,
        contentType: "application/json",
        bytes,
        expectedSha256Digest
      });
      if (
        receipt.contentType !== "application/json" ||
        receipt.sha256Digest !== expectedSha256Digest ||
        receipt.byteLength !== bytes.byteLength
      ) {
        fail("storage_integrity");
      }
      return Object.freeze({
        kind: "sealed_payout_destination_snapshot" as const,
        payoutMethodId: destination.payoutMethodId,
        payoutMethodVersion: destination.payoutMethodVersion,
        destinationKind: destination.destinationKind,
        beneficiaryFingerprint: destinationFingerprint(destination),
        redactedDisplay: redactedDisplay(destination.destinationKind, destination.destinationValue),
        sealedDestinationRef: encodeLocator({
          privateObjectKey: receipt.privateObjectKey,
          privateObjectVersion: receipt.privateObjectVersion,
          envelopeKeyVersion: receipt.envelopeKeyVersion
        })
      });
    },
    async resolvePayoutDestination(input) {
      const snapshot = normalizeSnapshot(input.snapshot);
      const expectedAstrologerUserId = uuid(input.expectedAstrologerUserId);
      const artifact = await storage.readImmutable(decodeLocator(snapshot.sealedDestinationRef));
      if (
        artifact.contentType !== "application/json" ||
        artifact.byteLength < 1 ||
        artifact.byteLength !== artifact.bytes.byteLength ||
        artifact.sha256Digest !== digest(artifact.bytes)
      ) {
        fail("storage_integrity");
      }
      const destination = decodeStoredDestination(artifact.bytes);
      if (
        destination.astrologerUserId !== expectedAstrologerUserId ||
        destination.payoutMethodId !== snapshot.payoutMethodId ||
        destination.payoutMethodVersion !== snapshot.payoutMethodVersion ||
        destination.destinationKind !== snapshot.destinationKind ||
        destinationFingerprint(destination) !== snapshot.beneficiaryFingerprint ||
        redactedDisplay(destination.destinationKind, destination.destinationValue) !== snapshot.redactedDisplay
      ) {
        fail("destination_identity_conflict");
      }
      return Object.freeze({
        destinationKind: destination.destinationKind,
        recipientName: destination.recipientName,
        bankName: destination.bankName,
        destinationValue: destination.destinationValue
      });
    }
  } satisfies FinancePayoutDestinationVaultPort);
}

export class FinancePayoutDestinationVaultError extends Error {
  readonly code = "FINANCE_PAYOUT_DESTINATION_VAULT_ERROR" as const;

  constructor(readonly reason: "invalid_input" | "storage_integrity" | "destination_identity_conflict") {
    super("Payout destination vault operation failed");
  }
}

function normalizeSealInput(input: PayoutDestinationSealInput): StoredDestination {
  return Object.freeze({
    kind: "elevenhouse_payout_destination",
    payoutMethodId: uuid(input.payoutMethodId),
    payoutMethodVersion: revision(input.payoutMethodVersion),
    astrologerUserId: uuid(input.astrologerUserId),
    destinationKind: destinationKind(input.destinationKind),
    recipientName: recipientText(input.recipientName),
    bankName: recipientText(input.bankName),
    destinationValue: destinationValue(input.destinationValue)
  });
}

function storedDestination(input: StoredDestination): StoredDestination {
  return input;
}

function normalizeSnapshot(value: SealedPayoutDestinationSnapshot): SealedPayoutDestinationSnapshot {
  if (!value || value.kind !== "sealed_payout_destination_snapshot") fail("invalid_input");
  const payoutMethodId = uuid(value.payoutMethodId);
  const payoutMethodVersion = revision(value.payoutMethodVersion);
  const kind = destinationKind(value.destinationKind);
  if (
    typeof value.beneficiaryFingerprint !== "string" ||
    !digestPattern.test(value.beneficiaryFingerprint) ||
    typeof value.redactedDisplay !== "string" ||
    value.redactedDisplay.length < 8 ||
    value.redactedDisplay.length > 180 ||
    value.redactedDisplay.trim() !== value.redactedDisplay ||
    hasAsciiControlCharacter(value.redactedDisplay) ||
    typeof value.sealedDestinationRef !== "string"
  ) {
    fail("invalid_input");
  }
  return Object.freeze({
    kind: "sealed_payout_destination_snapshot",
    payoutMethodId,
    payoutMethodVersion,
    destinationKind: kind,
    beneficiaryFingerprint: value.beneficiaryFingerprint,
    redactedDisplay: value.redactedDisplay,
    sealedDestinationRef: value.sealedDestinationRef
  });
}

function decodeStoredDestination(bytes: Uint8Array): StoredDestination {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail("storage_integrity");
  }
  if (
    !record(value) ||
    !exactKeys(value, [
      "kind",
      "payoutMethodId",
      "payoutMethodVersion",
      "astrologerUserId",
      "destinationKind",
      "recipientName",
      "bankName",
      "destinationValue"
    ]) ||
    value.kind !== "elevenhouse_payout_destination"
  ) {
    fail("storage_integrity");
  }
  try {
    return normalizeSealInput(value as PayoutDestinationSealInput);
  } catch {
    fail("storage_integrity");
  }
}

function destinationFingerprint(value: Omit<StoredDestination, "kind"> | StoredDestination): `sha256:${string}` {
  return digest(
    new TextEncoder().encode(
      JSON.stringify({
        payoutMethodId: value.payoutMethodId,
        payoutMethodVersion: value.payoutMethodVersion,
        astrologerUserId: value.astrologerUserId,
        destinationKind: value.destinationKind,
        recipientName: value.recipientName,
        bankName: value.bankName,
        destinationValue: value.destinationValue
      })
    )
  );
}

function redactedDisplay(kind: PayoutDestinationKind, value: string): string {
  const suffix = value.slice(-4);
  return kind === "bank_card" ? `Карта •••• ${suffix}` : `Счёт •••• ${suffix}`;
}

function encodeLocator(locator: Locator): string {
  return `kms://s3/${Buffer.from(JSON.stringify(locator), "utf8").toString("base64url")}`;
}

function decodeLocator(value: string): Locator {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail("invalid_input");
  }
  if (url.protocol !== "kms:" || url.host !== "s3" || url.search || url.hash) fail("invalid_input");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(url.pathname.slice(1), "base64url").toString("utf8"));
  } catch {
    fail("invalid_input");
  }
  if (!record(parsed) || !exactKeys(parsed, ["privateObjectKey", "privateObjectVersion", "envelopeKeyVersion"])) {
    fail("invalid_input");
  }
  return Object.freeze({
    privateObjectKey: locatorPart(parsed.privateObjectKey),
    privateObjectVersion: locatorPart(parsed.privateObjectVersion),
    envelopeKeyVersion: locatorPart(parsed.envelopeKeyVersion)
  });
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) fail("invalid_input");
  return value;
}

function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail("invalid_input");
  return value as number;
}

function destinationKind(value: unknown): PayoutDestinationKind {
  if (typeof value !== "string" || !destinationKinds.has(value as PayoutDestinationKind)) {
    fail("invalid_input");
  }
  return value as PayoutDestinationKind;
}

function recipientText(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  ) {
    fail("invalid_input");
  }
  return value;
}

function destinationValue(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 4 ||
    value.length > 160 ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  ) {
    fail("invalid_input");
  }
  return value;
}

function locatorPart(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 640 ||
    hasAsciiControlCharacter(value)
  ) {
    fail("invalid_input");
  }
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fail(reason: FinancePayoutDestinationVaultError["reason"]): never {
  throw new FinancePayoutDestinationVaultError(reason);
}
