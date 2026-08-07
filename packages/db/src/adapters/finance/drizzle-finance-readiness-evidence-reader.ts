import type {
  FinanceReadinessEvidenceQuery,
  FinanceReadinessEvidenceReader,
  FinanceReadinessEvidenceRef
} from "@elevenhouse/domain";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { financeReadinessEvidenceVersions } from "../../schema/finance/readiness-evidence.schema";

export function createDrizzleFinanceReadinessEvidenceReader<TSchema extends Record<string, unknown>>(
  input: Readonly<{ database: NodePgDatabase<TSchema> }>
): FinanceReadinessEvidenceReader {
  return Object.freeze({
    listFinanceReadinessEvidence: async (query) => {
      const normalized = normalizeQuery(query);
      const rows = await input.database
        .select()
        .from(financeReadinessEvidenceVersions)
        .where(
          and(
            eq(financeReadinessEvidenceVersions.isCurrent, true),
            inArray(financeReadinessEvidenceVersions.requirementCode, normalized.requirementCodes),
            scopePredicate(normalized)
          )
        )
        .orderBy(asc(financeReadinessEvidenceVersions.requirementCode));
      return Object.freeze(rows.map(toEvidenceRef));
    }
  } satisfies FinanceReadinessEvidenceReader);
}

function scopePredicate(query: FinanceReadinessEvidenceQuery) {
  const transactionCategory =
    query.transactionCategory === null
      ? isNull(financeReadinessEvidenceVersions.transactionCategory)
      : or(
          isNull(financeReadinessEvidenceVersions.transactionCategory),
          eq(financeReadinessEvidenceVersions.transactionCategory, query.transactionCategory)
        );
  return transactionCategory;
}

function normalizeQuery(value: FinanceReadinessEvidenceQuery): FinanceReadinessEvidenceQuery {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray(value.requirementCodes) ||
    value.requirementCodes.length === 0 ||
    value.requirementCodes.some((code) => typeof code !== "string") ||
    typeof value.operationKind !== "string" ||
    (value.transactionCategory !== null &&
      value.transactionCategory !== "client_purchase" &&
      value.transactionCategory !== "platform_subscription")
  ) {
    throw new Error("Invalid finance readiness evidence query");
  }
  return value;
}

function toEvidenceRef(
  row: typeof financeReadinessEvidenceVersions.$inferSelect
): FinanceReadinessEvidenceRef {
  const version = Number(row.evidenceVersion);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("Finance readiness evidence version is outside the safe integer range");
  }
  return Object.freeze({
    id: row.evidenceId,
    version,
    requirementCode: row.requirementCode as FinanceReadinessEvidenceRef["requirementCode"],
    status: row.status as FinanceReadinessEvidenceRef["status"],
    transactionCategory: row.transactionCategory as FinanceReadinessEvidenceRef["transactionCategory"],
    effectiveAt: row.effectiveAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    safeDigest: row.safeDigest
  });
}
