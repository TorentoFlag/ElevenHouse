export type MessagingDeliveryProviderInput = {
  readonly messageId: string;
  readonly businessConnectionId: string;
  readonly chatId: string;
  readonly text: string;
};

export type MessagingDeliveryProviderResult = {
  readonly provider: "telegram";
  readonly status: "sent" | "failed" | "unknown";
  readonly retryable: boolean;
  readonly providerStatusCode?: number;
  readonly providerMessageId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly connectionStatus?: "reauth_required" | "revoked" | "error";
};

export type MessagingDeliveryProvider = {
  readonly sendMessage: (
    input: MessagingDeliveryProviderInput
  ) => Promise<MessagingDeliveryProviderResult>;
};

export type TelegramBusinessDeliveryOptions = {
  readonly botToken: string;
  readonly botApiBaseUrl: string;
};

type TelegramBusinessFetch = (
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Record<string, string>;
    readonly body: string;
  }
) => Promise<Response>;

export class TelegramBusinessMessagingDeliveryProvider implements MessagingDeliveryProvider {
  constructor(
    private readonly options: TelegramBusinessDeliveryOptions,
    private readonly fetchFn: TelegramBusinessFetch = fetch
  ) {}

  async sendMessage(
    input: MessagingDeliveryProviderInput
  ): Promise<MessagingDeliveryProviderResult> {
    try {
      const response = await this.fetchFn(this.sendMessageUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          business_connection_id: input.businessConnectionId,
          chat_id: input.chatId,
          text: input.text
        })
      });

      const body = await readTelegramJson(response);
      if (!response.ok) {
        const errorMessage = normalizeTelegramErrorMessage(body, response.statusText, this.options);
        const connectionFailure = classifyTelegramConnectionFailure(response.status, errorMessage);
        return {
          provider: "telegram",
          status: "failed",
          retryable: connectionFailure ? false : isRetryableHttpStatus(response.status),
          providerStatusCode: response.status,
          errorCode: connectionFailure?.errorCode ?? `TELEGRAM_BUSINESS_HTTP_${response.status}`,
          errorMessage,
          ...(connectionFailure ? { connectionStatus: connectionFailure.connectionStatus } : {})
        };
      }

      if (!isTelegramOkResponse(body)) {
        const errorCode = readTelegramErrorCode(body);
        const errorMessage = normalizeTelegramErrorMessage(
          body,
          "Telegram Bot API sendMessage failed",
          this.options
        );
        const connectionFailure = classifyTelegramConnectionFailure(errorCode, errorMessage);
        return {
          provider: "telegram",
          status: "failed",
          retryable: connectionFailure ? false : isRetryableHttpStatus(errorCode),
          providerStatusCode: errorCode,
          providerMessageId: undefined,
          errorCode: connectionFailure?.errorCode ?? `TELEGRAM_BUSINESS_API_${errorCode}`,
          errorMessage,
          ...(connectionFailure ? { connectionStatus: connectionFailure.connectionStatus } : {})
        };
      }

      return {
        provider: "telegram",
        status: "sent",
        retryable: false,
        providerStatusCode: response.status,
        providerMessageId: String(body.result.message_id)
      };
    } catch (error) {
      return {
        provider: "telegram",
        status: "unknown",
        retryable: true,
        errorCode: "TELEGRAM_BUSINESS_EXCEPTION",
        errorMessage: normalizeExceptionMessage(error, this.options)
      };
    }
  }

  private sendMessageUrl(): string {
    return `${this.options.botApiBaseUrl.replace(/\/+$/, "")}/bot${this.options.botToken}/sendMessage`;
  }
}

async function readTelegramJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isTelegramOkResponse(value: unknown): value is {
  readonly ok: true;
  readonly result: { readonly message_id: number | string };
} {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.result)) {
    return false;
  }

  return typeof value.result.message_id === "number" || typeof value.result.message_id === "string";
}

function readTelegramErrorCode(value: unknown): number {
  if (isRecord(value) && typeof value.error_code === "number") {
    return value.error_code;
  }

  return 500;
}

function normalizeTelegramErrorMessage(
  value: unknown,
  fallback: string,
  options: TelegramBusinessDeliveryOptions
): string {
  if (isRecord(value) && typeof value.description === "string" && value.description.trim()) {
    return redactTelegramSecrets(value.description.trim(), options).slice(0, 500);
  }

  return redactTelegramSecrets(
    fallback.trim() || "Telegram Bot API sendMessage failed",
    options
  ).slice(0, 500);
}

function normalizeExceptionMessage(
  error: unknown,
  options: TelegramBusinessDeliveryOptions
): string {
  if (error instanceof Error && error.message.trim()) {
    return redactTelegramSecrets(error.message.trim(), options).slice(0, 500);
  }

  if (typeof error === "string" && error.trim()) {
    return redactTelegramSecrets(error.trim(), options).slice(0, 500);
  }

  return "Telegram Bot API sendMessage threw an unknown error";
}

function classifyTelegramConnectionFailure(
  status: number,
  errorMessage: string
): {
  readonly errorCode: "TELEGRAM_BUSINESS_CONNECTION_REAUTH_REQUIRED";
  readonly connectionStatus: "reauth_required";
} | null {
  if (status !== 400 && status !== 403) return null;

  const normalized = errorMessage.toLowerCase();
  const referencesBusinessConnection =
    normalized.includes("business connection") || normalized.includes("business_connection");
  const referencesBusinessRights =
    normalized.includes("on behalf of the business account") ||
    normalized.includes("not enough rights") ||
    normalized.includes("rights to send");
  if (!referencesBusinessConnection && !referencesBusinessRights) return null;

  return {
    errorCode: "TELEGRAM_BUSINESS_CONNECTION_REAUTH_REQUIRED",
    connectionStatus: "reauth_required"
  };
}

function redactTelegramSecrets(
  value: string,
  options: TelegramBusinessDeliveryOptions
): string {
  const baseUrl = options.botApiBaseUrl.replace(/\/+$/, "");
  const sendMessageUrl = `${baseUrl}/bot${options.botToken}/sendMessage`;
  return value
    .split(sendMessageUrl)
    .join("[telegram-bot-api-url]")
    .split(options.botToken)
    .join("[telegram-bot-token]")
    .split(baseUrl)
    .join("[telegram-bot-api-base-url]");
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
