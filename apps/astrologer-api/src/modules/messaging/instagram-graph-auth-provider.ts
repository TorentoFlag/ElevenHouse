import { z } from "@elevenhouse/validation";

export type InstagramGraphAuthProvider = {
  readonly exchangeCode: (input: {
    readonly code: string;
    readonly redirectUri: string;
  }) => Promise<InstagramGraphTokenExchangeResult>;
  readonly exchangeLongLivedToken: (input: {
    readonly shortLivedAccessToken: string;
  }) => Promise<InstagramGraphLongLivedTokenResult>;
  readonly resolveConnectedAccount: (input: {
    readonly accessToken: string;
    readonly fallbackInstagramUserId: string | null;
  }) => Promise<InstagramGraphConnectedAccount>;
  readonly subscribeAccountToWebhooks: (input: {
    readonly accessToken: string;
    readonly instagramUserId: string;
    readonly fields: readonly string[];
  }) => Promise<void>;
};

export type InstagramGraphTokenExchangeResult = {
  readonly accessToken: string;
  readonly instagramUserId: string | null;
  readonly grantedScopes: readonly string[];
};

export type InstagramGraphLongLivedTokenResult = {
  readonly accessToken: string;
  readonly tokenType: string | null;
  readonly expiresInSeconds: number;
};

export type InstagramGraphConnectedAccount = {
  readonly instagramAccountId: string;
  readonly instagramAppScopedUserId: string | null;
  readonly instagramUserId: string;
  readonly instagramUsername: string | null;
  readonly instagramDisplayName: string | null;
};

export type InstagramGraphAuthProviderOptions = {
  readonly appId: string;
  readonly appSecret: string;
  readonly tokenExchangeBaseUrl: string;
  readonly graphTokenBaseUrl: string;
  readonly graphApiBaseUrl: string;
};

const authorizationCodeTokenPayloadSchema = z.object({
  access_token: z.string().trim().min(1),
  user_id: z.union([z.string().trim().min(1), z.number()]).optional(),
  permissions: z.union([z.string(), z.array(z.string())]).optional()
});

const authorizationCodeTokenResponseSchema = z.union([
  authorizationCodeTokenPayloadSchema,
  z.object({
    data: z.array(authorizationCodeTokenPayloadSchema).min(1)
  })
]);

const longLivedTokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  token_type: z.string().trim().min(1).optional(),
  expires_in: z.number().int().positive()
});

const profileResponseSchema = z.object({
  user_id: z.union([z.string().trim().min(1), z.number()]).optional(),
  id: z.union([z.string().trim().min(1), z.number()]).optional(),
  username: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional()
});

const subscribeAccountResponseSchema = z.object({
  success: z.literal(true)
});

export class HttpInstagramGraphAuthProvider implements InstagramGraphAuthProvider {
  constructor(private readonly options: InstagramGraphAuthProviderOptions) {}

  async exchangeCode(input: {
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<InstagramGraphTokenExchangeResult> {
    const url = new URL(`${this.options.tokenExchangeBaseUrl}/oauth/access_token`);
    const body = new URLSearchParams();
    body.set("client_id", this.options.appId);
    body.set("client_secret", this.options.appSecret);
    body.set("grant_type", "authorization_code");
    body.set("redirect_uri", input.redirectUri);
    body.set("code", input.code);

    const response = await fetch(url, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    const payload = await readGraphJson(response);
    const parsed = authorizationCodeTokenResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw new Error("Instagram Graph authorization code exchange failed");
    }
    const tokenPayload = "data" in parsed.data ? parsed.data.data[0] : parsed.data;
    if (!tokenPayload) {
      throw new Error("Instagram Graph authorization code exchange returned no token");
    }
    return {
      accessToken: tokenPayload.access_token,
      instagramUserId: tokenPayload.user_id === undefined ? null : tokenPayload.user_id.toString(),
      grantedScopes: parseGrantedScopes(tokenPayload.permissions)
    };
  }

  async exchangeLongLivedToken(input: {
    readonly shortLivedAccessToken: string;
  }): Promise<InstagramGraphLongLivedTokenResult> {
    const url = new URL(`${this.options.graphTokenBaseUrl}/access_token`);
    url.searchParams.set("grant_type", "ig_exchange_token");
    url.searchParams.set("client_secret", this.options.appSecret);
    url.searchParams.set("access_token", input.shortLivedAccessToken);

    const response = await fetch(url, { method: "GET" });
    const payload = await readGraphJson(response);
    const parsed = longLivedTokenResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw new Error("Instagram Graph long-lived token exchange failed");
    }
    return {
      accessToken: parsed.data.access_token,
      tokenType: parsed.data.token_type ?? null,
      expiresInSeconds: parsed.data.expires_in
    };
  }

  async resolveConnectedAccount(input: {
    readonly accessToken: string;
    readonly fallbackInstagramUserId: string | null;
  }): Promise<InstagramGraphConnectedAccount> {
    const url = new URL(`${this.options.graphApiBaseUrl}/me`);
    url.searchParams.set("fields", "id,user_id,username");
    url.searchParams.set("access_token", input.accessToken);

    const response = await fetch(url, { method: "GET" });
    const payload = await readGraphJson(response);
    const parsed = profileResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw new Error("Instagram Graph connected account lookup failed");
    }
    const instagramUserId =
      parsed.data.user_id?.toString() ??
      parsed.data.id?.toString() ??
      input.fallbackInstagramUserId;
    const instagramAccountId = instagramUserId;
    const instagramAppScopedUserId = parsed.data.id?.toString() ?? null;
    if (!instagramUserId) throw new Error("Instagram Graph account id was not returned");
    if (!instagramAccountId) throw new Error("Instagram Graph scoped account id was not returned");

    return {
      instagramAccountId,
      instagramAppScopedUserId,
      instagramUserId,
      instagramUsername: parsed.data.username ?? null,
      instagramDisplayName: parsed.data.name ?? null
    };
  }

  async subscribeAccountToWebhooks(input: {
    readonly accessToken: string;
    readonly instagramUserId: string;
    readonly fields: readonly string[];
  }): Promise<void> {
    const fields = input.fields.map((field) => field.trim()).filter(Boolean);
    if (fields.length === 0) {
      throw new Error("Instagram Graph webhook subscribed fields are required");
    }

    const url = new URL(`${this.options.graphApiBaseUrl}/${input.instagramUserId}/subscribed_apps`);
    url.searchParams.set("subscribed_fields", fields.join(","));
    url.searchParams.set("access_token", input.accessToken);

    const response = await fetch(url, { method: "POST" });
    const payload = await readGraphJson(response);
    const parsed = subscribeAccountResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw new Error("Instagram Graph account webhook subscription failed");
    }
  }
}

function parseGrantedScopes(value: string | string[] | undefined): readonly string[] {
  if (Array.isArray(value)) return value.map((scope: string) => scope.trim()).filter(Boolean);
  return (value ?? "")
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

async function readGraphJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
