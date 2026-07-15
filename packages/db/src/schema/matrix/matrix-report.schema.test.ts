import { readFileSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { matrixReportDrafts } from "../index";

const migrationFile = "packages/db/drizzle/0000_sticky_rictor.sql";

describe("Matrix report persistence schema", () => {
  it("exports a single revisioned checksum-bound report per owned calculation", () => {
    expect(Object.keys(getTableColumns(matrixReportDrafts))).toEqual([
      "id",
      "calculationId",
      "ownerUserId",
      "source",
      "status",
      "locale",
      "content",
      "plainText",
      "resultChecksum",
      "revision",
      "modelId",
      "promptVersion",
      "createdAt",
      "updatedAt"
    ]);
    const config = getTableConfig(matrixReportDrafts);
    expect(config.foreignKeys.map((key) => key.getName())).toContain(
      "matrix_report_drafts_calculation_owner_fk"
    );
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "matrix_report_drafts_calculation_unique"
    );
    expect(config.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "matrix_report_drafts_source_check",
        "matrix_report_drafts_status_check",
        "matrix_report_drafts_locale_check",
        "matrix_report_drafts_content_object_check",
        "matrix_report_drafts_result_checksum_check",
        "matrix_report_drafts_revision_check"
      ])
    );
  });

  it("keeps report ownership constraints and no Matrix-owned PDF table in the baseline", () => {
    const migration = readFileSync(migrationFile, "utf8");
    expect(migration).toContain('CREATE TABLE "matrix_report_drafts"');
    expect(migration).toContain("matrix_report_drafts_calculation_owner_fk");
  });
});
