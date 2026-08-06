import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "./connection";
import { assertCatalogEquivalent, readApplicationCatalogManifest } from "../scripts/migration-catalog-manifest";
import {
  buildCandidateLineage,
  collectSchemaSourcePaths,
  DEFAULT_FORWARD_PHASE_PLAN,
  type PhasePlan
} from "../scripts/rebuild-forward-migration-lineage";

const execFileAsync = promisify(execFile);
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "");
const referenceDatabaseName = `elevenhouse_forward_reference_${suffix}`;
const candidateDatabaseName = `elevenhouse_forward_candidate_${suffix}`;
const referenceDatabaseUrl = integrationDatabaseUrl
  ? withDatabaseName(assertDevelopmentDatabaseUrl(integrationDatabaseUrl, process.env.NODE_ENV, "test forward migration reference"), referenceDatabaseName)
  : "";
const candidateDatabaseUrl = integrationDatabaseUrl
  ? withDatabaseName(assertDevelopmentDatabaseUrl(integrationDatabaseUrl, process.env.NODE_ENV, "test forward migration candidate"), candidateDatabaseName)
  : "";
const adminClient = integrationDatabaseUrl ? new Client({ connectionString: integrationDatabaseUrl }) : undefined;
const referenceClient = referenceDatabaseUrl ? new Client({ connectionString: referenceDatabaseUrl }) : undefined;
const candidateClient = candidateDatabaseUrl ? new Client({ connectionString: candidateDatabaseUrl }) : undefined;
let fixtureDirectory = "";
const sourceReferencePhasePlan: readonly PhasePlan[] = [
  {
    index: 0,
    name: "source_reference",
    schemaModules: DEFAULT_FORWARD_PHASE_PLAN.at(-1)!.schemaModules,
    augmenters: DEFAULT_FORWARD_PHASE_PLAN.flatMap((phase) => phase.augmenters ?? [])
  }
];

describeWithDatabase("forward migration lineage", () => {
  beforeAll(async () => {
    fixtureDirectory = await mkdtemp(resolve(process.cwd(), "packages/db/.forward-migration-lineage-"));
    const sourceManifestPaths = await collectSchemaSourcePaths(join(process.cwd(), "packages/db/src/schema"));
    const sourceManifest = await buildCandidateLineage.captureSourceManifest(sourceManifestPaths);
    await buildCandidateLineage({
      packageDirectory: join(process.cwd(), "packages/db"),
      outputDirectory: join(fixtureDirectory, "reference"),
      sourceManifestPaths,
      sourceManifest,
      phasePlan: sourceReferencePhasePlan
    });
    await buildCandidateLineage({
      packageDirectory: join(process.cwd(), "packages/db"),
      outputDirectory: join(fixtureDirectory, "candidate"),
      sourceManifestPaths,
      sourceManifest,
      phasePlan: DEFAULT_FORWARD_PHASE_PLAN
    });
    await writeMigratorConfig(fixtureDirectory);
    await adminClient!.connect();
    await adminClient!.query(`CREATE DATABASE "${referenceDatabaseName}"`);
    await adminClient!.query(`CREATE DATABASE "${candidateDatabaseName}"`);
    await migrate(join(fixtureDirectory, "reference"), referenceDatabaseUrl);
    await migrate(join(fixtureDirectory, "candidate"), candidateDatabaseUrl);
    await referenceClient!.connect();
    await candidateClient!.connect();
  }, 90_000);

  afterAll(async () => {
    try {
      await referenceClient?.end();
      await candidateClient?.end();
      await adminClient?.query(`DROP DATABASE IF EXISTS "${referenceDatabaseName}" WITH (FORCE)`);
      await adminClient?.query(`DROP DATABASE IF EXISTS "${candidateDatabaseName}" WITH (FORCE)`);
    } finally {
      await adminClient?.end();
      if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("creates the same application catalog while retaining an ordered multi-row ledger", async () => {
    const referenceManifest = await readApplicationCatalogManifest(referenceClient!);
    const candidateManifest = await readApplicationCatalogManifest(candidateClient!);
    const referenceLedger = await referenceClient!.query<{ count: string }>("SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations");
    const candidateLedger = await candidateClient!.query<{ count: string }>("SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations");

    try {
      assertCatalogEquivalent(referenceManifest, candidateManifest);
    } catch (error) {
      throw new Error(
        `FORWARD_LINEAGE_CATALOG_DIFF:${String(error)}:${JSON.stringify(firstDifference(referenceManifest.constraints, candidateManifest.constraints))}`,
        { cause: error }
      );
    }
    expect(referenceLedger.rows).toEqual([{ count: "1" }]);
    expect(candidateLedger.rows).toEqual([{ count: "17" }]);
  }, 30_000);
});

async function writeMigratorConfig(fixtureDirectory: string): Promise<void> {
  await writeFile(
    join(fixtureDirectory, "drizzle.config.ts"),
    [
      'import { defineConfig } from "drizzle-kit";',
      "export default defineConfig({",
      '  dialect: "postgresql",',
      "  schema: process.env.FORWARD_LINEAGE_SCHEMA_PATH!,",
      "  out: process.env.FORWARD_LINEAGE_OUT_PATH!,",
      "  dbCredentials: { url: process.env.DATABASE_URL! }",
      "});"
    ].join("\n"),
    "utf8"
  );
}

async function migrate(migrationsDirectory: string, databaseUrl: string): Promise<void> {
  try {
    await execFileAsync(
      "pnpm",
      ["--filter", "@elevenhouse/db", "exec", "drizzle-kit", "migrate", "--config", join(fixtureDirectory, "drizzle.config.ts")],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          FORWARD_LINEAGE_SCHEMA_PATH: join(process.cwd(), "packages/db/src/schema/index.ts"),
          FORWARD_LINEAGE_OUT_PATH: relative(join(process.cwd(), "packages/db"), migrationsDirectory)
        },
        timeout: 60_000
      }
    );
  } catch (error) {
    const details = error as { stdout?: string; stderr?: string };
    throw new Error(`FORWARD_LINEAGE_MIGRATE_FAILED:${details.stdout ?? ""}:${details.stderr ?? ""}`, { cause: error });
  }
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function firstDifference(
  reference: readonly Record<string, unknown>[],
  candidate: readonly Record<string, unknown>[]
): { reference: Record<string, unknown> | null; candidate: Record<string, unknown> | null } {
  const length = Math.max(reference.length, candidate.length);
  for (let index = 0; index < length; index += 1) {
    const referenceRow = reference[index] ?? null;
    const candidateRow = candidate[index] ?? null;
    if (JSON.stringify(referenceRow) !== JSON.stringify(candidateRow)) {
      return { reference: referenceRow, candidate: candidateRow };
    }
  }
  return { reference: null, candidate: null };
}
