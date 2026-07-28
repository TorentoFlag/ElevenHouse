import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpInstagramGraphAuthProvider } from "./instagram-graph-auth-provider";

describe("HttpInstagramGraphAuthProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exchanges the OAuth code through the Graph API token endpoint", async () => {
    const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        jsonResponse({
          access_token: "user-token",
          token_type: "bearer",
          expires_in: 3600
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
      tokenType: "bearer",
      expiresInSeconds: 3600
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.toString()).toContain("https://graph.facebook.test/v25.0/oauth/access_token");
    expect(url.searchParams.get("client_id")).toBe("app-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://api.elevenhouse.test/messaging/channel-connections/instagram/graph/callback"
    );
    expect(url.searchParams.get("client_secret")).toBe("app-secret");
    expect(url.searchParams.get("code")).toBe("meta-code");
  });

  it("resolves the Page token and linked Instagram professional account", async () => {
    const fetchMock = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        jsonResponse({
          data: [
            { id: "page-without-instagram", name: "No IG", access_token: "unused-page-token" },
            {
              id: "page_123",
              name: "Alisa Astrology",
              access_token: "page-token",
              instagram_business_account: {
                id: "ig_456",
                username: "alisa.astro",
                name: "Alisa Astro"
              }
            }
          ]
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = createProvider();

    await expect(
      provider.resolveConnectedAccount({ userAccessToken: "user-token" })
    ).resolves.toEqual({
      pageId: "page_123",
      pageName: "Alisa Astrology",
      pageAccessToken: "page-token",
      instagramUserId: "ig_456",
      instagramUsername: "alisa.astro",
      instagramDisplayName: "Alisa Astro"
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/v25.0/me/accounts");
    expect(url.searchParams.get("fields")).toBe(
      "id,name,access_token,instagram_business_account{id,username,name}"
    );
    expect(url.searchParams.get("access_token")).toBe("user-token");
  });
});

function createProvider() {
  return new HttpInstagramGraphAuthProvider({
    appId: "app-id",
    appSecret: "app-secret",
    graphApiBaseUrl: "https://graph.facebook.test/v25.0"
  });
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body
  } as Response;
}
