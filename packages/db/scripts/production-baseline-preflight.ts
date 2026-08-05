import type { QueryResultRow } from "pg";
import { Client } from "pg";

import { assertFlowBookingLifecycleSafety } from "./flow-booking-lifecycle-safety-reconciliation";
import { assertFlowEnrollmentControl } from "./flow-enrollment-control-reconciliation";
import {
  isCurrentBaselineHistory,
  type MigrationLedgerRow
} from "./production-baseline-plan";

export type ProductionBaselinePreflightInput = {
  readonly ledgerExists: boolean;
  readonly usersExists: boolean;
  readonly migrations: readonly MigrationLedgerRow[];
};

export type ProductionBaselinePreflightResult =
  | { readonly kind: "fresh" }
  | { readonly kind: "current" };

export function assessProductionBaselinePreflight(
  input: ProductionBaselinePreflightInput
): ProductionBaselinePreflightResult {
  if (!input.ledgerExists) {
    if (input.usersExists) {
      throw new Error("PRODUCTION_BASELINE_PREFLIGHT_LEDGER_MISSING");
    }
    return { kind: "fresh" };
  }

  if (!isCurrentBaselineHistory(input.migrations)) {
    throw new Error(
      `PRODUCTION_BASELINE_PREFLIGHT_UNKNOWN_HISTORY ${formatMigrationHistory(input.migrations)}`
    );
  }
  return { kind: "current" };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required for production baseline preflight");

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const ledgerExists = await relationExists(client, "drizzle.__drizzle_migrations");
    const usersExists = await relationExists(client, "public.users");
    const migrations = ledgerExists ? await readMigrationLedger(client) : [];
    const result = assessProductionBaselinePreflight({ ledgerExists, usersExists, migrations });
    if (result.kind === "current") {
      await assertCurrentFlowRolloutSafety(client);
    }
    await client.query("COMMIT");
    console.log(
      result.kind === "fresh"
        ? "Production baseline preflight accepted a fresh database"
        : "Production baseline preflight accepted the current baseline"
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function assertCurrentFlowRolloutSafety(client: Client): Promise<void> {
  await assertFlowEnrollmentControl(client);
  await assertFlowBookingLifecycleSafety(client);
}

async function relationExists(client: Client, qualifiedName: string): Promise<boolean> {
  const result = await client.query<{ relation: string | null }>(
    "SELECT to_regclass($1) AS relation",
    [qualifiedName]
  );
  return (result.rows[0]?.relation ?? null) !== null;
}

async function readMigrationLedger(client: Client): Promise<MigrationLedgerRow[]> {
  const result = await client.query<QueryResultRow & MigrationLedgerRow>(`
    SELECT hash, created_at::text AS created_at
      FROM drizzle.__drizzle_migrations
     ORDER BY created_at, id
  `);
  return result.rows;
}

function formatMigrationHistory(migrations: readonly MigrationLedgerRow[]): string {
  return migrations.map((migration) => `${migration.hash}@${migration.created_at}`).join(",");
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
