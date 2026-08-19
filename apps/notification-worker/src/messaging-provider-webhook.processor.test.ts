import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";

import { processMessagingProviderWebhookJob } from "./messaging-provider-webhook.processor";
import type { MessagingProviderWebhookJobData } from "./messaging-provider-webhook.queue";

describe("processMessagingProviderWebhookJob", () => {
  it("marks WhatsApp history and contact sync webhook events processed without creating CRM clients", async () => {
    const store = {
      claimDueById: vi.fn().mockResolvedValue({
        eventKey: "whatsapp:history-chunk:waba-1:phone-1:initial:1",
        field: "history",
        provider: "whatsapp",
        mode: "whatsapp_cloud",
        externalAccountId: "phone-1",
        externalOwnerUserId: "waba-1",
        normalizedSummary: {
          action: "received",
          hasMessages: true,
          hasContact: false
        }
      }),
      markProcessed: vi.fn().mockResolvedValue(undefined),
      markRetryableFailed: vi.fn(),
      markFinalFailed: vi.fn(),
      createClient: vi.fn()
    };

    await processMessagingProviderWebhookJob({
      job: job("whatsapp:history-chunk:waba-1:phone-1:initial:1"),
      store,
      now: new Date("2026-08-19T00:45:00.000Z")
    });

    expect(store.claimDueById).toHaveBeenCalledWith({
      eventKey: "whatsapp:history-chunk:waba-1:phone-1:initial:1",
      leaseOwner: expect.any(String),
      now: "2026-08-19T00:45:00.000Z"
    });
    expect(store.markProcessed).toHaveBeenCalledWith({
      eventKey: "whatsapp:history-chunk:waba-1:phone-1:initial:1",
      now: "2026-08-19T00:45:00.000Z"
    });
    expect(store.createClient).not.toHaveBeenCalled();
  });

  it("records retryable and final failures on the webhook event row", async () => {
    const store = {
      claimDueById: vi.fn().mockResolvedValue({
        eventKey: "whatsapp:contact-sync:phone-1:15551234567:upsert:1",
        field: "smb_app_state_sync",
        provider: "whatsapp",
        mode: "whatsapp_cloud",
        externalAccountId: "phone-1",
        externalOwnerUserId: "waba-1",
        normalizedSummary: null
      }),
      markProcessed: vi.fn(),
      markRetryableFailed: vi.fn().mockResolvedValue(undefined),
      markFinalFailed: vi.fn().mockResolvedValue(undefined)
    };

    await expect(
      processMessagingProviderWebhookJob({
        job: job("whatsapp:contact-sync:phone-1:15551234567:upsert:1", false),
        store,
        now: new Date("2026-08-19T00:46:00.000Z")
      })
    ).rejects.toThrow("Messaging provider webhook processing failed");
    expect(store.markRetryableFailed).toHaveBeenCalledWith({
      eventKey: "whatsapp:contact-sync:phone-1:15551234567:upsert:1",
      errorCode: "MESSAGING_PROVIDER_WEBHOOK_PROCESSING_FAILED",
      errorMessage: "WhatsApp sync webhook summary is invalid",
      now: "2026-08-19T00:46:00.000Z"
    });

    await processMessagingProviderWebhookJob({
      job: job("whatsapp:contact-sync:phone-1:15551234567:upsert:1", true),
      store,
      now: new Date("2026-08-19T00:46:01.000Z")
    });
    expect(store.markFinalFailed).toHaveBeenCalledWith({
      eventKey: "whatsapp:contact-sync:phone-1:15551234567:upsert:1",
      errorCode: "MESSAGING_PROVIDER_WEBHOOK_PROCESSING_FAILED",
      errorMessage: "WhatsApp sync webhook summary is invalid",
      now: "2026-08-19T00:46:01.000Z"
    });
  });
});

function job(eventKey: string, finalAttempt = true): Job<MessagingProviderWebhookJobData> {
  return {
    data: { eventKey },
    attemptsMade: finalAttempt ? 4 : 1,
    opts: { attempts: 5 }
  } as Job<MessagingProviderWebhookJobData>;
}
