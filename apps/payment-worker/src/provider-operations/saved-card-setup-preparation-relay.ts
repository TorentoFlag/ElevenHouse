import {
  FINANCE_SAVED_CARD_SETUP_PREPARATION_REQUESTED_EVENT,
  createFinanceSavedCardSetupPreparationRequestedPayload
} from "@elevenhouse/domain/finance-core";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import { retryDelayMs } from "./provider-operation-dispatch-relay";

export type SavedCardSetupPreparer = Readonly<{ prepare(input: Readonly<{ setupSessionId: string }>): Promise<void> }>;
export type SavedCardSetupPreparationRelayResult = Readonly<{ claimed: number; prepared: number; requeued: number }>;

/** Fenced IDs-only handoff. A malformed or failed item is retried without exposing card data in the queue. */
export async function relaySavedCardSetupPreparations(input: Readonly<{ store: OutboxRelayStore; preparer: SavedCardSetupPreparer; now: Date; batchSize: number; publishingLockTimeoutMs: number }>): Promise<SavedCardSetupPreparationRelayResult> {
  const events = await input.store.claimPending({ eventTypes: [FINANCE_SAVED_CARD_SETUP_PREPARATION_REQUESTED_EVENT], limit: positive(input.batchSize), now: input.now, stalePublishingBefore: new Date(input.now.getTime() - positive(input.publishingLockTimeoutMs)) });
  let prepared = 0;
  let requeued = 0;
  for (const event of events) {
    try {
      const payload = createFinanceSavedCardSetupPreparationRequestedPayload(event.payload);
      if (event.eventType !== FINANCE_SAVED_CARD_SETUP_PREPARATION_REQUESTED_EVENT || event.aggregateId !== payload.setupSessionId) throw new SavedCardSetupPreparationRelayError("outbox_integrity_conflict");
      await input.preparer.prepare(payload);
      await input.store.markPublished({ eventId: event.id, claimFence: event.claimFence, publishedAt: input.now });
      prepared += 1;
    } catch {
      await input.store.markPublishFailed({ eventId: event.id, claimFence: event.claimFence, failedAt: input.now, nextAvailableAt: new Date(input.now.getTime() + retryDelayMs(event.attempts)), errorMessage: "Saved-card setup preparation requires retry or operator review" });
      requeued += 1;
    }
  }
  return Object.freeze({ claimed: events.length, prepared, requeued });
}

export class SavedCardSetupPreparationRelayError extends Error { readonly code = "SAVED_CARD_SETUP_PREPARATION_RELAY_ERROR" as const; constructor(readonly reason: "outbox_integrity_conflict") { super("Saved-card setup preparation outbox payload is inconsistent"); } }
function positive(value: number) { if (!Number.isSafeInteger(value) || value < 1) throw new SavedCardSetupPreparationRelayError("outbox_integrity_conflict"); return value; }
