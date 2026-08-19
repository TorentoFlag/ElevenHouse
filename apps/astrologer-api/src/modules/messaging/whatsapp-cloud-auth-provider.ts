import { z } from "@elevenhouse/validation";

export type WhatsAppCloudAuthProvider = {
  readonly exchangeCode: (input: { readonly code: string }) => Promise<{
    readonly accessToken: string;
    readonly grantedScopes: readonly string[];
    readonly expiresAt: Date | null;
  }>;
  readonly resolvePhoneNumber: (input: {
    readonly accessToken: string;
    readonly wabaId: string;
    readonly phoneNumberId?: string;
  }) => Promise<WhatsAppCloudResolvedPhoneNumber>;
  readonly subscribeWabaToWebhooks: (input: {
    readonly accessToken: string;
    readonly wabaId: string;
  }) => Promise<void>;
  readonly requestSmbAppDataSync: (input: {
    readonly accessToken: string;
    readonly phoneNumberId: string;
    readonly syncType: "smb_app_state_sync" | "history";
  }) => Promise<{ readonly requestId: string | null }>;
};

export type WhatsAppCloudResolvedPhoneNumber = {
  readonly wabaId: string;
  readonly businessId: string | null;
  readonly phoneNumberId: string;
  readonly displayPhoneNumber: string | null;
  readonly verifiedName: string | null;
  readonly platformType: string | null;
  readonly isOnBizApp: boolean | null;
};

export type WhatsAppCloudAuthProviderOptions = {
  readonly appId: string;
  readonly appSecret: string;
  readonly graphApiBaseUrl: string;
};

type WhatsAppCloudFetch = (url: URL, init: RequestInit) => Promise<Response>;

const tokenExchangeResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  expires_in: z.number().int().positive().optional(),
  scope: z.union([z.string(), z.array(z.string())]).optional()
});

const phoneNumberSchema = z.object({
  id: z.union([z.string().trim().min(1), z.number()]),
  display_phone_number: z.string().trim().min(1).optional(),
  verified_name: z.string().trim().min(1).optional(),
  platform_type: z.string().trim().min(1).optional(),
  is_on_biz_app: z.boolean().optional()
});

const phoneNumbersResponseSchema = z.object({
  data: z.array(phoneNumberSchema).min(1)
});

const wabaBusinessResponseSchema = z.object({
  id: z.union([z.string().trim().min(1), z.number()]).optional(),
  business: z
    .object({
      id: z.union([z.string().trim().min(1), z.number()]).optional()
    })
    .optional()
});

const successResponseSchema = z.object({
  success: z.literal(true),
  id: z.union([z.string().trim().min(1), z.number()]).optional()
});

const graphErrorResponseSchema = z.object({
  error: z.object({
    message: z.string().trim().min(1).optional(),
    code: z.number().int().optional(),
    error_subcode: z.number().int().optional(),
    error_data: z
      .object({
        details: z.string().trim().min(1).optional()
      })
      .optional()
  })
});

export class WhatsAppCloudGraphProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly graphErrorCode: number | null,
    readonly graphErrorSubcode: number | null,
    readonly graphErrorDetails: string | null
  ) {
    super(message);
  }
}

export class HttpWhatsAppCloudAuthProvider implements WhatsAppCloudAuthProvider {
  constructor(
    private readonly options: WhatsAppCloudAuthProviderOptions,
    private readonly fetchFn: WhatsAppCloudFetch = fetch
  ) {}

  async exchangeCode(input: { readonly code: string }) {
    const url = new URL(`${this.options.graphApiBaseUrl}/oauth/access_token`);
    url.searchParams.set("client_id", this.options.appId);
    url.searchParams.set("client_secret", this.options.appSecret);
    url.searchParams.set("code", input.code);

    const response = await this.fetchFn(url, { method: "GET" });
    const payload = await readGraphJson(response);
    const parsed = tokenExchangeResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw graphError("whatsapp_cloud_graph_oauth_failed", response, payload);
    }
    return {
      accessToken: parsed.data.access_token,
      grantedScopes: parseGrantedScopes(parsed.data.scope),
      expiresAt: parsed.data.expires_in
        ? new Date(Date.now() + parsed.data.expires_in * 1000)
        : null
    };
  }

  async resolvePhoneNumber(input: {
    readonly accessToken: string;
    readonly wabaId: string;
    readonly phoneNumberId?: string;
  }): Promise<WhatsAppCloudResolvedPhoneNumber> {
    const phone = input.phoneNumberId
      ? await this.fetchPhoneNumber(input.accessToken, input.phoneNumberId)
      : await this.fetchFirstWabaPhoneNumber(input.accessToken, input.wabaId);
    const businessId = await this.fetchBusinessId(input.accessToken, input.wabaId);
    return {
      wabaId: input.wabaId,
      businessId,
      phoneNumberId: phone.id.toString(),
      displayPhoneNumber: phone.display_phone_number ?? null,
      verifiedName: phone.verified_name ?? null,
      platformType: phone.platform_type ?? null,
      isOnBizApp: phone.is_on_biz_app ?? null
    };
  }

  async subscribeWabaToWebhooks(input: {
    readonly accessToken: string;
    readonly wabaId: string;
  }): Promise<void> {
    const url = new URL(`${this.options.graphApiBaseUrl}/${input.wabaId}/subscribed_apps`);
    url.searchParams.set("access_token", input.accessToken);

    const response = await this.fetchFn(url, { method: "POST" });
    const payload = await readGraphJson(response);
    const parsed = successResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw graphError("whatsapp_cloud_graph_subscribe_failed", response, payload);
    }
  }

  async requestSmbAppDataSync(input: {
    readonly accessToken: string;
    readonly phoneNumberId: string;
    readonly syncType: "smb_app_state_sync" | "history";
  }): Promise<{ readonly requestId: string | null }> {
    const url = new URL(`${this.options.graphApiBaseUrl}/${input.phoneNumberId}/smb_app_data`);
    url.searchParams.set("access_token", input.accessToken);
    const body = new URLSearchParams();
    body.set("sync_type", input.syncType);

    const response = await this.fetchFn(url, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    const payload = await readGraphJson(response);
    const parsed = successResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw graphError("whatsapp_cloud_graph_sync_request_failed", response, payload);
    }
    return { requestId: parsed.data.id === undefined ? null : parsed.data.id.toString() };
  }

  private async fetchPhoneNumber(accessToken: string, phoneNumberId: string) {
    const url = new URL(`${this.options.graphApiBaseUrl}/${phoneNumberId}`);
    url.searchParams.set(
      "fields",
      "id,display_phone_number,verified_name,platform_type,is_on_biz_app"
    );
    url.searchParams.set("access_token", accessToken);
    const response = await this.fetchFn(url, { method: "GET" });
    const payload = await readGraphJson(response);
    const parsed = phoneNumberSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw graphError("whatsapp_cloud_graph_phone_lookup_failed", response, payload);
    }
    return parsed.data;
  }

  private async fetchFirstWabaPhoneNumber(accessToken: string, wabaId: string) {
    const url = new URL(`${this.options.graphApiBaseUrl}/${wabaId}/phone_numbers`);
    url.searchParams.set(
      "fields",
      "id,display_phone_number,verified_name,platform_type,is_on_biz_app"
    );
    url.searchParams.set("access_token", accessToken);
    const response = await this.fetchFn(url, { method: "GET" });
    const payload = await readGraphJson(response);
    const parsed = phoneNumbersResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw graphError("whatsapp_cloud_graph_phone_lookup_failed", response, payload);
    }
    const phone = parsed.data.data[0];
    if (!phone) {
      throw graphError("whatsapp_cloud_graph_phone_lookup_failed", response, payload);
    }
    return phone;
  }

  private async fetchBusinessId(accessToken: string, wabaId: string): Promise<string | null> {
    const url = new URL(`${this.options.graphApiBaseUrl}/${wabaId}`);
    url.searchParams.set("fields", "id,business{id}");
    url.searchParams.set("access_token", accessToken);
    const response = await this.fetchFn(url, { method: "GET" });
    const payload = await readGraphJson(response);
    const parsed = wabaBusinessResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw graphError("whatsapp_cloud_graph_waba_lookup_failed", response, payload);
    }
    return parsed.data.business?.id?.toString() ?? parsed.data.id?.toString() ?? null;
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

function graphError(code: string, response: Response, payload: unknown): WhatsAppCloudGraphProviderError {
  const parsed = graphErrorResponseSchema.safeParse(payload);
  const graph = parsed.success ? parsed.data.error : null;
  return new WhatsAppCloudGraphProviderError(
    code,
    `WhatsApp Cloud Graph request failed: ${code}`,
    response.status,
    graph?.code ?? null,
    graph?.error_subcode ?? null,
    graph?.error_data?.details ?? graph?.message ?? response.statusText
  );
}
