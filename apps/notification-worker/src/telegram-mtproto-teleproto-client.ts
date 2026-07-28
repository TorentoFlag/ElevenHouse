import bigInt from "big-integer";
import { Api, TelegramClient } from "teleproto";
import { NewMessage } from "teleproto/events";
import { StringSession } from "teleproto/sessions";
import type { TelegramMtprotoClient, TelegramMtprotoClientSendInput } from "./telegram-mtproto-provider";
import type { TelegramMtprotoIncomingMessage } from "./telegram-mtproto-inbound.processor";
import type {
  TelegramMtprotoSessionClient,
  TelegramMtprotoSessionClientFactory
} from "./telegram-mtproto-session-supervisor";

type TeleprotoInvoker = {
  readonly invoke: (request: unknown) => Promise<unknown>;
};

type SendMessageConstructor = new (input: {
  readonly peer: string;
  readonly message: string;
  readonly randomId: ReturnType<typeof bigInt>;
}) => unknown;

export class TeleprotoMtprotoClient implements TelegramMtprotoClient {
  constructor(
    private readonly client: TeleprotoInvoker,
    private readonly messagesApi: { readonly SendMessage: SendMessageConstructor } = Api.messages
  ) {}

  async sendMessage(
    input: TelegramMtprotoClientSendInput
  ): Promise<{ readonly providerMessageId: string }> {
    const response = await this.client.invoke(
      new this.messagesApi.SendMessage({
        peer: input.peerId,
        message: input.text,
        randomId: bigInt(input.randomId)
      })
    );
    return { providerMessageId: extractProviderMessageId(response) };
  }
}

type TeleprotoClientRuntime = TeleprotoInvoker & {
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly addEventHandler: (handler: (event: unknown) => void, event: unknown) => void;
  readonly removeEventHandler?: (handler: (event: unknown) => void, event: unknown) => void;
};

type TelegramClientConstructor = new (
  session: unknown,
  apiId: number,
  apiHash: string,
  options: { readonly connectionRetries: number }
) => TeleprotoClientRuntime;

type StringSessionConstructor = new (session: string) => unknown;

export function createTeleprotoMtprotoSessionClientFactory(options: {
  readonly apiId: number;
  readonly apiHash: string;
  readonly TelegramClientCtor?: TelegramClientConstructor;
  readonly StringSessionCtor?: StringSessionConstructor;
}): TelegramMtprotoSessionClientFactory {
  const TelegramClientCtor = (options.TelegramClientCtor ?? TelegramClient) as TelegramClientConstructor;
  const StringSessionCtor = (options.StringSessionCtor ?? StringSession) as StringSessionConstructor;

  return async (input): Promise<TelegramMtprotoSessionClient> => {
    const runtimeClient = new TelegramClientCtor(
      new StringSessionCtor(input.session),
      options.apiId,
      options.apiHash,
      { connectionRetries: 5 }
    );
    const mtprotoClient = new TeleprotoMtprotoClient(runtimeClient as unknown as TeleprotoInvoker);
    return {
      connect: async () => {
        await runtimeClient.connect();
      },
      disconnect: async () => {
        await runtimeClient.disconnect();
      },
      sendMessage: (message) => mtprotoClient.sendMessage(message),
      onNewMessage: (handler) => {
        const eventBuilder = new NewMessage({});
        const eventHandler = (event: unknown) => {
          const message = normalizeTeleprotoNewMessageEvent(event);
          if (!message) return;
          void handler(message);
        };
        runtimeClient.addEventHandler(eventHandler, eventBuilder);
        return () => {
          runtimeClient.removeEventHandler?.(eventHandler, eventBuilder);
        };
      }
    };
  };
}

function extractProviderMessageId(response: unknown): string {
  const directId = readId(response);
  if (directId !== null) return directId;

  if (isRecord(response) && Array.isArray(response.updates)) {
    for (const update of response.updates) {
      const updateId = readId(update);
      if (updateId !== null) return updateId;
      if (isRecord(update)) {
        const messageId = readId(update.message);
        if (messageId !== null) return messageId;
      }
    }
  }

  throw new Error("Telegram MTProto send response did not include a message id");
}

function readId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.id === "number" || typeof value.id === "bigint" || typeof value.id === "string") {
    return String(value.id);
  }
  return null;
}

function normalizeTeleprotoNewMessageEvent(event: unknown): TelegramMtprotoIncomingMessage | null {
  if (!isRecord(event) || !isRecord(event.message)) return null;
  const message = event.message;
  const providerMessageId = readId(message);
  const providerChatId = readPeerId(message.peerId);
  const text = readText(message.message) ?? readText(event.rawText);
  const providerSentAt = readTelegramDate(message.date);
  if (!providerMessageId || !providerChatId || !text || !providerSentAt) return null;

  const originalUpdate = isRecord(event.originalUpdate) ? event.originalUpdate : null;
  return {
    providerMessageId,
    providerChatId,
    providerUserId: readPeerId(message.fromId),
    username: null,
    displayName: null,
    isOutgoing: message.out === true,
    text,
    providerSentAt,
    cursor: originalUpdate
      ? {
          pts: readOptionalNonNegativeInteger(originalUpdate.pts),
          qts: readOptionalNonNegativeInteger(originalUpdate.qts),
          dateCursor: readTelegramDate(originalUpdate.date),
          seq: readOptionalNonNegativeInteger(originalUpdate.seq)
        }
      : null
  };
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function readPeerId(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (!isRecord(value)) return null;
  const stringified = readStringifiableScalar(value);
  if (stringified) return stringified;
  return (
    readPeerId(value.userId) ??
    readPeerId(value.chatId) ??
    readPeerId(value.channelId) ??
    readPeerId(value.value)
  );
}

function readStringifiableScalar(value: Record<string, unknown>): string | null {
  if (typeof value.toString !== "function") return null;
  const text = value.toString();
  if (!/^-?[0-9]+$/.test(text)) return null;
  return text;
}

function readTelegramDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return new Date(value * 1000).toISOString();
  }
  return null;
}

function readOptionalNonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
