import {
  createProviderAccountIdentityBinding,
  type CreateEconomicPaymentIntentCommand,
  type EconomicPaymentIntentCreationReceipt,
  type EconomicPaymentIntentCreationUnitOfWork,
  type FinanceProviderAccountIdentity
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  financeEconomicPaymentIntentCreationReceipts,
  financeEconomicPaymentIntents,
  financeEconomicPaymentSourceHeads,
  financePlatformInvoicePaymentBindings
} from "../../schema/finance/economic-payments.schema";
import {
  financeProviderAccountSeries,
  financeProviderAccounts
} from "../../schema/finance/provider-accounts.schema";
import { decodeFinancePositiveRevision, encodeFinanceNumeric38 } from "./finance-row-codecs";

type FinanceTransaction<TSchema extends Record<string, unknown>> = Parameters<
  Parameters<NodePgDatabase<TSchema>["transaction"]>[0]
>[0];

export const economicPaymentIntentCreationWriteBoundaryValues = Object.freeze([
  "economic_payment_intent",
  "economic_payment_source_head",
  "platform_invoice_payment_binding",
  "economic_payment_creation_receipt"
] as const);

export type EconomicPaymentIntentCreationWriteBoundary =
  (typeof economicPaymentIntentCreationWriteBoundaryValues)[number];

export type EconomicPaymentIntentCreationFailureInjector = (
  boundary: EconomicPaymentIntentCreationWriteBoundary
) => void | Promise<void>;

export type EconomicPaymentIntentCreationPersistenceReason =
  | "invalid_command"
  | "provider_binding_not_found"
  | "provider_binding_not_active"
  | "source_version_conflict"
  | "source_identity_conflict"
  | "retryable_concurrency_conflict"
  | "persistence_write_incomplete";

export class EconomicPaymentIntentCreationPersistenceError extends Error {
  readonly code = "economic_payment_intent_creation_persistence_error";

  constructor(readonly reason: EconomicPaymentIntentCreationPersistenceReason) {
    super("Economic payment intent could not be created atomically");
    this.name = "EconomicPaymentIntentCreationPersistenceError";
  }
}

export function createDrizzleEconomicPaymentIntentCreationUnitOfWork<
  TSchema extends Record<string, unknown>
>(input: {
  readonly database: NodePgDatabase<TSchema>;
  readonly afterWriteBoundary?: EconomicPaymentIntentCreationFailureInjector;
}): EconomicPaymentIntentCreationUnitOfWork {
  const unitOfWork = {
    async createEconomicPaymentIntent(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction((transaction) =>
          createInTransaction(
            transaction,
            normalized,
            input.afterWriteBoundary ?? noFailureInjection
          )
        );
      } catch (error) {
        if (error instanceof EconomicPaymentIntentCreationPersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        if (code === "23505") fail("source_identity_conflict");
        if (code === "23503" || code === "23514") fail("persistence_write_incomplete");
        throw error;
      }
    }
  } satisfies EconomicPaymentIntentCreationUnitOfWork;
  return Object.freeze(unitOfWork);
}

/**
 * Internal composition hook for a larger PostgreSQL transaction. It retains this adapter's
 * validation and receipt semantics, but never opens a nested transaction.
 */
export async function createEconomicPaymentIntentInTransaction<
  TSchema extends Record<string, unknown>
>(
  transaction: FinanceTransaction<TSchema>,
  command: CreateEconomicPaymentIntentCommand,
  afterWriteBoundary: EconomicPaymentIntentCreationFailureInjector = noFailureInjection
): Promise<EconomicPaymentIntentCreationReceipt> {
  return createInTransaction(transaction, normalizeCommand(command), afterWriteBoundary);
}

type NormalizedCommand = Readonly<{
  economicPaymentIntentId: string;
  sourceId: string;
  purpose: "client_order" | "platform_invoice" | "platform_card_setup";
  providerAccount: FinanceProviderAccountIdentity;
  amountMinor: string;
  currency: "RUB";
  expectedSourceUniquenessVersion: number;
}>;

async function createInTransaction<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  afterWriteBoundary: EconomicPaymentIntentCreationFailureInjector
): Promise<EconomicPaymentIntentCreationReceipt> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(
      hashtextextended(${`finance-economic-source:${command.purpose}:${command.sourceId}`}, 0)
    )`
  );

  const [sourceHead] = await transaction
    .select()
    .from(financeEconomicPaymentSourceHeads)
    .where(
      and(
        eq(financeEconomicPaymentSourceHeads.purpose, command.purpose),
        eq(financeEconomicPaymentSourceHeads.sourceId, command.sourceId)
      )
    )
    .limit(1)
    .for("update");

  await lockExactProviderBinding(transaction, command.providerAccount, sourceHead === undefined);

  if (sourceHead) return replayExistingIntent(transaction, command, sourceHead);
  if (command.expectedSourceUniquenessVersion !== 0) fail("source_version_conflict");

  const insertedIntent = await transaction
    .insert(financeEconomicPaymentIntents)
    .values({
      id: command.economicPaymentIntentId,
      purpose: command.purpose,
      sourceId: command.sourceId,
      seriesId: command.providerAccount.seriesId,
      providerAccountId: command.providerAccount.providerAccountId,
      providerIdentityVersion: command.providerAccount.identityVersion,
      amountMinor: command.amountMinor,
      currency: command.currency,
      state: "created",
      version: "1"
    })
    .returning({ id: financeEconomicPaymentIntents.id });
  if (insertedIntent.length !== 1 || insertedIntent[0]?.id !== command.economicPaymentIntentId) {
    fail("persistence_write_incomplete");
  }
  await afterWriteBoundary("economic_payment_intent");

  const insertedSourceHead = await transaction
    .insert(financeEconomicPaymentSourceHeads)
    .values({
      purpose: command.purpose,
      sourceId: command.sourceId,
      economicPaymentIntentId: command.economicPaymentIntentId,
      headVersion: "1"
    })
    .returning({
      economicPaymentIntentId: financeEconomicPaymentSourceHeads.economicPaymentIntentId
    });
  if (
    insertedSourceHead.length !== 1 ||
    insertedSourceHead[0]?.economicPaymentIntentId !== command.economicPaymentIntentId
  ) {
    fail("persistence_write_incomplete");
  }
  await afterWriteBoundary("economic_payment_source_head");

  if (command.purpose === "platform_invoice") {
    const [binding] = await transaction
      .insert(financePlatformInvoicePaymentBindings)
      .values({
        invoiceId: command.sourceId,
        economicPaymentIntentId: command.economicPaymentIntentId
      })
      .returning({
        invoiceId: financePlatformInvoicePaymentBindings.invoiceId,
        economicPaymentIntentId: financePlatformInvoicePaymentBindings.economicPaymentIntentId
      });
    if (
      !binding ||
      binding.invoiceId !== command.sourceId ||
      binding.economicPaymentIntentId !== command.economicPaymentIntentId
    ) {
      fail("persistence_write_incomplete");
    }
    await afterWriteBoundary("platform_invoice_payment_binding");
  }

  const [receipt] = await transaction
    .insert(financeEconomicPaymentIntentCreationReceipts)
    .values({
      economicPaymentIntentId: command.economicPaymentIntentId,
      purpose: command.purpose,
      sourceId: command.sourceId,
      seriesId: command.providerAccount.seriesId,
      providerAccountId: command.providerAccount.providerAccountId,
      providerIdentityVersion: command.providerAccount.identityVersion,
      amountMinor: command.amountMinor,
      currency: command.currency,
      economicPaymentVersion: "1",
      sourceUniquenessVersion: "1"
    })
    .returning();
  if (!receipt) fail("persistence_write_incomplete");
  await afterWriteBoundary("economic_payment_creation_receipt");
  return mapReceipt(receipt);
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

async function replayExistingIntent<TSchema extends Record<string, unknown>>(
  transaction: FinanceTransaction<TSchema>,
  command: NormalizedCommand,
  sourceHead: typeof financeEconomicPaymentSourceHeads.$inferSelect
): Promise<EconomicPaymentIntentCreationReceipt> {
  const [intent] = await transaction
    .select()
    .from(financeEconomicPaymentIntents)
    .where(eq(financeEconomicPaymentIntents.id, sourceHead.economicPaymentIntentId))
    .limit(1)
    .for("share");
  if (!intent || !sameImmutableIntent(intent, command)) fail("source_identity_conflict");
  if (command.purpose === "platform_invoice") {
    const [binding] = await transaction
      .select()
      .from(financePlatformInvoicePaymentBindings)
      .where(eq(financePlatformInvoicePaymentBindings.invoiceId, command.sourceId))
      .limit(1)
      .for("share");
    if (!binding || binding.economicPaymentIntentId !== command.economicPaymentIntentId) {
      fail("persistence_write_incomplete");
    }
  }
  const [receipt] = await transaction
    .select()
    .from(financeEconomicPaymentIntentCreationReceipts)
    .where(
      eq(
        financeEconomicPaymentIntentCreationReceipts.economicPaymentIntentId,
        command.economicPaymentIntentId
      )
    )
    .limit(1)
    .for("share");
  if (!receipt) fail("persistence_write_incomplete");
  return mapReceipt(receipt);
}

function sameImmutableIntent(
  row: typeof financeEconomicPaymentIntents.$inferSelect,
  command: NormalizedCommand
): boolean {
  return (
    row.id === command.economicPaymentIntentId &&
    row.purpose === command.purpose &&
    row.sourceId === command.sourceId &&
    row.seriesId === command.providerAccount.seriesId &&
    row.providerAccountId === command.providerAccount.providerAccountId &&
    row.providerIdentityVersion === command.providerAccount.identityVersion &&
    row.amountMinor === command.amountMinor &&
    row.currency === command.currency
  );
}

function mapReceipt(
  row: typeof financeEconomicPaymentIntentCreationReceipts.$inferSelect
): EconomicPaymentIntentCreationReceipt {
  const economicPaymentVersion = positiveSafeVersion(row.economicPaymentVersion);
  const sourceUniquenessVersion = positiveSafeVersion(row.sourceUniquenessVersion);
  if (
    economicPaymentVersion !== 1 ||
    sourceUniquenessVersion !== 1 ||
    row.currency !== "RUB" ||
    !/^sha256:[a-f0-9]{64}$/.test(row.canonicalDigest) ||
    !/^postgres-xid:[0-9]+$/.test(row.persistenceTransactionBoundaryRef) ||
    !(row.committedAt instanceof Date) ||
    Number.isNaN(row.committedAt.getTime())
  ) {
    fail("persistence_write_incomplete");
  }
  const providerAccount = createProviderAccountIdentityBinding({
    seriesId: row.seriesId,
    providerAccountId: row.providerAccountId,
    identityVersion: row.providerIdentityVersion
  });
  const receipt = Object.freeze({
    kind: "economic_payment_intent_creation_receipt" as const,
    economicPaymentHead: Object.freeze({
      economicPaymentIntentId: row.economicPaymentIntentId,
      sourceId: row.sourceId,
      purpose: purpose(row.purpose),
      providerAccount,
      amountMinor: encodeFinanceNumeric38(row.amountMinor),
      currency: "RUB" as const,
      state: "created" as const,
      activeSessionId: null,
      capturedProviderPaymentId: null,
      version: economicPaymentVersion
    }),
    sourceUniquenessVersion,
    persistenceTransactionBoundaryRef: row.persistenceTransactionBoundaryRef,
    committedAt: row.committedAt.toISOString()
  });
  return receipt as EconomicPaymentIntentCreationReceipt;
}

function normalizeCommand(command: CreateEconomicPaymentIntentCommand): NormalizedCommand {
  try {
    assertExactOwnDataKeys(command, [
      "economicPaymentIntentId",
      "sourceId",
      "purpose",
      "providerAccount",
      "amountMinor",
      "currency",
      "expectedSourceUniquenessVersion"
    ]);
    const normalizedPurpose = purpose(command.purpose);
    const amountMinor = encodeFinanceNumeric38(command.amountMinor);
    if (
      command.currency !== "RUB" ||
      !Number.isSafeInteger(command.expectedSourceUniquenessVersion) ||
      command.expectedSourceUniquenessVersion < 0 ||
      (normalizedPurpose === "platform_card_setup"
        ? BigInt(amountMinor) !== 0n
        : BigInt(amountMinor) <= 0n)
    ) {
      fail("invalid_command");
    }
    return Object.freeze({
      economicPaymentIntentId: identifier(command.economicPaymentIntentId),
      sourceId: identifier(command.sourceId),
      purpose: normalizedPurpose,
      providerAccount: createProviderAccountIdentityBinding(command.providerAccount),
      amountMinor,
      currency: "RUB",
      expectedSourceUniquenessVersion: command.expectedSourceUniquenessVersion
    });
  } catch (error) {
    if (error instanceof EconomicPaymentIntentCreationPersistenceError) throw error;
    fail("invalid_command");
  }
}

function purpose(value: unknown): "client_order" | "platform_invoice" | "platform_card_setup" {
  if (value !== "client_order" && value !== "platform_invoice" && value !== "platform_card_setup") {
    fail("invalid_command");
  }
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
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("invalid_command");
  }
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

function fail(reason: EconomicPaymentIntentCreationPersistenceReason): never {
  throw new EconomicPaymentIntentCreationPersistenceError(reason);
}
