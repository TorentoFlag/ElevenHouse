import { createHash } from "node:crypto";

import type { FinanceArtifactRegistry } from "@elevenhouse/db/finance";
import {
  createLosslessSettlementEntry,
  createLosslessSettlementPayout,
  digestFinanceCanonicalValueV1,
  hasAsciiControlCharacter,
  type FinanceProviderAccountIdentity,
  type FinanceSettlementStream,
  type FinancePrivateObjectStoragePort,
  type LosslessSettlementEntry,
  type LosslessSettlementPayout,
  type SettlementProviderReadPort,
  type VerifiedSettlementPageBundle
} from "@elevenhouse/domain/finance-core";

import { decodeArcPayExactJson } from "./arc-pay-exact-json";

export class ArcPayExactSettlementLedgerError extends Error {
  readonly code = "ARC_PAY_EXACT_SETTLEMENT_LEDGER_ERROR" as const;

  constructor(
    readonly reason:
      | "invalid_command"
      | "transport"
      | "invalid_response"
      | "policy_limit"
      | "storage"
      | "registration"
  ) {
    super("ArcPay settlement ledger page could not be verified");
    this.name = "ArcPayExactSettlementLedgerError";
  }
}

/**
 * Fetches one immutable ArcPay ledger page outside the database transaction. The raw response is
 * sealed before normalization, so a later parser or reconciliation change never alters evidence.
 */
type ExactSettlementClientInput = Readonly<{
  stream: FinanceSettlementStream;
  apiBaseUrl: string;
  apiSecret: string | null;
  privateObjectStorage: Pick<FinancePrivateObjectStoragePort, "writeImmutable">;
  artifactRegistry: Pick<FinanceArtifactRegistry, "registerSealedArtifact">;
  retention: Readonly<{ policyId: string; policyVersion: string }>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}>;

/**
 * Reads one exact ArcPay settlement stream. Each stream remains independently cursor-bound and
 * gets its own immutable raw artifact, even when a provider page happens to have the same body.
 */
export function createArcPayExactSettlementClient(
  input: ExactSettlementClientInput
): SettlementProviderReadPort {
  const fetchImpl = input.fetchImpl ?? fetch;
  const retention = readRetention(input.retention);

  return Object.freeze({
    transactionBoundary: "outside_database_transaction" as const,
    async fetchVerifiedPage(command) {
      if (command.cursorKey.stream !== input.stream) fail("invalid_command");
      const maximumRows = command.operationEnvelope.maximumRows;
      const maximumArtifactBytes = command.operationEnvelope.maximumArtifactBytes;
      if (
        !input.apiSecret ||
        !positiveSafeInteger(maximumRows) ||
        !positiveSafeInteger(maximumArtifactBytes) ||
        maximumArtifactBytes > 2 * 1024 * 1024
      ) {
        fail("invalid_command");
      }

      const url = new URL(
        input.stream === "settlement_ledger" ? "/v1/settlement/ledger" : "/v1/settlement/payouts",
        input.apiBaseUrl
      );
      if (input.stream === "settlement_ledger") {
        url.searchParams.set("from", command.windowStart);
        url.searchParams.set("to", command.windowEnd);
      }
      url.searchParams.set("limit", String(maximumRows));
      if (input.stream === "settlement_ledger") {
        url.searchParams.set("currency", "RUB");
      }
      if (command.checkpointIdentity.providerPageCursor !== null) {
        url.searchParams.set("cursor", command.checkpointIdentity.providerPageCursor);
      }

      let response: Response;
      try {
        response = await fetchImpl(url, { headers: { authorization: `Bearer ${input.apiSecret}` } });
      } catch {
        fail("transport");
      }
      if (!response.ok) fail("transport");

      let rawBytes: Uint8Array;
      try {
        rawBytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        fail("transport");
      }
      const rawDigest = digest(rawBytes);
      let decoded: ReturnType<typeof decodeArcPayExactJson>;
      try {
        decoded = decodeArcPayExactJson({
          rawBody: rawBytes,
          expectedDigest: rawDigest,
          maximumBytes: maximumArtifactBytes
        });
      } catch {
        fail("invalid_response");
      }
      const page =
        input.stream === "settlement_ledger"
          ? parseLedgerPage(decoded.value, command.cursorKey.providerAccount)
          : parsePayoutPage(decoded.value, command.cursorKey.providerAccount);
      if (page.rows.length > maximumRows) fail("policy_limit");

      const artifactId = `arc-${input.stream.replaceAll("_", "-")}:${command.cursorKey.providerAccount.providerAccountId}:${rawDigest.slice(7)}`;
      let privateObject: Awaited<ReturnType<FinancePrivateObjectStoragePort["writeImmutable"]>>;
      try {
        privateObject = await input.privateObjectStorage.writeImmutable({
          artifactId,
          contentType: "application/json",
          bytes: rawBytes,
          expectedSha256Digest: rawDigest
        });
      } catch {
        fail("storage");
      }
      if (
        privateObject.sha256Digest !== rawDigest ||
        privateObject.byteLength !== rawBytes.byteLength ||
        privateObject.contentType !== "application/json"
      ) {
        fail("storage");
      }

      let artifact: Awaited<ReturnType<FinanceArtifactRegistry["registerSealedArtifact"]>>;
      try {
        artifact = await input.artifactRegistry.registerSealedArtifact({
          artifact: { artifactId, sha256Digest: rawDigest, byteLength: rawBytes.byteLength },
          artifactClass: "provider_settlement_page",
          binding: { kind: "provider", providerAccount: command.cursorKey.providerAccount },
          contentType: "application/json",
          privateObject,
          retentionPolicyId: retention.policyId,
          retentionPolicyVersion: retention.policyVersion
        });
      } catch {
        fail("registration");
      }
      if (
        "bankCashPoolId" in artifact ||
        artifact.artifactId !== artifactId ||
        artifact.sha256Digest !== rawDigest ||
        artifact.byteLength !== rawBytes.byteLength
      ) {
        fail("registration");
      }

      const fetchedAt = (input.now ?? (() => new Date()))().toISOString();
      return Object.freeze({
        kind: "verified_settlement_page_bundle",
        providerAccount: command.cursorKey.providerAccount,
        checkpointIdentity: command.checkpointIdentity,
        rawArtifact: artifact,
        decodedEntriesDigest: digestFinanceCanonicalValueV1(page.rows),
        pageEvidence: Object.freeze({
          kind: "verified_settlement_page_evidence",
          providerAccount: command.cursorKey.providerAccount,
          stream: input.stream,
          windowGeneration: command.checkpointIdentity.windowGeneration,
          providerPageCursor: command.checkpointIdentity.providerPageCursor,
          artifact,
          fetchedAt
        }),
        verifiedAt: fetchedAt,
        stream: input.stream,
        normalizedEntries: Object.freeze({
          rows: page.rows,
          nextCursor: page.nextCursor,
          returnedCount: page.rows.length,
          operationEnvelope: command.operationEnvelope
        })
      }) as unknown as VerifiedSettlementPageBundle;
    }
  } satisfies SettlementProviderReadPort);
}

/** Preserves the ledger-specific public entry point for existing payment-ledger callers. */
export function createArcPayExactSettlementLedgerClient(
  input: Omit<ExactSettlementClientInput, "stream">
): SettlementProviderReadPort {
  return createArcPayExactSettlementClient({ ...input, stream: "settlement_ledger" });
}

function parseLedgerPage(value: unknown, providerAccount: FinanceProviderAccountIdentity): Readonly<{
  rows: readonly LosslessSettlementEntry[];
  nextCursor: string | null;
}> {
  const page = recordWithOptional(value, ["entries", "total_count"], ["next_cursor"]);
  if (!Array.isArray(page.entries)) fail("invalid_response");
  const rows = page.entries.map((entry) => parseLedgerEntry(entry, providerAccount));
  return Object.freeze({ rows: Object.freeze(rows), nextCursor: optionalIdentifier(page.next_cursor, 1_000) });
}

function parseLedgerEntry(
  value: unknown,
  providerAccount: FinanceProviderAccountIdentity
): LosslessSettlementEntry {
  const entry = recordWithOptional(value, [
    "amount",
    "bank_terminal_id",
    "currency",
    "direction",
    "entry_id",
    "entry_type",
    "occurred_at",
    "organization_id",
    "reference_id",
    "reference_type",
    "settlement_status",
    "terminal_id"
  ], ["balance_after", "bank_auth_code", "bank_code", "bank_internal_reference", "bank_rrn"]);
  const organizationId = identifier(entry.organization_id, 160);
  if (organizationId !== providerAccount.providerAccountId || entry.currency !== "RUB") {
    fail("invalid_response");
  }
  return createLosslessSettlementEntry({
    key: { providerAccount, providerEntryId: identifier(entry.entry_id, 200) },
    amountMinor: int64(entry.amount),
    currency: "RUB",
    direction: identifier(entry.direction, 500),
    entryType: identifier(entry.entry_type, 500),
    referenceType: identifier(entry.reference_type, 500),
    referenceId: identifier(entry.reference_id, 500),
    feeAmountMinor: null,
    balanceAfterMinor: optionalInt64(entry.balance_after),
    occurredAt: timestamp(entry.occurred_at),
    organizationId,
    terminalId: nullableIdentifier(entry.terminal_id, 500),
    bankTerminalId: nullableIdentifier(entry.bank_terminal_id, 500),
    bankCode: optionalIdentifier(entry.bank_code, 500),
    bankRrn: optionalIdentifier(entry.bank_rrn, 500),
    bankAuthCode: optionalIdentifier(entry.bank_auth_code, 500),
    bankInternalReference: optionalIdentifier(entry.bank_internal_reference, 500),
    settlementStatus: nullableIdentifier(entry.settlement_status, 500),
    rawPayloadDigest: digestFinanceCanonicalValueV1(entry)
  });
}

function parsePayoutPage(
  value: unknown,
  providerAccount: FinanceProviderAccountIdentity
): Readonly<{
  rows: readonly LosslessSettlementPayout[];
  nextCursor: string | null;
}> {
  const page = recordWithOptional(value, ["payouts"], ["next_cursor"]);
  if (!Array.isArray(page.payouts)) fail("invalid_response");
  return Object.freeze({
    rows: Object.freeze(page.payouts.map((payout) => parsePayout(payout, providerAccount))),
    nextCursor: optionalIdentifier(page.next_cursor, 1_000)
  });
}

function parsePayout(
  value: unknown,
  providerAccount: FinanceProviderAccountIdentity
): LosslessSettlementPayout {
  const payout = recordWithOptional(
    value,
    ["payout_id", "amount", "currency", "status"],
    [
      "payout_method",
      "bank_code",
      "bank_terminal_id",
      "bank_payout_id",
      "bank_payout_status",
      "initiated_at",
      "completed_at",
      "failed_reason"
    ]
  );
  if (payout.currency !== "RUB") fail("invalid_response");
  return createLosslessSettlementPayout({
    key: {
      providerAccount,
      providerPayoutId: identifier(payout.payout_id, 200)
    },
    amountMinor: int64(payout.amount),
    currency: "RUB",
    status: identifier(payout.status, 500),
    payoutMethod: optionalIdentifier(payout.payout_method, 500),
    bankCode: optionalIdentifier(payout.bank_code, 500),
    bankTerminalId: optionalIdentifier(payout.bank_terminal_id, 500),
    providerBankPayoutId: optionalIdentifier(payout.bank_payout_id, 500),
    bankPayoutStatus: optionalIdentifier(payout.bank_payout_status, 500),
    initiatedAt: optionalTimestamp(payout.initiated_at),
    completedAt: optionalTimestamp(payout.completed_at),
    failedReason: optionalIdentifier(payout.failed_reason, 1_000),
    rawPayloadDigest: digestFinanceCanonicalValueV1(payout)
  });
}

function recordWithOptional(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[]
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_response");
  const result = value as Record<string, unknown>;
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const actual = Object.keys(result);
  if (
    requiredKeys.some((key) => !(key in result)) ||
    actual.some((key) => !allowed.has(key))
  ) {
    fail("invalid_response");
  }
  return result;
}

function identifier(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  ) {
    fail("invalid_response");
  }
  return value;
}

function nullableIdentifier(value: unknown, maximumLength: number): string | null {
  return value === null ? null : identifier(value, maximumLength);
}

function optionalIdentifier(value: unknown, maximumLength: number): string | null {
  return value === undefined ? null : nullableIdentifier(value, maximumLength);
}

function int64(value: unknown): string {
  if (typeof value !== "string" || !/^-?(0|[1-9][0-9]{0,18})$/.test(value)) fail("invalid_response");
  try {
    const parsed = BigInt(value);
    if (parsed < -(1n << 63n) || parsed > (1n << 63n) - 1n || parsed.toString() !== value) {
      fail("invalid_response");
    }
  } catch {
    fail("invalid_response");
  }
  return value;
}

function nullableInt64(value: unknown): string | null {
  return value === null ? null : int64(value);
}

function optionalInt64(value: unknown): string | null {
  return value === undefined ? null : nullableInt64(value);
}

function timestamp(value: unknown): string | null {
  if (value === null) return null;
  const parsed = identifier(value, 500);
  if (Number.isNaN(Date.parse(parsed))) fail("invalid_response");
  return parsed;
}

function optionalTimestamp(value: unknown): string | null {
  return value === undefined ? null : timestamp(value);
}

function readRetention(value: Readonly<{ policyId: string; policyVersion: string }>) {
  return Object.freeze({ policyId: identifier(value.policyId, 160), policyVersion: identifier(value.policyVersion, 160) });
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function digest(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fail(reason: ArcPayExactSettlementLedgerError["reason"]): never {
  throw new ArcPayExactSettlementLedgerError(reason);
}
