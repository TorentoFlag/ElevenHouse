import { describe, expect, it, vi } from "vitest";
import { relayPendingMessagingMediaIngestions } from "./messaging-media-ingestion.relay";

describe("relayPendingMessagingMediaIngestions", () => {
  it("publishes due DB ingestion ids as identifier-only queue jobs", async () => {
    const queue = { add: vi.fn(async () => undefined) };
    const store = {
      listDueIds: vi.fn(async () => ["ingestion-1", "ingestion-2"])
    };
    const now = new Date("2026-07-27T08:00:00.000Z");

    await relayPendingMessagingMediaIngestions({
      store,
      queue,
      now,
      batchSize: 2,
      queueOptions: { attempts: 5, backoffMs: 1000 }
    });

    expect(store.listDueIds).toHaveBeenCalledWith({ now, limit: 2 });
    expect(queue.add).toHaveBeenCalledWith(
      "ingest-message-media",
      { ingestionId: "ingestion-1" },
      expect.objectContaining({ jobId: "messaging-media-ingestion-ingestion-1" })
    );
    expect(queue.add).toHaveBeenCalledWith(
      "ingest-message-media",
      { ingestionId: "ingestion-2" },
      expect.objectContaining({ jobId: "messaging-media-ingestion-ingestion-2" })
    );
  });
});
