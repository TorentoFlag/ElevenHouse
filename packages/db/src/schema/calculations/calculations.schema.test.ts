import { readFileSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  chartCalculationJobMethodValues,
  calculationParticipants,
  calculationPdfJobs,
  calculationRecords,
  chartCalculationJobs
} from "./index";

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

  it("owns one generic PDF job table for all calculation methods", () => {
    const columns = getTableColumns(calculationPdfJobs);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "calculationId",
        "ownerUserId",
        "module",
        "methodCode",
        "resultChecksum",
        "locale",
        "sourceLocator",
        "documentFingerprint",
        "status",
        "artifactId",
        "mediaAssetId",
        "failureCode",
        "failureReason",
        "pageCount"
      ])
    );
    expect(columns).not.toHaveProperty("reportId");
    expect(columns).not.toHaveProperty("reportRevision");
  });

  it("defines chart calculation jobs with nullable result calculation id", () => {
    const columns = getTableColumns(chartCalculationJobs);

    expect(columns.resultCalculationId).toBeDefined();
    expect(columns).not.toHaveProperty("calculationId");
  });

  it("defines the generic PDF table directly in the baseline migration", () => {
    const migration = readFileSync(migrationFile, "utf8");

    expect(migration).toContain('CREATE TABLE "calculation_pdf_jobs"');
    expect(migration).toContain('"source_locator" jsonb NOT NULL');
    expect(migration).toContain('"document_fingerprint" text NOT NULL');
    expect(migration).toContain("calculation_pdf_jobs_idempotency_unique");
    expect(migration).toContain('WHERE "calculation_pdf_jobs"."status" <> \'failed\'');
  });

  it("defines chart calculation jobs directly in the baseline migration", () => {
    const migration = readFileSync(migrationFile, "utf8");
    const chartJobsTable = migration.slice(
      migration.indexOf('CREATE TABLE "chart_calculation_jobs"'),
      migration.indexOf('CREATE TABLE "client_profiles"')
    );

    expect(migration).toContain('CREATE TABLE "chart_calculation_jobs"');
    expect(migration).toContain('"result_calculation_id" uuid');
    expect(chartCalculationJobMethodValues).toContain("transit");
    expect(chartCalculationJobMethodValues).toContain("synastry");
    expect(chartCalculationJobMethodValues).toContain("composite");
    expect(chartCalculationJobMethodValues).toContain("solar_return");
    expect(chartCalculationJobMethodValues).toContain("horary");
    expect(chartJobsTable).toContain(
      "\"chart_calculation_jobs\".\"method\" in ('natal', 'transit', 'synastry', 'composite', 'solar_return', 'progression', 'horary')"
    );
    expect(migration).toContain("chart_calculation_jobs_active_fingerprint_unique");
    expect(migration).toContain("chart_calculation_jobs_success_fingerprint_unique");
    expect(chartJobsTable).not.toContain('"calculation_id" uuid NOT NULL');
  });
});
