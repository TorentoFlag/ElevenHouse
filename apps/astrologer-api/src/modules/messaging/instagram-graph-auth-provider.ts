import { z } from "@elevenhouse/validation";

export type InstagramGraphAuthProvider = {
  readonly exchangeCode: (input: {
    readonly code: string;
    readonly redirectUri: string;
  }) => Promise<InstagramGraphTokenExchangeResult>;
  readonly resolveConnectedAccount: (input: {
    readonly userAccessToken: string;
  }) => Promise<InstagramGraphConnectedAccount>;
};

export type InstagramGraphTokenExchangeResult = {
  readonly accessToken: string;
  readonly tokenType: string | null;
  readonly expiresInSeconds: number | null;
};

export type InstagramGraphConnectedAccount = {
  readonly pageId: string;
  readonly pageName: string | null;
  readonly pageAccessToken: string;
  readonly instagramUserId: string;
  readonly instagramUsername: string | null;
  readonly instagramDisplayName: string | null;
};

export type InstagramGraphAuthProviderOptions = {
  readonly appId: string;
  readonly appSecret: string;
  readonly graphApiBaseUrl: string;
};

const tokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  token_type: z.string().trim().min(1).optional(),
  expires_in: z.number().int().positive().optional()
});

const accountsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1).optional(),
      access_token: z.string().trim().min(1).optional(),
      instagram_business_account: z
        .object({
          id: z.string().trim().min(1),
          username: z.string().trim().min(1).optional(),
          name: z.string().trim().min(1).optional()
        })
        .optional()
    })
  )
});

export class HttpInstagramGraphAuthProvider implements InstagramGraphAuthProvider {
  constructor(private readonly options: InstagramGraphAuthProviderOptions) {}

  async exchangeCode(input: {
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<InstagramGraphTokenExchangeResult> {
    const url = new URL(`${this.options.graphApiBaseUrl}/oauth/access_token`);
    url.searchParams.set("client_id", this.options.appId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("client_secret", this.options.appSecret);
    url.searchParams.set("code", input.code);

    const response = await fetch(url, { method: "GET" });
    const payload = await readGraphJson(response);
    const parsed = tokenResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw new Error("Instagram Graph authorization code exchange failed");
    }
    return {
      accessToken: parsed.data.access_token,
      tokenType: parsed.data.token_type ?? null,
      expiresInSeconds: parsed.data.expires_in ?? null
    };
  }

  async resolveConnectedAccount(input: {
    readonly userAccessToken: string;
  }): Promise<InstagramGraphConnectedAccount> {
    const url = new URL(`${this.options.graphApiBaseUrl}/me/accounts`);
    url.searchParams.set(
      "fields",
      "id,name,access_token,instagram_business_account{id,username,name}"
    );
    url.searchParams.set("access_token", input.userAccessToken);

    const response = await fetch(url, { method: "GET" });
    const payload = await readGraphJson(response);
    const parsed = accountsResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw new Error("Instagram Graph connected account lookup failed");
    }

    const account = parsed.data.data.find(
      (candidate) => candidate.access_token && candidate.instagram_business_account
    );
    if (!account?.access_token || !account.instagram_business_account) {
      throw new Error("Instagram Graph account has no linked Instagram professional account");
    }

    return {
      pageId: account.id,
      pageName: account.name ?? null,
      pageAccessToken: account.access_token,
      instagramUserId: account.instagram_business_account.id,
      instagramUsername: account.instagram_business_account.username ?? null,
      instagramDisplayName: account.instagram_business_account.name ?? null
    };
  }
}

async function readGraphJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
