import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  buildFinancialInventoryReport,
  serializeFinancialInventoryReport
} from "@elevenhouse/domain";
import { Client, type ClientConfig, type QueryResultRow } from "pg";
import {
  readCanonicalFinancialInventorySnapshot
} from "../src/adapters/finance/drizzle-financial-inventory-reader.js";
import {
  isCurrentBaselineHistory,
  type MigrationLedgerRow
} from "./production-baseline-plan.js";

export type FinanceInventoryCliClient = {
  readonly connect: () => Promise<void>;
  readonly end: () => Promise<void>;
  readonly query: <Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ) => Promise<{ readonly rows: readonly Row[] }>;
};

export type FinanceInventoryCliDependencies = {
  readonly source: Readonly<Record<string, string | undefined>>;
  readonly args: readonly string[];
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
  readonly createClient: (config: ClientConfig) => FinanceInventoryCliClient;
  readonly now: () => string;
};

type ReadOnlyTarget = {
  readonly databaseUrl: string;
  readonly parsedUrl: URL;
  readonly databaseName: string;
  readonly safeSummary: string;
  readonly targetIdentityDigest: string;
};

export async function runFinanceInventoryCli(
  dependencies: FinanceInventoryCliDependencies
): Promise<number> {
  let target: ReadOnlyTarget | null = null;
  let client: FinanceInventoryCliClient | null = null;
  let exitCode: number;

  try {
    target = parseReadOnlyTarget(dependencies.source);
    dependencies.stderr(target.safeSummary);
    assertExactConfirmation(dependencies.args, target.databaseName);

    client = dependencies.createClient({
      connectionString: target.databaseUrl,
      application_name: "elevenhouse_finance_inventory",
      options: "-c default_transaction_read_only=on"
    });
    await client.connect();
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    const readOnlyState = await client.query<{ readonly transaction_read_only: string }>(
      "SHOW transaction_read_only"
    );
    if (readOnlyState.rows[0]?.transaction_read_only !== "on") {
      throw new Error("PostgreSQL session did not enter read-only mode");
    }

    const migrationHistory = await readMigrationLedger(client);
    if (!isCurrentBaselineHistory(migrationHistory)) {
      throw new Error("Finance inventory requires the current pre-launch baseline");
    }
    const snapshot = await readCanonicalFinancialInventorySnapshot(client, {
      generatedAt: dependencies.now(),
      targetIdentityDigest: target.targetIdentityDigest
    });
    const report = buildFinancialInventoryReport(snapshot);
    dependencies.stdout(serializeFinancialInventoryReport(report));
    exitCode = report.status === "passed" ? 0 : 2;
  } catch (error) {
    dependencies.stderr(formatSafeError(error, target?.parsedUrl ?? null));
    exitCode = 1;
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        dependencies.stderr("Finance inventory failed while closing the database connection");
        exitCode = 1;
      }
    }
  }

  return exitCode;
}

async function readMigrationLedger(
  client: FinanceInventoryCliClient
): Promise<readonly MigrationLedgerRow[]> {
  const result = await client.query<MigrationLedgerRow>(`
    /* finance_inventory:migration_ledger */
    SELECT hash::text AS hash, created_at::text AS created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at
  `);
  return result.rows;
}

function parseReadOnlyTarget(source: Readonly<Record<string, string | undefined>>): ReadOnlyTarget {
  const databaseUrl = source.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const parsedUrl = new URL(databaseUrl);
  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error(`Unsupported database protocol: ${parsedUrl.protocol}`);
  }
  if (!parsedUrl.hostname) throw new Error("DATABASE_URL must contain a PostgreSQL host");

  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""));
  if (!/^[A-Za-z0-9_.-]+$/.test(databaseName)) {
    throw new Error("DATABASE_URL must contain a safe, explicit database name");
  }
  const port = parsedUrl.port || "5432";
  const targetIdentity = `postgresql://${parsedUrl.hostname}:${port}/${databaseName}`;
  return {
    databaseUrl,
    parsedUrl,
    databaseName,
    safeSummary: `Read-only target: ${targetIdentity}`,
    targetIdentityDigest: `sha256:${createHash("sha256").update(targetIdentity).digest("hex")}`
  };
}

function assertExactConfirmation(args: readonly string[], databaseName: string): void {
  const prefix = "--confirm-read-only-target=";
  const confirmations = args.filter((argument) => argument.startsWith(prefix));
  const expected = `${prefix}${databaseName}`;
  if (args.length !== 1 || confirmations.length !== 1 || confirmations[0] !== expected) {
    throw new Error(`Exact confirmation is required: ${expected}`);
  }
}

function formatSafeError(error: unknown, databaseUrl: URL | null): string {
  const message = error instanceof Error ? error.message : "Unknown finance inventory failure";
  let redacted = message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]");
  if (databaseUrl) {
    for (const secret of [
      databaseUrl.href,
      databaseUrl.username,
      databaseUrl.password,
      decodeURIComponent(databaseUrl.username),
      decodeURIComponent(databaseUrl.password)
    ]) {
      if (secret) redacted = redacted.split(secret).join("[REDACTED]");
    }
  }
  return `Finance inventory failed: ${redacted}`;
}

function createCliClient(config: ClientConfig): FinanceInventoryCliClient {
  const client = new Client(config);
  return {
    connect: async () => {
      await client.connect();
    },
    end: () => client.end(),
    query: async <Row extends Record<string, unknown>>(
      text: string,
      values: readonly unknown[] = []
    ) => {
      const result = await client.query<Row & QueryResultRow>(text, [...values]);
      return { rows: result.rows };
    }
  };
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && resolve(entrypoint) === resolve(__filename));
}

if (isDirectExecution()) {
  void runFinanceInventoryCli({
    source: process.env,
    args: process.argv.slice(2),
    stdout: (value) => process.stdout.write(`${value}\n`),
    stderr: (value) => process.stderr.write(`${value}\n`),
    createClient: createCliClient,
    now: () => new Date().toISOString()
  }).then((result) => {
    process.exitCode = result;
  });
}
