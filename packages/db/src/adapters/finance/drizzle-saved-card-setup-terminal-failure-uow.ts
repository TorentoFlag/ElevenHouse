import type {
  ProviderOperationResultCommitReceipt,
  SavedCardSetupTerminalFailureCommitReceipt,
  SavedCardSetupTerminalFailureUnitOfWork
} from "@elevenhouse/domain/finance-core";
import { and, eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { financeSavedCardSetupCustomerActions } from "../../schema/finance/saved-card-setup-actions.schema";
import { financeSavedCardSetupSessions } from "../../schema/finance/saved-card-setup-sessions.schema";
import { applyProviderOperationResultInTransaction } from "./drizzle-provider-operation-result-application-uow";

export class SavedCardSetupTerminalFailurePersistenceError extends Error {
  readonly code = "saved_card_setup_terminal_failure_persistence_error" as const;

  constructor(
    readonly reason:
      | "setup_session_not_found"
      | "setup_session_correlation_conflict"
      | "setup_session_state_conflict"
      | "provider_result_conflict"
      | "setup_session_concurrency_conflict"
      | "retryable_concurrency_conflict"
  ) {
    super("Saved-card setup terminal failure could not be committed atomically");
  }
}

/**
 * A confirmed provider refusal ends only the zero-value setup coordinator. It deliberately does
 * not mutate a tariff invoice, credential, ledger, or monetary economic payment state.
 */
export function createDrizzleSavedCardSetupTerminalFailureUnitOfWork(
  input: Readonly<{ database: ElevenHouseDatabase }>
): SavedCardSetupTerminalFailureUnitOfWork {
  return Object.freeze({
    async applyTerminalFailure(command) {
      try {
        return await input.database.transaction(async (transaction) => {
          const [session] = await transaction
            .select()
            .from(financeSavedCardSetupSessions)
            .where(eq(financeSavedCardSetupSessions.id, command.providerResult.evidence.sourceId))
            .limit(1)
            .for("update");
          if (!session) fail("setup_session_not_found");
          assertCorrelation(command, session);

          const result = await applyProviderOperationResultInTransaction(
            transaction,
            command.providerResult
          );
          if (result.outcome !== "failed") fail("provider_result_conflict");

          if (session.state === "setup_failed") return receipt(session.id, result);
          if (session.state !== "execution_pending" && session.state !== "requires_customer_action") {
            fail("setup_session_state_conflict");
          }

          await transaction
            .update(financeSavedCardSetupCustomerActions)
            .set({ status: "expired", resolvedAt: sql`clock_timestamp()` })
            .where(
              and(
                eq(financeSavedCardSetupCustomerActions.setupSessionId, session.id),
                eq(financeSavedCardSetupCustomerActions.status, "pending")
              )
            );

          const observedAt = new Date(result.observedAt);
          if (Number.isNaN(observedAt.getTime())) fail("provider_result_conflict");
          const [updated] = await transaction
            .update(financeSavedCardSetupSessions)
            .set({
              state: "setup_failed",
              version: session.version + 1,
              terminalAt: observedAt,
              updatedAt: sql`clock_timestamp()`
            })
            .where(
              and(
                eq(financeSavedCardSetupSessions.id, session.id),
                eq(financeSavedCardSetupSessions.version, session.version),
                eq(financeSavedCardSetupSessions.state, session.state)
              )
            )
            .returning({ id: financeSavedCardSetupSessions.id });
          if (!updated) fail("setup_session_concurrency_conflict");
          return receipt(session.id, result);
        });
      } catch (error) {
        if (error instanceof SavedCardSetupTerminalFailurePersistenceError) throw error;
        const code = postgresCode(error);
        if (code === "40001" || code === "40P01") fail("retryable_concurrency_conflict");
        throw error;
      }
    }
  } satisfies SavedCardSetupTerminalFailureUnitOfWork);
}

function assertCorrelation(
  command: Parameters<SavedCardSetupTerminalFailureUnitOfWork["applyTerminalFailure"]>[0],
  session: typeof financeSavedCardSetupSessions.$inferSelect
): void {
  const evidence = command.providerResult.evidence;
  if (
    evidence.outcome !== "failed" ||
    evidence.purpose !== "platform_card_setup" ||
    (evidence.operationKind !== "card_setup_execute" &&
      evidence.operationKind !== "card_setup_3ds_method_complete") ||
    evidence.sourceId !== session.id ||
    evidence.economicPaymentIntentId !== session.economicPaymentIntentId ||
    evidence.providerAccount.seriesId !== session.seriesId ||
    evidence.providerAccount.providerAccountId !== session.providerAccountId ||
    evidence.providerAccount.identityVersion !== session.providerIdentityVersion
  ) {
    fail("setup_session_correlation_conflict");
  }
}

function receipt(
  setupSessionId: string,
  result: ProviderOperationResultCommitReceipt
): SavedCardSetupTerminalFailureCommitReceipt {
  return Object.freeze({
    kind: "saved_card_setup_terminal_failure_commit_receipt" as const,
    setupSessionId,
    providerOperationIntentId: result.providerOperationIntentId,
    committedAt: result.committedAt
  });
}

function postgresCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function fail(reason: SavedCardSetupTerminalFailurePersistenceError["reason"]): never {
  throw new SavedCardSetupTerminalFailurePersistenceError(reason);
}
