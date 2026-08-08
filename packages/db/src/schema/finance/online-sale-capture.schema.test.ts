import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeOnlineSaleCaptureAuthorityBindings,
  financeOnlineSaleCaptureApplications,
  financeOnlineSaleCaptureJournalProofs,
  financeOnlineSaleCaptureReceipts,
  financeOnlineSaleCaptureRootLots,
  financeOnlineSaleCaptureIntegritySql,
  financeOnlineWalletCommitments,
  financeOnlineWalletHeads
} from "./online-sale-capture.schema";

describe("online client-sale capture v2 persistence graph", () => {
  it("keeps its wallet revision and predecessor commitment independent from v1 full-state rows", () => {
    expect(getTableName(financeOnlineWalletHeads)).toBe("finance_online_wallet_heads");
    expect(getTableName(financeOnlineWalletCommitments)).toBe("finance_online_wallet_commitments");
    expect(getTableName(financeOnlineSaleCaptureReceipts)).toBe(
      "finance_online_sale_capture_receipts"
    );

    const receiptConfig = getTableConfig(financeOnlineSaleCaptureReceipts);
    expect(receiptConfig.uniqueConstraints.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_online_sale_capture_receipts_order_digest_unique",
        "finance_online_sale_capture_receipts_exact_wallet_owner_unique",
        "finance_online_sale_capture_receipts_exact_wallet_revision_unique"
      ])
    );
    expect(receiptConfig.foreignKeys.map((candidate) => candidate.getName())).toEqual(
      expect.arrayContaining(["finance_online_sale_capture_receipts_wallet_fk"])
    );
    expect(
      getTableConfig(financeOnlineWalletCommitments).foreignKeys.map((candidate) =>
        candidate.getName()
      )
    ).not.toEqual(expect.arrayContaining(["finance_online_wallet_commitments_previous_fk"]));
    expect(financeOnlineSaleCaptureIntegritySql).toContain(
      "finance_validate_online_wallet_commitment_predecessor"
    );
    expect(
      getTableConfig(financeOnlineWalletCommitments).uniqueConstraints.map(
        (candidate) => candidate.name
      )
    ).toEqual(
      expect.arrayContaining([
        "finance_online_wallet_commitments_predecessor_identity_unique",
        "finance_online_wallet_commitments_application_owner_unique"
      ])
    );
    expect(receiptConfig.checks.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_online_sale_capture_receipts_version_check",
        "finance_online_sale_capture_receipts_revision_check",
        "finance_online_sale_capture_receipts_predecessor_shape_check",
        "finance_online_sale_capture_receipts_digest_check"
      ])
    );
  });

  it("binds the root capture to the immutable capture, economics, risk and fulfillment authorities", () => {
    expect(getTableName(financeOnlineSaleCaptureAuthorityBindings)).toBe(
      "finance_online_sale_capture_authority_bindings"
    );
    expect(getTableName(financeOnlineSaleCaptureRootLots)).toBe(
      "finance_online_sale_capture_root_lots"
    );

    const authorityForeignKeys = getTableConfig(
      financeOnlineSaleCaptureAuthorityBindings
    ).foreignKeys.map((candidate) => candidate.getName());
    expect(authorityForeignKeys).toEqual(
      expect.arrayContaining([
        "finance_online_sale_capture_authority_receipt_order_fk",
        "finance_online_sale_capture_authority_capture_fact_fk",
        "finance_online_sale_capture_authority_economics_fk",
        "finance_online_sale_capture_authority_risk_fk",
        "finance_online_sale_capture_authority_fulfillment_fk"
      ])
    );

    const rootLotForeignKeys = getTableConfig(financeOnlineSaleCaptureRootLots).foreignKeys.map(
      (candidate) => candidate.getName()
    );
    expect(rootLotForeignKeys).toEqual(
      expect.arrayContaining([
        "finance_online_sale_capture_root_lots_receipt_fk",
        "finance_online_sale_capture_root_lots_authority_fk"
      ])
    );
  });

  it("has a separate one-to-one journal proof rather than a v1 allocation-link proof", () => {
    expect(getTableName(financeOnlineSaleCaptureJournalProofs)).toBe(
      "finance_online_sale_capture_journal_proofs"
    );
    const proofConfig = getTableConfig(financeOnlineSaleCaptureJournalProofs);
    expect(proofConfig.foreignKeys.map((candidate) => candidate.getName())).toEqual(
      expect.arrayContaining([
        "finance_online_sale_capture_journal_proofs_receipt_fk",
        "finance_online_sale_capture_journal_proofs_transaction_fk"
      ])
    );
    expect(proofConfig.checks.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_online_sale_capture_journal_proofs_version_check",
        "finance_online_sale_capture_journal_proofs_digest_check"
      ])
    );
  });

  it("binds the business application only to canonical semantic and v2 evidence, never v1 receipt tables", () => {
    expect(getTableName(financeOnlineSaleCaptureApplications)).toBe(
      "finance_online_sale_capture_applications"
    );
    const config = getTableConfig(financeOnlineSaleCaptureApplications);
    expect(config.foreignKeys.map((candidate) => candidate.getName())).toEqual(
      expect.arrayContaining([
        "finance_online_sale_capture_applications_semantic_receipt_fk",
        "finance_online_sale_capture_applications_semantic_fact_fk",
        "finance_online_sale_capture_applications_capture_fact_fk",
        "finance_online_sale_capture_applications_clearing_fk",
        "finance_online_sale_capture_applications_receipt_fk",
        "finance_online_sale_capture_applications_receipt_capture_fk",
        "finance_online_sale_capture_applications_journal_proof_fk",
        "finance_online_sale_capture_applications_commitment_fk"
      ])
    );
    expect(config.foreignKeys.map((candidate) => candidate.getName())).not.toEqual(
      expect.arrayContaining([
        "finance_verified_capture_receipts_journal_commit_fk",
        "finance_verified_capture_receipts_wallet_commit_fk"
      ])
    );
    expect(config.checks.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "finance_online_sale_capture_applications_shape_check",
        "finance_online_sale_capture_applications_identifier_check"
      ])
    );
  });
});
