import { createHash } from "node:crypto";

export type TelegramMtprotoSendInput = {
  readonly messageId: string;
  readonly peerId: string;
  readonly text: string;
};

export type TelegramMtprotoClientSendInput = {
  readonly peerId: string;
  readonly text: string;
  readonly randomId: bigint;
};

export type TelegramMtprotoClient = {
  readonly sendMessage: (
    input: TelegramMtprotoClientSendInput
  ) => Promise<{ readonly providerMessageId: string }>;
};

export type TelegramMtprotoMessagingProviderResult = {
  readonly provider: "telegram";
  readonly status: "sent" | "failed" | "unknown";
  readonly retryable: boolean;
  readonly providerMessageId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly retryAfterSeconds?: number;
  readonly connectionStatus?: "reauth_required" | "revoked" | "error";
};

export class TelegramMtprotoMessagingProvider {
  constructor(
    private readonly options: {
      readonly client: TelegramMtprotoClient;
      readonly apiHash: string;
      readonly sessionDescriptor: string;
    }
  ) {}

  async sendMessage(
    input: TelegramMtprotoSendInput
  ): Promise<TelegramMtprotoMessagingProviderResult> {
    try {
      const result = await this.options.client.sendMessage({
        peerId: input.peerId,
        text: input.text,
        randomId: telegramMtprotoRandomId(input.messageId)
      });
      return {
        provider: "telegram",
        status: "sent",
        retryable: false,
        providerMessageId: result.providerMessageId
      };
    } catch (error) {
      return this.mapException(error);
    }
  }

  private mapException(error: unknown): TelegramMtprotoMessagingProviderResult {
    const message = normalizeExceptionMessage(error, this.options);
    const floodWaitSeconds = parseFloodWaitSeconds(message);
    if (floodWaitSeconds !== null) {
      return {
        provider: "telegram",
        status: "failed",
        retryable: true,
        errorCode: "TELEGRAM_MTPROTO_FLOOD_WAIT",
        errorMessage: "Telegram MTProto flood wait",
        retryAfterSeconds: floodWaitSeconds
      };
    }

    const connectionFailure = classifyConnectionFailure(message);
    if (connectionFailure) {
      return {
        provider: "telegram",
        status: "failed",
        retryable: false,
        errorCode: connectionFailure.errorCode,
        errorMessage: connectionFailure.errorMessage,
        connectionStatus: connectionFailure.connectionStatus
      };
    }

    return {
      provider: "telegram",
      status: "unknown",
      retryable: true,
      errorCode: "TELEGRAM_MTPROTO_EXCEPTION",
      errorMessage: message.slice(0, 500)
    };
  }
}

export function telegramMtprotoRandomId(messageId: string): bigint {
  const digest = createHash("sha256").update(messageId).digest();
  return digest.readBigInt64BE(0);
}

function parseFloodWaitSeconds(message: string): number | null {
  const match = /FLOOD_WAIT_(\d+)/i.exec(message);
  if (!match) return null;
  return Number.parseInt(match[1] ?? "0", 10);
}

function classifyConnectionFailure(message: string): {
  readonly errorCode: "TELEGRAM_MTPROTO_REAUTH_REQUIRED";
  readonly errorMessage: "Telegram MTProto session requires reauthorization";
  readonly connectionStatus: "reauth_required";
} | null {
  if (
    /\b(AUTH_KEY_UNREGISTERED|AUTH_KEY_DUPLICATED|SESSION_REVOKED|SESSION_PASSWORD_NEEDED)\b/i.test(
      message
    )
  ) {
    return {
      errorCode: "TELEGRAM_MTPROTO_REAUTH_REQUIRED",
      errorMessage: "Telegram MTProto session requires reauthorization",
      connectionStatus: "reauth_required"
    };
  }

  return null;
}

function normalizeExceptionMessage(
  error: unknown,
  options: { readonly apiHash: string; readonly sessionDescriptor: string }
): string {
  const rawMessage = rawExceptionMessage(error);
  return rawMessage
    .split(options.apiHash)
    .join("[telegram-mtproto-api-hash]")
    .split(options.sessionDescriptor)
    .join("[telegram-mtproto-session]");
}

function rawExceptionMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Telegram MTProto provider threw an unknown error";
}
