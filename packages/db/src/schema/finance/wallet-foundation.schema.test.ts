import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financePayableLotOperationAuthorityBindings,
  financePayableLotOperationComponentSlots,
  financePayableLotOperationEffects,
  financePayableLotOperationLineage,
  financePayableLotOperationReceipts,
  financePayableLots,
  financePayableLotTransitions,
  financeWalletCommitBindings,
  financeWalletDeferredForeignKeys,
  financeWalletHeads,
  financeWalletHistory,
  financeWalletLotCommitmentChain,
  financeWalletLotStateSnapshots,
  financeWalletIntegritySql
} from "./wallet.schema";

describe("normalized finance wallet and source-lot schema", () => {
  it("keeps one versioned RUB head per astrologer without a seeded or mutable balance bag", () => {
    expect(getTableName(financeWalletHeads)).toBe("finance_wallet_heads");
    expect(Object.keys(getTableColumns(financeWalletHeads))).toEqual([
      "id",
      "astrologerUserId",
      "currency",
      "revision",
      "mutationSequence",
      "pendingMinor",
      "availableMinor",
      "reservedMinor",
      "payoutPendingMinor",
      "refundPendingMinor",
      "recoveryReceivableMinor",
      "lotStateVersion",
      "lotStateDigest",
      "snapshotDigest",
      "lastOperationId",
      "lastCommitBindingId",
      "updatedAt"
    ]);

    const config = getTableConfig(financeWalletHeads);
    expect(config.uniqueConstraints.map((candidate) => candidate.name)).toContain(
      "finance_wallet_heads_owner_currency_unique"
    );
    expect(config.checks.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_wallet_heads_currency_check",
        "finance_wallet_heads_revision_check",
        "finance_wallet_heads_balance_check",
        "finance_wallet_heads_digest_check",
        "finance_wallet_heads_identifier_check"
      ])
    );
    for (const column of [
      financeWalletHeads.revision,
      financeWalletHeads.mutationSequence,
      financeWalletHeads.pendingMinor,
      financeWalletHeads.availableMinor,
      financeWalletHeads.reservedMinor,
      financeWalletHeads.payoutPendingMinor,
      financeWalletHeads.refundPendingMinor,
      financeWalletHeads.recoveryReceivableMinor,
      financeWalletHeads.lotStateVersion
    ]) {
      expect(column.dataType).toBe("string");
      expect(column.getSQLType()).toBe("numeric(38, 0)");
    }
  });

  it("stores immutable source lots and globally exclusive normalized consumption edges", () => {
    expect(getTableName(financePayableLots)).toBe("finance_payable_lots");
    expect(financePayableLots.amountMinor.dataType).toBe("string");
    expect(financePayableLots.amountMinor.getSQLType()).toBe("numeric(38, 0)");
    expect(financePayableLots.createdEffectId.notNull).toBe(false);
    expect(financePayableLots.componentSlotId.notNull).toBe(false);

    const lotConfig = getTableConfig(financePayableLots);
    expect(lotConfig.foreignKeys.map((candidate) => candidate.getName())).toEqual(
      expect.arrayContaining([
        "finance_payable_lots_wallet_fk",
        "finance_payable_lots_parent_fk",
        "finance_payable_lots_root_fk",
        "finance_payable_lots_provider_identity_fk",
        "finance_payable_lots_operation_receipt_fk",
        "finance_payable_lots_capture_fact_fk",
        "finance_payable_lots_economics_snapshot_fk",
        "finance_payable_lots_risk_policy_fk",
        "finance_payable_lots_fulfillment_decision_fk"
      ])
    );
    expect(lotConfig.checks.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_payable_lots_amount_check",
        "finance_payable_lots_lineage_shape_check",
        "finance_payable_lots_creation_effect_shape_check",
        "finance_payable_lots_time_check",
        "finance_payable_lots_identifier_check"
      ])
    );
    expect(lotConfig.indexes.map((candidate) => candidate.config.name)).toEqual(
      expect.arrayContaining([
        "finance_payable_lots_creation_effect_unique",
        "finance_payable_lots_component_slot_unique"
      ])
    );

    expect(getTableName(financePayableLotTransitions)).toBe("finance_payable_lot_transitions");
    const transitionIndexes = getTableConfig(financePayableLotTransitions).indexes.map(
      (candidate) => candidate.config.name
    );
    expect(transitionIndexes).toEqual(
      expect.arrayContaining([
        "finance_payable_lot_transitions_one_creation_unique",
        "finance_payable_lot_transitions_one_consumption_unique",
        "finance_payable_lot_transitions_spendable_history_idx"
      ])
    );
  });

  it("normalizes receipt authority, effects, lineage and required component slots", () => {
    expect(getTableName(financePayableLotOperationReceipts)).toBe(
      "finance_payable_lot_operation_receipts"
    );
    expect(getTableName(financePayableLotOperationAuthorityBindings)).toBe(
      "finance_payable_lot_operation_authority_bindings"
    );
    expect(getTableName(financePayableLotOperationEffects)).toBe(
      "finance_payable_lot_operation_effects"
    );
    expect(getTableName(financePayableLotOperationLineage)).toBe(
      "finance_payable_lot_operation_lineage"
    );
    expect(getTableName(financePayableLotOperationComponentSlots)).toBe(
      "finance_payable_lot_operation_component_slots"
    );

    const receiptConfig = getTableConfig(financePayableLotOperationReceipts);
    expect(receiptConfig.uniqueConstraints.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_payable_lot_operation_receipts_operation_unique",
        "finance_payable_lot_operation_receipts_source_unique"
      ])
    );
    expect(receiptConfig.checks.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_payable_lot_operation_receipts_revision_check",
        "finance_payable_lot_operation_receipts_digest_check",
        "finance_payable_lot_operation_receipts_verified_check",
        "finance_payable_lot_operation_receipts_count_check"
      ])
    );

    const effectIndexes = getTableConfig(financePayableLotOperationEffects).indexes.map(
      (candidate) => candidate.config.name
    );
    expect(effectIndexes).toEqual(
      expect.arrayContaining([
        "finance_payable_lot_operation_effects_allocation_unique",
        "finance_payable_lot_operation_effects_component_slot_unique"
      ])
    );
  });

  it("binds exactly one wallet revision to one sealed journal graph and opaque receipt", () => {
    expect(getTableName(financeWalletHistory)).toBe("finance_wallet_history");
    expect(getTableName(financeWalletCommitBindings)).toBe("finance_wallet_commit_bindings");
    expect(getTableColumns(financeWalletCommitBindings)).toHaveProperty(
      "commitReceiptCanonicalPreimage"
    );

    const historyConfig = getTableConfig(financeWalletHistory);
    expect(historyConfig.uniqueConstraints.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_wallet_history_wallet_revision_unique",
        "finance_wallet_history_operation_unique",
        "finance_wallet_history_receipt_unique"
      ])
    );
    const bindingConfig = getTableConfig(financeWalletCommitBindings);
    expect(bindingConfig.foreignKeys.map((candidate) => candidate.getName())).toEqual(
      expect.arrayContaining([
        "finance_wallet_commit_bindings_history_fk",
        "finance_wallet_commit_bindings_journal_fk",
        "finance_wallet_commit_bindings_proof_fk",
        "finance_wallet_commit_bindings_lot_receipt_fk"
      ])
    );
    expect(bindingConfig.uniqueConstraints.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_wallet_commit_bindings_operation_unique",
        "finance_wallet_commit_bindings_receipt_unique",
        "finance_wallet_commit_bindings_boundary_unique"
      ])
    );
  });

  it("retains one immutable lot-state checkpoint for every committed wallet revision", () => {
    expect(getTableName(financeWalletLotStateSnapshots)).toBe("finance_wallet_lot_state_snapshots");
    expect(getTableColumns(financeWalletLotStateSnapshots)).toEqual(
      expect.objectContaining({
        walletId: expect.anything(),
        walletRevision: expect.anything(),
        lotStateVersion: expect.anything(),
        lotStateDigest: expect.anything(),
        walletHistoryId: expect.anything(),
        operationReceiptId: expect.anything(),
        commitBindingId: expect.anything(),
        commitReceiptId: expect.anything()
      })
    );
    const snapshotConfig = getTableConfig(financeWalletLotStateSnapshots);
    expect(snapshotConfig.uniqueConstraints.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_wallet_lot_state_snapshots_wallet_revision_unique",
        "finance_wallet_lot_state_snapshots_history_unique",
        "finance_wallet_lot_state_snapshots_receipt_unique",
        "finance_wallet_lot_state_snapshots_binding_unique"
      ])
    );
    expect(snapshotConfig.foreignKeys.map((candidate) => candidate.getName())).toEqual(
      expect.arrayContaining([
        "finance_wallet_lot_state_snapshots_history_fk",
        "finance_wallet_lot_state_snapshots_receipt_fk",
        "finance_wallet_lot_state_snapshots_binding_fk"
      ])
    );

    const normalized = financeWalletIntegritySql.replaceAll(/\s+/g, " ").toLowerCase();
    expect(normalized).toContain("finance_assert_wallet_history_snapshot");
    expect(normalized).toContain("finance_wallet_history_snapshot_integrity");
    expect(normalized).toContain("finance_wallet_lot_state_snapshots_immutable");
  });

  it("issues an append-only online commitment chain without substituting the offline state digest", () => {
    expect(getTableName(financeWalletLotCommitmentChain)).toBe(
      "finance_wallet_lot_commitment_chain"
    );
    expect(getTableColumns(financeWalletLotCommitmentChain)).toEqual(
      expect.objectContaining({
        walletId: expect.anything(),
        walletRevision: expect.anything(),
        previousCommitmentDigest: expect.anything(),
        commitmentDigest: expect.anything(),
        operationReceiptId: expect.anything(),
        operationReceiptDigest: expect.anything(),
        commitBindingId: expect.anything()
      })
    );
    const chainConfig = getTableConfig(financeWalletLotCommitmentChain);
    expect(chainConfig.uniqueConstraints.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_wallet_lot_commitment_chain_wallet_revision_unique",
        "finance_wallet_lot_commitment_chain_receipt_unique",
        "finance_wallet_lot_commitment_chain_binding_unique"
      ])
    );

    const normalized = financeWalletIntegritySql.replaceAll(/\s+/g, " ").toLowerCase();
    expect(normalized).toContain("finance_issue_wallet_lot_commitment");
    expect(normalized).toContain("finance_assert_wallet_lot_commitment_predecessor");
    expect(normalized).toContain("finance_wallet_lot_commitment_chain_immutable");
    expect(normalized).toContain("operation_receipt_digest");
    expect(normalized).not.toContain("commitment_digest <> new.lot_state_digest");
  });

  it("defers only the unresolved normalized component-registry owner", () => {
    expect(financeWalletDeferredForeignKeys).toEqual([
      {
        sourceTable: "finance_payable_lot_operation_component_slots",
        sourceColumns: ["resolved_component_id"],
        targetTable: "finance_component_registry",
        targetColumns: ["component_id"]
      }
    ]);
  });

  it("installs DB-authoritative CAS, active-lot balance and append-only guards", () => {
    const normalized = financeWalletIntegritySql.replaceAll(/\s+/g, " ").toLowerCase();

    expect(normalized).toContain("wallet head must start at revision one");
    expect(normalized).toContain("new.lot_state_version <> 2");
    expect(normalized).toContain("new.previous_lot_state_version <> 1");
    expect(normalized).toContain("first wallet mutation must be a payable sale capture");
    expect(normalized).toContain("wallet head revision and mutation sequence must advance by one");
    expect(normalized).toContain("select * into strict current_head");
    expect(normalized).toContain("wallet head must exactly match its committed history revision");
    expect(normalized).toContain(
      "wallet history chain does not match its prior committed revision"
    );
    expect(normalized).toContain("wallet payable buckets must equal active normalized lots");
    expect(normalized).toContain("payable lot lineage must resolve to one bounded root tree");
    expect(normalized).toContain(
      "payable lot child does not preserve immutable capture provenance"
    );
    expect(normalized).toContain("payable lot must have exactly one creation edge");
    expect(normalized).toContain("structural remainder must consume its same-bucket parent");
    expect(normalized).toContain("payable lot creation effect is missing or cross-wired");
    expect(normalized).toContain("payable lot consumption is globally exclusive");
    expect(normalized).toContain("payable lot component slot is missing or cross-wired");
    expect(normalized).toContain("wallet commit binding graph is incomplete or cross-wired");
    expect(normalized).toContain("wallet commit receipt digest is database-issued");
    expect(normalized).toContain("wallet journal proof does not exactly cover payable lot effects");
    expect(normalized).toContain("before update or delete on finance_payable_lots");
    expect(normalized).toContain("before update or delete on finance_wallet_history");
    expect(normalized).toContain("before truncate on finance_wallet_heads");
    expect(normalized).toContain("clock_timestamp()");
    expect(
      normalized.match(/set search_path = pg_catalog, public/g)?.length
    ).toBeGreaterThanOrEqual(9);
  });
});
