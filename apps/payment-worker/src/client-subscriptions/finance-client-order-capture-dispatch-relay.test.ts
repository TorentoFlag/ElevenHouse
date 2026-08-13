import { describe, expect, it, vi } from "vitest";
import type { FinanceClientOrderCapturePurposeDispatchExecution } from "@elevenhouse/domain/finance-core";

import {
  FINANCE_CLIENT_ORDER_CAPTURE_APPLIED_EVENT,
  relayFinanceClientOrderCaptureDispatches
} from "./finance-client-order-capture-dispatch-relay";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";

const receiptId = "10000000-0000-4000-8000-000000000001";
const eventId = "20000000-0000-4000-8000-000000000002";
const now = new Date("2026-08-12T12:00:00.000Z");
type SuccessfulDispatch = Extract<
  FinanceClientOrderCapturePurposeDispatchExecution,
  { outcome: "dispatched" }
>;

describe("client-subscription capture dispatch relay", () => {
  it("publishes a non-subscription client-order capture without invoking booking fulfillment", async () => {
    const store = createStore();
    const dispatcher = {
      dispatch: vi.fn(async () => ({ outcome: "not_client_subscription" as const }))
    };

    await expect(
      relayFinanceClientOrderCaptureDispatches({
        store,
        dispatcher,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        maximumAttempts: 3
      })
    ).resolves.toEqual({ claimed: 1, dispatched: 0, replayed: 0, skipped: 1, requeued: 0, quarantined: 0 });

    expect(dispatcher.dispatch).toHaveBeenCalledWith({ captureApplicationReceiptId: receiptId });
    expect(store.markPublished).toHaveBeenCalledWith({ eventId, claimFence: 4n, publishedAt: now });
    expect(store.markQuarantined).not.toHaveBeenCalled();
  });

  it("quarantines a purpose-authority conflict instead of activating or retrying", async () => {
    const store = createStore();
    const dispatcher = {
      dispatch: vi.fn(async () => ({ outcome: "authority_conflict" as const }))
    };

    await relayFinanceClientOrderCaptureDispatches({
      store,
      dispatcher,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      maximumAttempts: 3
    });

    expect(store.markQuarantined).toHaveBeenCalledWith({
      eventId,
      claimFence: 4n,
      quarantinedAt: now,
      reasonCode: "CLIENT_SUBSCRIPTION_CAPTURE_AUTHORITY_CONFLICT",
      errorMessage: "Client subscription capture dispatch authority conflict"
    });
    expect(store.markPublishFailed).not.toHaveBeenCalled();
  });

  it("quarantines a malformed IDs-only payload without treating it as a transient failure", async () => {
    const store = createStore({ payload: { captureApplicationReceiptId: "not-a-uuid" } });
    const dispatcher = { dispatch: vi.fn() };

    await relayFinanceClientOrderCaptureDispatches({
      store,
      dispatcher,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      maximumAttempts: 3
    });

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(store.markQuarantined).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "CLIENT_SUBSCRIPTION_CAPTURE_OUTBOX_INTEGRITY" })
    );
    expect(store.markPublishFailed).not.toHaveBeenCalled();
  });

  it("quarantines the third total transient attempt instead of retrying indefinitely", async () => {
    const store = createStore({ attempts: 2 });
    const dispatcher = { dispatch: vi.fn(async () => { throw new Error("database unavailable"); }) };

    await relayFinanceClientOrderCaptureDispatches({
      store,
      dispatcher,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      maximumAttempts: 3
    });

    expect(store.markQuarantined).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "CLIENT_SUBSCRIPTION_CAPTURE_RETRY_EXHAUSTED" })
    );
    expect(store.markPublishFailed).not.toHaveBeenCalled();
  });

  it("requeues the first of three total transient attempts", async () => {
    const store = createStore({ attempts: 0 });
    const dispatcher = { dispatch: vi.fn(async () => { throw new Error("database unavailable"); }) };

    await relayFinanceClientOrderCaptureDispatches({
      store,
      dispatcher,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      maximumAttempts: 3
    });

    expect(store.markPublishFailed).toHaveBeenCalledWith(
      expect.objectContaining({ nextAvailableAt: new Date("2026-08-12T12:00:01.000Z") })
    );
    expect(store.markQuarantined).not.toHaveBeenCalled();
  });

  it("requeues the second of three total transient attempts and applies exponential backoff", async () => {
    const store = createStore({ attempts: 1 });
    const dispatcher = { dispatch: vi.fn(async () => { throw new Error("database unavailable"); }) };

    await expect(
      relayFinanceClientOrderCaptureDispatches({
        store,
        dispatcher,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        maximumAttempts: 3
      })
    ).resolves.toEqual({ claimed: 1, dispatched: 0, replayed: 0, skipped: 0, requeued: 1, quarantined: 0 });

    expect(store.markPublishFailed).toHaveBeenCalledWith({
      eventId,
      claimFence: 4n,
      failedAt: now,
      nextAvailableAt: new Date("2026-08-12T12:00:02.000Z"),
      errorMessage: "Client subscription capture dispatch requires retry or operator review"
    });
    expect(store.markQuarantined).not.toHaveBeenCalled();
  });

  it("ignores a stale transient requeue disposition without quarantining", async () => {
    const store = createStore({ failedDisposition: "stale" });
    const dispatcher = { dispatch: vi.fn(async () => { throw new Error("database unavailable"); }) };

    await expect(
      relayFinanceClientOrderCaptureDispatches({
        store,
        dispatcher,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        maximumAttempts: 3
      })
    ).resolves.toEqual({ claimed: 1, dispatched: 0, replayed: 0, skipped: 0, requeued: 0, quarantined: 0 });

    expect(store.markPublishFailed).toHaveBeenCalledTimes(1);
    expect(store.markQuarantined).not.toHaveBeenCalled();
  });

  it("ignores a stale publish disposition without attempting a second mutation", async () => {
    const store = createStore({ publishedDisposition: "stale" });
    const dispatcher = { dispatch: vi.fn(async () => dispatchedExecution()) };

    await expect(
      relayFinanceClientOrderCaptureDispatches({
        store,
        dispatcher,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        maximumAttempts: 3
      })
    ).resolves.toEqual({ claimed: 1, dispatched: 0, replayed: 0, skipped: 0, requeued: 0, quarantined: 0 });

    expect(store.markPublished).toHaveBeenCalledTimes(1);
    expect(store.markPublishFailed).not.toHaveBeenCalled();
    expect(store.markQuarantined).not.toHaveBeenCalled();
  });

  it("ignores a stale permanent-quarantine disposition without retrying", async () => {
    const store = createStore({ quarantinedDisposition: "stale" });
    const dispatcher = {
      dispatch: vi.fn(async () => ({ outcome: "source_event_conflict" as const }))
    };

    await expect(
      relayFinanceClientOrderCaptureDispatches({
        store,
        dispatcher,
        now,
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        maximumAttempts: 3
      })
    ).resolves.toEqual({ claimed: 1, dispatched: 0, replayed: 0, skipped: 0, requeued: 0, quarantined: 0 });

    expect(store.markQuarantined).toHaveBeenCalledTimes(1);
    expect(store.markPublishFailed).not.toHaveBeenCalled();
  });

  it("quarantines an aggregate mismatch before dispatch", async () => {
    const store = createStore({ aggregateId: eventId });
    const dispatcher = { dispatch: vi.fn() };

    await relayFinanceClientOrderCaptureDispatches({
      store,
      dispatcher,
      now,
      batchSize: 10,
      publishingLockTimeoutMs: 60_000,
      maximumAttempts: 3
    });

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(store.markQuarantined).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "CLIENT_SUBSCRIPTION_CAPTURE_OUTBOX_INTEGRITY" })
    );
  });
});

function createStore(
  overrides: Partial<
    Readonly<{
      attempts: number;
      payload: unknown;
      aggregateId: string;
      publishedDisposition: "applied" | "stale";
      failedDisposition: "applied" | "stale";
      quarantinedDisposition: "applied" | "stale";
    }>
  > = {}
): OutboxRelayStore {
  return {
    claimPending: vi.fn(async () => [{
      id: eventId,
      eventType: FINANCE_CLIENT_ORDER_CAPTURE_APPLIED_EVENT,
      aggregateId: overrides.aggregateId ?? receiptId,
      payload: overrides.payload ?? { captureApplicationReceiptId: receiptId },
      attempts: overrides.attempts ?? 0,
      claimFence: 4n
    }]),
    markPublished: vi.fn(async () => {
      if ((overrides.publishedDisposition ?? "applied") === "stale") {
        throw new (await import("@elevenhouse/db/outbox")).OutboxRelayStaleClaimError("mark_published");
      }
    }),
    markPublishFailed: vi.fn(async () => {
      if ((overrides.failedDisposition ?? "applied") === "stale") {
        throw new (await import("@elevenhouse/db/outbox")).OutboxRelayStaleClaimError("mark_publish_failed");
      }
    }),
    markQuarantined: vi.fn(async () => {
      if ((overrides.quarantinedDisposition ?? "applied") === "stale") {
        throw new (await import("@elevenhouse/db/outbox")).OutboxRelayStaleClaimError("mark_quarantined");
      }
    })
  } as unknown as OutboxRelayStore;
}

function dispatchedExecution(): FinanceClientOrderCapturePurposeDispatchExecution {
  return {
    outcome: "dispatched",
    receipt: {} as SuccessfulDispatch["receipt"],
    sourceEvent: {} as SuccessfulDispatch["sourceEvent"]
  };
}
