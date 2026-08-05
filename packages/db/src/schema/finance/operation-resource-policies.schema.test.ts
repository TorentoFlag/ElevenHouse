import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  financeOperationResourcePolicyIntegritySql,
  financeOperationResourcePolicyKindValues,
  financeOperationResourcePolicyLifecycleValues,
  financeOperationResourcePolicyVersions
} from "./operation-resource-policies.schema";

describe("finance operation resource policy schema", () => {
  it("persists immutable, operation-specific envelopes without a hidden default", () => {
    expect(getTableName(financeOperationResourcePolicyVersions)).toBe(
      "finance_operation_resource_policy_versions"
    );
    expect(financeOperationResourcePolicyLifecycleValues).toEqual([
      "draft",
      "published",
      "retired"
    ]);
    expect(financeOperationResourcePolicyKindValues).toContain("client_checkout_prepare");
    expect(financeOperationResourcePolicyKindValues).toContain("client_order_capture");
    expect(Object.keys(getTableColumns(financeOperationResourcePolicyVersions))).toEqual(
      expect.arrayContaining([
        "policyId",
        "version",
        "operationKind",
        "draftRevision",
        "maximumRows",
        "maximumDecimalDigits",
        "maximumArtifactBytes",
        "canonicalPreimage",
        "canonicalDigest"
      ])
    );
    expect(
      getTableColumns(financeOperationResourcePolicyVersions).maximumArtifactBytes.default
    ).toBeUndefined();
    expect(
      getTableConfig(financeOperationResourcePolicyVersions).indexes.map((item) => item.config.name)
    ).toEqual(
      expect.arrayContaining([
        "finance_operation_resource_policy_one_published_operation_unique",
        "finance_operation_resource_policy_lookup_idx"
      ])
    );
    expect(financeOperationResourcePolicyIntegritySql).toContain(
      "finance_operation_resource_policy_versions_sealed_immutable"
    );
  });
});
