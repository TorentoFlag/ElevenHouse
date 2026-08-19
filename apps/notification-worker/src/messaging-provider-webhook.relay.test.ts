import { describe, expect, it, vi } from "vitest";

import { relayPendingMessagingProviderWebhooks } from "./messaging-provider-webhook.relay";
import { messagingProviderWebhookJobName } from "./messaging-provider-webhook.queue";

describe("relayPendingMessagingProviderWebhooks", () => {
  it("publishes pending WhatsApp sync webhook events with deterministic job ids", async () => {
    const store = {
      listPendingSyncEventKeys: vi.fn().mockResolvedValue(["whatsapp:history-chunk:waba-1:phone-1:initial:1"])
    };
    const queue = {
      add: vi.fn().mockResolvedValue(undefined)
    };

    await relayPendingMessagingProviderWebhooks({
      store,
      queue,
      batchSize: 10,
      queueOptions: { attempts: 5, backoffMs: 1000 }
    });

    expect(store.listPendingSyncEventKeys).toHaveBeenCalledWith({ limit: 10 });
    expect(queue.add).toHaveBeenCalledWith(
      messagingProviderWebhookJobName,
      { eventKey: "whatsapp:history-chunk:waba-1:phone-1:initial:1" },
      expect.objectContaining({
        jobId: "messaging-provider-webhook-whatsapp:history-chunk:waba-1:phone-1:initial:1",
        attempts: 5
      })
    );
  });
});
