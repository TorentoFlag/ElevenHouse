import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertDevelopmentDatabaseUrl } from "../src/connection";
import { readMigrationLineage } from "./migration-lineage";

const execFileAsync = promisify(execFile);
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;
const databaseName = `elevenhouse_migration_lineage_spike_${randomUUID().replaceAll("-", "")}`;
const isolatedDatabaseUrl = integrationDatabaseUrl
  ? withDatabaseName(
      assertDevelopmentDatabaseUrl(
        integrationDatabaseUrl,
        process.env.NODE_ENV,
        "test migration-lineage generation spike"
      ),
      databaseName
    )
  : "";
const adminClient = integrationDatabaseUrl ? new Client({ connectionString: integrationDatabaseUrl }) : undefined;
const databaseClient = isolatedDatabaseUrl ? new Client({ connectionString: isolatedDatabaseUrl }) : undefined;
let fixtureDirectory = "";

describeWithDatabase("staged Drizzle migration generation", () => {
  beforeAll(async () => {
    fixtureDirectory = await mkdtemp(resolve(process.cwd(), "packages/db/.migration-lineage-spike-"));
    await writeFixtureSources(fixtureDirectory);
    await generate("identity");
    await generate("products");
    await generateCustom("products_integrity");
    await adminClient!.connect();
    await adminClient!.query(`CREATE DATABASE "${databaseName}"`);
    await migrate();
    await databaseClient!.connect();
  }, 30_000);

  afterAll(async () => {
    try {
      await databaseClient?.end();
      await adminClient?.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await adminClient?.end();
      if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("creates a valid generated/custom lineage with a cross-phase foreign key", async () => {
    const lineage = await readMigrationLineage(join(fixtureDirectory, "drizzle"));
    const foreignKey = await databaseClient!.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'products_owner_id_identity_users_id_fk'
      ) AS exists
    `);

    expect(lineage.artifacts).toHaveLength(3);
    expect(lineage.artifacts.map((artifact) => artifact.index)).toEqual([0, 1, 2]);
    expect(foreignKey.rows).toEqual([{ exists: true }]);
  }, 30_000);
});

async function writeFixtureSources(directory: string): Promise<void> {
  await Promise.all([
    writeFile(
      join(directory, "identity.ts"),
      [
        'import { pgTable, uuid } from "drizzle-orm/pg-core";',
        'export const identityUsers = pgTable("identity_users", { id: uuid("id").primaryKey() });'
      ].join("\n"),
      "utf8"
    ),
    writeFile(
      join(directory, "products.ts"),
      [
        'import { pgTable, uuid } from "drizzle-orm/pg-core";',
        'import { identityUsers } from "./identity";',
        'export { identityUsers } from "./identity";',
        'export const products = pgTable("products", {',
        '  id: uuid("id").primaryKey(),',
        '  ownerId: uuid("owner_id").notNull().references(() => identityUsers.id)',
        '});'
      ].join("\n"),
      "utf8"
    ),
    writeFile(
      join(directory, "drizzle.config.ts"),
      [
        'import { defineConfig } from "drizzle-kit";',
        'export default defineConfig({',
        '  dialect: "postgresql",',
        '  schema: process.env.MIGRATION_LINEAGE_SPIKE_SCHEMA_PATH!,',
        '  out: process.env.MIGRATION_LINEAGE_SPIKE_OUT_PATH!,',
        '  dbCredentials: { url: process.env.DATABASE_URL! }',
        '});'
      ].join("\n"),
      "utf8"
    )
  ]);
}

async function generate(phase: "identity" | "products"): Promise<void> {
  await execFileAsync(
    "pnpm",
    [
      "--filter",
      "@elevenhouse/db",
      "exec",
      "drizzle-kit",
      "generate",
      "--config",
      join(fixtureDirectory, "drizzle.config.ts"),
      "--name",
      phase
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MIGRATION_LINEAGE_SPIKE_SCHEMA_PATH: join(fixtureDirectory, `${phase}.ts`),
        MIGRATION_LINEAGE_SPIKE_OUT_PATH: relative(
          join(process.cwd(), "packages/db"),
          join(fixtureDirectory, "drizzle")
        )
      },
      timeout: 20_000
    }
  );
}

async function generateCustom(name: string): Promise<void> {
  await execFileAsync(
    "pnpm",
    [
      "--filter",
      "@elevenhouse/db",
      "exec",
      "drizzle-kit",
      "generate",
      "--config",
      join(fixtureDirectory, "drizzle.config.ts"),
      "--custom",
      "--name",
      name
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MIGRATION_LINEAGE_SPIKE_SCHEMA_PATH: join(fixtureDirectory, "products.ts"),
        MIGRATION_LINEAGE_SPIKE_OUT_PATH: relative(
          join(process.cwd(), "packages/db"),
          join(fixtureDirectory, "drizzle")
        )
      },
      timeout: 20_000
    }
  );
}

async function migrate(): Promise<void> {
  await execFileAsync(
    "pnpm",
    [
      "--filter",
      "@elevenhouse/db",
      "exec",
      "drizzle-kit",
      "migrate",
      "--config",
      join(fixtureDirectory, "drizzle.config.ts")
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: isolatedDatabaseUrl,
        MIGRATION_LINEAGE_SPIKE_SCHEMA_PATH: join(fixtureDirectory, "products.ts"),
        MIGRATION_LINEAGE_SPIKE_OUT_PATH: relative(
          join(process.cwd(), "packages/db"),
          join(fixtureDirectory, "drizzle")
        )
      },
      timeout: 20_000
    }
  );
}

function withDatabaseName(databaseUrl: string, name: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
