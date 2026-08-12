import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { clientLifecycleHistory, clientLifecycleStates } from "../index";

describe("client lifecycle schema", () => {
  it("keeps lifecycle separate from the access relationship and records every source decision", () => {
    expect(getTableName(clientLifecycleStates)).toBe("client_lifecycle_states");
    expect(Object.keys(getTableColumns(clientLifecycleStates))).toEqual(
      expect.arrayContaining([
        "relationshipId",
        "status",
        "mode",
        "latestAutomaticCandidateStatus",
        "revision",
        "lastActivityAt"
      ])
    );
    expect(getTableName(clientLifecycleHistory)).toBe("client_lifecycle_history");
    expect(Object.keys(getTableColumns(clientLifecycleHistory))).toEqual(
      expect.arrayContaining([
        "relationshipId",
        "sourceEventId",
        "causeKind",
        "beforeStatus",
        "afterStatus",
        "disposition",
        "occurredAt"
      ])
    );
    expect(getTableConfig(clientLifecycleHistory).indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining(["client_lifecycle_history_relationship_source_unique"])
    );
  });
});
