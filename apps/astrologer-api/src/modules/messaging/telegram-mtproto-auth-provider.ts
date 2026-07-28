import { Api, TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";

export type TelegramMtprotoAuthProvider = {
  readonly sendCode: (input: {
    readonly phoneNumber: string;
  }) => Promise<TelegramMtprotoSendCodeResult>;
  readonly signInWithCode: (input: {
    readonly phoneNumber: string;
    readonly phoneCodeHash: string;
    readonly code: string;
  }) => Promise<TelegramMtprotoSignInCodeResult>;
  readonly signInWithPassword: (input: {
    readonly session: string;
    readonly password: string;
  }) => Promise<TelegramMtprotoSignInPasswordResult>;
};

export type TelegramMtprotoSendCodeResult = {
  readonly phoneCodeHash: string;
  readonly isCodeViaApp: boolean;
};

export type TelegramMtprotoSignInCodeResult =
  | {
      readonly loginStep: "password_required";
      readonly session: string;
    }
  | TelegramMtprotoSignInPasswordResult;

export type TelegramMtprotoSignInPasswordResult = {
  readonly loginStep: "connected";
  readonly session: string;
  readonly telegramUserId: string;
  readonly username: string | null;
  readonly displayName: string | null;
};

export type TelegramMtprotoAuthProviderOptions = {
  readonly apiId: number;
  readonly apiHash: string;
};

export class TeleprotoTelegramMtprotoAuthProvider implements TelegramMtprotoAuthProvider {
  constructor(private readonly options: TelegramMtprotoAuthProviderOptions) {}

  async sendCode(input: { readonly phoneNumber: string }): Promise<TelegramMtprotoSendCodeResult> {
    const client = this.createClient("");
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

  async signInWithCode(input: {
    readonly phoneNumber: string;
    readonly phoneCodeHash: string;
    readonly code: string;
  }): Promise<TelegramMtprotoSignInCodeResult> {
    const client = this.createClient("");
    await client.connect();
    try {
      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: input.phoneNumber,
          phoneCodeHash: input.phoneCodeHash,
          phoneCode: input.code
        })
      );
      if (result instanceof Api.auth.AuthorizationSignUpRequired) {
        throw new Error("Telegram Account sign-up is not supported");
      }
      return connectedResult(client, result.user);
    } catch (error) {
      if (isTelegramError(error, "SESSION_PASSWORD_NEEDED")) {
        return {
          loginStep: "password_required",
          session: client.session.save()
        };
      }
      throw error;
    } finally {
      await client.disconnect();
    }
  }

  async signInWithPassword(input: {
    readonly session: string;
    readonly password: string;
  }): Promise<TelegramMtprotoSignInPasswordResult> {
    const client = this.createClient(input.session);
    await client.connect();
    try {
      const user = await client.signInWithPassword(
        { apiId: this.options.apiId, apiHash: this.options.apiHash },
        {
          password: async () => input.password,
          onError: () => undefined
        }
      );
      return connectedResult(client, user);
    } finally {
      await client.disconnect();
    }
  }

  private createClient(session: string): TelegramClient<StringSession> {
    return new TelegramClient(new StringSession(session), this.options.apiId, this.options.apiHash, {});
  }
}

function connectedResult(
  client: TelegramClient<StringSession>,
  user: Api.TypeUser
): TelegramMtprotoSignInPasswordResult {
  const snapshot = user instanceof Api.User ? user : null;
  if (!snapshot) throw new Error("Telegram Account authorization did not return a user");
  return {
    loginStep: "connected",
    session: client.session.save(),
    telegramUserId: snapshot.id.toString(),
    username: snapshot.username ?? null,
    displayName: [snapshot.firstName, snapshot.lastName].filter(Boolean).join(" ") || null
  };
}

function isTelegramError(error: unknown, errorMessage: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "errorMessage" in error &&
    (error as { readonly errorMessage?: unknown }).errorMessage === errorMessage
  );
}
