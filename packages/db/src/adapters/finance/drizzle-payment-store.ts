import { and, eq, isNull } from "drizzle-orm";
import {
  FinanceProviderPaymentMismatchError,
  FinanceProviderContextMismatchError,
  type CreatePaymentAttemptInput,
  type CreateRefundInput,
  type FinancePaymentProvider,
  type LinkPaymentAttemptToProviderPaymentInput,
  type Money,
  type PaymentAttempt,
  type MarkPaymentAttemptCheckoutOpenedInput,
  type PaymentProviderEnvironment,
  type PaymentProviderEvent,
  type PaymentStore,
  type RecordPaymentProviderEventInput,
  type RefundRecord
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { paymentAttempts, paymentProviderEvents, refunds } from "../../schema";
import {
  executeIdempotentFinanceCommand,
  hasPostgresConstraintViolation,
  type FinanceDatabase
} from "./drizzle-finance-command-store";

type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;
type PaymentProviderEventRow = typeof paymentProviderEvents.$inferSelect;
type RefundRow = typeof refunds.$inferSelect;

const paymentAttemptProviderPaymentUnique = "payment_attempts_provider_payment_unique";

export function createDrizzlePaymentStore(database: ElevenHouseDatabase): PaymentStore {
  return {
    executeCreateCheckout: (command, createInput) =>
      executeIdempotentFinanceCommand({
        database,
        command,
        create: async (transaction) => {
          const attempt = await createPaymentAttempt(transaction, await createInput());
          return { result: { paymentAttemptId: attempt.id }, value: attempt };
        },
        replay: (result) => {
          const paymentAttemptId = readResultId(result, "paymentAttemptId");
          return findPaymentAttemptById(database, paymentAttemptId);
        }
      }),
    createAttempt: (input) => createPaymentAttempt(database, input),
    markAttemptCheckoutOpened: (input) => markPaymentAttemptCheckoutOpened(database, input),
    ...createDrizzlePaymentWebhookStore(database),
    createRefund: (input) => createRefund(database, input),
    findAttemptById: (paymentAttemptId) => findPaymentAttemptById(database, paymentAttemptId),
    findAttemptByProviderPaymentId: (input) =>
      findPaymentAttemptByProviderPaymentId(database, input)
  };
}

export function createDrizzlePaymentWebhookStore(
  database: FinanceDatabase
): Pick<
  PaymentStore,
  | "linkAttemptToProviderPayment"
  | "recordProviderEvent"
  | "findProviderEventByWebhookId"
  | "findAttemptById"
  | "createRefund"
> {
  return {
    linkAttemptToProviderPayment: (input) => linkPaymentAttemptToProviderPayment(database, input),
    recordProviderEvent: (input) => recordProviderEvent(database, input),
    findProviderEventByWebhookId: (input) => findProviderEventByWebhookId(database, input),
    findAttemptById: (paymentAttemptId) => findPaymentAttemptById(database, paymentAttemptId),
    createRefund: (input) => createRefund(database, input)
  };
}

async function linkPaymentAttemptToProviderPayment(
  database: FinanceDatabase,
  input: LinkPaymentAttemptToProviderPaymentInput
): Promise<PaymentAttempt | null> {
  const existing = await findPaymentAttemptById(database, input.paymentAttemptId);
  if (!existing) return null;
  if (existing.provider !== input.provider || existing.environment !== input.environment) {
    throw new FinanceProviderContextMismatchError();
  }
  assertProviderEventPaymentMatchesAttempt(
    { providerPaymentId: input.providerPaymentId },
    existing
  );
  if (existing.providerPaymentId) return existing;

  try {
    const [row] = await database
      .update(paymentAttempts)
      .set({ providerPaymentId: input.providerPaymentId, updatedAt: new Date(input.now) })
      .where(
        and(
          eq(paymentAttempts.id, input.paymentAttemptId),
          isNull(paymentAttempts.providerPaymentId)
        )
      )
      .returning();
    if (row) return toPaymentAttempt(row);
  } catch (error) {
    if (!isPaymentAttemptProviderPaymentUniqueViolation(error)) throw error;
    const linkedElsewhere = await findPaymentAttemptByProviderPaymentId(database, input);
    if (linkedElsewhere?.id !== input.paymentAttemptId) {
      throw new FinanceProviderPaymentMismatchError();
    }
    return linkedElsewhere;
  }

  const replayed = await findPaymentAttemptById(database, input.paymentAttemptId);
  if (!replayed) return null;
  assertProviderEventPaymentMatchesAttempt(
    { providerPaymentId: input.providerPaymentId },
    replayed
  );
  if (!replayed.providerPaymentId) {
    throw new Error("Payment attempt provider payment id was not persisted");
  }
  return replayed;
}

async function createPaymentAttempt(
  database: FinanceDatabase,
  input: CreatePaymentAttemptInput
): Promise<PaymentAttempt> {
  try {
    const timestamp = new Date(input.now);
    const [row] = await database
      .insert(paymentAttempts)
      .values({
        ...(input.id ? { id: input.id } : {}),
        orderId: input.orderId,
        provider: input.provider,
        environment: input.environment,
        status: input.status ?? "created",
        amountMinor: input.amount.amountMinor,
        currency: input.amount.currency,
        providerPaymentId: input.providerPaymentId,
        providerCheckoutId: input.providerCheckoutId,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .returning();
    if (!row) throw new Error("Expected payment attempt insert to return a row");
    return toPaymentAttempt(row);
  } catch (error) {
    if (!isPaymentAttemptProviderPaymentUniqueViolation(error) || !input.providerPaymentId) {
      throw error;
    }
  }

  const existing = await findPaymentAttemptByProviderPaymentId(database, {
    provider: input.provider,
    environment: input.environment,
    providerPaymentId: input.providerPaymentId
  });
  if (!existing) throw new Error("Expected existing payment attempt after provider dedupe");
  return existing;
}

async function markPaymentAttemptCheckoutOpened(
  database: ElevenHouseDatabase,
  input: MarkPaymentAttemptCheckoutOpenedInput
): Promise<PaymentAttempt | null> {
  const existing = await findPaymentAttemptById(database, input.paymentAttemptId);
  if (!existing) return null;
  if (existing.providerCheckoutId && existing.providerCheckoutId !== input.providerCheckoutId) {
    throw new Error("Payment attempt already has a different provider checkout id");
  }

  const [row] = await database
    .update(paymentAttempts)
    .set({
      status:
        existing.status === "created" || existing.status === "checkout_opened"
          ? "checkout_opened"
          : existing.status,
      providerCheckoutId: input.providerCheckoutId,
      metadata: { ...existing.metadata, checkoutUrl: input.checkoutUrl },
      updatedAt: new Date(input.now)
    })
    .where(eq(paymentAttempts.id, input.paymentAttemptId))
    .returning();
  return row ? toPaymentAttempt(row) : null;
}

async function recordProviderEvent(
  database: FinanceDatabase,
  input: RecordPaymentProviderEventInput
): Promise<{ readonly kind: "created" | "replayed"; readonly event: PaymentProviderEvent }> {
  if (input.paymentAttemptId) {
    const attempt = await findPaymentAttemptById(database, input.paymentAttemptId);
    if (!attempt) throw new Error("Linked payment attempt for provider event was not found");
    resolveFinanceRefundProviderContext(input, attempt);
    assertProviderEventPaymentMatchesAttempt(input, attempt);
  }

  const [row] = await database
    .insert(paymentProviderEvents)
    .values({
      ...(input.id ? { id: input.id } : {}),
      paymentAttemptId: input.paymentAttemptId,
      provider: input.provider,
      environment: input.environment,
      providerWebhookId: input.providerWebhookId,
      providerPaymentId: input.providerPaymentId,
      type: input.type,
      occurredAt: new Date(input.occurredAt),
      receivedAt: new Date(input.receivedAt),
      payload: input.payload
    })
    .onConflictDoNothing()
    .returning();
  if (row) return { kind: "created", event: toPaymentProviderEvent(row) };

  const existing = await findProviderEventByWebhookId(database, input);
  if (!existing) throw new Error("Expected existing provider event after webhook dedupe");
  return { kind: "replayed", event: existing };
}

async function findProviderEventByWebhookId(
  database: FinanceDatabase,
  input: {
    readonly provider: FinancePaymentProvider;
    readonly environment: PaymentProviderEnvironment;
    readonly providerWebhookId: string;
  }
): Promise<PaymentProviderEvent | null> {
  const [row] = await database
    .select()
    .from(paymentProviderEvents)
    .where(
      and(
        eq(paymentProviderEvents.provider, input.provider),
        eq(paymentProviderEvents.environment, input.environment),
        eq(paymentProviderEvents.providerWebhookId, input.providerWebhookId)
      )
    )
    .limit(1);
  return row ? toPaymentProviderEvent(row) : null;
}

async function createRefund(
  database: FinanceDatabase,
  input: CreateRefundInput
): Promise<{ readonly kind: "created" | "replayed"; readonly refund: RefundRecord }> {
  const attempt = await findPaymentAttemptById(database, input.paymentAttemptId);
  if (!attempt) throw new Error("Payment attempt for refund was not found");
  const providerContext = resolveFinanceRefundProviderContext(input, attempt);

  const timestamp = new Date(input.now);
  const [inserted] = await database
    .insert(refunds)
    .values({
      ...(input.id ? { id: input.id } : {}),
      orderId: input.orderId,
      paymentAttemptId: input.paymentAttemptId,
      providerEventId: input.providerEventId,
      provider: providerContext.provider,
      environment: providerContext.environment,
      status: input.status ?? "requested",
      amountMinor: input.amount.amountMinor,
      currency: input.amount.currency,
      reason: input.reason,
      providerRefundId: input.providerRefundId,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) return { kind: "created", refund: toRefund(inserted) };
  if (!input.providerRefundId) throw new Error("Expected refund insert to return a row");

  const [existing] = await database
    .select()
    .from(refunds)
    .where(
      and(
        eq(refunds.provider, providerContext.provider),
        eq(refunds.environment, providerContext.environment),
        eq(refunds.providerRefundId, input.providerRefundId)
      )
    )
    .limit(1);
  if (!existing) throw new Error("Expected existing refund after provider refund dedupe");
  return { kind: "replayed", refund: toRefund(existing) };
}

async function findPaymentAttemptById(
  database: FinanceDatabase,
  paymentAttemptId: string
): Promise<PaymentAttempt | null> {
  const [row] = await database
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, paymentAttemptId))
    .limit(1);
  return row ? toPaymentAttempt(row) : null;
}

async function findPaymentAttemptByProviderPaymentId(
  database: FinanceDatabase,
  input: {
    readonly provider: FinancePaymentProvider;
    readonly environment: PaymentProviderEnvironment;
    readonly providerPaymentId: string;
  }
): Promise<PaymentAttempt | null> {
  const [row] = await database
    .select()
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.provider, input.provider),
        eq(paymentAttempts.environment, input.environment),
        eq(paymentAttempts.providerPaymentId, input.providerPaymentId)
      )
    )
    .limit(1);
  return row ? toPaymentAttempt(row) : null;
}

export function resolveFinanceRefundProviderContext(
  input: Pick<CreateRefundInput, "provider" | "environment">,
  attempt: Pick<PaymentAttempt, "provider" | "environment">
): { readonly provider: FinancePaymentProvider; readonly environment: PaymentProviderEnvironment } {
  if (input.provider && input.provider !== attempt.provider) {
    throw new FinanceProviderContextMismatchError();
  }
  if (input.environment && input.environment !== attempt.environment) {
    throw new FinanceProviderContextMismatchError();
  }
  return { provider: attempt.provider, environment: attempt.environment };
}

export function assertProviderEventPaymentMatchesAttempt(
  input: Pick<RecordPaymentProviderEventInput, "providerPaymentId">,
  attempt: Pick<PaymentAttempt, "providerPaymentId">
): void {
  if (
    input.providerPaymentId &&
    attempt.providerPaymentId &&
    input.providerPaymentId !== attempt.providerPaymentId
  ) {
    throw new FinanceProviderPaymentMismatchError();
  }
}

function toPaymentAttempt(row: PaymentAttemptRow): PaymentAttempt {
  return {
    id: row.id,
    orderId: row.orderId,
    provider: row.provider as FinancePaymentProvider,
    environment: row.environment as PaymentProviderEnvironment,
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

function toPaymentProviderEvent(row: PaymentProviderEventRow): PaymentProviderEvent {
  return {
    id: row.id,
    paymentAttemptId: row.paymentAttemptId,
    provider: row.provider as FinancePaymentProvider,
    environment: row.environment as PaymentProviderEnvironment,
    providerWebhookId: row.providerWebhookId,
    providerPaymentId: row.providerPaymentId,
    type: row.type as PaymentProviderEvent["type"],
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    payload: row.payload
  };
}

function toRefund(row: RefundRow): RefundRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    paymentAttemptId: row.paymentAttemptId,
    providerEventId: row.providerEventId,
    provider: row.provider as FinancePaymentProvider,
    environment: row.environment as PaymentProviderEnvironment,
    status: row.status as RefundRecord["status"],
    amount: money(row.amountMinor, row.currency),
    reason: row.reason,
    providerRefundId: row.providerRefundId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function money(amountMinor: number, currency: string): Money {
  if (currency !== "RUB") throw new Error(`Unsupported finance currency: ${currency}`);
  return { amountMinor, currency };
}

function isPaymentAttemptProviderPaymentUniqueViolation(error: unknown): boolean {
  return hasPostgresConstraintViolation(error, "23505", paymentAttemptProviderPaymentUnique);
}

function readResultId(result: Record<string, unknown>, key: string): string {
  const value = result[key];
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`Finance idempotency result is missing ${key}`);
}
