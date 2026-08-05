import { resolve } from "node:path";

import { Client, type ClientConfig, type QueryResultRow } from "pg";

export type ProductionPrelaunchResetTarget = {
  readonly databaseUrl: string;
  readonly host: string;
  readonly port: string;
  readonly databaseName: string;
  readonly release: string;
  readonly safeSummary: string;
};

export type ProductionPrelaunchResetClient = {
  readonly connect: () => Promise<void>;
  readonly end: () => Promise<void>;
  readonly query: <Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ) => Promise<{ readonly rows: readonly Row[] }>;
};

export type ProductionPrelaunchResetDependencies = {
  readonly source: Readonly<Record<string, string | undefined>>;
  readonly args: readonly string[];
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
  readonly createClient: (config: ClientConfig) => ProductionPrelaunchResetClient;
};

export function parseProductionPrelaunchResetTarget(
  source: Readonly<Record<string, string | undefined>>,
  args: readonly string[]
): ProductionPrelaunchResetTarget {
  const databaseUrl = required(source, "DATABASE_URL");
  const expectedHost = required(source, "PRELAUNCH_RESET_EXPECTED_DATABASE_HOST");
  const expectedDatabaseName = required(source, "PRELAUNCH_RESET_EXPECTED_DATABASE_NAME");
  const release = required(source, "PRELAUNCH_RESET_RELEASE");
  if (!/^[a-f0-9]{40}$/u.test(release)) {
    throw new Error("PRELAUNCH_RESET_RELEASE must be a full lowercase Git SHA");
  }

  const parsedUrl = new URL(databaseUrl);
  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error(`Unsupported database protocol: ${parsedUrl.protocol}`);
  }
  const host = parsedUrl.hostname;
  const port = parsedUrl.port || "5432";
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//u, ""));
  if (!host || !databaseName) throw new Error("DATABASE_URL must contain host and database name");
  if (host !== expectedHost) {
    throw new Error("Pre-launch reset target host does not match expected host");
  }
  if (databaseName !== expectedDatabaseName) {
    throw new Error("Pre-launch reset target database does not match expected database");
  }

  const confirmationArgs = args[0] === "--" ? args.slice(1) : args;
  const expectedConfirmation = `--confirm-prelaunch-reset=${release}:${host}:${port}/${databaseName}`;
  if (confirmationArgs.length !== 1 || confirmationArgs[0] !== expectedConfirmation) {
    throw new Error(`Exact confirmation is required: ${expectedConfirmation}`);
  }

  return {
    databaseUrl,
    host,
    port,
    databaseName,
    release,
    safeSummary: `Pre-launch reset target: postgresql://${host}:${port}/${databaseName} release=${release}`
  };
}

export async function runProductionPrelaunchReset(
  dependencies: ProductionPrelaunchResetDependencies
): Promise<number> {
  let target: ProductionPrelaunchResetTarget | null = null;
  let client: ProductionPrelaunchResetClient | null = null;
  let inTransaction = false;

  try {
    target = parseProductionPrelaunchResetTarget(dependencies.source, dependencies.args);
    dependencies.stderr(target.safeSummary);
    client = dependencies.createClient({
      connectionString: target.databaseUrl,
      application_name: "elevenhouse_prelaunch_reset",
      options: "-c lock_timeout=10s -c statement_timeout=120s"
    });
    await client.connect();
    await client.query("BEGIN");
    inTransaction = true;

    const identity = await client.query<{ readonly database_name: string }>(
      "SELECT current_database() AS database_name"
    );
    if (identity.rows[0]?.database_name !== target.databaseName) {
      throw new Error("Connected database does not match the approved reset target");
    }
    const lock = await client.query<{ readonly acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtext('elevenhouse:prelaunch-reset')) AS acquired"
    );
    if (lock.rows[0]?.acquired !== true) {
      throw new Error("Pre-launch reset lock is unavailable");
    }

    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT ALL ON SCHEMA public TO public");
    await client.query("COMMIT");
    inTransaction = false;
    dependencies.stdout(`Pre-launch reset completed for ${target.safeSummary}`);
    return 0;
  } catch (error) {
    if (client && inTransaction) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    dependencies.stderr(formatSafeError(error, target));
    return 1;
  } finally {
    await client?.end().catch(() => undefined);
  }
}

function required(source: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = source[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function formatSafeError(error: unknown, target: ProductionPrelaunchResetTarget | null): string {
  const message = error instanceof Error ? error.message : "Unknown pre-launch reset failure";
  const redacted = target ? message.split(target.databaseUrl).join("[REDACTED_DATABASE_URL]") : message;
  return `Pre-launch reset failed: ${redacted}`;
}

function createCliClient(config: ClientConfig): ProductionPrelaunchResetClient {
  const client = new Client(config);
  return {
    connect: () => client.connect(),
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
  void runProductionPrelaunchReset({
    source: process.env,
    args: process.argv.slice(2),
    stdout: (value) => process.stdout.write(`${value}\n`),
    stderr: (value) => process.stderr.write(`${value}\n`),
    createClient: createCliClient
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
