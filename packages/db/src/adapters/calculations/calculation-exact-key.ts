import { sql } from "drizzle-orm";
import type { CalculationMode, CalculationModule } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";

type CalculationTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type CalculationExactKeyDatabase = ElevenHouseDatabase | CalculationTransaction;

export type CalculationExactKey = {
  readonly ownerUserId: string;
  readonly module: CalculationModule;
  readonly mode: CalculationMode;
  readonly methodCode: string;
  readonly requestFingerprint: string;
};

export async function lockCalculationExactKey(
  database: CalculationExactKeyDatabase,
  key: CalculationExactKey
): Promise<void> {
  const serialized = [
    key.ownerUserId,
    key.module,
    key.mode,
    key.methodCode,
    key.requestFingerprint
  ].join(":");
  await database.execute(sql`select pg_advisory_xact_lock(hashtextextended(${serialized}, 0))`);
}

export function isCalculationExactKeyUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  const visited = new Set<object>();

  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if (
      "code" in current &&
      current.code === "23505" &&
      "constraint" in current &&
      current.constraint === "calculation_records_exact_request_unique"
    ) {
      return true;
    }
    current = "cause" in current ? current.cause : null;
  }

  return false;
}
