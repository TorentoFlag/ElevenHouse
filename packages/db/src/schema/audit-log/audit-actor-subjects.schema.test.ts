import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { auditActorSubjectIntegritySql, auditActorSubjects } from "../index";

describe("Audit actor subjects schema", () => {
  it("separates immutable audit identity from its erasable account mapping", () => {
    expect(getTableName(auditActorSubjects)).toBe("audit_actor_subjects");
    expect(Object.keys(getTableColumns(auditActorSubjects))).toEqual(
      expect.arrayContaining([
        "actorSubjectId",
        "kind",
        "userId",
        "serviceKey",
        "state",
        "createdAt",
        "erasedAt"
      ])
    );
    const config = getTableConfig(auditActorSubjects);
    expect(config.indexes.map((candidate) => candidate.config.name)).toEqual(
      expect.arrayContaining([
        "audit_actor_subjects_user_unique",
        "audit_actor_subjects_service_unique",
        "audit_actor_subjects_state_created_idx"
      ])
    );
    expect(auditActorSubjectIntegritySql).toContain("active audit actor subject mapping is immutable");
    expect(auditActorSubjectIntegritySql).toContain("new.state := 'erased'");
    expect(auditActorSubjectIntegritySql).toContain("audit_actor_subjects_reject_truncate");
  });
});
