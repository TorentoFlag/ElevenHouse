import {
  createProviderAccountIdentityBinding,
  hasAsciiControlCharacter,
  type FinanceDigest,
  type FinanceProviderAccountIdentity,
  type WebhookProcessingErrorClass
} from "@elevenhouse/domain/finance-core";
import { sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";

export type CapturedClientOrderWebhookRetryPolicy = Readonly<{
  maximumAttempts: number;
  baseDelayMilliseconds: number;
  maximumDelayMilliseconds: number;
}>;

export type ClientOrderWebhookEventType =
  | "payment.captured"
  | "payment.refunded"
  | "payment.chargeback";

export type ClaimedClientOrderWebhook = Readonly<{
  inboxItemId: string;
  inboxVersion: number;
  expectedCheckpointSequence: number;
  leaseFence: number;
  providerAccount: FinanceProviderAccountIdentity;
  receivingEnvironment: "sandbox" | "live";
  webhookId: string;
  providerEventType: ClientOrderWebhookEventType;
  sealedWebhookArtifact: Readonly<{
    artifactId: string;
    sha256Digest: FinanceDigest;
    byteLength: number;
    contentType: "application/json";
  }>;
}>;

export type ClaimedCapturedClientOrderWebhook = Omit<ClaimedClientOrderWebhook, "providerEventType"> &
  Readonly<{
  providerEventType: "payment.captured";
}>;

export type CapturedClientOrderWebhookClaimPort = Readonly<{
  claimNextCapturedClientOrderWebhook(): Promise<ClaimedCapturedClientOrderWebhook | null>;
  recordFailure(
    input: Readonly<{
      claim: ClaimedCapturedClientOrderWebhook;
      errorClass: WebhookProcessingErrorClass;
    }>
  ): Promise<void>;
}>;

export type ClaimedRefundedClientOrderWebhook = Omit<ClaimedClientOrderWebhook, "providerEventType"> &
  Readonly<{
    providerEventType: "payment.refunded";
  }>;

export type RefundedClientOrderWebhookClaimPort = Readonly<{
  claimNextRefundedClientOrderWebhook(): Promise<ClaimedRefundedClientOrderWebhook | null>;
  recordFailure(
    input: Readonly<{
      claim: ClaimedRefundedClientOrderWebhook;
      errorClass: WebhookProcessingErrorClass;
    }>
  ): Promise<void>;
}>;

export type ClaimedChargebackClientOrderWebhook = Omit<ClaimedClientOrderWebhook, "providerEventType"> &
  Readonly<{
    providerEventType: "payment.chargeback";
  }>;

export type ChargebackClientOrderWebhookClaimPort = Readonly<{
  claimNextChargebackClientOrderWebhook(): Promise<ClaimedChargebackClientOrderWebhook | null>;
  recordFailure(
    input: Readonly<{
      claim: ClaimedChargebackClientOrderWebhook;
      errorClass: WebhookProcessingErrorClass;
    }>
  ): Promise<void>;
}>;

type ClientOrderWebhookClaimPort = Readonly<{
  claimNextClientOrderWebhook(): Promise<ClaimedClientOrderWebhook | null>;
  recordFailure(
    input: Readonly<{
      claim: ClaimedClientOrderWebhook;
      errorClass: WebhookProcessingErrorClass;
    }>
  ): Promise<void>;
}>;

export type CapturedClientOrderWebhookClaimPersistenceReason =
  | "invalid_configuration"
  | "claimed_row_integrity_conflict"
  | "stale_lease"
  | "retryable_concurrency_conflict"
  | "persistence_failure";

export class CapturedClientOrderWebhookClaimPersistenceError extends Error {
  readonly code = "CAPTURED_CLIENT_ORDER_WEBHOOK_CLAIM_PERSISTENCE_ERROR" as const;

  constructor(readonly reason: CapturedClientOrderWebhookClaimPersistenceReason) {
    super("Captured client-order webhook claim could not be persisted safely");
    this.name = "CapturedClientOrderWebhookClaimPersistenceError";
  }
}

type ClaimRow = Readonly<{
  inboxItemId: unknown;
  issuedVersion: unknown;
  issuedLeaseFence: unknown;
  lastCheckpointSequence: unknown;
  seriesId: unknown;
  providerAccountId: unknown;
  providerIdentityVersion: unknown;
  receivingEnvironment: unknown;
  webhookId: unknown;
  providerEventType: unknown;
  provider: unknown;
  signatureStatus: unknown;
  artifactId: unknown;
  artifactClass: unknown;
  artifactBindingKind: unknown;
  artifactSeriesId: unknown;
  artifactProviderAccountId: unknown;
  artifactProviderIdentityVersion: unknown;
  sha256Digest: unknown;
  byteLength: unknown;
  contentType: unknown;
}>;

type ReleaseRow = Readonly<{ inboxItemId: string }>;

type FailureDisposition =
  | Readonly<{ kind: "retry"; delayMilliseconds: number }>
  | Readonly<{ kind: "quarantine" }>;

/**
 * Claims only verified ArcPay `payment.captured` inbox rows. The CTE locks the head with
 * `SKIP LOCKED`, advances both version and fence, and appends the required history row in the
 * same transaction; it never infers a client order from raw webhook bytes.
 */
export function createDrizzleCapturedClientOrderWebhookClaimPort(
  input: Readonly<{
    database: ElevenHouseDatabase;
    workerId: string;
    leaseDurationSeconds: number;
    retryPolicy: CapturedClientOrderWebhookRetryPolicy;
  }>
): CapturedClientOrderWebhookClaimPort {
  const port = createDrizzleClientOrderWebhookClaimPort({
    ...input,
    providerEventType: "payment.captured"
  });
  return Object.freeze({
    claimNextCapturedClientOrderWebhook: async () =>
      (await port.claimNextClientOrderWebhook()) as ClaimedCapturedClientOrderWebhook | null,
    recordFailure: port.recordFailure
  });
}

/** Claims a verified `payment.refunded` row through the same lease/fence state machine as capture. */
export function createDrizzleRefundedClientOrderWebhookClaimPort(
  input: Readonly<{
    database: ElevenHouseDatabase;
    workerId: string;
    leaseDurationSeconds: number;
    retryPolicy: CapturedClientOrderWebhookRetryPolicy;
  }>
): RefundedClientOrderWebhookClaimPort {
  const port = createDrizzleClientOrderWebhookClaimPort({
    ...input,
    providerEventType: "payment.refunded"
  });
  return Object.freeze({
    claimNextRefundedClientOrderWebhook: async () =>
      (await port.claimNextClientOrderWebhook()) as ClaimedRefundedClientOrderWebhook | null,
    recordFailure: port.recordFailure
  });
}

/** Claims a verified `payment.chargeback` notice through the same lease/fence protocol. */
export function createDrizzleChargebackClientOrderWebhookClaimPort(
  input: Readonly<{
    database: ElevenHouseDatabase;
    workerId: string;
    leaseDurationSeconds: number;
    retryPolicy: CapturedClientOrderWebhookRetryPolicy;
  }>
): ChargebackClientOrderWebhookClaimPort {
  const port = createDrizzleClientOrderWebhookClaimPort({
    ...input,
    providerEventType: "payment.chargeback"
  });
  return Object.freeze({
    claimNextChargebackClientOrderWebhook: async () =>
      (await port.claimNextClientOrderWebhook()) as ClaimedChargebackClientOrderWebhook | null,
    recordFailure: port.recordFailure
  });
}

function createDrizzleClientOrderWebhookClaimPort(
  input: Readonly<{
    database: ElevenHouseDatabase;
    workerId: string;
    leaseDurationSeconds: number;
    retryPolicy: CapturedClientOrderWebhookRetryPolicy;
    providerEventType: ClientOrderWebhookEventType;
  }>
): ClientOrderWebhookClaimPort {
  const workerId = identifier(input.workerId, "invalid_configuration");
  const providerEventType = input.providerEventType;
  const leaseDurationSeconds = boundedInteger(
    input.leaseDurationSeconds,
    1,
    300,
    "invalid_configuration"
  );
  const retryPolicy = normalizeRetryPolicy(input.retryPolicy);

  return Object.freeze({
    async claimNextClientOrderWebhook() {
      try {
        return await input.database.transaction(async (transaction) => {
          const result = await transaction.execute(sql<ClaimRow>`
            with candidate as (
              select inbox.id,
                     inbox.version as version_before,
                     inbox.processing_status as status_before,
                     inbox.lease_fence as lease_fence_before,
                     inbox.last_checkpoint_sequence,
                     inbox.series_id,
                     inbox.provider_account_id,
                     inbox.provider_identity_version,
                     inbox.receiving_environment,
                     inbox.transport_event_id,
                     inbox.provider_event_type,
                     inbox.provider,
                     inbox.signature_status,
                     inbox.artifact_id,
                     artifact.artifact_class,
                     artifact.binding_kind as artifact_binding_kind,
                     artifact.series_id as artifact_series_id,
                     artifact.provider_account_id as artifact_provider_account_id,
                     artifact.provider_identity_version as artifact_provider_identity_version,
                     artifact.sha256_digest,
                     artifact.byte_length,
                     artifact.content_type
                from finance_webhook_inbox inbox
                join finance_artifacts artifact on artifact.id = inbox.artifact_id
               where inbox.provider = 'arc_pay'
                 and inbox.provider_event_type = ${providerEventType}
                 and inbox.signature_status = 'verified'
                 and (
                   (inbox.processing_status = 'stored' and inbox.available_at <= clock_timestamp())
                   or (inbox.processing_status = 'processing' and inbox.lease_expires_at <= clock_timestamp())
                 )
               order by inbox.available_at, inbox.received_at, inbox.id
               for update of inbox skip locked
               limit 1
            ), claimed as (
              update finance_webhook_inbox inbox
                 set processing_status = 'processing',
                     processing_attempts = inbox.processing_attempts + 1,
                     lease_owner_id = ${workerId},
                     lease_fence = inbox.lease_fence + 1,
                     lease_expires_at = clock_timestamp() + (${leaseDurationSeconds}::integer * interval '1 second'),
                     claimed_at = clock_timestamp(),
                     version = inbox.version + 1,
                     updated_at = clock_timestamp()
                from candidate
               where inbox.id = candidate.id
                 and inbox.version = candidate.version_before
                 and inbox.lease_fence = candidate.lease_fence_before
             returning inbox.id, inbox.version, inbox.lease_fence
            ), history as (
              insert into finance_webhook_processing_history (
                inbox_item_id, event_sequence, version_from, version_to, from_status, to_status,
                worker_id, lease_fence, occurred_at
              )
              select candidate.id,
                     finance_next_webhook_history_sequence(candidate.id),
                     candidate.version_before,
                     claimed.version,
                     candidate.status_before,
                     'processing',
                     ${workerId},
                     claimed.lease_fence,
                     clock_timestamp()
                from candidate
                join claimed on claimed.id = candidate.id
            )
            select claimed.id as "inboxItemId",
                   claimed.version as "issuedVersion",
                   claimed.lease_fence as "issuedLeaseFence",
                   candidate.last_checkpoint_sequence as "lastCheckpointSequence",
                   candidate.series_id as "seriesId",
                   candidate.provider_account_id as "providerAccountId",
                   candidate.provider_identity_version as "providerIdentityVersion",
                   candidate.receiving_environment as "receivingEnvironment",
                   candidate.transport_event_id as "webhookId",
                   candidate.provider_event_type as "providerEventType",
                   candidate.provider as "provider",
                   candidate.signature_status as "signatureStatus",
                   candidate.artifact_id as "artifactId",
                   candidate.artifact_class as "artifactClass",
                   candidate.artifact_binding_kind as "artifactBindingKind",
                   candidate.artifact_series_id as "artifactSeriesId",
                   candidate.artifact_provider_account_id as "artifactProviderAccountId",
                   candidate.artifact_provider_identity_version as "artifactProviderIdentityVersion",
                   candidate.sha256_digest as "sha256Digest",
                   candidate.byte_length as "byteLength",
                   candidate.content_type as "contentType"
              from candidate
              join claimed on claimed.id = candidate.id
          `);
          const rows = result.rows as unknown as readonly ClaimRow[];
          if (rows.length === 0) return null;
          if (rows.length !== 1 || !rows[0]) fail("claimed_row_integrity_conflict");
          return mapClaimedClientOrderWebhook(rows[0], providerEventType);
        });
      } catch (error) {
        throw translate(error);
      }
    },

    async recordFailure(inputFailure) {
      const claim = normalizeClaim(inputFailure.claim);
      const errorClass = webhookErrorClass(inputFailure.errorClass);
      try {
        await input.database.transaction(async (transaction) => {
          const result = await transaction.execute(sql<ReleaseRow>`
            with current_item as (
              select id, version, lease_fence, processing_attempts
                from finance_webhook_inbox
               where id = ${claim.inboxItemId}
                 and processing_status = 'processing'
                 and lease_owner_id = ${workerId}
                 and lease_fence = ${String(claim.leaseFence)}
                 and version = ${String(claim.inboxVersion)}
                 and lease_expires_at > clock_timestamp()
               for update
            ), released as (
              update finance_webhook_inbox inbox
                 set processing_status = case
                       when ${errorClass} = 'processor_contract_violation'
                         or current_item.processing_attempts >= ${retryPolicy.maximumAttempts}
                       then 'quarantined'
                       else 'stored'
                     end,
                     last_error_class = ${errorClass},
                     available_at = case
                       when ${errorClass} = 'processor_contract_violation'
                         or current_item.processing_attempts >= ${retryPolicy.maximumAttempts}
                       then clock_timestamp()
                       else clock_timestamp() + (
                         least(
                           ${retryPolicy.maximumDelayMilliseconds}::numeric,
                           ${retryPolicy.baseDelayMilliseconds}::numeric * power(
                             2::numeric,
                             greatest(current_item.processing_attempts - 1, 0)
                           )
                         ) * interval '1 millisecond'
                       )
                     end,
                     lease_owner_id = null,
                     lease_expires_at = null,
                     completed_at = null,
                     quarantined_at = case
                       when ${errorClass} = 'processor_contract_violation'
                         or current_item.processing_attempts >= ${retryPolicy.maximumAttempts}
                       then clock_timestamp()
                       else null
                     end,
                     version = inbox.version + 1,
                     updated_at = clock_timestamp()
                from current_item
               where inbox.id = current_item.id
                 and inbox.version = current_item.version
                 and inbox.lease_fence = current_item.lease_fence
             returning inbox.id, inbox.version, inbox.lease_fence, inbox.processing_status
            ), history as (
              insert into finance_webhook_processing_history (
                inbox_item_id, event_sequence, version_from, version_to, from_status, to_status,
                worker_id, lease_fence, error_class, reason_code, occurred_at
              )
              select current_item.id,
                     finance_next_webhook_history_sequence(current_item.id),
                     current_item.version,
                     released.version,
                     'processing',
                     released.processing_status,
                     ${workerId},
                     released.lease_fence,
                     ${errorClass},
                     case when released.processing_status = 'quarantined'
                       then 'captured_webhook_quarantined'
                       else 'captured_webhook_retry_scheduled'
                     end,
                     clock_timestamp()
                from current_item
                join released on released.id = current_item.id
            )
            select id as "inboxItemId" from released
          `);
          const rows = result.rows as unknown as readonly ReleaseRow[];
          if (rows.length !== 1 || rows[0]?.inboxItemId !== claim.inboxItemId) fail("stale_lease");
        });
      } catch (error) {
        throw translate(error);
      }
    }
  } satisfies ClientOrderWebhookClaimPort);
}

export function mapClaimedCapturedClientOrderWebhook(
  row: ClaimRow
): ClaimedCapturedClientOrderWebhook {
  return mapClaimedClientOrderWebhook(row, "payment.captured") as ClaimedCapturedClientOrderWebhook;
}

/**
 * Verifies that a claimed inbox row is exactly the requested ArcPay client-order event.
 * The caller supplies a closed event type; raw provider event strings are never trusted here.
 */
export function mapClaimedClientOrderWebhook(
  row: ClaimRow,
  expectedProviderEventType: ClientOrderWebhookEventType
): ClaimedClientOrderWebhook {
  try {
    const providerAccount = createProviderAccountIdentityBinding({
      seriesId: identifier(row.seriesId, "claimed_row_integrity_conflict"),
      providerAccountId: identifier(row.providerAccountId, "claimed_row_integrity_conflict"),
      identityVersion: positiveSafeInteger(
        row.providerIdentityVersion,
        "claimed_row_integrity_conflict"
      )
    });
    const artifactId = identifier(row.artifactId, "claimed_row_integrity_conflict");
    const digest = financeDigest(row.sha256Digest, "claimed_row_integrity_conflict");
    const byteLength = nonNegativeSafeInteger(row.byteLength, "claimed_row_integrity_conflict");
    const artifactMatchesProvider =
      row.artifactClass === "provider_webhook" &&
      row.artifactBindingKind === "provider" &&
      row.artifactSeriesId === providerAccount.seriesId &&
      row.artifactProviderAccountId === providerAccount.providerAccountId &&
      row.artifactProviderIdentityVersion === providerAccount.identityVersion;
    if (
      row.provider !== "arc_pay" ||
      row.signatureStatus !== "verified" ||
      row.providerEventType !== expectedProviderEventType ||
      (row.receivingEnvironment !== "sandbox" && row.receivingEnvironment !== "live") ||
      row.contentType !== "application/json" ||
      !artifactMatchesProvider
    ) {
      fail("claimed_row_integrity_conflict");
    }
    const inboxVersion = positiveSafeInteger(row.issuedVersion, "claimed_row_integrity_conflict");
    const leaseFence = positiveSafeInteger(row.issuedLeaseFence, "claimed_row_integrity_conflict");
    const lastCheckpointSequence = nonNegativeSafeInteger(
      row.lastCheckpointSequence,
      "claimed_row_integrity_conflict"
    );
    const expectedCheckpointSequence = lastCheckpointSequence + 1;
    if (!Number.isSafeInteger(expectedCheckpointSequence)) fail("claimed_row_integrity_conflict");
    return Object.freeze({
      inboxItemId: identifier(row.inboxItemId, "claimed_row_integrity_conflict"),
      inboxVersion,
      expectedCheckpointSequence,
      leaseFence,
      providerAccount,
      receivingEnvironment: row.receivingEnvironment,
      webhookId: identifier(row.webhookId, "claimed_row_integrity_conflict"),
      providerEventType: expectedProviderEventType,
      sealedWebhookArtifact: Object.freeze({
        artifactId,
        sha256Digest: digest,
        byteLength,
        contentType: "application/json"
      })
    });
  } catch (error) {
    if (error instanceof CapturedClientOrderWebhookClaimPersistenceError) throw error;
    fail("claimed_row_integrity_conflict");
  }
}

export function classifyCapturedClientOrderWebhookFailure(
  input: Readonly<{
    errorClass: WebhookProcessingErrorClass;
    processingAttempts: number;
    retryPolicy: CapturedClientOrderWebhookRetryPolicy;
  }>
): FailureDisposition {
  const retryPolicy = normalizeRetryPolicy(input.retryPolicy);
  const processingAttempts = positiveSafeInteger(input.processingAttempts, "invalid_configuration");
  const errorClass = webhookErrorClass(input.errorClass);
  if (
    errorClass === "processor_contract_violation" ||
    processingAttempts >= retryPolicy.maximumAttempts
  ) {
    return Object.freeze({ kind: "quarantine" });
  }
  const exponent = Math.max(0, processingAttempts - 1);
  const delayMilliseconds = Math.min(
    retryPolicy.maximumDelayMilliseconds,
    retryPolicy.baseDelayMilliseconds * 2 ** exponent
  );
  if (!Number.isSafeInteger(delayMilliseconds) || delayMilliseconds < 1)
    fail("invalid_configuration");
  return Object.freeze({ kind: "retry", delayMilliseconds });
}

function normalizeClaim(claim: ClaimedClientOrderWebhook): Readonly<{
  inboxItemId: string;
  inboxVersion: number;
  leaseFence: number;
}> {
  return Object.freeze({
    inboxItemId: identifier(claim.inboxItemId, "stale_lease"),
    inboxVersion: positiveSafeInteger(claim.inboxVersion, "stale_lease"),
    leaseFence: positiveSafeInteger(claim.leaseFence, "stale_lease")
  });
}

function normalizeRetryPolicy(
  input: CapturedClientOrderWebhookRetryPolicy
): CapturedClientOrderWebhookRetryPolicy {
  const maximumAttempts = boundedInteger(input.maximumAttempts, 1, 100, "invalid_configuration");
  const baseDelayMilliseconds = boundedInteger(
    input.baseDelayMilliseconds,
    1,
    300_000,
    "invalid_configuration"
  );
  const maximumDelayMilliseconds = boundedInteger(
    input.maximumDelayMilliseconds,
    baseDelayMilliseconds,
    3_600_000,
    "invalid_configuration"
  );
  return Object.freeze({ maximumAttempts, baseDelayMilliseconds, maximumDelayMilliseconds });
}

function webhookErrorClass(value: unknown): WebhookProcessingErrorClass {
  if (
    value === "transient_infrastructure" ||
    value === "canonical_provider_read_unavailable" ||
    value === "processor_contract_violation" ||
    value === "unexpected_internal_failure"
  ) {
    return value;
  }
  fail("invalid_configuration");
}

function identifier(
  value: unknown,
  reason: CapturedClientOrderWebhookClaimPersistenceReason
): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  ) {
    fail(reason);
  }
  return value;
}

function positiveSafeInteger(
  value: unknown,
  reason: CapturedClientOrderWebhookClaimPersistenceReason
): number {
  const parsed = decimalToSafeInteger(value);
  if (parsed === null || parsed < 1) fail(reason);
  return parsed;
}

function nonNegativeSafeInteger(
  value: unknown,
  reason: CapturedClientOrderWebhookClaimPersistenceReason
): number {
  const parsed = decimalToSafeInteger(value);
  if (parsed === null || parsed < 0) fail(reason);
  return parsed;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  reason: CapturedClientOrderWebhookClaimPersistenceReason
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(reason);
  }
  return value;
}

function decimalToSafeInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function financeDigest(
  value: unknown,
  reason: CapturedClientOrderWebhookClaimPersistenceReason
): FinanceDigest {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail(reason);
  return value as FinanceDigest;
}

function translate(error: unknown): CapturedClientOrderWebhookClaimPersistenceError {
  if (error instanceof CapturedClientOrderWebhookClaimPersistenceError) return error;
  const code = postgresCode(error);
  if (code === "40001" || code === "40P01") {
    return new CapturedClientOrderWebhookClaimPersistenceError("retryable_concurrency_conflict");
  }
  return new CapturedClientOrderWebhookClaimPersistenceError("persistence_failure");
}

function postgresCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function fail(reason: CapturedClientOrderWebhookClaimPersistenceReason): never {
  throw new CapturedClientOrderWebhookClaimPersistenceError(reason);
}
