import { readFileSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { calculationParticipants, calculationRecords } from "./index";

const migrationFile = "packages/db/drizzle/0000_sticky_rictor.sql";

describe("current calculation persistence schema", () => {
  it("stores one canonical input and result directly on calculation_records", () => {
    const columns = getTableColumns(calculationRecords);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "requestFingerprint",
        "inputData",
        "resultData",
        "resultSummary",
        "resultChecksum"
      ])
    );
    expect(columns).not.toHaveProperty("currentMethodVersion");
  });

  it("keeps participant identity metadata without duplicating method input", () => {
    const columns = getTableColumns(calculationParticipants);

    expect(columns).not.toHaveProperty("birthDate");
    expect(columns).not.toHaveProperty("inputSnapshot");
    expect(columns).not.toHaveProperty("manuallyOverridden");
  });

  it("keeps the checked-in migration free of calculation result versions", () => {
    const migration = readFileSync(migrationFile, "utf8");

    expect(migration).not.toContain('CREATE TABLE "calculation_versions"');
    expect(migration).toContain('"request_fingerprint" text NOT NULL');
    expect(migration).toContain('"input_data" jsonb NOT NULL');
    expect(migration).toContain('"result_data" jsonb NOT NULL');
    expect(migration).toContain('"result_summary" jsonb NOT NULL');
    expect(migration).toContain('"result_checksum" text NOT NULL');
    expect(migration).toContain("calculation_records_request_fingerprint_check");
    expect(migration).toContain("calculation_records_result_checksum_check");
    expect(migration).toContain("calculation_records_exact_request_unique");
  });
});
