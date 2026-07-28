import { and, desc, eq, inArray } from "drizzle-orm";
import {
  PayoutStatusEvidenceError,
  type CreatePayoutMethodInput,
  type CreatePayoutRequestInput,
  type FinancePaymentProvider,
  type ListPayoutRequestsInput,
  type Money,
  type PaymentProviderEnvironment,
  type PayoutMethodRecord,
  type PayoutRequestRecord,
  type PayoutStore,
  type UpdatePayoutRequestStatusInput
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { payoutMethods, payoutRequests } from "../../schema";
import type { FinanceDatabase } from "./drizzle-finance-command-store";

type PayoutMethodRow = typeof payoutMethods.$inferSelect;
type PayoutRequestRow = typeof payoutRequests.$inferSelect;

export function createDrizzlePayoutStore(database: ElevenHouseDatabase): PayoutStore {
  return {
    createMethod: (input) => createPayoutMethod(database, input),
    findDefaultMethod: (astrologerUserId) => findDefaultPayoutMethod(database, astrologerUserId),
    createRequest: (input) => createPayoutRequest(database, input),
    updateRequestStatus: (input) => updatePayoutRequestStatus(database, input),
    findRequestById: (payoutRequestId) => findPayoutRequestById(database, payoutRequestId),
    listRequests: (input) => listPayoutRequests(database, input)
  };
}

export function createDrizzlePayoutTransactionStore(
  database: FinanceDatabase
): Pick<PayoutStore, "findRequestById" | "listRequests" | "updateRequestStatus"> {
  return {
    findRequestById: (payoutRequestId) => findPayoutRequestById(database, payoutRequestId),
    listRequests: (input) => listPayoutRequests(database, input),
    updateRequestStatus: (input) => updatePayoutRequestStatus(database, input)
  };
}

async function createPayoutMethod(
  database: ElevenHouseDatabase,
  input: CreatePayoutMethodInput
): Promise<PayoutMethodRecord> {
  const timestamp = new Date(input.now);
  const [row] = await database
    .insert(payoutMethods)
    .values({
      ...(input.id ? { id: input.id } : {}),
      astrologerUserId: input.astrologerUserId,
      method: input.method,
      currency: input.currency,
      displayName: input.displayName,
      manualBankTransferDetails: input.manualBankTransferDetails,
      provider: input.provider,
      environment: input.environment,
      providerPayoutAccountId: input.providerPayoutAccountId,
      isDefault: input.isDefault,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .returning();
  if (!row) throw new Error("Expected payout method insert to return a row");
  return toPayoutMethod(row);
}

async function findDefaultPayoutMethod(
  database: FinanceDatabase,
  astrologerUserId: string
): Promise<PayoutMethodRecord | null> {
  const [row] = await database
    .select()
    .from(payoutMethods)
    .where(
      and(eq(payoutMethods.astrologerUserId, astrologerUserId), eq(payoutMethods.isDefault, true))
    )
    .limit(1);
  return row ? toPayoutMethod(row) : null;
}

async function createPayoutRequest(
  database: ElevenHouseDatabase,
  input: CreatePayoutRequestInput
): Promise<PayoutRequestRecord> {
  const method = await findPayoutMethodById(database, input.payoutMethodId);
  if (!method) throw new Error("Payout method was not found");
  if (method.astrologerUserId !== input.astrologerUserId) {
    throw new Error("Payout method does not belong to the payout requester");
  }
  if (method.currency !== input.amount.currency) {
    throw new Error("Payout request currency must match payout method currency");
  }

  const timestamp = new Date(input.now);
  const [row] = await database
    .insert(payoutRequests)
    .values({
      ...(input.id ? { id: input.id } : {}),
      astrologerUserId: input.astrologerUserId,
      payoutMethodId: input.payoutMethodId,
      status: "requested",
      amountMinor: input.amount.amountMinor,
      currency: input.amount.currency,
      method: method.method,
      provider: method.provider,
      environment: method.environment,
      requestedAt: timestamp,
      metadata: input.metadata,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .returning();
  if (!row) throw new Error("Expected payout request insert to return a row");
  return toPayoutRequest(row);
}

async function updatePayoutRequestStatus(
  database: FinanceDatabase,
  input: UpdatePayoutRequestStatusInput
): Promise<PayoutRequestRecord | null> {
  assertPayoutStatusEvidence(input);
  const timestamp = new Date(input.now);
  const completedAt = isTerminalPayoutStatus(input.status) ? timestamp : undefined;
  const [row] = await database
    .update(payoutRequests)
    .set({
      status: input.status,
      adminUserId: input.adminUserId,
      adminNote: input.adminNote,
      failureReason: input.failureReason,
      externalReference: input.externalReference,
      transferredAt: input.transferredAt ? new Date(input.transferredAt) : undefined,
      providerPayoutId: input.providerPayoutId,
      reviewedAt: input.adminUserId ? timestamp : undefined,
      completedAt,
      updatedAt: timestamp
    })
    .where(eq(payoutRequests.id, input.payoutRequestId))
    .returning();
  return row ? toPayoutRequest(row) : null;
}

function isTerminalPayoutStatus(status: UpdatePayoutRequestStatusInput["status"]): boolean {
  return (
    status === "paid" || status === "failed" || status === "rejected" || status === "cancelled"
  );
}

export function assertPayoutStatusEvidence(
  input: Pick<
    UpdatePayoutRequestStatusInput,
    "status" | "externalReference" | "transferredAt" | "failureReason"
  >
): void {
  if (input.status === "paid") {
    if (!input.externalReference || !input.transferredAt) {
      throw new PayoutStatusEvidenceError(
        "Paid payout requests require externalReference and transferredAt"
      );
    }
  }
  if ((input.status === "failed" || input.status === "rejected") && !input.failureReason) {
    throw new PayoutStatusEvidenceError("Failed or rejected payout requests require failureReason");
  }
}

async function findPayoutMethodById(
  database: FinanceDatabase,
  payoutMethodId: string
): Promise<PayoutMethodRecord | null> {
  const [row] = await database
    .select()
    .from(payoutMethods)
    .where(eq(payoutMethods.id, payoutMethodId))
    .limit(1);
  return row ? toPayoutMethod(row) : null;
}

async function findPayoutRequestById(
  database: FinanceDatabase,
  payoutRequestId: string
): Promise<PayoutRequestRecord | null> {
  const [row] = await database
    .select()
    .from(payoutRequests)
    .where(eq(payoutRequests.id, payoutRequestId))
    .limit(1);
  return row ? toPayoutRequest(row) : null;
}

async function listPayoutRequests(
  database: FinanceDatabase,
  input: ListPayoutRequestsInput = {}
): Promise<readonly PayoutRequestRecord[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const filters = [
    input.astrologerUserId
      ? eq(payoutRequests.astrologerUserId, input.astrologerUserId)
      : undefined,
    input.statuses?.length ? inArray(payoutRequests.status, [...input.statuses]) : undefined
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
  const rows = await database
    .select()
    .from(payoutRequests)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(payoutRequests.requestedAt), desc(payoutRequests.id))
    .limit(limit);
  return rows.map(toPayoutRequest);
}

function toPayoutMethod(row: PayoutMethodRow): PayoutMethodRecord {
  return {
    id: row.id,
    astrologerUserId: row.astrologerUserId,
    method: row.method as PayoutMethodRecord["method"],
    currency: money(0, row.currency).currency,
    displayName: row.displayName,
    manualBankTransferDetails: row.manualBankTransferDetails,
    provider: row.provider as FinancePaymentProvider | null,
    environment: row.environment as PaymentProviderEnvironment | null,
    providerPayoutAccountId: row.providerPayoutAccountId,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toPayoutRequest(row: PayoutRequestRow): PayoutRequestRecord {
  return {
    id: row.id,
    astrologerUserId: row.astrologerUserId,
    payoutMethodId: row.payoutMethodId,
    status: row.status as PayoutRequestRecord["status"],
    amount: money(row.amountMinor, row.currency),
    method: row.method as PayoutRequestRecord["method"],
    provider: row.provider as FinancePaymentProvider | null,
    environment: row.environment as PaymentProviderEnvironment | null,
    requestedAt: row.requestedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    adminUserId: row.adminUserId,
    adminNote: row.adminNote,
    failureReason: row.failureReason,
    externalReference: row.externalReference,
    transferredAt: row.transferredAt?.toISOString() ?? null,
    providerPayoutId: row.providerPayoutId,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function money(amountMinor: number, currency: string): Money {
  if (currency !== "RUB") throw new Error(`Unsupported finance currency: ${currency}`);
  return { amountMinor, currency };
}
