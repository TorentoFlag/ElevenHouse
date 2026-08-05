import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { flowRuntimeOwnerSubjectIntegritySql, flowRuntimeOwnerSubjects } from "../index";

describe("Flow runtime owner subjects schema", () => {
  it("keeps a stable purpose-specific subject while allowing one-way account erasure", () => {
    expect(getTableName(flowRuntimeOwnerSubjects)).toBe("flow_runtime_owner_subjects");
    expect(Object.keys(getTableColumns(flowRuntimeOwnerSubjects))).toEqual(
      expect.arrayContaining([
        "ownerSubjectId",
        "ownerUserId",
        "state",
        "createdAt",
        "erasedAt"
      ])
    );
    expect(
      getTableConfig(flowRuntimeOwnerSubjects).indexes.map((candidate) => candidate.config.name)
    ).toEqual(
      expect.arrayContaining([
        "flow_runtime_owner_subjects_user_unique",
        "flow_runtime_owner_subjects_state_created_idx"
      ])
    );
    expect(flowRuntimeOwnerSubjectIntegritySql).toContain("flow runtime owner subject mapping is immutable");
    expect(flowRuntimeOwnerSubjectIntegritySql).toContain("new.state := 'erased'");
    expect(flowRuntimeOwnerSubjectIntegritySql).toContain("flow_runtime_owner_subjects_reject_truncate");
  });
});
