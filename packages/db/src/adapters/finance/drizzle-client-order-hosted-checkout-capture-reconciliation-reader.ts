import type { ClientOrderHostedCheckoutCaptureReconciliationCandidateReader } from "@elevenhouse/domain/finance-core";
import { sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { mapCapturedClientOrderCorrelation } from "./drizzle-captured-client-order-webhook-correlation-port";

export type ClientOrderHostedCheckoutCaptureReconciliationReaderReason =
  | "invalid_input"
  | "integrity_conflict";

export class ClientOrderHostedCheckoutCaptureReconciliationReaderError extends Error {
  readonly code = "client_order_hosted_checkout_capture_reconciliation_reader_error";

  constructor(readonly reason: ClientOrderHostedCheckoutCaptureReconciliationReaderReason) {
    super("Pending client-order hosted checkout could not be listed safely");
    this.name = "ClientOrderHostedCheckoutCaptureReconciliationReaderError";
  }
}

type PendingHostedCheckoutRow = Parameters<typeof mapCapturedClientOrderCorrelation>[0];

export function createDrizzleClientOrderHostedCheckoutCaptureReconciliationReader(
  database: ElevenHouseDatabase
): ClientOrderHostedCheckoutCaptureReconciliationCandidateReader {
  return Object.freeze({
    async listPendingClientOrderHostedCheckoutCandidates({ limit }) {
      const pageLimit = positiveSafeInteger(limit);
      const result = await database.execute(sql<PendingHostedCheckoutRow>`
        select order_row.id::text as "externalId",
               'provider-payment-pending' as "providerPaymentId",
               order_row.id as "orderId",
               checkout_authorization.order_id as "authorizationOrderId",
               checkout_authorization.economic_payment_intent_id as "authorizationEconomicPaymentIntentId",
               checkout_authorization.economic_payment_session_id as "authorizationEconomicPaymentSessionId",
               checkout_authorization.provider_operation_intent_id as "authorizationProviderOperationIntentId",
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
          from finance_client_checkout_authorizations checkout_authorization
          join orders order_row on order_row.id = checkout_authorization.order_id
          join finance_economic_payment_intents intent
            on intent.id = checkout_authorization.economic_payment_intent_id
          join finance_economic_payment_sessions session
            on session.id = checkout_authorization.economic_payment_session_id
          join finance_provider_operation_intents operation
            on operation.id = checkout_authorization.provider_operation_intent_id
          join finance_operation_resource_policy_versions policy
            on policy.operation_kind = 'client_order_capture'
           and policy.lifecycle = 'published'
         where order_row.status = 'pending_payment'
           and intent.purpose = 'client_order'
           and intent.source_id = order_row.id::text
           and session.economic_payment_intent_id = intent.id
           and session.state = 'checkout_opened'
           and operation.operation_kind = 'checkout_session_create'
           and operation.purpose = 'client_order'
           and operation.source_id = order_row.id::text
           and operation.status = 'succeeded'
         order by checkout_authorization.committed_at, checkout_authorization.order_id
         limit ${pageLimit}
      `);
      const rows = result.rows as unknown as readonly PendingHostedCheckoutRow[];
      return Object.freeze(
        rows.map((row) => Object.freeze({ correlation: mapCapturedClientOrderCorrelation(row) }))
      );
    }
  });
}

function positiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new ClientOrderHostedCheckoutCaptureReconciliationReaderError("invalid_input");
  }
  return Number(value);
}
