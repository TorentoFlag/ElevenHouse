import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpInstagramGraphAuthProvider } from "./instagram-graph-auth-provider";

describe("HttpInstagramGraphAuthProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exchanges the OAuth code through the Instagram token endpoint", async () => {
    const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        jsonResponse({
          access_token: "user-token",
          user_id: "ig_456",
          permissions: "instagram_business_basic,instagram_business_manage_messages"
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = createProvider();

    await expect(
      provider.exchangeCode({
        code: "meta-code",
        redirectUri:
          "https://api.elevenhouse.test/messaging/channel-connections/instagram/graph/callback"
      })
    ).resolves.toEqual({
      accessToken: "user-token",
      instagramUserId: "ig_456",
      grantedScopes: ["instagram_business_basic", "instagram_business_manage_messages"]
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const init = fetchMock.mock.calls[0]?.[1];
    expect(url.toString()).toBe("https://api.instagram.test/oauth/access_token");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" });
    const body = init?.body as URLSearchParams;
    expect(body.get("client_id")).toBe("app-id");
    expect(body.get("redirect_uri")).toBe(
      "https://api.elevenhouse.test/messaging/channel-connections/instagram/graph/callback"
    );
    expect(body.get("client_secret")).toBe("app-secret");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("meta-code");
  });

  it("exchanges a short-lived Instagram token for a long-lived token", async () => {
    const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        jsonResponse({
          access_token: "long-lived-token",
          token_type: "bearer",
          expires_in: 5184000
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = createProvider();

    await expect(
      provider.exchangeLongLivedToken({ shortLivedAccessToken: "short-lived-token" })
    ).resolves.toEqual({
      accessToken: "long-lived-token",
      tokenType: "bearer",
      expiresInSeconds: 5184000
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.toString()).toContain("https://graph.instagram.test/access_token");
    expect(url.searchParams.get("grant_type")).toBe("ig_exchange_token");
    expect(url.searchParams.get("client_secret")).toBe("app-secret");
    expect(url.searchParams.get("access_token")).toBe("short-lived-token");
  });

  it("resolves the connected Instagram professional account directly", async () => {
    const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        jsonResponse({
          user_id: "ig_456",
          username: "alisa.astro"
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = createProvider();

    await expect(
      provider.resolveConnectedAccount({
        accessToken: "long-lived-token",
        fallbackInstagramUserId: null
      })
    ).resolves.toEqual({
      instagramUserId: "ig_456",
      instagramUsername: "alisa.astro",
      instagramDisplayName: null
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/v25.0/me");
    expect(url.searchParams.get("fields")).toBe("user_id,username");
    expect(url.searchParams.get("access_token")).toBe("long-lived-token");
  });
});

function createProvider() {
  return new HttpInstagramGraphAuthProvider({
    appId: "app-id",
    appSecret: "app-secret",
    tokenExchangeBaseUrl: "https://api.instagram.test",
    graphTokenBaseUrl: "https://graph.instagram.test",
    graphApiBaseUrl: "https://graph.instagram.test/v25.0"
  });
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body
  } as Response;
}
