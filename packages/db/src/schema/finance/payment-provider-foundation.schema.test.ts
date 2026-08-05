import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeCaptureFacts,
  financeEconomicPaymentIntegritySql,
  financeEconomicPaymentIntentCreationReceipts,
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessionOpenReceipts,
  financePlatformInvoicePaymentBindings,
  financeEconomicPaymentSessions,
  financeEconomicPaymentSourceHeads,
  financePaymentClearingHeads,
  financePaymentClearingHistory,
  financePaymentTransitionFacts
} from "./economic-payments.schema";
import {
  financeProviderDispatchArtifacts,
  financeProviderOperationIntegritySql,
  financeProviderOperationIntentCreationReceipts,
  financeProviderOperationIntents,
  financeProviderOperationTransportUnknownReceipts,
  financeProviderOperationResultCommitReceipts,
  financeProviderOperationResults,
  financeProviderOperationSourceHeads
} from "./provider-operations.schema";
import {
  financeArcPayRateBudgetHistory,
  financeArcPayRateBudgetIntegritySql,
  financeArcPayRateBudgets
} from "./rate-budget.schema";
import {
  financeProviderSemanticFacts,
  financeWebhookInbox,
  financeWebhookInboxIntegritySql,
  financeWebhookProcessingHistory,
  financeWebhookSemanticCommitReceipts,
  financeWebhookStoredReceipts
} from "./webhook-inbox.schema";

function indexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.flatMap((index) =>
    index.config.name === undefined ? [] : [index.config.name]
  );
}

function uniqueConstraintNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).uniqueConstraints.flatMap((constraint) =>
    constraint.name === undefined ? [] : [constraint.name]
  );
}

function uniqueConstraintColumnNames(
  table: Parameters<typeof getTableConfig>[0],
  constraintName: string
): string[] {
  const constraint = getTableConfig(table).uniqueConstraints.find(
    (candidate) => candidate.name === constraintName
  );
  expect(constraint, `missing unique constraint ${constraintName}`).toBeDefined();
  return constraint?.columns.map((column) => column.name) ?? [];
}

function indexOrUniqueNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return [...indexNames(table), ...uniqueConstraintNames(table)];
}

function foreignKeyNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).foreignKeys.map((key) => key.getName());
}

function checkNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).checks.map((constraint) => constraint.name);
}

function expectEverySqlFunctionToPinSearchPath(ddl: string): void {
  const functions = ddl.split("create or replace function ").slice(1);
  expect(functions.length).toBeGreaterThan(0);
  for (const definition of functions) {
    expect(definition.split("as $$", 1)[0]).toContain("set search_path = pg_catalog, public");
  }
}

describe("normalized economic payment persistence", () => {
  it("owns one versioned economic intent per logical source and one active-or-unknown session", () => {
    expect(getTableName(financeEconomicPaymentSourceHeads)).toBe(
      "finance_economic_payment_source_heads"
    );
    expect(getTableName(financeEconomicPaymentIntents)).toBe("finance_economic_payment_intents");
    expect(getTableName(financeEconomicPaymentSessions)).toBe("finance_economic_payment_sessions");
    expect(getTableName(financePlatformInvoicePaymentBindings)).toBe(
      "finance_platform_invoice_payment_bindings"
    );
    expect(foreignKeyNames(financePlatformInvoicePaymentBindings)).toEqual(
      expect.arrayContaining([
        "finance_platform_invoice_payment_binding_invoice_fk",
        "finance_platform_invoice_payment_binding_intent_fk"
      ])
    );

    expect(indexOrUniqueNames(financeEconomicPaymentIntents)).toEqual(
      expect.arrayContaining([
        "finance_economic_payment_intents_purpose_source_unique",
        "finance_economic_payment_intents_exact_identity_unique"
      ])
    );
    expect(indexNames(financeEconomicPaymentSessions)).toContain(
      "finance_economic_payment_sessions_one_active_or_unknown_unique"
    );
    expect(foreignKeyNames(financeEconomicPaymentIntents)).toContain(
      "finance_economic_payment_intents_provider_identity_fk"
    );
    expect(foreignKeyNames(financeEconomicPaymentSessions)).toEqual(
      expect.arrayContaining([
        "finance_economic_payment_sessions_intent_fk",
        "finance_economic_payment_sessions_provider_identity_fk"
      ])
    );
    expect(checkNames(financeEconomicPaymentIntents)).toEqual(
      expect.arrayContaining([
        "finance_economic_payment_intents_identifier_check",
        "finance_economic_payment_intents_amount_purpose_check",
        "finance_economic_payment_intents_version_state_time_check"
      ])
    );

    expect(getTableColumns(financeEconomicPaymentIntents).amountMinor.getSQLType()).toBe(
      "numeric(38, 0)"
    );
    expect(getTableColumns(financeEconomicPaymentIntents).version.getSQLType()).toBe(
      "numeric(38, 0)"
    );
    expect(getTableColumns(financeEconomicPaymentSourceHeads).headVersion.getSQLType()).toBe(
      "numeric(38, 0)"
    );
    expect(financeEconomicPaymentIntegritySql).toContain(
      "finance_validate_platform_invoice_payment_binding"
    );
  });

  it("records immutable transition, capture and clearing facts without a generic event payload", () => {
    expect(getTableName(financePaymentTransitionFacts)).toBe("finance_payment_transition_facts");
    expect(getTableName(financeCaptureFacts)).toBe("finance_capture_facts");
    expect(getTableName(financePaymentClearingHeads)).toBe("finance_payment_clearing_heads");
    expect(getTableName(financePaymentClearingHistory)).toBe("finance_payment_clearing_history");

    expect(indexOrUniqueNames(financeCaptureFacts)).toEqual(
      expect.arrayContaining([
        "finance_capture_facts_one_capture_per_intent_unique",
        "finance_capture_facts_provider_payment_unique",
        "finance_capture_facts_exact_receipt_owner_unique"
      ])
    );
    expect(indexNames(financePaymentTransitionFacts)).toEqual(
      expect.arrayContaining([
        "finance_payment_transition_facts_intent_version_unique",
        "finance_payment_transition_facts_authority_unique"
      ])
    );
    expect(
      uniqueConstraintColumnNames(
        financeCaptureFacts,
        "finance_capture_facts_exact_receipt_owner_unique"
      )
    ).toEqual([
      "id",
      "economic_payment_intent_id",
      "economic_payment_session_id",
      "series_id",
      "provider_account_id",
      "provider_identity_version",
      "provider_payment_id",
      "amount_minor",
      "currency",
      "evidence_authority_kind",
      "evidence_authority_id",
      "evidence_artifact_id",
      "evidence_artifact_digest"
    ]);

    const forbidden = [
      "payload",
      "eventPayload",
      "metadata",
      "rawBody",
      "providerResponse",
      "customerId",
      "cardTokenId",
      "pan",
      "cvv"
    ];
    for (const table of [
      financePaymentTransitionFacts,
      financeCaptureFacts,
      financePaymentClearingHistory
    ]) {
      expect(Object.keys(getTableColumns(table))).not.toEqual(expect.arrayContaining(forbidden));
    }

    for (const tableName of [
      "finance_economic_payment_source_heads",
      "finance_economic_payment_intents",
      "finance_economic_payment_sessions",
      "finance_economic_payment_session_open_receipts",
      "finance_payment_transition_facts",
      "finance_capture_facts",
      "finance_payment_clearing_heads",
      "finance_payment_clearing_history"
    ]) {
      expect(financeEconomicPaymentIntegritySql).toContain(`before truncate on ${tableName}`);
    }
    expect(financeEconomicPaymentIntegritySql).toContain("new.version <> old.version + 1");
    expect(financeEconomicPaymentIntegritySql).toContain(
      "finance_validate_economic_payment_capture"
    );
    expect(financeEconomicPaymentIntegritySql).toContain(
      "finance_validate_payment_transition_heads"
    );
  });

  it("persists a DB-issued one-to-one economic-intent creation receipt", () => {
    expect(getTableName(financeEconomicPaymentIntentCreationReceipts)).toBe(
      "finance_economic_payment_intent_creation_receipts"
    );
    expect(indexOrUniqueNames(financeEconomicPaymentIntentCreationReceipts)).toEqual(
      expect.arrayContaining([
        "finance_economic_intent_creation_receipts_intent_unique",
        "finance_economic_intent_creation_receipts_boundary_unique"
      ])
    );
    expect(Object.keys(getTableColumns(financeEconomicPaymentIntentCreationReceipts))).toEqual(
      expect.arrayContaining([
        "canonicalPreimage",
        "canonicalDigest",
        "persistenceTransactionBoundaryRef",
        "committedAt"
      ])
    );
    expect(financeEconomicPaymentIntegritySql).toContain(
      "finance_issue_economic_payment_intent_creation_receipt"
    );
    expect(financeEconomicPaymentIntegritySql).toContain(
      "new.persistence_transaction_boundary_ref := 'postgres-xid:' || pg_current_xact_id()::text"
    );
    expect(financeEconomicPaymentIntegritySql).toContain(
      "digest(new.canonical_preimage, 'sha256')"
    );
  });

  it("keeps an internal checkout-open receipt separate from provider payment evidence", () => {
    expect(getTableName(financeEconomicPaymentSessionOpenReceipts)).toBe(
      "finance_economic_payment_session_open_receipts"
    );
    expect(foreignKeyNames(financeEconomicPaymentSessionOpenReceipts)).toContain(
      "finance_economic_session_open_receipts_session_fk"
    );
    expect(indexOrUniqueNames(financeEconomicPaymentSessionOpenReceipts)).toEqual(
      expect.arrayContaining([
        "finance_economic_session_open_receipts_session_unique",
        "finance_economic_session_open_receipts_boundary_unique"
      ])
    );
    expect(Object.keys(getTableColumns(financeEconomicPaymentSessionOpenReceipts))).not.toEqual(
      expect.arrayContaining(["providerPaymentId", "amountMinor", "currency"])
    );
    expect(financeEconomicPaymentIntegritySql).toContain(
      "finance_issue_economic_payment_session_open_receipt"
    );
  });
});

describe("provider operation persistence", () => {
  it("binds idempotency and predecessor chains to one exact provider identity", () => {
    expect(getTableName(financeProviderOperationIntents)).toBe(
      "finance_provider_operation_intents"
    );
    expect(getTableName(financeProviderOperationSourceHeads)).toBe(
      "finance_provider_operation_source_heads"
    );
    expect(getTableName(financeProviderDispatchArtifacts)).toBe(
      "finance_provider_dispatch_artifacts"
    );
    expect(getTableName(financeProviderOperationResults)).toBe(
      "finance_provider_operation_results"
    );
    expect(getTableName(financeProviderOperationTransportUnknownReceipts)).toBe(
      "finance_provider_operation_transport_unknown_receipts"
    );

    expect(indexOrUniqueNames(financeProviderOperationIntents)).toEqual(
      expect.arrayContaining([
        "finance_provider_operation_intents_scoped_idempotency_unique",
        "finance_provider_operation_intents_source_chain_version_unique",
        "finance_provider_operation_intents_one_successor_unique",
        "finance_provider_operation_intents_exact_result_owner_unique"
      ])
    );
    expect(foreignKeyNames(financeProviderOperationIntents)).toEqual(
      expect.arrayContaining([
        "finance_provider_operation_intents_provider_identity_fk",
        "finance_provider_operation_intents_economic_intent_fk",
        "finance_provider_operation_intents_predecessor_fk",
        "finance_provider_operation_intents_restricted_credential_fk",
        "finance_provider_operation_intents_transient_secret_fk"
      ])
    );
    expect(checkNames(financeProviderOperationIntents)).toEqual(
      expect.arrayContaining([
        "finance_provider_operation_intents_identifier_check",
        "finance_provider_operation_intents_secret_shape_check",
        "finance_provider_operation_intents_predecessor_shape_check",
        "finance_provider_operation_intents_status_result_shape_check"
      ])
    );
  });

  it("requires the sealed 3DS Method context on its one server-side completion operation", () => {
    const check = getTableConfig(financeProviderOperationIntents).checks.find(
      (entry) => entry.name === "finance_provider_operation_intents_secret_shape_check"
    );
    const checkSql = sqlChunkText(check?.value);
    expect(checkSql).toContain("card_setup_3ds_method_complete");
    const methodClause = checkSql
      .split("operation_kind = 'card_setup_3ds_method_complete'")[1]
      ?.split(") or (")[0];
    expect(methodClause).toContain("transient_secret_ref_id is not null");
    expect(methodClause).not.toContain("transient_secret_ref_id is null");
  });

  it("keeps canonical dispatch and verified results as immutable evidence, never economics", () => {
    expect(Object.keys(getTableColumns(financeProviderDispatchArtifacts))).toEqual([
      "providerOperationIntentId",
      "artifactId",
      "artifactDigest",
      "canonicalRequestDigest",
      "registeredAt"
    ]);

    const operationColumns = Object.keys(getTableColumns(financeProviderOperationIntents));
    expect(operationColumns).toEqual(
      expect.arrayContaining([
        "canonicalRequestDigest",
        "dispatchAuthorizationId",
        "dispatchAuthorizationVersion",
        "dispatchAuthorizationDigest",
        "operationPolicyId",
        "operationPolicyVersion",
        "operationPolicyDigest",
        "operationMaximumArtifactBytes",
        "restrictedCredentialId",
        "restrictedCredentialVersion",
        "transientSecretRefId",
        "status",
        "version"
      ])
    );
    for (const forbidden of [
      "dispatchEnvelope",
      "dispatchPayload",
      "payload",
      "customerId",
      "providerCustomerId",
      "cardTokenId",
      "providerToken",
      "tokenValue",
      "pan",
      "cvv",
      "rawCard",
      "encryptedCard",
      "split",
      "submerchant"
    ]) {
      expect(operationColumns).not.toContain(forbidden);
    }

    const resultColumns = Object.keys(getTableColumns(financeProviderOperationResults));
    for (const forbidden of [
      "economicState",
      "walletId",
      "journalTransactionId",
      "payableMinor",
      "balanceMinor",
      "ledgerEntryId",
      "payload",
      "providerResponse"
    ]) {
      expect(resultColumns).not.toContain(forbidden);
    }

    expect(financeProviderOperationIntegritySql).toContain(
      "new.canonical_request_digest is distinct from old.canonical_request_digest"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "old.status = 'provider_unknown' and new.status in ('provider_unknown', 'succeeded', 'failed')"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "finance_validate_provider_operation_source_head"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "finance_validate_provider_operation_artifact"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "finance_validate_client_checkout_dispatch_authorization"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "finance_validate_provider_operation_transport_unknown_receipt"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "finance_require_provider_operation_observation_for_head"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "authority.provider_operation_intent_id = new.id"
    );
    expect(financeProviderOperationIntegritySql).not.toContain(
      "operation.operation_kind in ('checkout_session_create', 'card_setup', 'saved_card_charge')"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "operation.operation_kind in ('card_setup', 'card_setup_execute', 'card_setup_3ds_method_complete', 'saved_card_charge', 'saved_card_charge_3ds_method_complete')"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "new.amount_minor is distinct from economic_intent.amount_minor"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "operation.operation_kind in ('card_setup', 'card_setup_execute', 'card_setup_3ds_method_complete') and economic_intent.amount_minor <> 0"
    );
    for (const tableName of [
      "finance_provider_operation_intents",
      "finance_provider_operation_source_heads",
      "finance_provider_dispatch_artifacts",
      "finance_provider_operation_results",
      "finance_provider_operation_transport_unknown_receipts"
    ]) {
      expect(financeProviderOperationIntegritySql).toContain(`before truncate on ${tableName}`);
    }
  });

  it("persists exact DB-issued dispatch and provider-result commit receipts", () => {
    expect(getTableName(financeProviderOperationIntentCreationReceipts)).toBe(
      "finance_provider_operation_intent_creation_receipts"
    );
    expect(getTableName(financeProviderOperationResultCommitReceipts)).toBe(
      "finance_provider_operation_result_commit_receipts"
    );
    expect(indexOrUniqueNames(financeProviderOperationIntentCreationReceipts)).toEqual(
      expect.arrayContaining([
        "finance_provider_intent_creation_receipts_operation_unique",
        "finance_provider_intent_creation_receipts_boundary_unique"
      ])
    );
    expect(indexOrUniqueNames(financeProviderOperationResultCommitReceipts)).toEqual(
      expect.arrayContaining([
        "finance_provider_result_commit_receipts_result_unique",
        "finance_provider_result_receipts_capture_owner_unique",
        "finance_provider_result_commit_receipts_boundary_unique"
      ])
    );
    expect(
      uniqueConstraintColumnNames(
        financeProviderOperationResultCommitReceipts,
        "finance_provider_result_receipts_capture_owner_unique"
      )
    ).toEqual([
      "id",
      "provider_operation_result_id",
      "provider_operation_intent_id",
      "provider_operation_intent_version",
      "economic_payment_intent_id",
      "correlated_economic_payment_version",
      "economic_payment_session_id",
      "purpose",
      "source_id",
      "operation_kind",
      "series_id",
      "provider_account_id",
      "provider_identity_version",
      "outcome",
      "provider_operation_id",
      "provider_payment_id",
      "amount_minor",
      "currency",
      "canonical_request_digest",
      "evidence_artifact_id",
      "evidence_artifact_digest",
      "observed_at"
    ]);
    expect(Object.keys(getTableColumns(financeProviderOperationIntents))).toContain(
      "correlatedEconomicPaymentVersion"
    );
    expect(Object.keys(getTableColumns(financeProviderOperationResults))).toContain(
      "correlatedEconomicPaymentVersion"
    );
    for (const table of [
      financeProviderOperationIntentCreationReceipts,
      financeProviderOperationResultCommitReceipts
    ]) {
      expect(Object.keys(getTableColumns(table))).toEqual(
        expect.arrayContaining([
          "correlatedEconomicPaymentVersion",
          "canonicalPreimage",
          "canonicalDigest",
          "persistenceTransactionBoundaryRef",
          "committedAt"
        ])
      );
    }
    expect(financeProviderOperationIntegritySql).toContain(
      "finance_issue_provider_operation_intent_creation_receipt"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "finance_issue_provider_operation_result_commit_receipt"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "digest(new.canonical_preimage, 'sha256')"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "finance_provider_operation_result_commit_receipts receipt"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "new.correlated_economic_payment_version := economic_intent.version"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "'correlatedEconomicPaymentVersion', new.correlated_economic_payment_version::text"
    );
  });
});

function sqlChunkText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(sqlChunkText).join("");
  if (!value || typeof value !== "object") return "";
  if ("value" in value && (typeof value.value === "string" || Array.isArray(value.value))) {
    return sqlChunkText(value.value);
  }
  if ("name" in value && typeof value.name === "string" && "table" in value) {
    return value.name;
  }
  if ("queryChunks" in value && Array.isArray(value.queryChunks)) {
    return value.queryChunks.map(sqlChunkText).join("");
  }
  return "";
}

describe("durable provider webhook inbox", () => {
  it("deduplicates exact transport and semantic identities with one sealed artifact", () => {
    expect(getTableName(financeWebhookInbox)).toBe("finance_webhook_inbox");
    expect(getTableName(financeWebhookProcessingHistory)).toBe(
      "finance_webhook_processing_history"
    );
    expect(getTableName(financeProviderSemanticFacts)).toBe("finance_provider_semantic_facts");

    expect(indexNames(financeWebhookInbox)).toEqual(
      expect.arrayContaining([
        "finance_webhook_inbox_transport_identity_unique",
        "finance_webhook_inbox_artifact_unique",
        "finance_webhook_inbox_claim_idx"
      ])
    );
    expect(indexNames(financeProviderSemanticFacts)).toContain(
      "finance_provider_semantic_facts_natural_key_unique"
    );
    expect(foreignKeyNames(financeProviderSemanticFacts)).toEqual(
      expect.arrayContaining([
        "finance_provider_semantic_facts_economic_intent_fk",
        "finance_provider_semantic_facts_economic_session_fk"
      ])
    );
    expect(foreignKeyNames(financeWebhookInbox)).toEqual(
      expect.arrayContaining([
        "finance_webhook_inbox_provider_identity_fk",
        "finance_webhook_inbox_artifact_fk"
      ])
    );
    expect(checkNames(financeWebhookInbox)).toEqual(
      expect.arrayContaining([
        "finance_webhook_inbox_signature_check",
        "finance_webhook_inbox_lease_shape_check",
        "finance_webhook_inbox_state_time_check"
      ])
    );

    const inboxColumns = Object.keys(getTableColumns(financeWebhookInbox));
    expect(inboxColumns).toEqual(
      expect.arrayContaining([
        "transportEventId",
        "artifactId",
        "rawBodyDigest",
        "signatureScheme",
        "signatureEvidenceDigest",
        "processingStatus",
        "leaseFence",
        "leaseOwnerId",
        "leaseExpiresAt",
        "version"
      ])
    );
    for (const forbidden of [
      "rawBody",
      "body",
      "payload",
      "eventPayload",
      "headers",
      "signature",
      "metadata",
      "json"
    ]) {
      expect(inboxColumns).not.toContain(forbidden);
      expect(Object.keys(getTableColumns(financeProviderSemanticFacts))).not.toContain(forbidden);
    }
    expect(Object.keys(getTableColumns(financeProviderSemanticFacts))).toEqual(
      expect.arrayContaining([
        "economicPaymentIntentId",
        "economicPaymentSessionId",
        "providerPaymentId",
        "amountMinor",
        "currency"
      ])
    );
    expect(getTableColumns(financeProviderSemanticFacts).amountMinor.getSQLType()).toBe(
      "numeric(38, 0)"
    );
    expect(financeEconomicPaymentIntegritySql).toContain(
      "semantic.provider_payment_id = new.provider_payment_id"
    );
    expect(financeEconomicPaymentIntegritySql).toContain(
      "semantic.amount_minor = new.amount_minor"
    );
    expect(financeEconomicPaymentIntegritySql).toContain("semantic.currency = new.currency");
    expect(financeEconomicPaymentIntegritySql).toContain(
      "semantic.effect_disposition = 'applied_once'"
    );
  });

  it("exports DB-clock fenced claim, renew and completion primitives", () => {
    expect(financeWebhookInboxIntegritySql).toContain("clock_timestamp()");
    expect(financeWebhookInboxIntegritySql).toContain("for update skip locked");
    expect(financeWebhookInboxIntegritySql).toContain("finance_claim_webhook_inbox");
    expect(financeWebhookInboxIntegritySql).toContain("finance_renew_webhook_inbox_lease");
    expect(financeWebhookInboxIntegritySql).toContain("finance_complete_webhook_inbox");
    expect(financeWebhookInboxIntegritySql).toContain("lease_fence = p_expected_lease_fence");
    expect(financeWebhookInboxIntegritySql).toContain("version = p_expected_version");
    expect(financeWebhookInboxIntegritySql).toContain("finance_validate_webhook_artifact");
    for (const tableName of [
      "finance_webhook_inbox",
      "finance_webhook_processing_history",
      "finance_provider_semantic_facts"
    ]) {
      expect(financeWebhookInboxIntegritySql).toContain(`before truncate on ${tableName}`);
    }
  });

  it("persists DB-issued stored-before-ack and semantic commit receipts", () => {
    expect(getTableName(financeWebhookStoredReceipts)).toBe("finance_webhook_stored_receipts");
    expect(getTableName(financeWebhookSemanticCommitReceipts)).toBe(
      "finance_webhook_semantic_commit_receipts"
    );
    expect(indexOrUniqueNames(financeWebhookStoredReceipts)).toEqual(
      expect.arrayContaining([
        "finance_webhook_stored_receipts_inbox_unique",
        "finance_webhook_stored_receipts_boundary_unique"
      ])
    );
    expect(indexOrUniqueNames(financeWebhookSemanticCommitReceipts)).toEqual(
      expect.arrayContaining([
        "finance_webhook_semantic_commit_receipts_fact_unique",
        "finance_webhook_semantic_commit_receipts_boundary_unique"
      ])
    );
    expect(financeWebhookInboxIntegritySql).toContain("finance_issue_webhook_stored_receipt");
    expect(financeWebhookInboxIntegritySql).toContain(
      "finance_issue_webhook_semantic_commit_receipt"
    );
    expect(financeWebhookInboxIntegritySql).toContain("digest(new.canonical_preimage, 'sha256')");
  });
});

describe("distributed ArcPay rate budget", () => {
  it("isolates one exact provider identity with exact revision and fencing values", () => {
    expect(getTableName(financeArcPayRateBudgets)).toBe("finance_arc_pay_rate_budgets");
    expect(getTableName(financeArcPayRateBudgetHistory)).toBe(
      "finance_arc_pay_rate_budget_history"
    );
    expect(indexNames(financeArcPayRateBudgets)).toEqual(
      expect.arrayContaining([
        "finance_arc_pay_rate_budgets_exact_budget_unique",
        "finance_arc_pay_rate_budgets_next_eligible_idx"
      ])
    );
    expect(foreignKeyNames(financeArcPayRateBudgets)).toContain(
      "finance_arc_pay_rate_budgets_provider_identity_fk"
    );
    expect(getTableColumns(financeArcPayRateBudgets).availableTokens.getSQLType()).toBe(
      "numeric(38, 9)"
    );
    expect(getTableColumns(financeArcPayRateBudgets).revision.getSQLType()).toBe("numeric(38, 0)");
    expect(getTableColumns(financeArcPayRateBudgets).fence.getSQLType()).toBe("numeric(38, 0)");
  });

  it("uses an atomic DB-clock acquisition and a monotonic provider not-before update", () => {
    expect(financeArcPayRateBudgetIntegritySql).toContain("clock_timestamp()");
    expect(financeArcPayRateBudgetIntegritySql).toContain("for update");
    expect(financeArcPayRateBudgetIntegritySql).toContain("finance_take_arc_pay_rate_budget");
    expect(financeArcPayRateBudgetIntegritySql).toContain("finance_apply_arc_pay_rate_limit");
    expect(financeArcPayRateBudgetIntegritySql).toContain(
      "greatest(current_budget.not_before, p_provider_not_before)"
    );
    expect(financeArcPayRateBudgetIntegritySql).toContain("where series_id = p_series_id");
    expect(financeArcPayRateBudgetIntegritySql).toContain(
      "and provider_account_id = p_provider_account_id"
    );
    expect(financeArcPayRateBudgetIntegritySql).toContain(
      "and provider_identity_version = p_provider_identity_version"
    );
    for (const tableName of [
      "finance_arc_pay_rate_budgets",
      "finance_arc_pay_rate_budget_history"
    ]) {
      expect(financeArcPayRateBudgetIntegritySql).toContain(`before truncate on ${tableName}`);
    }
  });
});

describe("DB authority hardening", () => {
  it("keeps every owned PostgreSQL identifier within the 63-byte limit", () => {
    const tables = [
      financeEconomicPaymentIntents,
      financePlatformInvoicePaymentBindings,
      financeEconomicPaymentSourceHeads,
      financeEconomicPaymentIntentCreationReceipts,
      financeEconomicPaymentSessions,
      financePaymentTransitionFacts,
      financeCaptureFacts,
      financePaymentClearingHeads,
      financePaymentClearingHistory,
      financeProviderOperationIntents,
      financeProviderOperationSourceHeads,
      financeProviderDispatchArtifacts,
      financeProviderOperationIntentCreationReceipts,
      financeProviderOperationResults,
      financeProviderOperationResultCommitReceipts,
      financeWebhookInbox,
      financeWebhookStoredReceipts,
      financeWebhookProcessingHistory,
      financeProviderSemanticFacts,
      financeWebhookSemanticCommitReceipts,
      financeArcPayRateBudgets,
      financeArcPayRateBudgetHistory
    ];
    const metadataNames = tables.flatMap((table) => {
      const config = getTableConfig(table);
      return [
        getTableName(table),
        ...config.indexes.flatMap((candidate) =>
          candidate.config.name === undefined ? [] : [candidate.config.name]
        ),
        ...config.uniqueConstraints.flatMap((candidate) =>
          candidate.name === undefined ? [] : [candidate.name]
        ),
        ...config.foreignKeys.map((candidate) => candidate.getName()),
        ...config.checks.map((candidate) => candidate.name),
        ...config.primaryKeys.flatMap((candidate) =>
          candidate.getName() === undefined ? [] : [candidate.getName()]
        )
      ];
    });
    const ddlNames = [
      financeEconomicPaymentIntegritySql,
      financeProviderOperationIntegritySql,
      financeWebhookInboxIntegritySql,
      financeArcPayRateBudgetIntegritySql
    ].flatMap((ddl) =>
      [...ddl.matchAll(/create (?:or replace function|(?:constraint )?trigger) ([a-z0-9_]+)/g)]
        .map((match) => match[1])
        .filter((name): name is string => name !== undefined)
    );

    expect([...metadataNames, ...ddlNames].filter((name) => name.length > 63)).toEqual([]);
  });

  it("uses inline UNIQUE constraints for every composite FK target and receipt owner", () => {
    const expectedByTable = [
      [
        financeEconomicPaymentIntents,
        [
          "finance_economic_payment_intents_exact_identity_unique",
          "finance_economic_payment_intents_source_owner_unique",
          "finance_economic_payment_intents_creation_owner_unique"
        ]
      ],
      [
        financeEconomicPaymentSourceHeads,
        ["finance_economic_payment_source_heads_receipt_owner_unique"]
      ],
      [financeEconomicPaymentSessions, ["finance_economic_payment_sessions_exact_owner_unique"]],
      [financeCaptureFacts, ["finance_capture_facts_exact_receipt_owner_unique"]],
      [
        financeEconomicPaymentIntentCreationReceipts,
        ["finance_economic_intent_creation_receipts_intent_unique"]
      ],
      [
        financeProviderOperationIntents,
        [
          "finance_provider_operation_intents_predecessor_owner_unique",
          "finance_provider_operation_intents_exact_result_owner_unique",
          "finance_provider_operation_intents_receipt_owner_unique"
        ]
      ],
      [
        financeProviderDispatchArtifacts,
        ["finance_provider_dispatch_artifacts_receipt_owner_unique"]
      ],
      [
        financeProviderOperationResults,
        ["finance_provider_operation_results_receipt_owner_unique"]
      ],
      [
        financeProviderOperationIntentCreationReceipts,
        ["finance_provider_intent_creation_receipts_operation_unique"]
      ],
      [
        financeProviderOperationResultCommitReceipts,
        [
          "finance_provider_result_commit_receipts_result_unique",
          "finance_provider_result_receipts_capture_owner_unique"
        ]
      ],
      [
        financeWebhookInbox,
        [
          "finance_webhook_inbox_exact_owner_unique",
          "finance_webhook_inbox_receipt_owner_unique",
          "finance_webhook_inbox_terminal_receipt_owner_unique"
        ]
      ],
      [financeProviderSemanticFacts, ["finance_provider_semantic_facts_receipt_owner_unique"]],
      [financeWebhookStoredReceipts, ["finance_webhook_stored_receipts_inbox_unique"]],
      [
        financeWebhookSemanticCommitReceipts,
        ["finance_webhook_semantic_commit_receipts_fact_unique"]
      ],
      [financeArcPayRateBudgets, ["finance_arc_pay_rate_budgets_exact_owner_unique"]]
    ] as const;

    for (const [table, expectedNames] of expectedByTable) {
      expect(uniqueConstraintNames(table)).toEqual(expect.arrayContaining([...expectedNames]));
    }
  });

  it("pins every custom SQL function to a fixed search path", () => {
    for (const ddl of [
      financeEconomicPaymentIntegritySql,
      financeProviderOperationIntegritySql,
      financeWebhookInboxIntegritySql,
      financeArcPayRateBudgetIntegritySql
    ]) {
      expectEverySqlFunctionToPinSearchPath(ddl);
    }
  });

  it("overwrites caller-supplied persistence timestamps with the PostgreSQL clock", () => {
    expect(financeEconomicPaymentIntegritySql).toContain("new.created_at := clock_timestamp()");
    expect(financeEconomicPaymentIntegritySql).toContain("new.committed_at := clock_timestamp()");
    expect(financeProviderOperationIntegritySql).toContain("new.created_at := clock_timestamp()");
    expect(financeProviderOperationIntegritySql).toContain(
      "new.registered_at := clock_timestamp()"
    );
    expect(financeProviderOperationIntegritySql).toContain("new.committed_at := clock_timestamp()");
    expect(financeWebhookInboxIntegritySql).toContain("new.received_at := clock_timestamp()");
    expect(financeWebhookInboxIntegritySql).toContain("new.committed_at := clock_timestamp()");
    expect(financeArcPayRateBudgetIntegritySql).toContain("new.occurred_at := clock_timestamp()");
  });

  it("derives every receipt owner snapshot from authoritative rows before hashing", () => {
    expect(financeEconomicPaymentIntegritySql).toContain(
      "new.economic_payment_version := intent.version"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "new.dispatch_artifact_id := dispatch.artifact_id"
    );
    expect(financeProviderOperationIntegritySql).toContain(
      "new.result_committed_at := result_row.committed_at"
    );
    expect(financeWebhookInboxIntegritySql).toContain("new.received_at := inbox.received_at");
    expect(financeWebhookInboxIntegritySql).toContain(
      "new.semantic_fact_committed_at := semantic.committed_at"
    );
  });
});
