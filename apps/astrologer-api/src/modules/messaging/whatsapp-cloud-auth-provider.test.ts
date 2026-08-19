import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpWhatsAppCloudAuthProvider } from "./whatsapp-cloud-auth-provider";

describe("HttpWhatsAppCloudAuthProvider", () => {
  const fetchFn = vi.fn();
  const provider = () =>
    new HttpWhatsAppCloudAuthProvider(
      {
        appId: "app-id",
        appSecret: "app-secret",
        graphApiBaseUrl: "https://graph.facebook.com/v26.0"
      },
      fetchFn
    );

  beforeEach(() => {
    fetchFn.mockReset();
  });

  it("exchanges Embedded Signup code through Graph OAuth", async () => {
    fetchFn.mockResolvedValueOnce(jsonResponse({ access_token: "token", expires_in: 5183944 }));

    await expect(provider().exchangeCode({ code: "code-1" })).resolves.toEqual({
      accessToken: "token",
      grantedScopes: [],
      expiresAt: expect.any(Date)
    });

    const call = fetchFn.mock.calls[0];
    if (!call) throw new Error("Expected Graph fetch call");
    const [url, init] = call;
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://graph.facebook.com/v26.0/oauth/access_token"
    );
    expect(url.searchParams.get("client_id")).toBe("app-id");
    expect(url.searchParams.get("client_secret")).toBe("app-secret");
    expect(url.searchParams.get("code")).toBe("code-1");
    expect(init).toEqual({ method: "GET" });
  });

  it("resolves a Coexistence phone through WABA when session event omits phone_number_id", async () => {
    fetchFn
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "phone-1",
              display_phone_number: "+15550783881",
              verified_name: "ElevenHouse",
              platform_type: "CLOUD_API",
              is_on_biz_app: true
            }
          ]
        })
      )
      .mockResolvedValueOnce(jsonResponse({ id: "business-1" }));

    await expect(
      provider().resolvePhoneNumber({ accessToken: "token", wabaId: "waba-1" })
    ).resolves.toEqual({
      businessId: "business-1",
      displayPhoneNumber: "+15550783881",
      isOnBizApp: true,
      phoneNumberId: "phone-1",
      platformType: "CLOUD_API",
      verifiedName: "ElevenHouse",
      wabaId: "waba-1"
    });
    const [phoneNumbersUrl, phoneNumbersInit] = fetchFn.mock.calls[0] ?? [];
    expect(phoneNumbersUrl?.searchParams.get("access_token")).toBeNull();
    expect(phoneNumbersInit).toMatchObject({
      headers: { authorization: "Bearer token" }
    });
    const [businessUrl, businessInit] = fetchFn.mock.calls[1] ?? [];
    expect(businessUrl?.searchParams.get("access_token")).toBeNull();
    expect(businessInit).toMatchObject({
      headers: { authorization: "Bearer token" }
    });
  });

  it("subscribes WABA and requests SMB app data sync", async () => {
    fetchFn
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true, id: "sync-request-1" }));

    await expect(
      provider().subscribeWabaToWebhooks({ accessToken: "token", wabaId: "waba-1" })
    ).resolves.toBeUndefined();
    await expect(
      provider().requestSmbAppDataSync({
        accessToken: "token",
        phoneNumberId: "phone-1",
        syncType: "history"
      })
    ).resolves.toEqual({ requestId: "sync-request-1" });
    const [subscribeUrl, subscribeInit] = fetchFn.mock.calls[0] ?? [];
    expect(subscribeUrl?.searchParams.get("access_token")).toBeNull();
    expect(subscribeInit).toMatchObject({
      method: "POST",
      headers: { authorization: "Bearer token" }
    });
    const [syncUrl, syncInit] = fetchFn.mock.calls[1] ?? [];
    expect(syncUrl?.searchParams.get("access_token")).toBeNull();
    expect(syncInit).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/x-www-form-urlencoded"
      }
    });
  });

  it("classifies Graph error body without leaking secrets", async () => {
    fetchFn.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            message: "Invalid OAuth access token",
            code: 190,
            error_subcode: 463,
            error_data: { details: "token expired" }
          }
        },
        400
      )
    );

    const result = provider().exchangeCode({ code: "secret-code" });
    await expect(result).rejects.toMatchObject({
      code: "whatsapp_cloud_graph_oauth_failed",
      graphErrorCode: 190,
      graphErrorSubcode: 463,
      graphErrorDetails: "token expired"
    });
    await result.catch((error: Error) => {
      expect(error.message).not.toContain("secret-code");
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Bad Request",
    json: async () => body
  } as Response;
}
