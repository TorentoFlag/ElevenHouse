import { and, desc, eq, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type {
  ClientServiceWorkOrderItem,
  ClientServiceWorkPaymentItem,
  FinanceClientServiceWorkSummaryReader
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { clientAstrologerRelationships, orders, paymentAttempts } from "../../schema";

type ClientServiceWorkOrderRow = {
  readonly id: string;
  readonly status: string;
  readonly productTitle: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly bookingId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type ClientServiceWorkPaymentRow = {
  readonly id: string;
  readonly orderId: string;
  readonly status: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export function createDrizzleFinanceClientServiceWorkSummaryReader(
  database: ElevenHouseDatabase
): FinanceClientServiceWorkSummaryReader {
  return {
    listClientServiceWorkFinance: async (input) => {
      const now = new Date(input.now);
      const limit = normalizeLimit(input.limit);
      const ordersWhere = activeOrdersWhere(input.ownerUserId, input.clientUserId, [
        lte(orders.createdAt, now)
      ]);
      const paymentsWhere = activePaymentsWhere(input.ownerUserId, input.clientUserId, [
        lte(paymentAttempts.createdAt, now)
      ]);
      const [recentOrderTotal, recentOrders, recentPaymentTotal, recentPayments] =
        await Promise.all([
          countOrders(database, ordersWhere),
          database
            .select({
              id: orders.id,
              status: orders.status,
              productTitle: orders.productTitleSnapshot,
              amountMinor: orders.grossAmountMinor,
              currency: orders.grossCurrency,
              bookingId: orders.bookingId,
              createdAt: orders.createdAt,
              updatedAt: orders.updatedAt
            })
            .from(orders)
            .innerJoin(
              clientAstrologerRelationships,
              activeOrdersJoin(input.ownerUserId, input.clientUserId)
            )
            .where(ordersWhere)
            .orderBy(desc(orders.createdAt), desc(orders.id))
            .limit(limit),
          countPayments(database, paymentsWhere),
          database
            .select({
              id: paymentAttempts.id,
              orderId: paymentAttempts.orderId,
              status: paymentAttempts.status,
              amountMinor: paymentAttempts.amountMinor,
              currency: paymentAttempts.currency,
              createdAt: paymentAttempts.createdAt,
              updatedAt: paymentAttempts.updatedAt
            })
            .from(paymentAttempts)
            .innerJoin(orders, eq(orders.id, paymentAttempts.orderId))
            .innerJoin(
              clientAstrologerRelationships,
              activeOrdersJoin(input.ownerUserId, input.clientUserId)
            )
            .where(paymentsWhere)
            .orderBy(desc(paymentAttempts.createdAt), desc(paymentAttempts.id))
            .limit(limit)
        ]);

      return {
        orders: {
          recentTotal: recentOrderTotal,
          recent: recentOrders.map(toOrderItem)
        },
        payments: {
          recentTotal: recentPaymentTotal,
          recent: recentPayments.map(toPaymentItem)
        }
      };
    }
  };
}

function activeOrdersJoin(ownerUserId: string, clientUserId: string) {
  return and(
    eq(clientAstrologerRelationships.astrologerUserId, ownerUserId),
    eq(clientAstrologerRelationships.clientUserId, clientUserId),
    eq(clientAstrologerRelationships.status, "active"),
    eq(clientAstrologerRelationships.astrologerUserId, orders.astrologerUserId),
    eq(clientAstrologerRelationships.clientUserId, orders.clientUserId)
  );
}

function activeOrdersWhere(ownerUserId: string, clientUserId: string, predicates: readonly SQL[]) {
  return and(
    eq(orders.astrologerUserId, ownerUserId),
    eq(orders.clientUserId, clientUserId),
    ...predicates
  );
}

function activePaymentsWhere(
  ownerUserId: string,
  clientUserId: string,
  predicates: readonly SQL[]
) {
  return and(
    eq(orders.astrologerUserId, ownerUserId),
    eq(orders.clientUserId, clientUserId),
    ...predicates
  );
}

async function countOrders(
  database: ElevenHouseDatabase,
  where: ReturnType<typeof activeOrdersWhere>
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .innerJoin(
      clientAstrologerRelationships,
      and(
        eq(clientAstrologerRelationships.astrologerUserId, orders.astrologerUserId),
        eq(clientAstrologerRelationships.clientUserId, orders.clientUserId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .where(where);
  return Number(row?.count ?? 0);
}

async function countPayments(
  database: ElevenHouseDatabase,
  where: ReturnType<typeof activePaymentsWhere>
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(paymentAttempts)
    .innerJoin(orders, eq(orders.id, paymentAttempts.orderId))
    .innerJoin(
      clientAstrologerRelationships,
      and(
        eq(clientAstrologerRelationships.astrologerUserId, orders.astrologerUserId),
        eq(clientAstrologerRelationships.clientUserId, orders.clientUserId),
        eq(clientAstrologerRelationships.status, "active")
      )
    )
    .where(where);
  return Number(row?.count ?? 0);
}

function toOrderItem(order: ClientServiceWorkOrderRow): ClientServiceWorkOrderItem {
  return {
    id: order.id,
    status: order.status as ClientServiceWorkOrderItem["status"],
    productTitle: order.productTitle,
    amountMinor: order.amountMinor,
    currency: order.currency,
    bookingId: order.bookingId,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString()
  };
}

function toPaymentItem(payment: ClientServiceWorkPaymentRow): ClientServiceWorkPaymentItem {
  return {
    id: payment.id,
    orderId: payment.orderId,
    status: payment.status as ClientServiceWorkPaymentItem["status"],
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString()
  };
}

function normalizeLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1) return 3;
  return Math.min(value, 3);
}
