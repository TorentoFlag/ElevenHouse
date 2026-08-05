/* eslint-disable no-control-regex -- Provider boundary validation intentionally rejects ASCII control characters. */
import { createHash } from "node:crypto";

import type {
  ArcPayRestrictedSavedCardCredential,
  FinancePrivateObjectStoragePort,
  FinanceRestrictedProviderCredentialVaultPort
} from "@elevenhouse/domain/finance-core";

type Locator = Readonly<{
  privateObjectKey: string;
  privateObjectVersion: string;
  envelopeKeyVersion: string;
}>;

const credentialIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * KMS-backed vault for the reusable ArcPay token. It gives the database only a non-exportable
 * object locator and a deterministic fingerprint; raw card tokens never cross an API boundary,
 * log record, outbox payload or database row.
 */
export function createFinanceRestrictedProviderCredentialVault(
  storage: FinancePrivateObjectStoragePort
): FinanceRestrictedProviderCredentialVaultPort {
  return Object.freeze({
    async sealArcPaySavedCardCredential(input) {
      const credentialId = identifier(input.credentialId);
      const providerCustomerId = customerId(input.providerCustomerId);
      const cardTokenId = cardToken(input.cardTokenId);
      const payload = Object.freeze({
        kind: "arc_pay_restricted_saved_card_credential" as const,
        credentialId,
        providerCustomerId,
        cardTokenId
      });
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      const expectedSha256Digest = digest(bytes);
      const receipt = await storage.writeImmutable({
        artifactId: `arc-saved-card-credential:${credentialId}`,
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
        kind: "sealed_restricted_provider_credential" as const,
        restrictedTokenHandleRef: encodeLocator({
          privateObjectKey: receipt.privateObjectKey,
          privateObjectVersion: receipt.privateObjectVersion,
          envelopeKeyVersion: receipt.envelopeKeyVersion
        }),
        providerCredentialFingerprint: digest(new TextEncoder().encode(cardTokenId))
      });
    },
    async resolveArcPaySavedCardCredential(input) {
      const expectedCredentialId = identifier(input.expectedCredentialId);
      const expectedProviderCustomerId = customerId(input.expectedProviderCustomerId);
      const artifact = await storage.readImmutable(decodeLocator(input.restrictedTokenHandleRef));
      if (
        artifact.contentType !== "application/json" ||
        artifact.byteLength < 1 ||
        artifact.byteLength !== artifact.bytes.byteLength ||
        artifact.sha256Digest !== digest(artifact.bytes)
      ) {
        fail("storage_integrity");
      }
      const credential = decodeCredential(artifact.bytes);
      if (
        credential.credentialId !== expectedCredentialId ||
        credential.providerCustomerId !== expectedProviderCustomerId
      ) {
        fail("credential_identity_conflict");
      }
      return credential;
    }
  } satisfies FinanceRestrictedProviderCredentialVaultPort);
}

export class FinanceRestrictedProviderCredentialVaultError extends Error {
  readonly code = "FINANCE_RESTRICTED_PROVIDER_CREDENTIAL_VAULT_ERROR" as const;

  constructor(readonly reason: "invalid_input" | "storage_integrity" | "credential_identity_conflict") {
    super("Restricted provider credential vault operation failed");
  }
}

function decodeCredential(bytes: Uint8Array): ArcPayRestrictedSavedCardCredential {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail("storage_integrity");
  }
  if (!record(value) || !exactKeys(value, ["kind", "credentialId", "providerCustomerId", "cardTokenId"])) {
    fail("storage_integrity");
  }
  if (value.kind !== "arc_pay_restricted_saved_card_credential") fail("storage_integrity");
  try {
    return Object.freeze({
      kind: "arc_pay_restricted_saved_card_credential" as const,
      credentialId: identifier(value.credentialId),
      providerCustomerId: customerId(value.providerCustomerId),
      cardTokenId: cardToken(value.cardTokenId)
    });
  } catch {
    fail("storage_integrity");
  }
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

function digest(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || !credentialIdPattern.test(value)) fail("invalid_input");
  return value;
}

function customerId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 255 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) fail("invalid_input");
  return value;
}

function cardToken(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) fail("invalid_input");
  return value;
}

function locatorPart(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 640 || /[\u0000-\u001f\u007f]/.test(value)) {
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

function fail(reason: FinanceRestrictedProviderCredentialVaultError["reason"]): never {
  throw new FinanceRestrictedProviderCredentialVaultError(reason);
}
