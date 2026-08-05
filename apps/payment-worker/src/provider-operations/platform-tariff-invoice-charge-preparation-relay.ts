import {
  FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_REQUESTED_EVENT,
  createFinancePlatformTariffInvoiceChargePreparationRequestedPayload
} from "@elevenhouse/domain/finance-core";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";

import { retryDelayMs } from "./provider-operation-dispatch-relay";

/** Worker-only input. The outbox remains IDs-only; all money and credential facts are reloaded. */
export type PlatformTariffInvoiceChargePreparer = Readonly<{
  prepare(input: Readonly<{ preparationRequestId: string }>): Promise<void>;
}>;

export type PlatformTariffInvoiceChargePreparationRelayResult = Readonly<{
  claimed: number;
  prepared: number;
  requeued: number;
}>;

export async function relayPlatformTariffInvoiceChargePreparations(input: Readonly<{
  store: OutboxRelayStore;
  preparer: PlatformTariffInvoiceChargePreparer;
  now: Date;
  batchSize: number;
  publishingLockTimeoutMs: number;
}>): Promise<PlatformTariffInvoiceChargePreparationRelayResult> {
  const events = await input.store.claimPending({
    eventTypes: [FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_REQUESTED_EVENT],
    limit: positive(input.batchSize),
    now: input.now,
    stalePublishingBefore: new Date(input.now.getTime() - positive(input.publishingLockTimeoutMs))
  });
  let prepared = 0;
  let requeued = 0;
  for (const event of events) {
    try {
      const payload = createFinancePlatformTariffInvoiceChargePreparationRequestedPayload(
        event.payload
      );
      if (
        event.eventType !== FINANCE_PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_REQUESTED_EVENT ||
        event.aggregateId !== payload.preparationRequestId
      ) {
        throw new PlatformTariffInvoiceChargePreparationRelayError("outbox_integrity_conflict");
      }
      await input.preparer.prepare(payload);
      await input.store.markPublished({
        eventId: event.id,
        claimFence: event.claimFence,
        publishedAt: input.now
      });
      prepared += 1;
    } catch {
      await input.store.markPublishFailed({
        eventId: event.id,
        claimFence: event.claimFence,
        failedAt: input.now,
        nextAvailableAt: new Date(input.now.getTime() + retryDelayMs(event.attempts)),
        errorMessage: "Platform tariff invoice charge preparation requires retry or operator review"
      });
      requeued += 1;
    }
  }
  return Object.freeze({ claimed: events.length, prepared, requeued });
}

export class PlatformTariffInvoiceChargePreparationRelayError extends Error {
  readonly code = "PLATFORM_TARIFF_INVOICE_CHARGE_PREPARATION_RELAY_ERROR" as const;

  constructor(readonly reason: "outbox_integrity_conflict") {
    super("Platform tariff invoice charge preparation outbox payload is inconsistent");
  }
}

function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new PlatformTariffInvoiceChargePreparationRelayError("outbox_integrity_conflict");
  }
  return value;
}
