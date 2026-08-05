import { getTableColumns, getTableName, type SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeOrderEconomicsSnapshots,
  financePaidProductFulfillmentDecisions,
  financeRiskPolicyVersions
} from "./capture-authorities.schema";
import * as captureAuthoritySchemaModule from "./capture-authorities.schema";
import { financePayableLots, financeWalletCommitBindings } from "./wallet.schema";

describe("immutable finance capture authority owners", () => {
  it("binds every payable lot to exact capture, economics, risk and fulfillment owners", () => {
    const foreignKeys = getTableConfig(financePayableLots).foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      return {
        name: foreignKey.getName(),
        sourceColumns: reference.columns.map((column) => column.name),
        targetTable: getTableName(reference.foreignTable),
        targetColumns: reference.foreignColumns.map((column) => column.name),
        onDelete: foreignKey.onDelete
      };
    });

    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        {
          name: "finance_payable_lots_capture_fact_fk",
          sourceColumns: [
            "canonical_capture_evidence_id",
            "capture_intent_id",
            "capture_session_id",
            "provider_account_series_id",
            "provider_account_id",
            "provider_identity_version",
            "provider_payment_id",
            "capture_amount_minor",
            "capture_currency",
            "capture_evidence_authority_kind",
            "capture_evidence_authority_id",
            "capture_evidence_artifact_id",
            "capture_evidence_artifact_digest"
          ],
          targetTable: "finance_capture_facts",
          targetColumns: [
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
          ],
          onDelete: "restrict"
        },
        {
          name: "finance_payable_lots_economics_snapshot_fk",
          sourceColumns: ["original_sale_id", "economics_snapshot_digest"],
          targetTable: "finance_order_economics_snapshots",
          targetColumns: ["order_id", "canonical_digest"],
          onDelete: "restrict"
        },
        {
          name: "finance_payable_lots_risk_policy_fk",
          sourceColumns: ["risk_policy_id", "risk_policy_version", "risk_policy_digest"],
          targetTable: "finance_risk_policy_versions",
          targetColumns: ["policy_id", "policy_version", "canonical_digest"],
          onDelete: "restrict"
        },
        {
          name: "finance_payable_lots_fulfillment_decision_fk",
          sourceColumns: [
            "fulfillment_decision_id",
            "fulfillment_decision_version",
            "fulfillment_decision_digest"
          ],
          targetTable: "finance_paid_product_fulfillment_decisions",
          targetColumns: ["registry_key", "registry_revision", "canonical_digest"],
          onDelete: "restrict"
        }
      ])
    );
  });

  it("stores every scalar of the immutable order economics snapshot", () => {
    expect(getTableName(financeOrderEconomicsSnapshots)).toBe("finance_order_economics_snapshots");
    expect(Object.keys(getTableColumns(financeOrderEconomicsSnapshots))).toEqual([
      "orderId",
      "astrologerUserId",
      "planId",
      "planVersionId",
      "grossAmountMinor",
      "grossCurrency",
      "commissionAmountMinor",
      "commissionCurrency",
      "payableAmountMinor",
      "payableCurrency",
      "commissionBps",
      "allocationRevision",
      "canonicalPreimage",
      "canonicalDigest",
      "persistedAt"
    ]);
    for (const column of [
      financeOrderEconomicsSnapshots.grossAmountMinor,
      financeOrderEconomicsSnapshots.commissionAmountMinor,
      financeOrderEconomicsSnapshots.payableAmountMinor
    ]) {
      expect(column.dataType).toBe("string");
      expect(column.getSQLType()).toBe("numeric(38, 0)");
      expect(column.hasDefault).toBe(false);
    }
    expect(financeOrderEconomicsSnapshots.canonicalPreimage.hasDefault).toBe(true);
    expect(financeOrderEconomicsSnapshots.canonicalDigest.hasDefault).toBe(true);
    expect(financeOrderEconomicsSnapshots.persistedAt.hasDefault).toBe(true);
    expect(checkNames(financeOrderEconomicsSnapshots)).toEqual(
      expect.arrayContaining([
        "finance_order_economics_snapshots_identifier_check",
        "finance_order_economics_snapshots_money_check",
        "finance_order_economics_snapshots_allocation_check",
        "finance_order_economics_snapshots_digest_check"
      ])
    );
  });

  it("stores every scalar of a versioned risk policy snapshot", () => {
    expect(getTableName(financeRiskPolicyVersions)).toBe("finance_risk_policy_versions");
    expect(Object.keys(getTableColumns(financeRiskPolicyVersions))).toEqual([
      "policyId",
      "policyVersion",
      "effectiveRiskTier",
      "holdAnchor",
      "holdDurationHours",
      "reserveBps",
      "reserveReleaseDelayDays",
      "providerSettlementRequired",
      "payoutMinimumAmountMinor",
      "payoutMinimumCurrency",
      "exceptionAuthorityId",
      "exceptionAuthorityVersion",
      "effectiveAt",
      "canonicalPreimage",
      "canonicalDigest",
      "persistedAt"
    ]);
    expect(financeRiskPolicyVersions.policyVersion.getSQLType()).toBe("numeric(38, 0)");
    expect(financeRiskPolicyVersions.payoutMinimumAmountMinor.getSQLType()).toBe("numeric(38, 0)");
    expect(financeRiskPolicyVersions.payoutMinimumAmountMinor.hasDefault).toBe(false);
    expect(financeRiskPolicyVersions.canonicalPreimage.hasDefault).toBe(true);
    expect(financeRiskPolicyVersions.canonicalDigest.hasDefault).toBe(true);
    expect(financeRiskPolicyVersions.persistedAt.hasDefault).toBe(true);
    expect(checkNames(financeRiskPolicyVersions)).toEqual(
      expect.arrayContaining([
        "finance_risk_policy_versions_identifier_check",
        "finance_risk_policy_versions_shape_check",
        "finance_risk_policy_versions_exception_authority_check",
        "finance_risk_policy_versions_digest_check"
      ])
    );
  });

  it("stores every scalar of a supported paid-product fulfillment decision", () => {
    expect(getTableName(financePaidProductFulfillmentDecisions)).toBe(
      "finance_paid_product_fulfillment_decisions"
    );
    expect(Object.keys(getTableColumns(financePaidProductFulfillmentDecisions))).toEqual([
      "supported",
      "registryKey",
      "registryRevision",
      "holdAnchor",
      "terminalEvidenceOwner",
      "terminalEvidenceStatus",
      "terminalEvidenceContractVersion",
      "cancellationAllocatorOwner",
      "cancellationAllocatorPort",
      "cancellationAllocatorPolicyVersion",
      "canonicalPreimage",
      "canonicalDigest",
      "persistedAt"
    ]);
    expect(financePaidProductFulfillmentDecisions.registryRevision.getSQLType()).toBe(
      "numeric(38, 0)"
    );
    expect(financePaidProductFulfillmentDecisions.canonicalPreimage.hasDefault).toBe(true);
    expect(financePaidProductFulfillmentDecisions.canonicalDigest.hasDefault).toBe(true);
    expect(financePaidProductFulfillmentDecisions.persistedAt.hasDefault).toBe(true);
    expect(checkNames(financePaidProductFulfillmentDecisions)).toEqual(
      expect.arrayContaining([
        "finance_paid_product_fulfillment_identifier_check",
        "finance_paid_product_fulfillment_supported_shape_check",
        "finance_paid_product_fulfillment_digest_check"
      ])
    );
  });

  it("exposes one exact wallet commit-receipt projection tuple", () => {
    const receiptProjection = getTableConfig(financeWalletCommitBindings).uniqueConstraints.find(
      (constraint) =>
        constraint.name === "finance_wallet_commit_bindings_exact_receipt_projection_unique"
    );

    expect(receiptProjection?.columns.map((column) => column.name)).toEqual([
      "commit_receipt_id",
      "operation_id",
      "next_wallet_id",
      "next_wallet_revision",
      "commit_receipt_canonical_digest"
    ]);

    expect(financeWalletCommitBindings.commitReceiptId.hasDefault).toBe(true);
    expect(
      new PgDialect().sqlToQuery(financeWalletCommitBindings.commitReceiptId.default as SQL).sql
    ).toBe("gen_random_uuid()::text");
  });

  it("makes every capture authority owner append-only at the PostgreSQL boundary", () => {
    const sqlManifest = Reflect.get(
      captureAuthoritySchemaModule,
      "financeCaptureAuthoritiesIntegritySql"
    );

    expect(sqlManifest).toBeTypeOf("string");
    const normalized = String(sqlManifest).replaceAll(/\s+/g, " ").toLowerCase();
    for (const tableName of [
      "finance_order_economics_snapshots",
      "finance_risk_policy_versions",
      "finance_paid_product_fulfillment_decisions"
    ]) {
      expect(normalized).toContain(`before update or delete on ${tableName}`);
      expect(normalized).toContain(`before truncate on ${tableName}`);
    }
    expect(normalized).toContain("set search_path = pg_catalog, public");
    expect(normalized).toContain("finance_canonical_jsonb_v1");
    expect(normalized).toContain("clock_timestamp()");
    expect(normalized).toContain("canonical snapshot digest does not match scalar fields");
  });
});

function checkNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).checks.map((check) => check.name);
}
