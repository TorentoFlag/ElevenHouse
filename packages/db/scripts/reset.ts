import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Pool } from "pg";
import { assertDevelopmentDatabaseUrl, createPostgresConnectionConfig } from "../src/index";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(currentDirectory, "../../../.env"), quiet: true });
config({ path: resolve(currentDirectory, "../../../.env.example"), quiet: true });

const { connectionString } = createPostgresConnectionConfig();
assertDevelopmentDatabaseUrl(connectionString);

const pool = new Pool({ connectionString });

async function main() {
  try {
    await pool.query("drop schema if exists public cascade");
    await pool.query("create schema public");
    await pool.query("grant all on schema public to public");
    console.log("Local PostgreSQL public schema reset");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
