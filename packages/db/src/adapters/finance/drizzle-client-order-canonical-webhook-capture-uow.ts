import {
  type ApplyCanonicalClientOrderCaptureCommand,
  type ApplyCanonicalClientOrderWebhookCaptureCommand,
  type CanonicalClientOrderWebhookCaptureUnitOfWork,
  type ClientOrderCanonicalCaptureMutationResolution,
  hasAsciiControlCharacter,
  type VerifiedClientOrderCaptureSemanticCommitReceipt
} from "@elevenhouse/domain/finance-core";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  applyCanonicalClientOrderCaptureInTransaction,
  ClientOrderCanonicalCapturePersistenceError
} from "./drizzle-client-order-canonical-capture-uow";
import {
  applyVerifiedWebhookSemanticFactInTransaction,
  WebhookInboxProcessingPersistenceError
} from "./drizzle-webhook-inbox-processing-uow";
import type { FinanceTransaction } from "./drizzle-finance-command-store";

const commandKeys = ["semanticFact", "capture"] as const;

export type ClientOrderCanonicalWebhookCapturePersistenceReason =
  | "invalid_command"
  | "semantic_capture_conflict"
  | "retryable_concurrency_conflict";

export class ClientOrderCanonicalWebhookCapturePersistenceError extends Error {
  readonly code = "client_order_canonical_webhook_capture_persistence_error";

  constructor(readonly reason: ClientOrderCanonicalWebhookCapturePersistenceReason) {
    super("Canonical client-order webhook capture could not be committed atomically");
    this.name = "ClientOrderCanonicalWebhookCapturePersistenceError";
  }
}

/**
 * A DB-backed wallet mutation must resolve under the exact transaction that later commits the
 * capture. A resolver opening its own transaction could neither retain the wallet advisory lock
 * nor safely bind its expected wallet revision to the final CAS.
 */
export type TransactionalClientOrderCanonicalCaptureMutationResolver = Readonly<{
  resolveClientOrderCanonicalCaptureMutation(
    transaction: FinanceTransaction,
    input: ClientOrderCanonicalCaptureMutationResolution
  ): Promise<ApplyCanonicalClientOrderCaptureCommand["financialMutation"]>;
}>;

/**
 * The resolver is a required server-owned dependency: a raw webhook never supplies journal or
 * wallet instructions. The outer transaction rolls back the semantic receipt if either resolver
 * or capture application rejects the canonical fact.
 */
export function createDrizzleClientOrderCanonicalWebhookCaptureUnitOfWork(
  input: Readonly<{
    database: ElevenHouseDatabase;
    workerId: string;
    mutationResolver: TransactionalClientOrderCanonicalCaptureMutationResolver;
  }>
): CanonicalClientOrderWebhookCaptureUnitOfWork {
  const workerId = identifier(input.workerId);
  assertMutationResolver(input.mutationResolver);
  return Object.freeze({
    async applyCanonicalClientOrderWebhookCapture(command) {
      const normalized = normalizeCommand(command);
      try {
        return await input.database.transaction(async (transaction) => {
          const semanticCommitReceipt = await applyVerifiedWebhookSemanticFactInTransaction(
            transaction,
            workerId,
            normalized.semanticFact
          );
          const semanticCapture = assertClientOrderCaptureSemanticReceipt(
            semanticCommitReceipt,
            normalized
          );
          const financialMutation = await resolveClientOrderCanonicalCaptureMutationInTransaction(
            input.mutationResolver,
            transaction,
            Object.freeze({ semanticCapture, capture: normalized.capture })
          );
          const captureCommitReceipt = await applyCanonicalClientOrderCaptureInTransaction(
            transaction,
            Object.freeze({ ...normalized.capture, semanticCapture, financialMutation })
          );
          return Object.freeze({
            kind: "canonical_client_order_webhook_capture_commit_receipt" as const,
            semanticCommitReceipt: semanticCapture,
            captureCommitReceipt
          });
        });
      } catch (error) {
        if (
          error instanceof ClientOrderCanonicalWebhookCapturePersistenceError ||
          error instanceof WebhookInboxProcessingPersistenceError ||
          error instanceof ClientOrderCanonicalCapturePersistenceError
        ) {
          throw error;
        }
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        throw error;
      }
    }
  } satisfies CanonicalClientOrderWebhookCaptureUnitOfWork);
}

type NormalizedCommand = Readonly<{
  semanticFact: ApplyCanonicalClientOrderWebhookCaptureCommand["semanticFact"];
  capture: ApplyCanonicalClientOrderWebhookCaptureCommand["capture"];
}>;

function normalizeCommand(
  input: ApplyCanonicalClientOrderWebhookCaptureCommand
): NormalizedCommand {
  try {
    exactRecord(input, commandKeys);
    const semanticFact = input.semanticFact;
    const capture = input.capture;
    if (
      typeof semanticFact !== "object" ||
      semanticFact === null ||
      typeof capture !== "object" ||
      capture === null ||
      semanticFact.semanticEvidence.semanticSourceKind !== "payment_transition" ||
      semanticFact.semanticEvidence.purpose !== "client_order" ||
      semanticFact.semanticEvidence.economicPaymentIntentId !== capture.economicPaymentIntentId ||
      semanticFact.semanticEvidence.economicPaymentSessionId === null ||
      semanticFact.semanticEvidence.providerPaymentId === null ||
      semanticFact.semanticEvidence.amountMinor === null ||
      semanticFact.semanticEvidence.currency !== "RUB"
    )
      fail("semantic_capture_conflict");
    return Object.freeze({ semanticFact, capture });
  } catch (error) {
    if (error instanceof ClientOrderCanonicalWebhookCapturePersistenceError) throw error;
    fail("invalid_command");
  }
}

function assertClientOrderCaptureSemanticReceipt(
  receipt: unknown,
  command: NormalizedCommand
): VerifiedClientOrderCaptureSemanticCommitReceipt {
  const fields = receipt as Readonly<Record<string, unknown>>;
  if (
    typeof receipt !== "object" ||
    receipt === null ||
    fields.kind !== "webhook_semantic_commit_receipt" ||
    fields.semanticSourceKind !== "payment_transition" ||
    fields.purpose !== "client_order" ||
    fields.businessEffect !== "applied_once" ||
    fields.economicPaymentIntentId !== command.capture.economicPaymentIntentId ||
    typeof fields.economicPaymentSessionId !== "string" ||
    typeof fields.providerPaymentId !== "string" ||
    typeof fields.amountMinor !== "string" ||
    fields.currency !== "RUB"
  )
    fail("semantic_capture_conflict");
  return receipt as VerifiedClientOrderCaptureSemanticCommitReceipt;
}

function assertMutationResolver(
  value: unknown
): asserts value is TransactionalClientOrderCanonicalCaptureMutationResolver {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as Readonly<{ resolveClientOrderCanonicalCaptureMutation?: unknown }>)
      .resolveClientOrderCanonicalCaptureMutation !== "function"
  )
    fail("invalid_command");
}

export function resolveClientOrderCanonicalCaptureMutationInTransaction(
  resolver: TransactionalClientOrderCanonicalCaptureMutationResolver,
  transaction: FinanceTransaction,
  input: ClientOrderCanonicalCaptureMutationResolution
): Promise<ApplyCanonicalClientOrderCaptureCommand["financialMutation"]> {
  return resolver.resolveClientOrderCanonicalCaptureMutation(transaction, input);
}

function exactRecord(value: unknown, expected: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("invalid_command");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length) fail("invalid_command");
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("invalid_command");
  }
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    value.trim() !== value ||
    hasAsciiControlCharacter(value)
  )
    fail("invalid_command");
  return value;
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

function fail(reason: ClientOrderCanonicalWebhookCapturePersistenceReason): never {
  throw new ClientOrderCanonicalWebhookCapturePersistenceError(reason);
}
