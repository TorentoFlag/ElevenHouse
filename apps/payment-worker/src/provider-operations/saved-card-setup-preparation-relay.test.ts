import { describe, expect, it, vi } from "vitest";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import { relaySavedCardSetupPreparations } from "./saved-card-setup-preparation-relay";

const sessionId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-04T12:00:00.000Z");
describe("saved-card setup preparation relay", () => {
  it("fences exactly one IDs-only setup preparation event", async () => {
    const store = memoryStore(); const prepare = vi.fn(async () => undefined);
    await expect(relaySavedCardSetupPreparations({ store, preparer: { prepare }, now, batchSize: 10, publishingLockTimeoutMs: 60_000 })).resolves.toEqual({ claimed: 1, prepared: 1, requeued: 0 });
    expect(prepare).toHaveBeenCalledWith({ setupSessionId: sessionId });
    expect(store.markPublished).toHaveBeenCalledWith({ eventId: "20000000-0000-4000-8000-000000000002", claimFence: 4n, publishedAt: now });
  });
  it("requeues a malformed event without calling preparation", async () => {
    const store = memoryStore({ aggregateId: "30000000-0000-4000-8000-000000000003" }); const prepare = vi.fn();
    await expect(relaySavedCardSetupPreparations({ store, preparer: { prepare }, now, batchSize: 10, publishingLockTimeoutMs: 60_000 })).resolves.toEqual({ claimed: 1, prepared: 0, requeued: 1 });
    expect(prepare).not.toHaveBeenCalled(); expect(store.markPublishFailed).toHaveBeenCalledOnce();
  });
});
function memoryStore(overrides: Record<string, unknown> = {}) { return { claimPending: vi.fn(async () => [{ id: "20000000-0000-4000-8000-000000000002", eventType: "finance.saved_card_setup.preparation_requested", aggregateId: sessionId, payload: { setupSessionId: sessionId }, attempts: 0, claimFence: 4n, ...overrides }]), markPublished: vi.fn(), markPublishFailed: vi.fn() } as unknown as OutboxRelayStore; }
