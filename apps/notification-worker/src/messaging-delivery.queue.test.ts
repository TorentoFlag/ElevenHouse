import { describe, expect, it } from "vitest";
import {
  messagingDeliveryJobName,
  messagingDeliveryQueueName,
  toMessagingDeliveryJobOptions
} from "./messaging-delivery.queue";

describe("messaging delivery queue", () => {
  it("uses the dedicated queue and deterministic outbox-event job id", () => {
    expect(messagingDeliveryQueueName).toBe("messaging.delivery");
    expect(messagingDeliveryJobName).toBe("deliver-messaging-message");
    expect(
      toMessagingDeliveryJobOptions({
        outboxEventId: "8e14390f-3db1-4d1c-9344-55679c778427",
        attempts: 5,
        backoffMs: 1000
      })
    ).toMatchObject({
      jobId: "messaging-delivery-8e14390f-3db1-4d1c-9344-55679c778427",
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 }
    });
  });
});
