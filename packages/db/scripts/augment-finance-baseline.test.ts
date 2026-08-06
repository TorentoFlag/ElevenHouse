import { describe, expect, it } from "vitest";

import {
  augmentOnlineWalletRefundCaseMigrationSource,
  augmentSavedCardDisclosureMigrationSource,
  financeIntegritySql
} from "./augment-finance-baseline";

describe("finance migration augmentation", () => {
  it("puts saved-card disclosure integrity after the migration that creates its table", () => {
    const source = [
      'CREATE TABLE "finance_saved_card_disclosure_versions" ("version" integer NOT NULL);',
      "--> statement-breakpoint",
      'CREATE INDEX "finance_saved_card_disclosure_versions_lookup_idx" ON "finance_saved_card_disclosure_versions" ("version");'
    ].join("\n");

    const augmented = augmentSavedCardDisclosureMigrationSource(source);

    expect(augmented).toContain("-- ElevenHouse saved-card disclosure integrity objects: begin");
    expect(augmented.indexOf("CREATE TABLE \"finance_saved_card_disclosure_versions\""))
      .toBeLessThan(augmented.indexOf("create trigger finance_saved_card_disclosure_versions_sealed_immutable"));
    expect(financeIntegritySql).not.toContain("finance_saved_card_disclosure_versions");
  });

  it("puts V2 refund-case triggers after the migration that creates the V2 aggregate", () => {
    const source = [
      'CREATE TABLE "finance_online_wallet_refund_cases" ("refund_case_id" varchar(200) PRIMARY KEY);',
      "--> statement-breakpoint",
      'CREATE TABLE "finance_online_wallet_refund_case_allocations" ("refund_case_id" varchar(200) NOT NULL);'
    ].join("\n");

    const augmented = augmentOnlineWalletRefundCaseMigrationSource(source);

    expect(augmented.indexOf('CREATE TABLE "finance_online_wallet_refund_cases"')).toBeLessThan(
      augmented.indexOf("create trigger finance_online_wallet_refund_cases_transition_guard")
    );
    expect(financeIntegritySql).not.toContain("finance_online_wallet_refund_cases_transition_guard");
  });

  it("includes tariff-invoice customer-action integrity in the managed finance block", () => {
    expect(financeIntegritySql).toContain(
      "finance_validate_platform_tariff_invoice_customer_action"
    );
    expect(financeIntegritySql).toContain(
      "finance_platform_tariff_invoice_customer_actions_no_truncate"
    );
    expect(financeIntegritySql).toContain(
      "response_artifact.artifact_class <> (case\n"
    );
    expect(financeIntegritySql).not.toContain(
      "response_artifact.artifact_class <> case\n"
    );
  });

  it("includes refund-candidate ownership and review-history integrity in the managed finance block", () => {
    expect(financeIntegritySql).toContain("finance_validate_refund_candidate_owner");
    expect(financeIntegritySql).toContain("finance_refund_candidate_reviews_immutable");
  });

  it("includes both capture-head and post-capture v2 wallet integrity in the managed finance block", () => {
    expect(financeIntegritySql).toContain("finance_online_wallet_heads_protected_mutation");
    expect(financeIntegritySql).toContain("finance_online_wallet_mutations_predecessor_guard");
    expect(financeIntegritySql).toContain("finance_online_payable_source_allocations_scope_guard");
    expect(financeIntegritySql).toContain(
      "finance_online_wallet_refund_applications_authority_guard"
    );
  });
});
