import { describe, expect, it } from "vitest";
import {
  messagingMediaIngestionJobName,
  messagingMediaIngestionQueueName,
  toMessagingMediaIngestionJobOptions
} from "./messaging-media-ingestion.queue";

describe("messaging media ingestion queue", () => {
  it("uses identifier-only jobs and deterministic dedupe keys", () => {
    expect(messagingMediaIngestionQueueName).toBe("messaging.media-ingestion");
    expect(messagingMediaIngestionJobName).toBe("ingest-message-media");
    expect(
      toMessagingMediaIngestionJobOptions({
        ingestionId: "8e14390f-3db1-4d1c-9344-55679c778427",
        attempts: 5,
        backoffMs: 1000
      })
    ).toMatchObject({
      jobId: "messaging-media-ingestion-8e14390f-3db1-4d1c-9344-55679c778427",
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 }
    });
  });
});
