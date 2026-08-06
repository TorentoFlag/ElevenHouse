import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { existsSync, readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { auditLogEntries } from "./index";

const baselineMigrationFile = readCurrentMigrationSql();
const baselineSnapshotFile = "packages/db/drizzle/meta/0016_snapshot.json";

function tableCheckNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).checks.map((check) => check.name);
}

function tableIndexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.flatMap((index) =>
    index.config.name === undefined ? [] : [index.config.name]
  );
}

function tableForeignKeyNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).foreignKeys.map((key) => key.getName());
}

describe("Audit log persistence schema", () => {
  it("exports the durable audit log table with evidence fields", () => {
    expect(getTableName(auditLogEntries)).toBe("audit_log_entries");
    expect(Object.keys(getTableColumns(auditLogEntries))).toEqual(
      expect.arrayContaining([
        "actorUserId",
        "action",
        "targetType",
        "targetId",
        "occurredAt",
        "metadata"
      ])
    );
    expect(tableCheckNames(auditLogEntries)).toEqual(
      expect.arrayContaining([
        "audit_log_entries_action_check",
        "audit_log_entries_target_type_check",
        "audit_log_entries_target_id_check",
        "audit_log_entries_metadata_check"
      ])
    );
    expect(tableIndexNames(auditLogEntries)).toEqual(
      expect.arrayContaining([
        "audit_log_entries_actor_user_id_index",
        "audit_log_entries_action_index",
        "audit_log_entries_target_index",
        "audit_log_entries_occurred_at_index"
      ])
    );
    expect(tableForeignKeyNames(auditLogEntries)).toContain(
      "audit_log_entries_actor_user_id_users_id_fk"
    );
  });

  it("keeps audit log DDL in the single current baseline", () => {
    const migration = baselineMigrationFile;
    const snapshot = JSON.parse(readFileSync(baselineSnapshotFile, "utf8")) as {
      tables: Record<string, unknown>;
    };

    expect(migration).toContain('CREATE TABLE "audit_log_entries"');
    expect(migration).toContain(
      'CONSTRAINT "audit_log_entries_metadata_check" CHECK (jsonb_typeof("audit_log_entries"."metadata") = \'object\')'
    );
    expect(migration).toContain(
      'CREATE INDEX "audit_log_entries_target_index" ON "audit_log_entries" USING btree ("target_type","target_id")'
    );
    expect(snapshot.tables["public.audit_log_entries"]).toBeDefined();
    expect(existsSync("packages/db/drizzle/0001_sticky_rictor.sql")).toBe(false);
  });
});
