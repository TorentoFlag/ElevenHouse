import { readCurrentMigrationSql } from "../../testing/current-migration-sql";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  chartCalculationJobMethodValues,
  calculationClientLinks,
  calculationInterpretations,
  calculationParticipants,
  calculationPdfJobs,
  calculationRecords,
  chartCalculationJobs
} from "./index";

const migrationFile = readCurrentMigrationSql();

describe("current calculation persistence schema", () => {
  it("stores one canonical input and result directly on calculation_records", () => {
    const columns = getTableColumns(calculationRecords);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "requestFingerprint",
        "interpretationMode",
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

  it("constrains persisted chart interpretation authority without backfilling legacy rows", () => {
    expect(
      getTableConfig(calculationRecords).checks.map((constraint) => constraint.name)
    ).toContain("calculation_records_interpretation_mode_check");
    expect(getTableColumns(calculationRecords).interpretationMode.notNull).toBe(false);
    expect(getTableColumns(chartCalculationJobs).interpretationMode.notNull).toBe(false);
  });

  it("binds every visible client publication to one interpretation and result checksum", () => {
    const linkColumns = getTableColumns(calculationClientLinks);
    const linkConfig = getTableConfig(calculationClientLinks);
    const interpretationConfig = getTableConfig(calculationInterpretations);

    expect(Object.keys(linkColumns)).toEqual(
      expect.arrayContaining(["publishedInterpretationId", "publishedResultChecksum"])
    );
    expect(linkConfig.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "calculation_client_links_published_result_checksum_check",
        "calculation_client_links_publication_binding_check"
      ])
    );
    expect(linkConfig.foreignKeys.map((constraint) => constraint.getName())).toContain(
      "calculation_client_links_published_interpretation_fk"
    );
    expect(linkConfig.indexes.map((index) => index.config.name)).toContain(
      "calculation_client_links_published_interpretation_idx"
    );
    expect(interpretationConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "calculation_interpretations_id_record_unique"
    );
  });

  it("declares publication bindings in the checked-in baseline migration", () => {
    const migration = migrationFile;

    expect(migration).toContain('"published_interpretation_id" uuid');
    expect(migration).toContain('"published_result_checksum" text');
    expect(migration).toContain("calculation_interpretations_id_record_unique");
    expect(migration).toContain("calculation_client_links_published_result_checksum_check");
    expect(migration).toContain("calculation_client_links_publication_binding_check");
    expect(migration).toContain("calculation_client_links_published_interpretation_fk");
    expect(migration).toContain("calculation_client_links_published_interpretation_idx");
  });

  it("keeps the checked-in migration free of calculation result versions", () => {
    const migration = migrationFile;

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
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "participantSnapshot",
        "interpretationMode",
        "targetCalculationId",
        "expectedSourceChecksum",
        "methodVersion",
        "executionProfile",
        "leaseGeneration",
        "resultChecksum",
        "resultReproducibilityFingerprint"
      ])
    );
    expect(columns.schemaVersion.default).toBe("chart-result.v2");
    expect(columns).not.toHaveProperty("calculationId");
  });

  it("declares chart participant, replacement, provenance and lease checks", () => {
    const jobConfig = getTableConfig(chartCalculationJobs);
    const checkNames = jobConfig.checks.map((constraint) => constraint.name);

    expect(checkNames).toEqual(
      expect.arrayContaining([
        "chart_calculation_jobs_participant_snapshot_check",
        "chart_calculation_jobs_interpretation_mode_check",
        "chart_calculation_jobs_replacement_pair_check",
        "chart_calculation_jobs_expected_source_checksum_check",
        "chart_calculation_jobs_method_version_check",
        "chart_calculation_jobs_execution_profile_object_check",
        "chart_calculation_jobs_lease_generation_check",
        "chart_calculation_jobs_result_checksum_check",
        "chart_calculation_jobs_result_reproducibility_fingerprint_check",
        "chart_calculation_jobs_lease_state_check",
        "chart_calculation_jobs_attempts_limit_check"
      ])
    );
    expect(jobConfig.foreignKeys.map((constraint) => constraint.getName())).toEqual(
      expect.arrayContaining([
        "chart_calculation_jobs_result_owner_fk",
        "chart_calculation_jobs_target_owner_fk"
      ])
    );
  });

  it("keeps persisted participants unique by both role and order", () => {
    const uniqueNames = getTableConfig(calculationParticipants).uniqueConstraints.map(
      (constraint) => constraint.name
    );

    expect(uniqueNames).toEqual(
      expect.arrayContaining([
        "calculation_participants_record_role_unique",
        "calculation_participants_record_order_unique"
      ])
    );
  });

  it("allows exact calculation requests to be recreated only after archival", () => {
    const exactRequest = getTableConfig(calculationRecords).indexes.find(
      (index) => index.config.name === "calculation_records_exact_request_unique"
    );

    expect(exactRequest?.config.unique).toBe(true);
    expect(exactRequest?.config.where).toBeDefined();
    expect(
      getTableConfig(chartCalculationJobs).indexes.map((index) => index.config.name)
    ).not.toContain("chart_calculation_jobs_success_fingerprint_unique");
  });

  it("defines the generic PDF table directly in the baseline migration", () => {
    const migration = migrationFile;

    expect(migration).toContain('CREATE TABLE "calculation_pdf_jobs"');
    expect(migration).toContain('"source_locator" jsonb NOT NULL');
    expect(migration).toContain('"document_fingerprint" text NOT NULL');
    expect(migration).toContain("calculation_pdf_jobs_idempotency_unique");
    expect(migration).toContain('WHERE "calculation_pdf_jobs"."status" <> \'failed\'');
  });

  it("defines chart calculation jobs directly in the baseline migration", () => {
    const migration = migrationFile;
    const chartJobsTable = migration.match(/CREATE TABLE "chart_calculation_jobs" \([\s\S]*?\n\);/)?.[0] ?? "";

    expect(migration).toContain('CREATE TABLE "chart_calculation_jobs"');
    expect(migration).toContain('"result_calculation_id" uuid');
    expect(migration).toContain('"participant_snapshot" jsonb NOT NULL');
    expect(migration).toContain('"method_version" text');
    expect(migration).toContain('"execution_profile" jsonb');
    expect(migration).toContain('"lease_generation" integer DEFAULT 0 NOT NULL');
    expect(migration).toContain('"result_reproducibility_fingerprint" text');
    expect(migration).toContain("chart_calculation_jobs_participant_snapshot_check");
    expect(migration).toContain("chart_calculation_jobs_lease_state_check");
    expect(migration).toContain("chart_calculation_jobs_result_owner_fk");
    expect(migration).toContain('WHERE "calculation_records"."status" <> \'archived\'');
    expect(chartCalculationJobMethodValues).toContain("transit");
    expect(chartCalculationJobMethodValues).toContain("synastry");
    expect(chartCalculationJobMethodValues).toContain("composite");
    expect(chartCalculationJobMethodValues).toContain("solar_return");
    expect(chartCalculationJobMethodValues).toContain("horary");
    expect(chartJobsTable).toContain(
      "\"chart_calculation_jobs\".\"method\" in ('natal', 'astrocartography', 'transit', 'synastry', 'composite', 'solar_return', 'progression', 'horary')"
    );
    expect(migration).toContain("chart_calculation_jobs_active_fingerprint_unique");
    expect(migration).not.toContain("chart_calculation_jobs_success_fingerprint_unique");
    expect(chartJobsTable).not.toContain('"calculation_id" uuid NOT NULL');
  });
});
