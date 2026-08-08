import {
  canonicalizeFinanceOperationResourcePolicy,
  verifyFinanceOperationResourcePolicyVersion,
  type FinanceOperationResourcePolicyReader,
  type FinanceOperationResourcePolicyVersion
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeOperationResourcePolicyVersions } from "../../schema/finance/operation-resource-policies.schema";

export class FinanceOperationResourcePolicyReaderPersistenceError extends Error {
  readonly code = "FINANCE_OPERATION_RESOURCE_POLICY_READER_PERSISTENCE_ERROR" as const;

  constructor(
    readonly reason: "invalid_query" | "policy_integrity_conflict" | "persistence_failure"
  ) {
    super("Finance operation resource policy could not be read safely");
  }
}

/** Reads only the one published envelope for an operation; no row means fail closed at the caller. */
export function createDrizzleFinanceOperationResourcePolicyReader(
  database: ElevenHouseDatabase
): FinanceOperationResourcePolicyReader {
  return Object.freeze({
    async findPublishedForOperation(input) {
      const operationKind = operationKindValue(input.operationKind);
      try {
        const [row] = await database
          .select()
          .from(financeOperationResourcePolicyVersions)
          .where(
            and(
              eq(financeOperationResourcePolicyVersions.operationKind, operationKind),
              eq(financeOperationResourcePolicyVersions.lifecycle, "published")
            )
          )
          .limit(1);
        if (!row) return null;
        return mapFinanceOperationResourcePolicyVersion(row);
      } catch (error) {
        if (error instanceof FinanceOperationResourcePolicyReaderPersistenceError) throw error;
        throw new FinanceOperationResourcePolicyReaderPersistenceError("persistence_failure");
      }
    }
  } satisfies FinanceOperationResourcePolicyReader);
}

export function mapFinanceOperationResourcePolicyVersion(
  row: typeof financeOperationResourcePolicyVersions.$inferSelect
): FinanceOperationResourcePolicyVersion {
  try {
    if (
      (row.lifecycle === "draft" && (row.publishedAt !== null || row.retiredAt !== null)) ||
      (row.lifecycle === "published" && (row.publishedAt === null || row.retiredAt !== null)) ||
      (row.lifecycle === "retired" && (row.publishedAt === null || row.retiredAt === null)) ||
      (row.lifecycle !== "draft" && row.lifecycle !== "published" && row.lifecycle !== "retired")
    ) {
      fail("policy_integrity_conflict");
    }
    const version = verifyFinanceOperationResourcePolicyVersion({
      policy: {
        policyId: row.policyId,
        version: row.version,
        operationKind: operationKindValue(row.operationKind),
        maximumRows: row.maximumRows,
        maximumDecimalDigits: row.maximumDecimalDigits,
        maximumArtifactBytes: row.maximumArtifactBytes,
        canonicalDigest: digestValue(row.canonicalDigest)
      },
      draftRevision: row.draftRevision,
      lifecycle: row.lifecycle
    });
    if (canonicalizeFinanceOperationResourcePolicy(version.policy) !== row.canonicalPreimage) {
      fail("policy_integrity_conflict");
    }
    return version;
  } catch (error) {
    if (error instanceof FinanceOperationResourcePolicyReaderPersistenceError) throw error;
    fail("policy_integrity_conflict");
  }
}

function operationKindValue(
  value: unknown
): Parameters<
  FinanceOperationResourcePolicyReader["findPublishedForOperation"]
>[0]["operationKind"] {
  const values = [
    "tariff_publish",
    "fiscal_policy_publish",
    "risk_policy_publish",
    "client_checkout_prepare",
    "client_order_capture",
    "platform_card_setup_prepare",
    "platform_card_setup_execute",
    "platform_card_setup_complete_3ds_method",
    "platform_invoice_complete_3ds_method",
    "platform_invoice_charge",
    "platform_renewal_schedule",
    "refund_execute",
    "chargeback_record_provisional",
    "chargeback_principal_allocate",
    "payout_destination_reveal",
    "payout_destination_change",
    "payout_approve",
    "payout_start_processing",
    "payout_confirm_paid",
    "bank_snapshot_attest",
    "bank_statement_match",
    "settlement_ingestion",
    "ledger_correction"
  ] as const;
  if ((values as readonly string[]).includes(value as string))
    return value as (typeof values)[number];
  fail("invalid_query");
}

function digestValue(value: unknown): `sha256:${string}` {
  if (typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value))
    return value as `sha256:${string}`;
  fail("policy_integrity_conflict");
}

function fail(reason: FinanceOperationResourcePolicyReaderPersistenceError["reason"]): never {
  throw new FinanceOperationResourcePolicyReaderPersistenceError(reason);
}
