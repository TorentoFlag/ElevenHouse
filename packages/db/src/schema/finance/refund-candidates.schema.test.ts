import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeRefundCandidateIntegritySql,
  financeRefundCandidateReviews,
  financeRefundCandidates,
  financeRefundCandidateStatusValues
} from "./refund-candidates.schema";

describe("refund candidate schema", () => {
  it("keeps the non-monetary client dispute aggregate separate from refund execution", () => {
    expect(getTableName(financeRefundCandidates)).toBe("finance_refund_candidates");
    expect(financeRefundCandidateStatusValues).toEqual([
      "submitted",
      "under_review",
      "rejected",
      "resolved"
    ]);
    expect(Object.keys(getTableColumns(financeRefundCandidates))).toEqual(
      expect.arrayContaining([
        "id",
        "orderId",
        "clientUserId",
        "statement",
        "status",
        "version",
        "resolvedRefundCaseId"
      ])
    );
    expect(getTableName(financeRefundCandidateReviews)).toBe("finance_refund_candidate_reviews");
  });

  it("enforces one open candidate per order/client and immutable review facts", () => {
    const candidates = getTableConfig(financeRefundCandidates);
    const reviews = getTableConfig(financeRefundCandidateReviews);
    expect(candidates.indexes.map((index) => index.config.name)).toContain(
      "finance_refund_candidates_one_open_order_unique"
    );
    expect(candidates.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "finance_refund_candidates_statement_check",
        "finance_refund_candidates_resolution_shape_check"
      ])
    );
    expect(reviews.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "finance_refund_candidate_reviews_candidate_version_unique"
    );
  });

  it("guards ownership and prevents direct rewriting of review history in PostgreSQL", () => {
    expect(financeRefundCandidateIntegritySql).toContain(
      "finance_validate_refund_candidate_owner"
    );
    expect(financeRefundCandidateIntegritySql).toContain(
      "refund candidate client does not own the order"
    );
    expect(financeRefundCandidateIntegritySql).toContain(
      "finance_refund_candidate_reviews_immutable"
    );
    expect(financeRefundCandidateIntegritySql).toContain(
      "refund candidate reviews are append-only"
    );
  });
});
