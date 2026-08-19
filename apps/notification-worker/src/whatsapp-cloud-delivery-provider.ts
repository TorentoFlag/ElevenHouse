import type { Aes256GcmSecretCipher } from "@elevenhouse/auth";
import type { EncryptedMessagingSecret } from "@elevenhouse/domain";

export type WhatsAppCloudDeliveryProviderInput = {
  readonly messageId: string;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  readonly phoneNumberId: string;
  readonly recipientWaId: string;
  readonly text: string;
  readonly encryptedAccessToken: EncryptedMessagingSecret;
};

export type WhatsAppCloudDeliveryProviderResult = {
  readonly provider: "whatsapp";
  readonly status: "sent" | "failed" | "unknown";
  readonly retryable: boolean;
  readonly providerStatusCode?: number;
  readonly providerMessageId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly connectionStatus?: "reauth_required" | "revoked" | "error";
};

export type WhatsAppCloudDeliveryProvider = {
  readonly sendMessage: (
    input: WhatsAppCloudDeliveryProviderInput
  ) => Promise<WhatsAppCloudDeliveryProviderResult>;
};

export type WhatsAppCloudDeliveryOptions = {
  readonly graphApiBaseUrl: string;
  readonly tokenCipher: Aes256GcmSecretCipher;
};

type WhatsAppCloudFetch = (
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Record<string, string>;
    readonly body: string;
  }
) => Promise<Response>;

export class HttpWhatsAppCloudDeliveryProvider implements WhatsAppCloudDeliveryProvider {
  constructor(
    private readonly options: WhatsAppCloudDeliveryOptions,
    private readonly fetchFn: WhatsAppCloudFetch = fetch
  ) {}

  async sendMessage(
    input: WhatsAppCloudDeliveryProviderInput
  ): Promise<WhatsAppCloudDeliveryProviderResult> {
    let accessToken: string;
    try {
      accessToken = this.options.tokenCipher.decrypt({
        encrypted: input.encryptedAccessToken,
        aad: whatsAppCloudAccessTokenAad(input)
      });
    } catch (error) {
      return {
        provider: "whatsapp",
        status: "failed",
        retryable: false,
        errorCode: "WHATSAPP_CLOUD_ACCESS_TOKEN_DECRYPTION_FAILED",
        errorMessage: normalizeExceptionMessage(error)
      };
    }

    try {
      const response = await this.fetchFn(this.sendMessageUrl(input.phoneNumberId), {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: input.recipientWaId,
          type: "text",
          text: {
            body: input.text,
            preview_url: false
          }
        })
      });
      const body = await readWhatsAppCloudJson(response);
      if (!response.ok) {
        const graphError = readWhatsAppCloudGraphError(body);
        const errorMessage = redactWhatsAppCloudSecret(
          normalizeWhatsAppCloudErrorMessage(graphError, response.statusText),
          accessToken
        );
        const connectionFailure = classifyWhatsAppCloudConnectionFailure(response.status, graphError);
        return {
          provider: "whatsapp",
          status: "failed",
          retryable: connectionFailure ? false : isRetryableHttpStatus(response.status),
          providerStatusCode: response.status,
          errorCode: connectionFailure?.errorCode ?? `WHATSAPP_CLOUD_HTTP_${response.status}`,
          errorMessage,
          ...(connectionFailure ? { connectionStatus: connectionFailure.connectionStatus } : {})
        };
      }

      const messageId = readWhatsAppCloudMessageId(body);
      return {
        provider: "whatsapp",
        status: "sent",
        retryable: false,
        providerStatusCode: response.status,
        ...(messageId ? { providerMessageId: messageId } : {})
      };
    } catch (error) {
      return {
        provider: "whatsapp",
        status: "unknown",
        retryable: true,
        errorCode: "WHATSAPP_CLOUD_EXCEPTION",
        errorMessage: normalizeExceptionMessage(error)
      };
    }
  }

  private sendMessageUrl(phoneNumberId: string): string {
    return `${this.options.graphApiBaseUrl.replace(/\/+$/, "")}/${encodeURIComponent(
      phoneNumberId
    )}/messages`;
  }
}

function whatsAppCloudAccessTokenAad(input: {
  readonly astrologerUserId: string;
  readonly channelConnectionId: string;
}): string {
  return `messaging:whatsapp_cloud:${input.astrologerUserId}:${input.channelConnectionId}:access_token`;
}

async function readWhatsAppCloudJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

type WhatsAppCloudGraphError = {
  readonly message?: string;
  readonly code?: number;
  readonly subcode?: number;
  readonly details?: string;
};

function readWhatsAppCloudGraphError(value: unknown): WhatsAppCloudGraphError | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const error = value.error;
  return {
    message: typeof error.message === "string" ? error.message : undefined,
    code: typeof error.code === "number" ? error.code : undefined,
    subcode: typeof error.error_subcode === "number" ? error.error_subcode : undefined,
    details:
      isRecord(error.error_data) && typeof error.error_data.details === "string"
        ? error.error_data.details
        : undefined
  };
}

function normalizeWhatsAppCloudErrorMessage(
  error: WhatsAppCloudGraphError | null,
  fallback: string
): string {
  const parts = [
    error?.message?.trim(),
    error?.details ? `details: ${error.details.trim()}` : undefined,
    error?.code !== undefined ? `code: ${error.code}` : undefined,
    error?.subcode !== undefined ? `subcode: ${error.subcode}` : undefined
  ].filter((part): part is string => Boolean(part));
  return (parts.join("; ") || fallback.trim() || "WhatsApp Cloud sendMessage failed").slice(0, 500);
}

function readWhatsAppCloudMessageId(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.messages)) return undefined;
  const first = value.messages[0];
  if (!isRecord(first)) return undefined;
  const id = first.id;
  if (typeof id === "string" || typeof id === "number") return String(id);
  return undefined;
}

function classifyWhatsAppCloudConnectionFailure(
  status: number,
  error: WhatsAppCloudGraphError | null
): {
  readonly errorCode: "WHATSAPP_CLOUD_CONNECTION_REAUTH_REQUIRED";
  readonly connectionStatus: "reauth_required";
} | null {
  if (status !== 400 && status !== 401 && status !== 403) return null;
  if (!error) return null;
  const oauthOrPermissionFailure =
    error.code === 10 ||
    error.code === 190 ||
    error.code === 200 ||
    error.code === 294 ||
    error.subcode === 460 ||
    error.subcode === 463 ||
    error.subcode === 467;
  if (!oauthOrPermissionFailure) return null;
  return {
    errorCode: "WHATSAPP_CLOUD_CONNECTION_REAUTH_REQUIRED",
    connectionStatus: "reauth_required"
  };
}

function normalizeExceptionMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 500);
  return "WhatsApp Cloud sendMessage threw an unknown error";
}

function redactWhatsAppCloudSecret(value: string, accessToken: string): string {
  return value.split(accessToken).join("[whatsapp-cloud-access-token]");
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
