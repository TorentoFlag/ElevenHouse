import { readCurrentMigrationSql } from "./testing/current-migration-sql";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { assertChartCalculationJobs } from "../scripts/chart-calculation-jobs-reconciliation";

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;

describeWithDatabase("chart calculation jobs production catalog", () => {
  it("accepts the exact checked-in chart job integrity catalog", async () => {
    await withCurrentBaseline(async (client) => {
      await expect(assertChartCalculationJobs(client)).resolves.toBeUndefined();
    });
  }, 30_000);

  it("rejects an unexpected non-internal chart job trigger", async () => {
    await withCurrentBaseline(async (client) => {
      await client.query(`
        CREATE FUNCTION elevenhouse_unexpected_chart_job_trigger_for_test()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $unexpected_chart_job_trigger$
        BEGIN
          RETURN NEW;
        END;
        $unexpected_chart_job_trigger$;

        CREATE TRIGGER elevenhouse_unexpected_chart_job_trigger_for_test
        BEFORE UPDATE ON chart_calculation_jobs
        FOR EACH ROW
        EXECUTE FUNCTION elevenhouse_unexpected_chart_job_trigger_for_test();
      `);

      await expect(assertChartCalculationJobs(client)).rejects.toThrow(/drifted/);
    });
  }, 30_000);

  it("rejects a disabled canonical chart job trigger", async () => {
    await withCurrentBaseline(async (client) => {
      await client.query(`
        ALTER TABLE chart_calculation_jobs
          DISABLE TRIGGER chart_calculation_jobs_result_checksum_immutable
      `);

      await expect(assertChartCalculationJobs(client)).rejects.toThrow(/drifted/);
    });
  }, 30_000);

  it("rejects a missing job and participant contour as partial prerequisites", async () => {
    await withCurrentBaseline(async (client) => {
      await client.query(`
        DROP TABLE chart_calculation_jobs;
        DROP FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation();
        DROP TABLE calculation_participants;
      `);

      await expect(assertChartCalculationJobs(client)).rejects.toThrow(
        /partial or drifted chart calculation job prerequisites/
      );
    });
  }, 30_000);

  it("rejects a canonical guard body with an additional side effect", async () => {
    await withCurrentBaseline(async (client) => {
      await client.query(`
        CREATE OR REPLACE FUNCTION elevenhouse_guard_chart_job_result_checksum_mutation()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $chart_job_result_checksum_guard$
        BEGIN
          IF OLD.result_checksum IS NOT NULL
             AND OLD.result_checksum IS DISTINCT FROM NEW.result_checksum THEN
            RAISE EXCEPTION 'succeeded chart job result checksum is immutable'
              USING ERRCODE = '55000',
                    CONSTRAINT = 'chart_calculation_jobs_result_checksum_immutable';
          END IF;

          NEW.last_error_message := 'unexpected side effect';
          RETURN NEW;
        END;
        $chart_job_result_checksum_guard$;
      `);

      await expect(assertChartCalculationJobs(client)).rejects.toThrow(/drifted/);
    });
  }, 30_000);
});

async function withCurrentBaseline(run: (client: Client) => Promise<void>): Promise<void> {
  const sourceUrl = new URL(integrationDatabaseUrl!);
  const databaseName = `elevenhouse_chart_catalog_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = "/postgres";
  const databaseUrl = new URL(sourceUrl);
  databaseUrl.pathname = `/${databaseName}`;

  const adminClient = new Client({ connectionString: adminUrl.toString() });
  let databaseClient: Client | undefined;
  try {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE ${databaseName}`);
    databaseClient = new Client({ connectionString: databaseUrl.toString() });
    await databaseClient.connect();
    await databaseClient.query(readCurrentMigrationSql());
    await run(databaseClient);
  } finally {
    await databaseClient?.end();
    await adminClient.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await adminClient.end();
  }
}
