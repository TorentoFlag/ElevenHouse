import { describe, expect, it } from "vitest";
import { parseInstagramGraphWebhookUpdates } from "./instagram-graph-webhook";

describe("parseInstagramGraphWebhookUpdates", () => {
  it("extracts text message events from Instagram Graph webhooks", () => {
    expect(
      parseInstagramGraphWebhookUpdates({
        object: "instagram",
        entry: [
          {
            id: "ig_business_1",
            time: 1784700060,
            messaging: [
              {
                sender: { id: "ig_client_1" },
                recipient: { id: "ig_business_1" },
                timestamp: 1784700060123,
                message: {
                  mid: "ig_mid_1",
                  text: "Здравствуйте"
                }
              }
            ]
          }
        ]
      })
    ).toEqual([
      {
        kind: "message",
        instagramAccountId: "ig_business_1",
        providerMessageId: "ig_mid_1",
        senderId: "ig_client_1",
        recipientId: "ig_business_1",
        text: "Здравствуйте",
        providerSentAt: "2026-07-22T06:01:00.123Z"
      }
    ]);
  });

  it("ignores non-message and non-text messaging events", () => {
    expect(
      parseInstagramGraphWebhookUpdates({
        object: "instagram",
        entry: [
          {
            id: "ig_business_1",
            messaging: [
              { sender: { id: "ig_client_1" }, recipient: { id: "ig_business_1" }, read: {} },
              {
                sender: { id: "ig_client_1" },
                recipient: { id: "ig_business_1" },
                message: { mid: "ig_mid_2", attachments: [] }
              }
            ]
          }
        ]
      })
    ).toEqual([]);
  });

  it("extracts messages from Meta webhook test payloads", () => {
    expect(
      parseInstagramGraphWebhookUpdates({
        field: "messages",
        value: {
          sender: { id: "12334" },
          recipient: { id: "23245" },
          timestamp: "1527459824",
          message: {
            mid: "random_mid",
            text: "random_text"
          }
        }
      })
    ).toEqual([
      {
        kind: "message",
        instagramAccountId: "23245",
        providerMessageId: "random_mid",
        senderId: "12334",
        recipientId: "23245",
        text: "random_text",
        providerSentAt: "2018-05-27T22:23:44.000Z"
      }
    ]);
  });

  it("extracts messages from Meta webhook changes payloads", () => {
    expect(
      parseInstagramGraphWebhookUpdates({
        object: "instagram",
        entry: [
          {
            id: "ig_business_1",
            changes: [
              {
                field: "messages",
                value: {
                  sender: { id: "ig_client_1" },
                  recipient: { id: "ig_business_1" },
                  timestamp: "1784700060123",
                  message: {
                    mid: "ig_mid_3",
                    text: "Через changes"
                  }
                }
              }
            ]
          }
        ]
      })
    ).toEqual([
      {
        kind: "message",
        instagramAccountId: "ig_business_1",
        providerMessageId: "ig_mid_3",
        senderId: "ig_client_1",
        recipientId: "ig_business_1",
        text: "Через changes",
        providerSentAt: "2026-07-22T06:01:00.123Z"
      }
    ]);
  });

  it("ignores unsupported Instagram change events without rejecting the webhook", () => {
    expect(
      parseInstagramGraphWebhookUpdates({
        object: "instagram",
        entry: [
          {
            id: "ig_business_1",
            changes: [
              {
                field: "message_reactions",
                value: {
                  sender: { id: "ig_client_1" },
                  recipient: { id: "ig_business_1" },
                  timestamp: "1784700060123"
                }
              },
              {
                field: "messages",
                value: {
                  sender: { id: "ig_client_1" },
                  recipient: { id: "ig_business_1" },
                  timestamp: "1784700060123"
                }
              }
            ]
          }
        ]
      })
    ).toEqual([]);
  });

  it("rejects non-Instagram webhook payloads", () => {
    expect(() => parseInstagramGraphWebhookUpdates({ object: "page", entry: [] })).toThrow(
      "Invalid Instagram Graph webhook payload"
    );
  });
});
