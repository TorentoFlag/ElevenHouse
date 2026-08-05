import {
  createProviderAccountIdentityBinding,
  hasAsciiControlCharacter,
  resolveFinanceOperationEnvelope,
  type FinanceProviderAccountIdentity,
  type ResolvedFinanceOperationEnvelope
} from "@elevenhouse/domain/finance-core";
import { sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { mapFinanceOperationResourcePolicyVersion } from "./drizzle-finance-operation-resource-policy-reader";

export type CapturedClientOrderWebhookCorrelation = Readonly<{
  externalId: string;
  providerAccount: FinanceProviderAccountIdentity;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  expectedEconomicPaymentVersion: number;
  expectedAmountMinor: string;
  expectedCurrency: "RUB";
  operationEnvelope: ResolvedFinanceOperationEnvelope;
}>;

export type CapturedClientOrderWebhookCorrelationPort = Readonly<{
  resolveCapturedClientOrder(
    input: Readonly<{
      providerAccount: FinanceProviderAccountIdentity;
      providerPaymentId: string;
      externalId: string;
    }>
  ): Promise<CapturedClientOrderWebhookCorrelation>;
}>;

export type CapturedClientOrderCorrelationPersistenceReason =
  | "invalid_input"
  | "checkout_authority_not_found"
  | "checkout_authority_integrity_conflict"
  | "capture_policy_integrity_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_failure";

export class CapturedClientOrderCorrelationPersistenceError extends Error {
  readonly code = "CAPTURED_CLIENT_ORDER_CORRELATION_PERSISTENCE_ERROR" as const;

  constructor(readonly reason: CapturedClientOrderCorrelationPersistenceReason) {
    super("Captured client-order webhook could not be correlated safely");
    this.name = "CapturedClientOrderCorrelationPersistenceError";
  }
}

type CorrelationRow = Readonly<{
  externalId: unknown;
  providerPaymentId: unknown;
  orderId: unknown;
  authorizationOrderId: unknown;
  authorizationEconomicPaymentIntentId: unknown;
  authorizationEconomicPaymentSessionId: unknown;
  authorizationProviderOperationIntentId: unknown;
  economicPaymentIntentId: unknown;
  economicPaymentSessionId: unknown;
  intentPurpose: unknown;
  intentSourceId: unknown;
  intentVersion: unknown;
  amountMinor: unknown;
  currency: unknown;
  seriesId: unknown;
  providerAccountId: unknown;
  providerIdentityVersion: unknown;
  operationKind: unknown;
  operationId: unknown;
  operationPurpose: unknown;
  operationSourceId: unknown;
  operationSeriesId: unknown;
  operationProviderAccountId: unknown;
  operationProviderIdentityVersion: unknown;
  policyId: unknown;
  policyVersion: unknown;
  policyOperationKind: unknown;
  policyLifecycle: unknown;
  policyDraftRevision: unknown;
  policyMaximumRows: unknown;
  policyMaximumDecimalDigits: unknown;
  policyMaximumArtifactBytes: unknown;
  policyCanonicalPreimage: unknown;
  policyCanonicalDigest: unknown;
  policyPublishedAt: unknown;
  policyRetiredAt: unknown;
}>;

/**
 * Resolves the canonical ArcPay `external_id` only through the durable Hosted Checkout chain.
 * This is a short read-lock transaction: the later composite capture UOW revalidates every fact
 * while holding its own write locks, so no provider call is performed while a DB lock is held.
 */
export function createDrizzleCapturedClientOrderWebhookCorrelationPort(
  input: ElevenHouseDatabase | Readonly<{ database: ElevenHouseDatabase }>
): CapturedClientOrderWebhookCorrelationPort {
  const database = "database" in input ? input.database : input;
  return Object.freeze({
    async resolveCapturedClientOrder(input) {
      const externalId = uuid(input.externalId, "invalid_input");
      const providerPaymentId = identifier(input.providerPaymentId, "invalid_input");
      const providerAccount = normalizeProviderAccount(input.providerAccount);
      try {
        return await database.transaction(async (transaction) => {
          const result = await transaction.execute(sql<CorrelationRow>`
            select ${externalId} as "externalId",
                   ${providerPaymentId} as "providerPaymentId",
                   order_row.id as "orderId",
                   authorization.order_id as "authorizationOrderId",
                   authorization.economic_payment_intent_id as "authorizationEconomicPaymentIntentId",
                   authorization.economic_payment_session_id as "authorizationEconomicPaymentSessionId",
                   authorization.provider_operation_intent_id as "authorizationProviderOperationIntentId",
                   intent.id as "economicPaymentIntentId",
                   session.id as "economicPaymentSessionId",
                   intent.purpose as "intentPurpose",
                   intent.source_id as "intentSourceId",
                   intent.version as "intentVersion",
                   intent.amount_minor as "amountMinor",
                   intent.currency as "currency",
                   intent.series_id as "seriesId",
                   intent.provider_account_id as "providerAccountId",
                   intent.provider_identity_version as "providerIdentityVersion",
                   operation.operation_kind as "operationKind",
                   operation.id as "operationId",
                   operation.purpose as "operationPurpose",
                   operation.source_id as "operationSourceId",
                   operation.series_id as "operationSeriesId",
                   operation.provider_account_id as "operationProviderAccountId",
                   operation.provider_identity_version as "operationProviderIdentityVersion",
                   policy.policy_id as "policyId",
                   policy.version as "policyVersion",
                   policy.operation_kind as "policyOperationKind",
                   policy.lifecycle as "policyLifecycle",
                   policy.draft_revision as "policyDraftRevision",
                   policy.maximum_rows as "policyMaximumRows",
                   policy.maximum_decimal_digits as "policyMaximumDecimalDigits",
                   policy.maximum_artifact_bytes as "policyMaximumArtifactBytes",
                   policy.canonical_preimage as "policyCanonicalPreimage",
                   policy.canonical_digest as "policyCanonicalDigest",
                   policy.published_at as "policyPublishedAt",
                   policy.retired_at as "policyRetiredAt"
              from finance_client_checkout_authorizations authorization
              join orders order_row on order_row.id = authorization.order_id
              join finance_economic_payment_intents intent
                on intent.id = authorization.economic_payment_intent_id
              join finance_economic_payment_sessions session
                on session.id = authorization.economic_payment_session_id
              join finance_provider_operation_intents operation
                on operation.id = authorization.provider_operation_intent_id
              join finance_operation_resource_policy_versions policy
                on policy.operation_kind = 'client_order_capture'
               and policy.lifecycle = 'published'
             where authorization.order_id = ${externalId}::uuid
               and authorization.economic_payment_intent_id = intent.id
               and authorization.economic_payment_session_id = session.id
               and authorization.provider_operation_intent_id = operation.id
               and intent.purpose = 'client_order'
               and intent.source_id = ${externalId}
               and intent.series_id = ${providerAccount.seriesId}
               and intent.provider_account_id = ${providerAccount.providerAccountId}
               and intent.provider_identity_version = ${providerAccount.identityVersion}
               and session.economic_payment_intent_id = intent.id
               and session.series_id = intent.series_id
               and session.provider_account_id = intent.provider_account_id
               and session.provider_identity_version = intent.provider_identity_version
               and operation.operation_kind = 'checkout_session_create'
               and operation.purpose = 'client_order'
               and operation.source_id = ${externalId}
               and operation.series_id = intent.series_id
               and operation.provider_account_id = intent.provider_account_id
               and operation.provider_identity_version = intent.provider_identity_version
             for update of authorization, intent, session, operation
          `);
          const rows = result.rows as unknown as readonly CorrelationRow[];
          if (rows.length === 0) fail("checkout_authority_not_found");
          if (rows.length !== 1 || !rows[0]) fail("checkout_authority_integrity_conflict");
          return mapCapturedClientOrderCorrelation(rows[0]);
        });
      } catch (error) {
        throw translate(error);
      }
    }
  } satisfies CapturedClientOrderWebhookCorrelationPort);
}

export function mapCapturedClientOrderCorrelation(
  row: CorrelationRow
): CapturedClientOrderWebhookCorrelation {
  try {
    const externalId = uuid(row.externalId, "checkout_authority_integrity_conflict");
    identifier(row.providerPaymentId, "checkout_authority_integrity_conflict");
    const providerAccount = createProviderAccountIdentityBinding({
      seriesId: identifier(row.seriesId, "checkout_authority_integrity_conflict"),
      providerAccountId: identifier(row.providerAccountId, "checkout_authority_integrity_conflict"),
      identityVersion: positiveSafeInteger(
        row.providerIdentityVersion,
        "checkout_authority_integrity_conflict"
      )
    });
    const intentId = identifier(
      row.economicPaymentIntentId,
      "checkout_authority_integrity_conflict"
    );
    const sessionId = identifier(
      row.economicPaymentSessionId,
      "checkout_authority_integrity_conflict"
    );
    const operationEnvelope = resolveCaptureOperationEnvelope(row);
    if (
      row.orderId !== externalId ||
      row.authorizationOrderId !== externalId ||
      row.authorizationEconomicPaymentIntentId !== intentId ||
      row.authorizationEconomicPaymentSessionId !== sessionId ||
      row.authorizationProviderOperationIntentId !== row.operationId ||
      row.intentPurpose !== "client_order" ||
      row.intentSourceId !== externalId ||
      row.currency !== "RUB" ||
      !positiveMinor(row.amountMinor) ||
      row.operationKind !== "checkout_session_create" ||
      row.operationPurpose !== "client_order" ||
      row.operationSourceId !== externalId ||
      row.operationSeriesId !== providerAccount.seriesId ||
      row.operationProviderAccountId !== providerAccount.providerAccountId ||
      row.operationProviderIdentityVersion !== providerAccount.identityVersion
    ) {
      fail("checkout_authority_integrity_conflict");
    }
    return Object.freeze({
      externalId,
      providerAccount,
      economicPaymentIntentId: intentId,
      economicPaymentSessionId: sessionId,
      expectedEconomicPaymentVersion: positiveSafeInteger(
        row.intentVersion,
        "checkout_authority_integrity_conflict"
      ),
      expectedAmountMinor: String(row.amountMinor),
      expectedCurrency: "RUB",
      operationEnvelope
    });
  } catch (error) {
    if (error instanceof CapturedClientOrderCorrelationPersistenceError) throw error;
    fail("checkout_authority_integrity_conflict");
  }
}

function resolveCaptureOperationEnvelope(row: CorrelationRow): ResolvedFinanceOperationEnvelope {
  try {
    const version = mapFinanceOperationResourcePolicyVersion({
      policyId: row.policyId,
      version: positiveSafeInteger(row.policyVersion, "capture_policy_integrity_conflict"),
      operationKind: row.policyOperationKind,
      draftRevision: positiveSafeInteger(
        row.policyDraftRevision,
        "capture_policy_integrity_conflict"
      ),
      lifecycle: row.policyLifecycle,
      maximumRows: positiveSafeInteger(row.policyMaximumRows, "capture_policy_integrity_conflict"),
      maximumDecimalDigits: positiveSafeInteger(
        row.policyMaximumDecimalDigits,
        "capture_policy_integrity_conflict"
      ),
      maximumArtifactBytes: positiveSafeInteger(
        row.policyMaximumArtifactBytes,
        "capture_policy_integrity_conflict"
      ),
      canonicalPreimage: row.policyCanonicalPreimage,
      canonicalDigest: row.policyCanonicalDigest,
      publishedAt: row.policyPublishedAt,
      retiredAt: row.policyRetiredAt
    } as never);
    return resolveFinanceOperationEnvelope({
      policy: version,
      operationKind: "client_order_capture"
    });
  } catch {
    fail("capture_policy_integrity_conflict");
  }
}

function normalizeProviderAccount(
  input: FinanceProviderAccountIdentity
): FinanceProviderAccountIdentity {
  try {
    return createProviderAccountIdentityBinding({
      seriesId: identifier(input.seriesId, "invalid_input"),
      providerAccountId: identifier(input.providerAccountId, "invalid_input"),
      identityVersion: positiveSafeInteger(input.identityVersion, "invalid_input")
    });
  } catch {
    fail("invalid_input");
  }
}

function uuid(value: unknown, reason: CapturedClientOrderCorrelationPersistenceReason): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    fail(reason);
  }
  return value;
}

function identifier(
  value: unknown,
  reason: CapturedClientOrderCorrelationPersistenceReason
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
  reason: CapturedClientOrderCorrelationPersistenceReason
): number {
  const decimal = typeof value === "string" ? value : String(value);
  if (!/^[1-9][0-9]*$/.test(decimal)) fail(reason);
  const parsed = Number(decimal);
  if (!Number.isSafeInteger(parsed)) fail(reason);
  return parsed;
}

function positiveMinor(value: unknown): boolean {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}

function translate(error: unknown): CapturedClientOrderCorrelationPersistenceError {
  if (error instanceof CapturedClientOrderCorrelationPersistenceError) return error;
  const code = postgresCode(error);
  if (code === "40001" || code === "40P01") {
    return new CapturedClientOrderCorrelationPersistenceError("retryable_concurrency_conflict");
  }
  return new CapturedClientOrderCorrelationPersistenceError("persistence_failure");
}

function postgresCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function fail(reason: CapturedClientOrderCorrelationPersistenceReason): never {
  throw new CapturedClientOrderCorrelationPersistenceError(reason);
}
