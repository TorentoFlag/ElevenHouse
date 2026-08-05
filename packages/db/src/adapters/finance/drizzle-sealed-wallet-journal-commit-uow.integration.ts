import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "../../connection";

/**
 * This suite deliberately consumes the real canonical baseline and never creates a reduced test
 * schema. Enable it only after the baseline owner has installed the normalized finance tables,
 * integrity triggers and deferred exact-provenance foreign keys in a fresh local integration DB.
 */
const canonicalBaselineReady = process.env.FINANCE_CANONICAL_BASELINE_READY === "1";
const describeWithCanonicalBaseline = canonicalBaselineReady ? describe.sequential : describe.skip;

describeWithCanonicalBaseline("sealed wallet/journal canonical-baseline integration gate", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({
      connectionString: requireCanonicalBaselineDatabaseUrl(process.env.INTEGRATION_DATABASE_URL)
    });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("requires the complete immutable wallet/journal surface and a zero launch wallet state", async () => {
    const requiredRelations = [
      "finance_provider_accounts",
      "finance_source_identities",
      "finance_journal_transactions",
      "finance_journal_entries",
      "finance_allocation_link_proofs",
      "finance_allocation_link_proof_entries",
      "finance_persistence_commit_receipts",
      "finance_wallet_heads",
      "finance_payable_lot_operation_receipts",
      "finance_payable_lots",
      "finance_payable_lot_operation_authority_bindings",
      "finance_payable_lot_operation_effects",
      "finance_payable_lot_operation_lineage",
      "finance_payable_lot_operation_component_slots",
      "finance_payable_lot_transitions",
      "finance_wallet_history",
      "finance_wallet_commit_bindings",
      "finance_refund_cases",
      "finance_refund_allocation_links"
    ];
    const relations = await pool.query<{ relation_name: string; relation: string | null }>(
      `select relation_name, to_regclass(relation_name) as relation
         from unnest($1::text[]) as required(relation_name)
        order by relation_name`,
      [requiredRelations]
    );
    expect(relations.rows).toHaveLength(requiredRelations.length);
    expect(relations.rows.every(({ relation }) => relation !== null)).toBe(true);

    const requiredTriggers = [
      "finance_wallet_heads_protected_mutation",
      "finance_payable_lot_operation_receipts_issue_time",
      "finance_wallet_history_issue_time",
      "finance_wallet_commit_bindings_00_issue_time",
      "finance_payable_lots_lineage_integrity",
      "finance_payable_lot_transition_integrity",
      "finance_payable_lot_operation_receipt_integrity",
      "finance_wallet_history_chain_integrity",
      "finance_wallet_commit_bindings_graph_integrity",
      "finance_wallet_head_history_integrity"
    ];
    const triggers = await pool.query<{ trigger_name: string }>(
      `select tgname as trigger_name
         from pg_trigger
        where not tgisinternal and tgname = any($1::text[])
        order by tgname`,
      [requiredTriggers]
    );
    expect(triggers.rows.map(({ trigger_name }) => trigger_name)).toEqual(
      [...requiredTriggers].sort()
    );

    const launchState = await pool.query<{
      wallet_count: string;
      lot_count: string;
      history_count: string;
      total_wallet_minor: string;
    }>(
      `select
         (select count(*)::text from finance_wallet_heads) as wallet_count,
         (select count(*)::text from finance_payable_lots) as lot_count,
         (select count(*)::text from finance_wallet_history) as history_count,
         (select coalesce(sum(
           pending_minor + available_minor + reserved_minor + payout_pending_minor
           + refund_pending_minor + recovery_receivable_minor
         ), 0)::text from finance_wallet_heads) as total_wallet_minor`
    );
    expect(launchState.rows).toEqual([
      {
        wallet_count: "0",
        lot_count: "0",
        history_count: "0",
        total_wallet_minor: "0"
      }
    ]);
  });
});

function requireCanonicalBaselineDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("INTEGRATION_DATABASE_URL is required when FINANCE_CANONICAL_BASELINE_READY=1");
  }
  return assertDevelopmentDatabaseUrl(
    value,
    process.env.NODE_ENV,
    "verify the sealed wallet/journal canonical baseline"
  );
}
