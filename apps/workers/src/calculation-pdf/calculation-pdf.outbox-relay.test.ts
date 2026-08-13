import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import {
  CALCULATION_PDF_DELETE_REQUESTED_EVENT,
  CALCULATION_PDF_REQUESTED_EVENT
} from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import {
  calculationPdfDeleteJobName,
  calculationPdfRenderJobName,
  type CalculationPdfQueue
} from "./calculation-pdf.queue";
import { relayPendingCalculationPdfEvents } from "./calculation-pdf.outbox-relay";
import { createCalculationPdfOutboxRelay } from "./calculation-pdf.outbox-relay";

const eventId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const mediaAssetId = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-07-15T12:00:00.000Z");
const claimFence = 17n;

describe("relayPendingCalculationPdfEvents", () => {
  it.each([
    [CALCULATION_PDF_REQUESTED_EVENT, jobId, { jobId }, calculationPdfRenderJobName, "render"],
    [
      CALCULATION_PDF_DELETE_REQUESTED_EVENT,
      mediaAssetId,
      { mediaAssetId },
      calculationPdfDeleteJobName,
      "delete"
    ]
  ] as const)(
    "publishes %s only after queue acceptance",
    async (eventType, aggregateId, payload, jobName, operation) => {
      const store = createStore({
        id: eventId,
        eventType,
        aggregateId,
        payload,
        attempts: 0,
        claimFence
      });
      const calls: string[] = [];
      const queue = {
        add: vi.fn(async () => {
          calls.push("queue");
        })
      } as unknown as CalculationPdfQueue;
      vi.mocked(store.markPublished).mockImplementationOnce(async () => {
        calls.push("published");
      });

      await expect(relayPendingCalculationPdfEvents(relayInput(store, queue))).resolves.toBe(1);

      expect(store.claimPending).toHaveBeenCalledWith({
        eventTypes: [CALCULATION_PDF_REQUESTED_EVENT, CALCULATION_PDF_DELETE_REQUESTED_EVENT],
        limit: 20,
        now,
        stalePublishingBefore: new Date("2026-07-15T11:59:00.000Z")
      });
      expect(queue.add).toHaveBeenCalledWith(
        jobName,
        payload,
        expect.objectContaining({ jobId: `calculation-pdf-${operation}-${aggregateId}` })
      );
      expect(calls).toEqual(["queue", "published"]);
      expect(store.markPublished).toHaveBeenCalledWith({ eventId, claimFence, publishedAt: now });
    }
  );

  it("returns malformed payloads to the outbox retry path without leaking fields", async () => {
    const store = createStore({
      id: eventId,
      eventType: CALCULATION_PDF_REQUESTED_EVENT,
      aggregateId: jobId,
      payload: { jobId: "not-a-uuid", secret: "do-not-log" } as never,
      attempts: 2,
      claimFence
    });
    const queue = { add: vi.fn() } as unknown as CalculationPdfQueue;

    await relayPendingCalculationPdfEvents(relayInput(store, queue));

    expect(queue.add).not.toHaveBeenCalled();
    expect(store.markPublished).not.toHaveBeenCalled();
    expect(store.markPublishFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId,
        claimFence,
        nextAvailableAt: new Date("2026-07-15T12:00:04.000Z")
      })
    );
    expect(vi.mocked(store.markPublishFailed).mock.calls.flat(Infinity).join(" ")).not.toContain(
      "do-not-log"
    );
  });

  it("propagates a stale publish claim without trying to requeue it", async () => {
    const store = createStore({
      id: eventId,
      eventType: CALCULATION_PDF_REQUESTED_EVENT,
      aggregateId: jobId,
      payload: { jobId },
      attempts: 0,
      claimFence
    });
    const staleClaimError = Object.assign(new Error("Outbox relay claim is stale"), {
      name: "OutboxRelayStaleClaimError",
      code: "OUTBOX_RELAY_STALE_CLAIM" as const
    });
    vi.mocked(store.markPublished).mockRejectedValueOnce(staleClaimError);
    const queue = { add: vi.fn(async () => undefined) } as unknown as CalculationPdfQueue;

    await expect(relayPendingCalculationPdfEvents(relayInput(store, queue))).rejects.toBe(
      staleClaimError
    );
    expect(store.markPublishFailed).not.toHaveBeenCalled();
  });

  it("stops intake and waits for the in-flight relay before shutdown", async () => {
    let release: (() => void) | undefined;
    const relayOnce = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const relay = createCalculationPdfOutboxRelay({ relayOnce, intervalMs: 60_000 });
    const inFlight = relay.runOnce();
    let stopped = false;
    const stopping = relay.stop().then(() => {
      stopped = true;
    });

    await Promise.resolve();
    expect(stopped).toBe(false);
    release?.();
    await expect(Promise.all([inFlight, stopping])).resolves.toEqual([undefined, undefined]);
    await relay.runOnce();
    expect(relayOnce).toHaveBeenCalledOnce();
  });
});

function relayInput(store: OutboxRelayStore, queue: CalculationPdfQueue) {
  return {
    store,
    queue,
    now,
    batchSize: 20,
    publishingLockTimeoutMs: 60_000,
    queueOptions: { attempts: 5, backoffMs: 1000, jitter: 0.5 }
  };
}

function createStore(event: Awaited<ReturnType<OutboxRelayStore["claimPending"]>>[number]) {
  return {
    claimPending: vi.fn(async () => [event]),
    markPublished: vi.fn(async () => undefined),
    markPublishFailed: vi.fn(async () => undefined),
    markQuarantined: vi.fn(async () => undefined)
  } satisfies OutboxRelayStore;
}
