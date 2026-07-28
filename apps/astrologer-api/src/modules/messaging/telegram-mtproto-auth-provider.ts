import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";

export type TelegramMtprotoAuthProvider = {
  readonly sendCode: (input: {
    readonly phoneNumber: string;
  }) => Promise<TelegramMtprotoSendCodeResult>;
};

export type TelegramMtprotoSendCodeResult = {
  readonly phoneCodeHash: string;
  readonly isCodeViaApp: boolean;
};

export type TelegramMtprotoAuthProviderOptions = {
  readonly apiId: number;
  readonly apiHash: string;
};

export class TeleprotoTelegramMtprotoAuthProvider implements TelegramMtprotoAuthProvider {
  constructor(private readonly options: TelegramMtprotoAuthProviderOptions) {}

  async sendCode(input: { readonly phoneNumber: string }): Promise<TelegramMtprotoSendCodeResult> {
    const client = new TelegramClient(new StringSession(""), this.options.apiId, this.options.apiHash, {});
    await client.connect();
    try {
      const result = await client.sendCode(
        { apiId: this.options.apiId, apiHash: this.options.apiHash },
        input.phoneNumber
      );
      return {
        phoneCodeHash: result.phoneCodeHash,
        isCodeViaApp: result.isCodeViaApp
      };
    } finally {
      await client.disconnect();
    }
  }
}
