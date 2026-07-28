import bigInt from "big-integer";
import { Api } from "teleproto";
import type { TelegramMtprotoClient, TelegramMtprotoClientSendInput } from "./telegram-mtproto-provider";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
