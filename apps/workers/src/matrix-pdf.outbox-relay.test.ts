import { describe, expect, it, vi } from "vitest";
import type { OutboxRelayStore } from "@elevenhouse/db/outbox";
import type { MatrixPdfQueue } from "./matrix-pdf.queue";
import { relayPendingMatrixPdfEvents } from "./matrix-pdf.outbox-relay";

const eventId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";

describe("relayPendingMatrixPdfEvents", () => {
  it("claims only Matrix PDF events and publishes a deterministic queue job", async () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const store = createStore({
      id: eventId,
      eventType: "matrix.pdf.requested.v1",
      aggregateId: jobId,
      payload: {
        jobId,
        ownerUserId: "00000000-0000-4000-8000-000000000003",
        calculationId: "00000000-0000-4000-8000-000000000004"
      },
      attempts: 0
    });
    const queue = { add: vi.fn(async () => undefined) } as unknown as MatrixPdfQueue;

    await expect(
      relayPendingMatrixPdfEvents({
        store,
        queue,
        now,
        batchSize: 20,
        publishingLockTimeoutMs: 60_000,
        queueOptions: { attempts: 5, backoffMs: 1000 }
      })
    ).resolves.toBe(1);

    expect(store.claimPending).toHaveBeenCalledWith({
      eventTypes: ["matrix.pdf.requested.v1"],
      limit: 20,
      now,
      stalePublishingBefore: new Date("2026-07-14T11:59:00.000Z")
    });
    expect(queue.add).toHaveBeenCalledWith(
      "render-matrix-pdf",
      { jobId },
      expect.objectContaining({ jobId: `matrix-pdf-${jobId}` })
    );
    expect(store.markPublished).toHaveBeenCalledWith({ eventId, publishedAt: now });
  });

  it("rejects malformed payloads without leaking their fields", async () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const store = createStore({
      id: eventId,
      eventType: "matrix.pdf.requested.v1",
      aggregateId: jobId,
      payload: { jobId: "not-a-uuid", secret: "do-not-log" } as never,
      attempts: 2
    });
    const queue = { add: vi.fn() } as unknown as MatrixPdfQueue;

    await relayPendingMatrixPdfEvents({
      store,
      queue,
      now,
      batchSize: 20,
      publishingLockTimeoutMs: 60_000,
      queueOptions: { attempts: 5, backoffMs: 1000 }
    });

    expect(queue.add).not.toHaveBeenCalled();
    expect(store.markPublishFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId,
        nextAvailableAt: new Date("2026-07-14T12:00:04.000Z")
      })
    );
    expect(JSON.stringify(vi.mocked(store.markPublishFailed).mock.calls)).not.toContain(
      "do-not-log"
    );
  });
});

function createStore(event: Awaited<ReturnType<OutboxRelayStore["claimPending"]>>[number]) {
  return {
    claimPending: vi.fn(async () => [event]),
    markPublished: vi.fn(async () => undefined),
    markPublishFailed: vi.fn(async () => undefined)
  } satisfies OutboxRelayStore;
}
