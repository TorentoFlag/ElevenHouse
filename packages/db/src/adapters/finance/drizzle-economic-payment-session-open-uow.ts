import {
  createProviderAccountIdentityBinding,
  type EconomicPaymentSessionOpenReceipt,
  type EconomicPaymentSessionOpenUnitOfWork,
  type FinanceProviderAccountIdentity,
  type OpenEconomicPaymentSessionCommand
} from "@elevenhouse/domain/finance-core";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeEconomicPaymentIntents,
  financeEconomicPaymentSessionOpenReceipts,
  financeEconomicPaymentSessions
} from "../../schema/finance/economic-payments.schema";
import {
  financeProviderAccountSeries,
  financeProviderAccounts
} from "../../schema/finance/provider-accounts.schema";
import { decodeFinancePositiveRevision, encodeFinanceNumeric38 } from "./finance-row-codecs";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export const economicPaymentSessionOpenWriteBoundaryValues = Object.freeze([
  "economic_payment_session",
  "economic_payment_head",
  "economic_payment_session_open_receipt"
] as const);

export type EconomicPaymentSessionOpenWriteBoundary =
  (typeof economicPaymentSessionOpenWriteBoundaryValues)[number];

export type EconomicPaymentSessionOpenFailureInjector = (
  boundary: EconomicPaymentSessionOpenWriteBoundary
) => void | Promise<void>;

export type EconomicPaymentSessionOpenPersistenceReason =
  | "invalid_command"
  | "provider_binding_not_found"
  | "provider_binding_not_active"
  | "economic_payment_not_found"
  | "economic_payment_version_conflict"
  | "economic_payment_correlation_conflict"
  | "economic_payment_state_conflict"
  | "session_identity_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class EconomicPaymentSessionOpenPersistenceError extends Error {
  readonly code = "economic_payment_session_open_persistence_error";

  constructor(readonly reason: EconomicPaymentSessionOpenPersistenceReason) {
    super("Economic payment session could not be opened atomically");
  }
}

export function createDrizzleEconomicPaymentSessionOpenUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: {
  readonly database: NodePgDatabase<TSchema>;
  readonly afterWriteBoundary?: EconomicPaymentSessionOpenFailureInjector;
}): EconomicPaymentSessionOpenUnitOfWork {
  const unitOfWork = {
    async openEconomicPaymentSession(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          openInTransaction(transaction, normalized, input.afterWriteBoundary ?? noFailureInjection)
        );
      } catch (error) {
        if (error instanceof EconomicPaymentSessionOpenPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("session_identity_conflict");
        if (code === "23503" || code === "23514") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies EconomicPaymentSessionOpenUnitOfWork;
  return Object.freeze(unitOfWork);
}

/**
 * Internal composition hook for a larger PostgreSQL transaction. It retains this adapter's
 * validation and receipt semantics, but never opens a nested transaction.
 */
export async function openEconomicPaymentSessionInTransaction<
  TSchema extends Record<string, unknown>
>(
  transaction: FinanceTransaction<TSchema>,
  command: OpenEconomicPaymentSessionCommand,
  afterWriteBoundary: EconomicPaymentSessionOpenFailureInjector = noFailureInjection
): Promise<EconomicPaymentSessionOpenReceipt> {
  return openInTransaction(transaction, normalizeCommand(command), afterWriteBoundary);
}

type NormalizedCommand = Readonly<{
  economicPaymentIntentId: string;
  economicPaymentSessionId: string;
  expectedEconomicPaymentVersion: number;
  providerAccount: FinanceProviderAccountIdentity;
}>;

async function openInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  afterWriteBoundary: EconomicPaymentSessionOpenFailureInjector
): Promise<EconomicPaymentSessionOpenReceipt> {
  const intent = await lockEconomicIntent(transaction, command.economicPaymentIntentId);
  const existingSession = await lockSession(transaction, command.economicPaymentSessionId);
  if (existingSession) return replayExistingSession(transaction, command, intent, existingSession);

  await lockExactProviderBinding(transaction, command.providerAccount, true);
  assertIntentCorrelation(intent, command);
  const actualVersion = positiveSafeVersion(intent.version);
  if (actualVersion !== command.expectedEconomicPaymentVersion)
    fail("economic_payment_version_conflict");
  if (!isOpenableState(intent.state)) fail("economic_payment_state_conflict");

  const nextIntentVersion = actualVersion + 1;
  const insertedSession = await transaction
    .insert(financeEconomicPaymentSessions)
    .values({
      id: command.economicPaymentSessionId,
      economicPaymentIntentId: command.economicPaymentIntentId,
      seriesId: command.providerAccount.seriesId,
      providerAccountId: command.providerAccount.providerAccountId,
      providerIdentityVersion: command.providerAccount.identityVersion,
      state: "checkout_opened",
      version: "1",
      intentVersionOpened: String(nextIntentVersion)
    })
    .returning({ id: financeEconomicPaymentSessions.id });
  if (insertedSession.length !== 1 || insertedSession[0]?.id !== command.economicPaymentSessionId) {
    fail("persistence_write_incomplete");
  }
  await afterWriteBoundary("economic_payment_session");

  const updatedIntent = await transaction
    .update(financeEconomicPaymentIntents)
    .set({ state: "checkout_opened", version: String(nextIntentVersion) })
    .where(
      and(
        eq(financeEconomicPaymentIntents.id, command.economicPaymentIntentId),
        eq(financeEconomicPaymentIntents.version, String(actualVersion)),
        eq(financeEconomicPaymentIntents.state, intent.state)
      )
    )
    .returning({ id: financeEconomicPaymentIntents.id });
  if (updatedIntent.length !== 1 || updatedIntent[0]?.id !== command.economicPaymentIntentId) {
    fail("economic_payment_version_conflict");
  }
  await afterWriteBoundary("economic_payment_head");

  const [receipt] = await transaction
    .insert(financeEconomicPaymentSessionOpenReceipts)
    .values({
      economicPaymentIntentId: command.economicPaymentIntentId,
      economicPaymentSessionId: command.economicPaymentSessionId,
      seriesId: command.providerAccount.seriesId,
      providerAccountId: command.providerAccount.providerAccountId,
      providerIdentityVersion: command.providerAccount.identityVersion,
      economicPaymentVersion: String(nextIntentVersion),
      economicPaymentSessionVersion: "1"
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");
  await afterWriteBoundary("economic_payment_session_open_receipt");

  return mapReceipt(receipt, intent);
}

async function lockEconomicIntent<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  economicPaymentIntentId: string
): Promise<typeof financeEconomicPaymentIntents.$inferSelect> {
  const [intent] = await transaction
    .select()
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, economicPaymentIntentId))
    .limit(1)
    .for("update");
  if (!intent) fail("economic_payment_not_found");
  return intent;
}

async function lockSession<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  economicPaymentSessionId: string
): Promise<typeof financeEconomicPaymentSessions.$inferSelect | undefined> {
  const [session] = await transaction
    .select()
    .from(financeEconomicPaymentSessions)
    .where(eq(financeEconomicPaymentSessions.id, economicPaymentSessionId))
    .limit(1)
    .for("update");
  return session;
}

async function replayExistingSession<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  intent: typeof financeEconomicPaymentIntents.$inferSelect,
  session: typeof financeEconomicPaymentSessions.$inferSelect
): Promise<EconomicPaymentSessionOpenReceipt> {
  assertIntentCorrelation(intent, command);
  if (
    session.economicPaymentIntentId !== command.economicPaymentIntentId ||
    session.seriesId !== command.providerAccount.seriesId ||
    session.providerAccountId !== command.providerAccount.providerAccountId ||
    session.providerIdentityVersion !== command.providerAccount.identityVersion
  ) {
    fail("session_identity_conflict");
  }
  const [receipt] = await transaction
    .select()
    .from(financeEconomicPaymentSessionOpenReceipts)
    .where(
      eq(
        financeEconomicPaymentSessionOpenReceipts.economicPaymentSessionId,
        command.economicPaymentSessionId
      )
    )
    .limit(1)
    .for("share");
  if (!receipt) fail("persistence_write_incomplete");
  return mapReceipt(receipt, intent);
}

async function lockExactProviderBinding<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  providerAccount: FinanceProviderAccountIdentity,
  requireActive: boolean
): Promise<void> {
  const [series] = await transaction
    .select({
      provider: financeProviderAccountSeries.provider,
      activeIdentityVersion: financeProviderAccountSeries.activeIdentityVersion
    })
    .from(financeProviderAccountSeries)
    .where(eq(financeProviderAccountSeries.seriesId, providerAccount.seriesId))
    .limit(1)
    .for("share");
  const [account] = await transaction
    .select({ provider: financeProviderAccounts.provider })
    .from(financeProviderAccounts)
    .where(
      and(
        eq(financeProviderAccounts.seriesId, providerAccount.seriesId),
        eq(financeProviderAccounts.providerAccountId, providerAccount.providerAccountId),
        eq(financeProviderAccounts.identityVersion, providerAccount.identityVersion)
      )
    )
    .limit(1)
    .for("share");
  if (!series || !account || series.provider !== "arc_pay" || account.provider !== "arc_pay") {
    fail("provider_binding_not_found");
  }
  if (requireActive && series.activeIdentityVersion !== providerAccount.identityVersion) {
    fail("provider_binding_not_active");
  }
}

function assertIntentCorrelation(
  intent: typeof financeEconomicPaymentIntents.$inferSelect,
  command: NormalizedCommand
): void {
  if (
    intent.seriesId !== command.providerAccount.seriesId ||
    intent.providerAccountId !== command.providerAccount.providerAccountId ||
    intent.providerIdentityVersion !== command.providerAccount.identityVersion
  ) {
    fail("economic_payment_correlation_conflict");
  }
}

function mapReceipt(
  receipt: typeof financeEconomicPaymentSessionOpenReceipts.$inferSelect,
  intent: typeof financeEconomicPaymentIntents.$inferSelect
): EconomicPaymentSessionOpenReceipt {
  const economicPaymentVersion = positiveSafeVersion(receipt.economicPaymentVersion);
  const economicPaymentSessionVersion = positiveSafeVersion(receipt.economicPaymentSessionVersion);
  if (
    economicPaymentVersion < 2 ||
    economicPaymentSessionVersion !== 1 ||
    receipt.economicPaymentIntentId !== intent.id ||
    receipt.seriesId !== intent.seriesId ||
    receipt.providerAccountId !== intent.providerAccountId ||
    receipt.providerIdentityVersion !== intent.providerIdentityVersion ||
    !/^sha256:[a-f0-9]{64}$/.test(receipt.canonicalDigest) ||
    !/^postgres-xid:[0-9]+$/.test(receipt.persistenceTransactionBoundaryRef) ||
    !(receipt.committedAt instanceof Date) ||
    Number.isNaN(receipt.committedAt.getTime())
  ) {
    fail("persistence_write_incomplete");
  }
  const providerAccount = createProviderAccountIdentityBinding({
    seriesId: receipt.seriesId,
    providerAccountId: receipt.providerAccountId,
    identityVersion: receipt.providerIdentityVersion
  });
  const mapped = Object.freeze({
    kind: "economic_payment_session_open_receipt" as const,
    economicPaymentHead: Object.freeze({
      economicPaymentIntentId: intent.id,
      sourceId: intent.sourceId,
      purpose: purpose(intent.purpose),
      providerAccount,
      amountMinor: encodeFinanceNumeric38(intent.amountMinor),
      currency: currency(intent.currency),
      state: "checkout_opened" as const,
      activeSessionId: receipt.economicPaymentSessionId,
      capturedProviderPaymentId: null,
      version: economicPaymentVersion
    }),
    economicPaymentSessionVersion,
    persistenceTransactionBoundaryRef: receipt.persistenceTransactionBoundaryRef,
    committedAt: receipt.committedAt.toISOString()
  });
  return mapped as EconomicPaymentSessionOpenReceipt;
}

function normalizeCommand(command: OpenEconomicPaymentSessionCommand): NormalizedCommand {
  try {
    assertExactOwnDataKeys(command, [
      "economicPaymentIntentId",
      "economicPaymentSessionId",
      "expectedEconomicPaymentVersion",
      "providerAccount"
    ]);
    if (
      !Number.isSafeInteger(command.expectedEconomicPaymentVersion) ||
      command.expectedEconomicPaymentVersion < 1
    ) {
      fail("invalid_command");
    }
    return Object.freeze({
      economicPaymentIntentId: identifier(command.economicPaymentIntentId),
      economicPaymentSessionId: identifier(command.economicPaymentSessionId),
      expectedEconomicPaymentVersion: command.expectedEconomicPaymentVersion,
      providerAccount: createProviderAccountIdentityBinding(command.providerAccount)
    });
  } catch (error) {
    if (error instanceof EconomicPaymentSessionOpenPersistenceError) throw error;
    fail("invalid_command");
  }
}

function isOpenableState(
  value: unknown
): value is "created" | "declined" | "failed" | "expired" | "voided" {
  return (
    value === "created" ||
    value === "declined" ||
    value === "failed" ||
    value === "expired" ||
    value === "voided"
  );
}

function purpose(value: unknown): "client_order" | "platform_invoice" | "platform_card_setup" {
  if (value !== "client_order" && value !== "platform_invoice" && value !== "platform_card_setup") {
    fail("persistence_write_incomplete");
  }
  return value;
}

function currency(value: unknown): "RUB" {
  if (value !== "RUB") fail("persistence_write_incomplete");
  return value;
}

function positiveSafeVersion(value: unknown): number {
  const decoded = decodeFinancePositiveRevision(value);
  const parsed = Number(decoded);
  if (!Number.isSafeInteger(parsed)) fail("persistence_write_incomplete");
  return parsed;
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    containsAsciiControl(value)
  ) {
    fail("invalid_command");
  }
  return value;
}

function containsAsciiControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

function assertExactOwnDataKeys(value: unknown, expectedKeys: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_command");
  const expected = new Set(expectedKeys);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.size) fail("invalid_command");
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) fail("invalid_command");
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

function noFailureInjection(): void {}

function fail(reason: EconomicPaymentSessionOpenPersistenceReason): never {
  throw new EconomicPaymentSessionOpenPersistenceError(reason);
}
