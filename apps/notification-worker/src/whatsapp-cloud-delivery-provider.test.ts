import { createAes256GcmSecretCipher } from "@elevenhouse/auth";
import { describe, expect, it } from "vitest";
import { HttpWhatsAppCloudDeliveryProvider } from "./whatsapp-cloud-delivery-provider";

const key = Buffer.from("12345678901234567890123456789012", "utf8");

describe("HttpWhatsAppCloudDeliveryProvider", () => {
  it("sends a text message through the phone-number Cloud API endpoint", async () => {
    const cipher = createAes256GcmSecretCipher(key);
    const encryptedAccessToken = {
      keyId: "test-key",
      ...cipher.encrypt({
        plaintext: "whatsapp-token",
        aad: "messaging:whatsapp_cloud:astrologer-1:connection-1:access_token"
      })
    };
    const calls: Array<{ readonly url: string; readonly init: RequestInit }> = [];
    const provider = new HttpWhatsAppCloudDeliveryProvider(
      {
        graphApiBaseUrl: "https://graph.facebook.com/v26.0/",
        tokenCipher: cipher
      },
      async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ messages: [{ id: "wamid.sent-1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    );

    await expect(
      provider.sendMessage({
        messageId: "message-1",
        channelConnectionId: "connection-1",
        astrologerUserId: "astrologer-1",
        phoneNumberId: "phone-number-1",
        recipientWaId: "wa-client-1",
        text: "Hello WhatsApp",
        encryptedAccessToken
      })
    ).resolves.toEqual({
      provider: "whatsapp",
      status: "sent",
      retryable: false,
      providerStatusCode: 200,
      providerMessageId: "wamid.sent-1"
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v26.0/phone-number-1/messages");
    expect(calls[0]?.init.headers).toEqual({
      authorization: "Bearer whatsapp-token",
      "content-type": "application/json"
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "wa-client-1",
      type: "text",
      text: {
        body: "Hello WhatsApp",
        preview_url: false
      }
    });
  });

  it("classifies Graph invalid-token errors as reauth_required without leaking the token", async () => {
    const cipher = createAes256GcmSecretCipher(key);
    const encryptedAccessToken = {
      keyId: "test-key",
      ...cipher.encrypt({
        plaintext: "secret-whatsapp-token",
        aad: "messaging:whatsapp_cloud:astrologer-1:connection-1:access_token"
      })
    };
    const provider = new HttpWhatsAppCloudDeliveryProvider(
      {
        graphApiBaseUrl: "https://graph.facebook.com/v26.0",
        tokenCipher: cipher
      },
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Session invalid for secret-whatsapp-token",
              code: 190,
              error_subcode: 463,
              error_data: { details: "Token expired" }
            }
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        )
    );

    const result = await provider.sendMessage({
      messageId: "message-1",
      channelConnectionId: "connection-1",
      astrologerUserId: "astrologer-1",
      phoneNumberId: "phone-number-1",
      recipientWaId: "wa-client-1",
      text: "Hello WhatsApp",
      encryptedAccessToken
    });

    expect(result).toMatchObject({
      provider: "whatsapp",
      status: "failed",
      retryable: false,
      providerStatusCode: 400,
      errorCode: "WHATSAPP_CLOUD_CONNECTION_REAUTH_REQUIRED",
      connectionStatus: "reauth_required"
    });
    expect(result.errorMessage).toContain("[whatsapp-cloud-access-token]");
    expect(result.errorMessage).not.toContain("secret-whatsapp-token");
  });
});
