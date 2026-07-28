import type {
  TelegramMtprotoMessagingProvider,
  TelegramMtprotoMessagingProviderResult
} from "./telegram-mtproto-provider";

export type TelegramMtprotoSessionDeliveryInput = {
  readonly messageId: string;
  readonly channelConnectionId: string;
  readonly peerId: string;
  readonly text: string;
};

export type TelegramMtprotoDeliveryProvider = {
  readonly sendMessage: (
    input: TelegramMtprotoSessionDeliveryInput
  ) => Promise<TelegramMtprotoMessagingProviderResult>;
};

export type TelegramMtprotoLeasedSessionRegistry = {
  readonly getProvider: (
    channelConnectionId: string
  ) => Pick<TelegramMtprotoMessagingProvider, "sendMessage"> | null;
};

export class TelegramMtprotoSessionDeliveryProvider implements TelegramMtprotoDeliveryProvider {
  constructor(private readonly options: { readonly registry: TelegramMtprotoLeasedSessionRegistry }) {}

  async sendMessage(
    input: TelegramMtprotoSessionDeliveryInput
  ): Promise<TelegramMtprotoMessagingProviderResult> {
    const provider = this.options.registry.getProvider(input.channelConnectionId);
    if (!provider) {
      return {
        provider: "telegram",
        status: "failed",
        retryable: true,
        errorCode: "TELEGRAM_MTPROTO_SESSION_NOT_OWNED",
        errorMessage: "Telegram MTProto session is not leased by this worker"
      };
    }

    return provider.sendMessage({
      messageId: input.messageId,
      peerId: input.peerId,
      text: input.text
    });
  }
}
