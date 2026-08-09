import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeReadinessEvidenceImmutabilitySql,
  financeReadinessEvidenceVersions
} from "./readiness-evidence.schema";

describe("finance readiness evidence schema", () => {
  it("keeps an immutable, versioned and scope-bound readiness authority", () => {
    expect(getTableName(financeReadinessEvidenceVersions)).toBe(
      "finance_readiness_evidence_versions"
    );
    expect(Object.keys(financeReadinessEvidenceVersions)).toEqual(
      expect.arrayContaining([
        "evidenceId",
        "evidenceVersion",
        "requirementCode",
        "transactionCategory",
        "scopeKey",
        "isCurrent",
        "status",
        "effectiveAt",
        "expiresAt",
        "safeDigest"
      ])
    );
    expect(Object.keys(financeReadinessEvidenceVersions)).not.toContain("environment");
    const config = getTableConfig(financeReadinessEvidenceVersions);
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "finance_readiness_evidence_current_scope_unique",
        "finance_readiness_evidence_current_lookup_idx"
      ])
    );
  });

  it("exposes append-only authority SQL instead of permitting in-place replacement", () => {
    const normalized = financeReadinessEvidenceImmutabilitySql.replaceAll(/\s+/g, " ").toLowerCase();
    expect(normalized).toContain("finance_readiness_evidence_versions_immutable");
    expect(normalized).toContain("finance_readiness_evidence_versions_no_truncate");
    expect(normalized).toContain("evidence version must start at one");
    expect(normalized).toContain("evidence version must advance by one");
  });
});
