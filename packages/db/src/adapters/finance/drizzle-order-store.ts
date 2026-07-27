import { and, eq, gt, inArray } from "drizzle-orm";
import type {
  ApplyFinancePolicyToOrderInput,
  CreateFinanceOrderRecordInput,
  FinanceOrder,
  FinanceOrderStore,
  UpdateFinanceOrderStatusInput
} from "@elevenhouse/domain";
import { OrderBookingHoldNotClaimableError as OrderBookingHoldNotClaimable } from "@elevenhouse/domain";
import type { Money } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { bookings, orders, scheduleReservations } from "../../schema";
import {
  executeIdempotentFinanceCommand,
  type FinanceDatabase,
  type FinanceTransaction
} from "./drizzle-finance-command-store";

type OrderRow = typeof orders.$inferSelect;

export function createDrizzleOrderStore(database: ElevenHouseDatabase): FinanceOrderStore {
  return {
    executeCreateOrder: (command, createInput) =>
      executeIdempotentFinanceCommand({
        database,
        command,
        create: async (transaction) => {
          const order = await insertOrder(transaction, await createInput());
          return { result: { orderId: order.id }, value: order };
        },
        replay: (result) => {
          const orderId = readResultId(result, "orderId");
          return findOrderById(database, orderId);
        }
      }),
    create: (input) => database.transaction((transaction) => insertOrder(transaction, input)),
    ...createDrizzleOrderTransactionStore(database)
  };
}

export function createDrizzleOrderTransactionStore(
  database: FinanceDatabase
): Pick<FinanceOrderStore, "applyFinancePolicy" | "findById" | "updateStatus"> {
  return {
    applyFinancePolicy: (input) => applyFinancePolicyToOrder(database, input),
    updateStatus: (input) => updateOrderStatus(database, input),
    findById: (orderId) => findOrderById(database, orderId)
  };
}

export async function markFinanceOrderPaid(
  database: FinanceTransaction,
  input: { readonly orderId: string; readonly now: string }
): Promise<FinanceOrder | null> {
  const [row] = await database
    .update(orders)
    .set({ status: "paid", updatedAt: new Date(input.now) })
    .where(and(eq(orders.id, input.orderId), eq(orders.status, "pending_payment")))
    .returning();
  return row ? toFinanceOrder(row) : null;
}

async function insertOrder(
  database: FinanceTransaction,
  input: CreateFinanceOrderRecordInput
): Promise<FinanceOrder> {
  const timestamp = new Date(input.now);
  const [row] = await database
    .insert(orders)
    .values({
      ...(input.id ? { id: input.id } : {}),
      clientUserId: input.clientUserId,
      astrologerUserId: input.astrologerUserId,
      productId: input.productId,
      directLinkIntentId: input.directLinkIntentId,
      bookingId: input.bookingId ?? null,
      status: input.status ?? "pending_payment",
      grossAmountMinor: input.grossAmount.amountMinor,
      grossCurrency: input.grossAmount.currency,
      platformFeeAmountMinor: input.platformFee.amountMinor,
      platformFeeCurrency: input.platformFee.currency,
      astrologerNetAmountMinor: input.astrologerNetAmount.amountMinor,
      astrologerNetCurrency: input.astrologerNetAmount.currency,
      financePolicySnapshotId: input.financePolicySnapshotId,
      financePolicyRiskTier: input.financePolicyRiskTier,
      financePolicyHoldDurationHours: input.financePolicyHoldDurationHours,
      financePolicyReserveBps: input.financePolicyReserveBps,
      financePolicyReserveReleaseDelayDays: input.financePolicyReserveReleaseDelayDays,
      financePolicyPlatformFeeBps: input.financePolicyPlatformFeeBps,
      financePolicyProviderSettlementRequired: input.financePolicyProviderSettlementRequired,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .returning();
  if (!row) throw new Error("Expected finance order insert to return a row");
  if (input.bookingId) {
    await claimPaidBookingHoldForOrder(database, {
      bookingId: input.bookingId,
      orderId: row.id,
      clientUserId: input.clientUserId,
      astrologerUserId: input.astrologerUserId,
      productId: input.productId,
      now: input.now
    });
  }
  return toFinanceOrder(row);
}

async function claimPaidBookingHoldForOrder(
  database: FinanceTransaction,
  input: {
    readonly bookingId: string;
    readonly orderId: string;
    readonly clientUserId: string;
    readonly astrologerUserId: string;
    readonly productId: string;
    readonly now: string;
  }
): Promise<void> {
  const [booking] = await database
    .update(bookings)
    .set({ state: "pending_payment", holdExpiresAt: null, updatedAt: new Date(input.now) })
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.clientUserId, input.clientUserId),
        eq(bookings.ownerUserId, input.astrologerUserId),
        eq(bookings.productId, input.productId),
        eq(bookings.source, "client_paid"),
        eq(bookings.state, "hold"),
        gt(bookings.holdExpiresAt, new Date(input.now))
      )
    )
    .returning({ reservationId: bookings.reservationId });
  if (!booking) throw new OrderBookingHoldNotClaimable();

  await database
    .update(scheduleReservations)
    .set({
      kind: "booking",
      sourceAggregateId: input.bookingId,
      holdExpiresAt: null,
      updatedAt: new Date(input.now)
    })
    .where(eq(scheduleReservations.id, booking.reservationId));
}

async function updateOrderStatus(
  database: FinanceDatabase,
  input: UpdateFinanceOrderStatusInput
): Promise<FinanceOrder | null> {
  const [row] = await database
    .update(orders)
    .set({ status: input.status, updatedAt: new Date(input.now) })
    .where(
      and(eq(orders.id, input.orderId), inArray(orders.status, paymentEventMutableOrderStatuses))
    )
    .returning();
  return row ? toFinanceOrder(row) : null;
}

async function applyFinancePolicyToOrder(
  database: FinanceDatabase,
  input: ApplyFinancePolicyToOrderInput
): Promise<FinanceOrder | null> {
  const [row] = await database
    .update(orders)
    .set({
      financePolicySnapshotId: input.financePolicySnapshotId,
      financePolicyRiskTier: input.financePolicyRiskTier,
      financePolicyHoldDurationHours: input.financePolicyHoldDurationHours,
      financePolicyReserveBps: input.financePolicyReserveBps,
      financePolicyReserveReleaseDelayDays: input.financePolicyReserveReleaseDelayDays,
      financePolicyPlatformFeeBps: input.financePolicyPlatformFeeBps,
      financePolicyProviderSettlementRequired: input.financePolicyProviderSettlementRequired,
      updatedAt: new Date(input.now)
    })
    .where(and(eq(orders.id, input.orderId), inArray(orders.status, policyApplicableOrderStatuses)))
    .returning();
  return row ? toFinanceOrder(row) : null;
}

async function findOrderById(
  database: FinanceDatabase,
  orderId: string
): Promise<FinanceOrder | null> {
  const [row] = await database.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return row ? toFinanceOrder(row) : null;
}

function toFinanceOrder(row: OrderRow): FinanceOrder {
  return {
    id: row.id,
    clientUserId: row.clientUserId,
    astrologerUserId: row.astrologerUserId,
    productId: row.productId,
    directLinkIntentId: row.directLinkIntentId,
    bookingId: row.bookingId,
    status: row.status as FinanceOrder["status"],
    grossAmount: money(row.grossAmountMinor, row.grossCurrency),
    platformFee: money(row.platformFeeAmountMinor, row.platformFeeCurrency),
    astrologerNetAmount: money(row.astrologerNetAmountMinor, row.astrologerNetCurrency),
    financePolicySnapshotId: row.financePolicySnapshotId,
    financePolicyRiskTier: row.financePolicyRiskTier as FinanceOrder["financePolicyRiskTier"],
    financePolicyHoldDurationHours: row.financePolicyHoldDurationHours,
    financePolicyReserveBps: row.financePolicyReserveBps,
    financePolicyReserveReleaseDelayDays: row.financePolicyReserveReleaseDelayDays,
    financePolicyPlatformFeeBps: row.financePolicyPlatformFeeBps,
    financePolicyProviderSettlementRequired: row.financePolicyProviderSettlementRequired,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function money(amountMinor: number, currency: string): Money {
  if (currency !== "RUB") throw new Error(`Unsupported finance currency: ${currency}`);
  return { amountMinor, currency };
}

const policyApplicableOrderStatuses = ["pending_payment", "paid", "fulfilled"] as const;
const paymentEventMutableOrderStatuses = [
  "pending_payment",
  "paid",
  "fulfilled",
  "partially_refunded"
] as const;

function readResultId(result: Record<string, unknown>, key: string): string {
  const value = result[key];
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`Finance idempotency result is missing ${key}`);
}
