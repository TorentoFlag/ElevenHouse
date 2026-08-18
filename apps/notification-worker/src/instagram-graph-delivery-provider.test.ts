import { createAes256GcmSecretCipher } from "@elevenhouse/auth";
import { describe, expect, it, vi } from "vitest";
import { HttpInstagramGraphDeliveryProvider } from "./instagram-graph-delivery-provider";

const key = Buffer.alloc(32, 14);
const cipher = createAes256GcmSecretCipher(key);

describe("HttpInstagramGraphDeliveryProvider", () => {
  it("decrypts the Instagram token and sends a text message through Graph API", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({ recipient_id: "igsid_777", message_id: "ig-message-100" }, 200)
    );
    const provider = new HttpInstagramGraphDeliveryProvider(
      {
        graphApiBaseUrl: "https://graph.instagram.test/v25.0",
        tokenCipher: cipher
      },
      fetchMock
    );

    await expect(
      provider.sendMessage({
        messageId: "message_1",
        channelConnectionId: "connection_1",
        astrologerUserId: "22222222-2222-4222-8222-222222222222",
        instagramAccountId: "ig_456",
        recipientId: "igsid_777",
        text: "Здравствуйте",
        encryptedAccessToken: encryptedAccessToken("long-lived-token")
      })
    ).resolves.toEqual({
      provider: "instagram",
      status: "sent",
      retryable: false,
      providerStatusCode: 200,
      providerMessageId: "ig-message-100"
    });

    const [urlValue, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(String(urlValue));
    expect(url.toString()).toBe(
      "https://graph.instagram.test/v25.0/me/messages?access_token=long-lived-token"
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      recipient: { id: "igsid_777" },
      message: { text: "Здравствуйте" }
    });
  });

  it("marks expired Instagram tokens as reauthorization-required", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({ error: { code: 190, message: "OAuth token expired" } }, 400, false)
    );
    const provider = new HttpInstagramGraphDeliveryProvider(
      {
        graphApiBaseUrl: "https://graph.instagram.test/v25.0",
        tokenCipher: cipher
      },
      fetchMock
    );

    await expect(
      provider.sendMessage({
        messageId: "message_1",
        channelConnectionId: "connection_1",
        astrologerUserId: "22222222-2222-4222-8222-222222222222",
        instagramAccountId: "ig_456",
        recipientId: "igsid_777",
        text: "Здравствуйте",
        encryptedAccessToken: encryptedAccessToken("long-lived-token")
      })
    ).resolves.toMatchObject({
      provider: "instagram",
      status: "failed",
      retryable: false,
      providerStatusCode: 400,
      errorCode: "INSTAGRAM_GRAPH_CONNECTION_REAUTH_REQUIRED",
      connectionStatus: "reauth_required"
    });
  });
});

function encryptedAccessToken(plaintext: string) {
  return {
    ...cipher.encrypt({
      plaintext,
      aad: "messaging:instagram_graph:22222222-2222-4222-8222-222222222222:connection_1:access_token"
    }),
    keyId: "instagram_graph_v1"
  };
}

function jsonResponse(body: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body
  } as Response;
}
