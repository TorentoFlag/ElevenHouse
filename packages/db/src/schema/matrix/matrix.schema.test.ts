import { readFileSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { calculationRecords, matrixNotes } from "../index";

const migrationFile = "packages/db/drizzle/0000_sticky_rictor.sql";

describe("Matrix private note persistence schema", () => {
  it("exports the checksum-bound private note columns", () => {
    expect(Object.keys(getTableColumns(matrixNotes))).toEqual([
      "id",
      "calculationId",
      "ownerUserId",
      "text",
      "resultChecksum",
      "createdAt",
      "updatedAt"
    ]);
  });

  it("binds notes to the owned calculation identity and indexes its timeline", () => {
    const noteConfig = getTableConfig(matrixNotes);
    const calculationConfig = getTableConfig(calculationRecords);

    expect(noteConfig.foreignKeys.map((key) => key.getName())).toContain(
      "matrix_notes_calculation_owner_fk"
    );
    expect(noteConfig.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "matrix_notes_text_length_check",
        "matrix_notes_result_checksum_check"
      ])
    );
    expect(noteConfig.indexes.map((index) => index.config.name)).toContain(
      "matrix_notes_owner_calculation_created_id_idx"
    );
    expect(calculationConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "calculation_records_id_owner_unique"
    );
  });

  it("keeps the ownership boundary in the checked-in baseline migration", () => {
    const migration = readFileSync(migrationFile, "utf8");

    expect(migration).toContain('CREATE TABLE "matrix_notes"');
    expect(migration).toContain("matrix_notes_calculation_owner_fk");
    expect(migration).toContain("matrix_notes_text_length_check");
    expect(migration).toContain("matrix_notes_result_checksum_check");
    expect(migration).toContain("matrix_notes_owner_calculation_created_id_idx");
    expect(migration).toContain("calculation_records_id_owner_unique");
  });
});
