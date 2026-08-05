/* eslint-disable no-control-regex -- Persistence boundary validation intentionally rejects ASCII control characters. */
import {
  createProviderDispatchEnvelope,
  type ClientOrderCheckoutPreparationReceipt,
  type ClientOrderCheckoutPreparationUnitOfWork,
  type FinanceDigest,
  type PrepareClientOrderCheckoutCommand,
  type ProviderDispatchAuthorizationReceipt
} from "@elevenhouse/domain/finance-core";
import { eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeClientCheckoutAuthorizations } from "../../schema/finance/client-checkout-authorizations.schema";
import { financeClientCheckoutPreparations } from "../../schema/finance/client-checkouts.schema";
import { orders } from "../../schema/finance/orders.schema";
import { mapClientCheckoutPreparationRow } from "./drizzle-client-checkout-preparation-store";
import {
  createEconomicPaymentIntentInTransaction,
  EconomicPaymentIntentCreationPersistenceError
} from "./drizzle-economic-payment-intent-creation-uow";
import {
  openEconomicPaymentSessionInTransaction,
  EconomicPaymentSessionOpenPersistenceError
} from "./drizzle-economic-payment-session-open-uow";
import {
  persistProviderOperationBeforeIoInTransaction,
  ProviderOperationIntentCreationPersistenceError
} from "./drizzle-provider-operation-intent-creation-uow";

type FinanceTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];

export type ClientOrderCheckoutPreparationPersistenceReason =
  | "invalid_command"
  | "order_not_found"
  | "order_owner_mismatch"
  | "order_not_payable"
  | "order_currency_unsupported"
  | "checkout_economics_mismatch"
  | "checkout_identity_conflict"
  | "checkout_preparation_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class ClientOrderCheckoutPreparationPersistenceError extends Error {
  readonly code = "client_order_checkout_preparation_persistence_error";

  constructor(readonly reason: ClientOrderCheckoutPreparationPersistenceReason) {
    super("Client order checkout could not be prepared atomically");
    this.name = "ClientOrderCheckoutPreparationPersistenceError";
  }
}

/**
 * Commits every pre-provider fact for one client Hosted Checkout attempt. The ArcPay call itself
 * is deliberately absent: the outbox written by the provider-operation boundary is consumed only
 * after this transaction commits.
 */
export function createDrizzleClientOrderCheckoutPreparationUnitOfWork(
  database: ElevenHouseDatabase
): ClientOrderCheckoutPreparationUnitOfWork {
  return Object.freeze({
    async prepareClientOrderCheckout(command) {
      const normalized = normalizeCommand(command);
      try {
        return await database.transaction((transaction) =>
          prepareInTransaction(transaction, normalized)
        );
      } catch (error) {
        if (error instanceof ClientOrderCheckoutPreparationPersistenceError) throw error;
        if (
          error instanceof EconomicPaymentIntentCreationPersistenceError ||
          error instanceof EconomicPaymentSessionOpenPersistenceError ||
          error instanceof ProviderOperationIntentCreationPersistenceError
        ) {
          fail("persistence_write_incomplete");
        }
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("checkout_preparation_conflict");
        if (code === "23503" || code === "23514") fail("persistence_write_incomplete");
        throw error;
      }
    }
  });
}

type NormalizedCommand = Readonly<{
  checkoutPreparationId: string;
  checkoutAuthorizationId: string;
  paymentCommandId: string;
  orderId: string;
  clientUserId: string;
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  providerOperationIntentId: string;
  providerAccount: PrepareClientOrderCheckoutCommand["providerAccount"];
  dispatchEnvelope: Extract<
    PrepareClientOrderCheckoutCommand["dispatchEnvelope"],
    { kind: "checkout_session_create" }
  >;
  dispatchArtifact: PrepareClientOrderCheckoutCommand["dispatchArtifact"];
  idempotencyKey: string;
  idempotencyRetentionDeadline: string;
  captureAuthority: PrepareClientOrderCheckoutCommand["captureAuthority"];
  operationEnvelope: PrepareClientOrderCheckoutCommand["operationEnvelope"];
}>;

async function prepareInTransaction(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<ClientOrderCheckoutPreparationReceipt> {
  const order = await lockOrder(transaction, command);
  assertCheckoutEconomics(order, command);
  await transaction.execute(
    sql`select pg_advisory_xact_lock(
      hashtextextended(${`finance-client-order-checkout-command:${command.paymentCommandId}`}, 0)
    )`
  );

  const existingAuthorization = await findAuthorizationByCommand(
    transaction,
    command.paymentCommandId
  );
  if (existingAuthorization) {
    return replayPreparedCheckout(transaction, command, existingAuthorization);
  }

  await createEconomicPaymentIntentInTransaction(transaction, {
    economicPaymentIntentId: command.economicPaymentIntentId,
    sourceId: command.orderId,
    purpose: "client_order",
    providerAccount: command.providerAccount,
    amountMinor: String(order.grossAmountMinor),
    currency: "RUB",
    expectedSourceUniquenessVersion: 0
  });
  await openEconomicPaymentSessionInTransaction(transaction, {
    economicPaymentIntentId: command.economicPaymentIntentId,
    economicPaymentSessionId: command.economicPaymentSessionId,
    expectedEconomicPaymentVersion: 1,
    providerAccount: command.providerAccount
  });

  const authorization = await issueAuthorization(transaction, command);
  const providerDispatch = await persistProviderOperationBeforeIoInTransaction(transaction, {
    providerOperationIntentId: command.providerOperationIntentId,
    economicPaymentIntentId: command.economicPaymentIntentId,
    expectedEconomicPaymentVersion: 2,
    expectedProviderOperationSourceVersion: 0,
    economicPaymentSessionId: command.economicPaymentSessionId,
    providerAccount: command.providerAccount,
    operationKind: "checkout_session_create",
    dispatchEnvelope: command.dispatchEnvelope,
    dispatchAuthorization: authorization,
    dispatchArtifact: command.dispatchArtifact,
    replacementAuthority: null,
    idempotencyKey: command.idempotencyKey,
    idempotencyRetentionDeadline: command.idempotencyRetentionDeadline,
    operationEnvelope: command.operationEnvelope
  });

  const [preparation] = await transaction
    .insert(financeClientCheckoutPreparations)
    .values({
      id: command.checkoutPreparationId,
      orderId: command.orderId,
      clientUserId: command.clientUserId,
      economicPaymentIntentId: command.economicPaymentIntentId,
      economicPaymentSessionId: command.economicPaymentSessionId,
      providerOperationIntentId: command.providerOperationIntentId,
      requestArtifactId: command.dispatchArtifact.artifactId,
      requestArtifactDigest: command.dispatchArtifact.sha256Digest,
      state: "checkout_requested",
      version: "1"
    })
    .returning();
  if (!preparation) fail("persistence_write_incomplete");

  return Object.freeze({
    kind: "client_order_checkout_preparation_receipt",
    checkoutPreparation: mapClientCheckoutPreparationRow(preparation),
    providerDispatch
  });
}

async function lockOrder(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<typeof orders.$inferSelect> {
  const [order] = await transaction
    .select()
    .from(orders)
    .where(eq(orders.id, command.orderId))
    .limit(1)
    .for("update");
  if (!order) fail("order_not_found");
  if (order.clientUserId !== command.clientUserId) fail("order_owner_mismatch");
  if (order.status !== "pending_payment") fail("order_not_payable");
  if (order.grossCurrency !== "RUB") fail("order_currency_unsupported");
  return order;
}

function assertCheckoutEconomics(
  order: typeof orders.$inferSelect,
  command: NormalizedCommand
): void {
  if (
    command.dispatchEnvelope.orderId !== command.orderId ||
    command.dispatchEnvelope.amount.currency !== "RUB" ||
    command.dispatchEnvelope.amount.amountMinor !== order.grossAmountMinor
  ) {
    fail("checkout_economics_mismatch");
  }
}

async function issueAuthorization(
  transaction: FinanceTransaction,
  command: NormalizedCommand
): Promise<
  Extract<ProviderDispatchAuthorizationReceipt, { kind: "client_order_checkout_authorization" }>
> {
  const [row] = await transaction
    .insert(financeClientCheckoutAuthorizations)
    .values({
      authorityId: command.checkoutAuthorizationId,
      orderId: command.orderId,
      clientUserId: command.clientUserId,
      paymentCommandId: command.paymentCommandId,
      orderSnapshotVersion: "1",
      economicPaymentIntentId: command.economicPaymentIntentId,
      economicPaymentSessionId: command.economicPaymentSessionId,
      providerOperationIntentId: command.providerOperationIntentId,
      riskPolicyId: command.captureAuthority.riskPolicy.policyId,
      riskPolicyVersion: String(command.captureAuthority.riskPolicy.policyVersion),
      riskPolicyDigest: command.captureAuthority.riskPolicy.canonicalDigest,
      fulfillmentDecisionId: command.captureAuthority.fulfillmentDecision.registryKey,
      fulfillmentDecisionVersion: String(
        command.captureAuthority.fulfillmentDecision.registryRevision
      ),
      fulfillmentDecisionDigest: command.captureAuthority.fulfillmentDecision.canonicalDigest
    })
    .returning();
  if (!row) fail("persistence_write_incomplete");
  return authorizationReceipt(row);
}

async function findAuthorizationByCommand(
  transaction: FinanceTransaction,
  paymentCommandId: string
): Promise<typeof financeClientCheckoutAuthorizations.$inferSelect | null> {
  const [authorization] = await transaction
    .select()
    .from(financeClientCheckoutAuthorizations)
    .where(eq(financeClientCheckoutAuthorizations.paymentCommandId, paymentCommandId))
    .limit(1)
    .for("update");
  return authorization ?? null;
}

async function replayPreparedCheckout(
  transaction: FinanceTransaction,
  command: NormalizedCommand,
  authorization: typeof financeClientCheckoutAuthorizations.$inferSelect
): Promise<ClientOrderCheckoutPreparationReceipt> {
  if (
    authorization.authorityId !== command.checkoutAuthorizationId ||
    authorization.orderId !== command.orderId ||
    authorization.clientUserId !== command.clientUserId ||
    authorization.economicPaymentIntentId !== command.economicPaymentIntentId ||
    authorization.economicPaymentSessionId !== command.economicPaymentSessionId ||
    authorization.providerOperationIntentId !== command.providerOperationIntentId
  ) {
    fail("checkout_identity_conflict");
  }
  const providerDispatch = await persistProviderOperationBeforeIoInTransaction(transaction, {
    providerOperationIntentId: command.providerOperationIntentId,
    economicPaymentIntentId: command.economicPaymentIntentId,
    expectedEconomicPaymentVersion: 2,
    expectedProviderOperationSourceVersion: 0,
    economicPaymentSessionId: command.economicPaymentSessionId,
    providerAccount: command.providerAccount,
    operationKind: "checkout_session_create",
    dispatchEnvelope: command.dispatchEnvelope,
    dispatchAuthorization: authorizationReceipt(authorization),
    dispatchArtifact: command.dispatchArtifact,
    replacementAuthority: null,
    idempotencyKey: command.idempotencyKey,
    idempotencyRetentionDeadline: command.idempotencyRetentionDeadline,
    operationEnvelope: command.operationEnvelope
  });
  const [preparation] = await transaction
    .select()
    .from(financeClientCheckoutPreparations)
    .where(
      eq(
        financeClientCheckoutPreparations.providerOperationIntentId,
        command.providerOperationIntentId
      )
    )
    .limit(1)
    .for("share");
  if (!preparation) fail("persistence_write_incomplete");
  if (
    preparation.id !== command.checkoutPreparationId ||
    preparation.orderId !== command.orderId ||
    preparation.clientUserId !== command.clientUserId ||
    preparation.requestArtifactId !== command.dispatchArtifact.artifactId ||
    preparation.requestArtifactDigest !== command.dispatchArtifact.sha256Digest
  ) {
    fail("checkout_identity_conflict");
  }
  return Object.freeze({
    kind: "client_order_checkout_preparation_receipt",
    checkoutPreparation: mapClientCheckoutPreparationRow(preparation),
    providerDispatch
  });
}

function authorizationReceipt(
  row: typeof financeClientCheckoutAuthorizations.$inferSelect
): Extract<ProviderDispatchAuthorizationReceipt, { kind: "client_order_checkout_authorization" }> {
  if (
    row.orderSnapshotVersion !== "1" ||
    !/^sha256:[a-f0-9]{64}$/.test(row.canonicalDigest) ||
    !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef)
  ) {
    fail("persistence_write_incomplete");
  }
  return Object.freeze({
    kind: "client_order_checkout_authorization" as const,
    authorityId: row.authorityId,
    authorityVersion: row.orderSnapshotVersion,
    authorityDigest: row.canonicalDigest as FinanceDigest,
    sourceId: row.orderId,
    orderId: row.orderId,
    orderSnapshotVersion: 1,
    paymentCommandId: row.paymentCommandId
  }) as unknown as Extract<
    ProviderDispatchAuthorizationReceipt,
    { kind: "client_order_checkout_authorization" }
  >;
}

function normalizeCommand(command: PrepareClientOrderCheckoutCommand): NormalizedCommand {
  try {
    assertExactKeys(command, [
      "checkoutPreparationId",
      "checkoutAuthorizationId",
      "paymentCommandId",
      "orderId",
      "clientUserId",
      "economicPaymentIntentId",
      "economicPaymentSessionId",
      "providerOperationIntentId",
      "providerAccount",
      "dispatchEnvelope",
      "dispatchArtifact",
      "idempotencyKey",
      "idempotencyRetentionDeadline",
      "captureAuthority",
      "operationEnvelope"
    ]);
    const dispatchEnvelope = createProviderDispatchEnvelope(command.dispatchEnvelope);
    if (dispatchEnvelope.kind !== "checkout_session_create") fail("invalid_command");
    return Object.freeze({
      checkoutPreparationId: uuid(command.checkoutPreparationId),
      checkoutAuthorizationId: identifier(command.checkoutAuthorizationId),
      paymentCommandId: uuid(command.paymentCommandId),
      orderId: uuid(command.orderId),
      clientUserId: uuid(command.clientUserId),
      economicPaymentIntentId: identifier(command.economicPaymentIntentId),
      economicPaymentSessionId: identifier(command.economicPaymentSessionId),
      providerOperationIntentId: uuid(command.providerOperationIntentId),
      providerAccount: command.providerAccount,
      dispatchEnvelope,
      dispatchArtifact: command.dispatchArtifact,
      idempotencyKey: identifier(command.idempotencyKey),
      idempotencyRetentionDeadline: instant(command.idempotencyRetentionDeadline),
      captureAuthority: captureAuthority(command.captureAuthority),
      operationEnvelope: command.operationEnvelope
    });
  } catch (error) {
    if (error instanceof ClientOrderCheckoutPreparationPersistenceError) throw error;
    fail("invalid_command");
  }
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    fail("invalid_command");
  }
  return value;
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail("invalid_command");
  }
  return value;
}

function instant(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) fail("invalid_command");
  return value;
}

function captureAuthority(
  value: PrepareClientOrderCheckoutCommand["captureAuthority"]
): PrepareClientOrderCheckoutCommand["captureAuthority"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_command");
  const input = value as Readonly<Record<string, unknown>>;
  assertExactKeys(input, ["riskPolicy", "fulfillmentDecision"]);
  const risk = input.riskPolicy;
  const fulfillment = input.fulfillmentDecision;
  if (
    typeof risk !== "object" ||
    risk === null ||
    Array.isArray(risk) ||
    typeof fulfillment !== "object" ||
    fulfillment === null ||
    Array.isArray(fulfillment)
  ) {
    fail("invalid_command");
  }
  assertExactKeys(risk, ["policyId", "policyVersion", "canonicalDigest"]);
  assertExactKeys(fulfillment, ["registryKey", "registryRevision", "canonicalDigest"]);
  const riskValue = risk as Readonly<Record<string, unknown>>;
  const fulfillmentValue = fulfillment as Readonly<Record<string, unknown>>;
  return Object.freeze({
    riskPolicy: Object.freeze({
      policyId: identifier(riskValue.policyId),
      policyVersion: positiveInteger(riskValue.policyVersion),
      canonicalDigest: digest(riskValue.canonicalDigest)
    }),
    fulfillmentDecision: Object.freeze({
      registryKey: identifier(fulfillmentValue.registryKey),
      registryRevision: positiveInteger(fulfillmentValue.registryRevision),
      canonicalDigest: digest(fulfillmentValue.canonicalDigest)
    })
  }) as PrepareClientOrderCheckoutCommand["captureAuthority"];
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail("invalid_command");
  return value as number;
}

function digest(value: unknown): `sha256:${string}` {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) fail("invalid_command");
  return value as `sha256:${string}`;
}

function assertExactKeys(value: unknown, expected: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_command");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length) fail("invalid_command");
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid_command");
  }
}

function postgresCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    const record = current as Readonly<{ code?: unknown; cause?: unknown }>;
    if (typeof record.code === "string") return record.code;
    current = record.cause;
  }
  return undefined;
}

function fail(reason: ClientOrderCheckoutPreparationPersistenceReason): never {
  throw new ClientOrderCheckoutPreparationPersistenceError(reason);
}
