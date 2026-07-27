import { readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { flowVersions, flows } from "../index";

const baselineMigrationFile = "packages/db/drizzle/0000_sticky_rictor.sql";

describe("Flows persistence schema", () => {
  it("exports flow draft and immutable version tables", () => {
    expect(getTableName(flows)).toBe("flows");
    expect(getTableName(flowVersions)).toBe("flow_versions");

    expect(Object.keys(getTableColumns(flows))).toEqual(
      expect.arrayContaining([
        "ownerUserId",
        "name",
        "status",
        "approvalMode",
        "draftGraph",
        "publishedVersionId",
        "publishedAt"
      ])
    );
    expect(Object.keys(getTableColumns(flowVersions))).toEqual(
      expect.arrayContaining([
        "flowId",
        "ownerUserId",
        "version",
        "approvalMode",
        "graph",
        "publishedAt"
      ])
    );
  });

  it("defines owner indexes, immutable version uniqueness and value checks", () => {
    const flowConfig = getTableConfig(flows);
    const versionConfig = getTableConfig(flowVersions);

    expect(flowConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining(["flows_owner_status_updated_idx", "flows_owner_name_idx"])
    );
    expect(versionConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "flow_versions_owner_published_idx",
        "flow_versions_flow_version_unique"
      ])
    );
    expect(flowConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "flows_status_check",
        "flows_approval_mode_check",
        "flows_draft_graph_object_check"
      ])
    );
    expect(versionConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "flow_versions_approval_mode_check",
        "flow_versions_positive_version_check",
        "flow_versions_graph_object_check"
      ])
    );
  });

  it("keeps Flows DDL in the single current baseline", () => {
    const migration = readFileSync(baselineMigrationFile, "utf8");

    expect(migration).toContain('CREATE TABLE "flows"');
    expect(migration).toContain('CREATE TABLE "flow_versions"');
    expect(migration).toContain("flows_status_check");
    expect(migration).toContain("flow_versions_flow_version_unique");
  });
});
