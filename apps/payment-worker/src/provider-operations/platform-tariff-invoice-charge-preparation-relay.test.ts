import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import { describe, expect, it, vi } from "vitest";

import { relayPlatformTariffInvoiceChargePreparations } from "./platform-tariff-invoice-charge-preparation-relay";

const preparationRequestId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-04T12:00:00.000Z");

describe("platform tariff invoice charge-preparation relay", () => {
  it("fences exactly one IDs-only preparation request before worker preparation", async () => {
    const store = memoryStore();
    const prepare = vi.fn(async () => undefined);

    await expect(
      relayPlatformTariffInvoiceChargePreparations({
        store,
        preparer: { prepare },
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000
      })
    ).resolves.toEqual({ claimed: 1, prepared: 1, requeued: 0 });

    expect(prepare).toHaveBeenCalledWith({ preparationRequestId });
    expect(store.markPublished).toHaveBeenCalledWith({
      eventId: "20000000-0000-4000-8000-000000000002",
      claimFence: 4n,
      publishedAt: now
    });
  });

  it("requeues an inconsistent event without invoking charge preparation", async () => {
    const store = memoryStore({ aggregateId: "30000000-0000-4000-8000-000000000003" });
    const prepare = vi.fn();

    await expect(
      relayPlatformTariffInvoiceChargePreparations({
        store,
        preparer: { prepare },
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000
      })
    ).resolves.toEqual({ claimed: 1, prepared: 0, requeued: 1 });

    expect(prepare).not.toHaveBeenCalled();
    expect(store.markPublishFailed).toHaveBeenCalledOnce();
  });
});

function memoryStore(overrides: Record<string, unknown> = {}) {
  return {
    claimPending: vi.fn(async () => [{
      id: "20000000-0000-4000-8000-000000000002",
      eventType: "finance.platform_tariff_invoice_charge.preparation_requested",
      aggregateId: preparationRequestId,
      payload: { preparationRequestId },
      attempts: 0,
      claimFence: 4n,
      ...overrides
    }]),
    markPublished: vi.fn(),
    markPublishFailed: vi.fn()
  } as unknown as OutboxRelayStore;
}
