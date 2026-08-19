import type { Job } from "bullmq";
import { describe, expect, it } from "vitest";
import type { MessagingDeliveryProcessingStore } from "@elevenhouse/db/messaging";
import { processMessagingDeliveryJob } from "./messaging-delivery.processor";
import type { MessagingDeliveryJobData } from "./messaging-delivery.queue";

describe("processMessagingDeliveryJob", () => {
  it("routes WhatsApp Cloud work items to the WhatsApp delivery provider", async () => {
    const sentAttempts: unknown[] = [];
    const providerInputs: unknown[] = [];
    const store: MessagingDeliveryProcessingStore = {
      findByOutboxEventId: async () =>
        ({
          outboxEventId: "outbox-1",
          messageId: "message-1",
          messageStatus: "queued",
          provider: "whatsapp",
          mode: "whatsapp_cloud",
          channelConnectionId: "connection-1",
          astrologerUserId: "astrologer-1",
          phoneNumberId: "phone-number-1",
          providerChatId: "wa-client-1",
          encryptedAccessToken: {
            algorithm: "aes-256-gcm",
            keyId: "test-key",
            iv: "iv",
            authTag: "tag",
            ciphertext: "ciphertext"
          },
          text: "Hello WhatsApp"
        }) as Awaited<ReturnType<MessagingDeliveryProcessingStore["findByOutboxEventId"]>>,
      recordSent: async (input) => {
        sentAttempts.push(input);
      },
      recordRetryableFailure: async () => undefined,
      recordRetryableUnknown: async () => undefined,
      recordFinalFailure: async () => undefined,
      recordFinalUnknown: async () => undefined
    };

    await processMessagingDeliveryJob({
      job: {
        data: { outboxEventId: "outbox-1" },
        attemptsMade: 0,
        opts: { attempts: 5 }
      } as Job<MessagingDeliveryJobData>,
      store,
      provider: {
        telegramBusiness: {
          sendMessage: async () => {
            throw new Error("Telegram provider must not be used for WhatsApp work items");
          }
        },
        whatsappCloud: {
          sendMessage: async (input) => {
            providerInputs.push(input);
            return {
              provider: "whatsapp",
              status: "sent",
              retryable: false,
              providerStatusCode: 200,
              providerMessageId: "wamid.sent-1"
            };
          }
        }
      },
      now: new Date("2026-08-18T16:00:00.000Z")
    });

    expect(providerInputs).toEqual([
      {
        messageId: "message-1",
        channelConnectionId: "connection-1",
        astrologerUserId: "astrologer-1",
        phoneNumberId: "phone-number-1",
        recipientWaId: "wa-client-1",
        text: "Hello WhatsApp",
        encryptedAccessToken: {
          algorithm: "aes-256-gcm",
          keyId: "test-key",
          iv: "iv",
          authTag: "tag",
          ciphertext: "ciphertext"
        }
      }
    ]);
    expect(sentAttempts).toEqual([
      {
        messageId: "message-1",
        attemptNumber: 1,
        provider: "whatsapp",
        providerStatusCode: 200,
        providerMessageId: "wamid.sent-1",
        attemptedAt: new Date("2026-08-18T16:00:00.000Z")
      }
    ]);
  });
});
