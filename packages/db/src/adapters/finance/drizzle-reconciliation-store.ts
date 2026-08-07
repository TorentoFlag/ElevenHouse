import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type {
  CreateReconciliationRecordInput,
  FinancePaymentProvider,
  Money,
  PaymentAttempt,
  ReconciliationExceptionEvidenceFilter,
  ReconciliationRecord,
  ReconciliationStore
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { paymentAttempts, reconciliationRecords } from "../../schema";
import type { FinanceDatabase } from "./drizzle-finance-command-store";
import { createDrizzlePaymentWebhookStore } from "./drizzle-payment-store";

type ReconciliationRecordRow = typeof reconciliationRecords.$inferSelect;

export function createDrizzleReconciliationStore(
  database: ElevenHouseDatabase | FinanceDatabase
): ReconciliationStore {
  return {
    findAttemptById: createDrizzlePaymentWebhookStore(database).findAttemptById,
    findAttemptByProviderPaymentId: (input) =>
      findPaymentAttemptByProviderPaymentId(database, input),
    createRecord: (input) => createReconciliationRecord(database, input),
    listOpenExceptions: (input) => listOpenReconciliationExceptions(database, input),
    resolveException: (input) => resolveReconciliationException(database, input)
  };
}

async function findPaymentAttemptByProviderPaymentId(
  database: ElevenHouseDatabase | FinanceDatabase,
  input: {
    readonly provider: FinancePaymentProvider;
    readonly providerPaymentId: string;
  }
): Promise<PaymentAttempt | null> {
  const [row] = await database
    .select()
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.provider, input.provider),
        eq(paymentAttempts.providerPaymentId, input.providerPaymentId)
      )
    )
    .limit(1);
  return row ? toPaymentAttempt(row) : null;
}

async function createReconciliationRecord(
  database: ElevenHouseDatabase | FinanceDatabase,
  input: CreateReconciliationRecordInput
): Promise<{ readonly kind: "created" | "replayed"; readonly record: ReconciliationRecord }> {
  const existing = await findDuplicateRecord(database, input);
  if (existing) return { kind: "replayed", record: existing };

  const [inserted] = await database
    .insert(reconciliationRecords)
    .values({
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      providerPayoutId: input.providerPayoutId,
      providerSettlementId: input.providerSettlementId,
      providerEventId: input.providerEventId,
      status: input.status,
      exceptionCode: input.exceptionCode,
      exceptionMessage: input.exceptionMessage,
      providerOccurredAt: input.providerOccurredAt ? new Date(input.providerOccurredAt) : null,
      checkedAt: new Date(input.checkedAt),
      payload: input.payload
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return { kind: "created", record: toReconciliationRecord(inserted) };

  const replayed = await findDuplicateRecord(database, input);
  if (!replayed) throw new Error("Expected existing reconciliation record after replay");
  return { kind: "replayed", record: replayed };
}

async function findDuplicateRecord(
  database: ElevenHouseDatabase | FinanceDatabase,
  input: CreateReconciliationRecordInput
): Promise<ReconciliationRecord | null> {
  const predicates = [
    eq(reconciliationRecords.provider, input.provider),
    eq(reconciliationRecords.status, input.status)
  ];
  if (input.providerPaymentId) {
    predicates.push(eq(reconciliationRecords.providerPaymentId, input.providerPaymentId));
  }
  if (input.providerPayoutId) {
    predicates.push(eq(reconciliationRecords.providerPayoutId, input.providerPayoutId));
  }
  if (input.providerSettlementId) {
    predicates.push(eq(reconciliationRecords.providerSettlementId, input.providerSettlementId));
  }
  if (input.providerEventId) {
    predicates.push(eq(reconciliationRecords.providerEventId, input.providerEventId));
  }
  const [row] = await database
    .select()
    .from(reconciliationRecords)
    .where(and(...predicates))
    .limit(1);
  return row ? toReconciliationRecord(row) : null;
}

async function listOpenReconciliationExceptions(
  database: ElevenHouseDatabase | FinanceDatabase,
  input: Parameters<ReconciliationStore["listOpenExceptions"]>[0]
): Promise<readonly ReconciliationRecord[]> {
  const predicates = [
    eq(reconciliationRecords.status, "exception"),
    isNull(reconciliationRecords.resolvedAt),
    input.provider ? eq(reconciliationRecords.provider, input.provider) : undefined,
    evidencePredicate(input.evidence ?? "all")
  ].filter((predicate): predicate is NonNullable<typeof predicate> => Boolean(predicate));
  const rows = await database
    .select()
    .from(reconciliationRecords)
    .where(and(...predicates))
    .orderBy(reconciliationRecords.checkedAt, reconciliationRecords.id)
    .limit(input.limit);
  return rows.map(toReconciliationRecord);
}

function evidencePredicate(evidence: ReconciliationExceptionEvidenceFilter) {
  switch (evidence) {
    case "payment":
      return isNotNull(reconciliationRecords.providerPaymentId);
    case "payout":
      return isNotNull(reconciliationRecords.providerPayoutId);
    case "settlement":
      return isNotNull(reconciliationRecords.providerSettlementId);
    case "provider_event":
      return isNotNull(reconciliationRecords.providerEventId);
    case "all":
      return undefined;
  }
}

async function resolveReconciliationException(
  database: ElevenHouseDatabase | FinanceDatabase,
  input: {
    readonly reconciliationRecordId: string;
    readonly resolution: "resolved" | "waived";
    readonly resolvedAt: string;
    readonly adminNote: string;
  }
): Promise<ReconciliationRecord | null> {
  const [existing] = await database
    .select()
    .from(reconciliationRecords)
    .where(eq(reconciliationRecords.id, input.reconciliationRecordId))
    .limit(1);
  if (!existing) return null;
  if (existing.status !== "exception" || existing.resolvedAt) {
    return toReconciliationRecord(existing);
  }

  const [updated] = await database
    .update(reconciliationRecords)
    .set({
      status: input.resolution === "resolved" ? "matched" : "ignored",
      resolvedAt: new Date(input.resolvedAt),
      payload: {
        ...existing.payload,
        resolution: input.resolution,
        adminNote: input.adminNote,
        resolvedAt: input.resolvedAt
      }
    })
    .where(eq(reconciliationRecords.id, input.reconciliationRecordId))
    .returning();
  return updated ? toReconciliationRecord(updated) : null;
}

function toReconciliationRecord(row: ReconciliationRecordRow): ReconciliationRecord {
  return {
    id: row.id,
    provider: row.provider as ReconciliationRecord["provider"],
    providerPaymentId: row.providerPaymentId,
    providerPayoutId: row.providerPayoutId,
    providerSettlementId: row.providerSettlementId,
    providerEventId: row.providerEventId,
    status: row.status as ReconciliationRecord["status"],
    exceptionCode: row.exceptionCode,
    exceptionMessage: row.exceptionMessage,
    providerOccurredAt: row.providerOccurredAt?.toISOString() ?? null,
    checkedAt: row.checkedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    payload: row.payload
  };
}

function toPaymentAttempt(row: typeof paymentAttempts.$inferSelect): PaymentAttempt {
  return {
    id: row.id,
    orderId: row.orderId,
    provider: row.provider as FinancePaymentProvider,
    status: row.status as PaymentAttempt["status"],
    amount: money(row.amountMinor, row.currency),
    providerPaymentId: row.providerPaymentId,
    providerCheckoutId: row.providerCheckoutId,
    idempotencyKey: row.idempotencyKey,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function money(amountMinor: number, currency: string): Money {
  if (currency !== "RUB") throw new Error(`Unsupported finance currency: ${currency}`);
  return { amountMinor, currency };
}
