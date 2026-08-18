import type { Aes256GcmSecretCipher } from "@elevenhouse/auth";
import type { EncryptedMessagingSecret } from "@elevenhouse/domain";

export type InstagramGraphDeliveryProviderInput = {
  readonly messageId: string;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  readonly instagramAccountId: string;
  readonly recipientId: string;
  readonly text: string;
  readonly encryptedAccessToken: EncryptedMessagingSecret;
};

export type InstagramGraphDeliveryProviderResult = {
  readonly provider: "instagram";
  readonly status: "sent" | "failed" | "unknown";
  readonly retryable: boolean;
  readonly providerStatusCode?: number;
  readonly providerMessageId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly connectionStatus?: "reauth_required" | "revoked" | "error";
};

export type InstagramGraphDeliveryProvider = {
  readonly sendMessage: (
    input: InstagramGraphDeliveryProviderInput
  ) => Promise<InstagramGraphDeliveryProviderResult>;
};

export type InstagramGraphDeliveryOptions = {
  readonly graphApiBaseUrl: string;
  readonly tokenCipher: Aes256GcmSecretCipher;
};

type InstagramGraphFetch = (
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Record<string, string>;
    readonly body: string;
  }
) => Promise<Response>;

export class HttpInstagramGraphDeliveryProvider implements InstagramGraphDeliveryProvider {
  constructor(
    private readonly options: InstagramGraphDeliveryOptions,
    private readonly fetchFn: InstagramGraphFetch = fetch
  ) {}

  async sendMessage(
    input: InstagramGraphDeliveryProviderInput
  ): Promise<InstagramGraphDeliveryProviderResult> {
    let accessToken: string;
    try {
      accessToken = this.options.tokenCipher.decrypt({
        encrypted: input.encryptedAccessToken,
        aad: instagramGraphAccessTokenAad(input)
      });
    } catch (error) {
      return {
        provider: "instagram",
        status: "failed",
        retryable: false,
        errorCode: "INSTAGRAM_GRAPH_ACCESS_TOKEN_DECRYPTION_FAILED",
        errorMessage: normalizeExceptionMessage(error)
      };
    }

    try {
      const response = await this.fetchFn(this.sendMessageUrl(accessToken), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipient: { id: input.recipientId },
          message: { text: input.text }
        })
      });
      const body = await readInstagramGraphJson(response);
      if (!response.ok) {
        const errorMessage = normalizeInstagramGraphErrorMessage(body, response.statusText);
        const connectionFailure = classifyInstagramGraphConnectionFailure(response.status, body);
        return {
          provider: "instagram",
          status: "failed",
          retryable: connectionFailure ? false : isRetryableHttpStatus(response.status),
          providerStatusCode: response.status,
          errorCode: connectionFailure?.errorCode ?? `INSTAGRAM_GRAPH_HTTP_${response.status}`,
          errorMessage,
          ...(connectionFailure ? { connectionStatus: connectionFailure.connectionStatus } : {})
        };
      }

      const messageId = readInstagramGraphMessageId(body);
      return {
        provider: "instagram",
        status: "sent",
        retryable: false,
        providerStatusCode: response.status,
        ...(messageId ? { providerMessageId: messageId } : {})
      };
    } catch (error) {
      return {
        provider: "instagram",
        status: "unknown",
        retryable: true,
        errorCode: "INSTAGRAM_GRAPH_EXCEPTION",
        errorMessage: normalizeExceptionMessage(error)
      };
    }
  }

  private sendMessageUrl(accessToken: string): string {
    const url = new URL(`${this.options.graphApiBaseUrl.replace(/\/+$/, "")}/me/messages`);
    url.searchParams.set("access_token", accessToken);
    return url.toString();
  }
}

function instagramGraphAccessTokenAad(input: {
  readonly astrologerUserId: string;
  readonly channelConnectionId: string;
}): string {
  return `messaging:instagram_graph:${input.astrologerUserId}:${input.channelConnectionId}:access_token`;
}

async function readInstagramGraphJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function readInstagramGraphMessageId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const messageId = value.message_id ?? value.id;
  if (typeof messageId === "string" || typeof messageId === "number") return String(messageId);
  if (isRecord(value.message)) {
    const nestedMessageId = value.message.message_id ?? value.message.id;
    if (typeof nestedMessageId === "string" || typeof nestedMessageId === "number") {
      return String(nestedMessageId);
    }
  }
  return undefined;
}

function normalizeInstagramGraphErrorMessage(value: unknown, fallback: string): string {
  if (isRecord(value) && isRecord(value.error)) {
    const message = value.error.message;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 500);
  }
  return (fallback.trim() || "Instagram Graph sendMessage failed").slice(0, 500);
}

function classifyInstagramGraphConnectionFailure(
  status: number,
  value: unknown
): {
  readonly errorCode: "INSTAGRAM_GRAPH_CONNECTION_REAUTH_REQUIRED";
  readonly connectionStatus: "reauth_required";
} | null {
  if (status !== 400 && status !== 401 && status !== 403) return null;
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const code = value.error.code;
  const subcode = value.error.error_subcode;
  if (code === 190 || subcode === 460 || subcode === 463 || subcode === 467) {
    return {
      errorCode: "INSTAGRAM_GRAPH_CONNECTION_REAUTH_REQUIRED",
      connectionStatus: "reauth_required"
    };
  }
  return null;
}

function normalizeExceptionMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 500);
  return "Instagram Graph sendMessage threw an unknown error";
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
