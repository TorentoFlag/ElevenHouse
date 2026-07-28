import type { TelegramMtprotoSessionProcessingStore } from "@elevenhouse/db/messaging";
import type { Aes256GcmEncryptedSecret } from "@elevenhouse/auth";
import type { TelegramMtprotoClient } from "./telegram-mtproto-provider";
import { TelegramMtprotoMessagingProvider } from "./telegram-mtproto-provider";
import type { TelegramMtprotoIncomingMessage } from "./telegram-mtproto-inbound.processor";
import type { TelegramMtprotoLeasedSessionRegistry } from "./telegram-mtproto-session-delivery-provider";

export type TelegramMtprotoSessionCipher = {
  readonly decrypt: (input: {
    readonly encrypted: Aes256GcmEncryptedSecret;
    readonly aad: string;
  }) => string;
};

export type TelegramMtprotoSessionClient = TelegramMtprotoClient & {
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly onNewMessage?: (
    handler: (message: TelegramMtprotoIncomingMessage) => Promise<void> | void
  ) => (() => void) | void;
};

export type TelegramMtprotoSessionClientFactory = (input: {
  readonly channelConnectionId: string;
  readonly session: string;
}) => Promise<TelegramMtprotoSessionClient>;

type ActiveSession = {
  readonly client: TelegramMtprotoSessionClient;
  readonly provider: TelegramMtprotoMessagingProvider;
  readonly unsubscribeNewMessages: (() => void) | null;
};

export class TelegramMtprotoSessionSupervisor implements TelegramMtprotoLeasedSessionRegistry {
  private readonly activeSessions = new Map<string, ActiveSession>();

  constructor(
    private readonly options: {
      readonly store: TelegramMtprotoSessionProcessingStore;
      readonly cipher: TelegramMtprotoSessionCipher;
      readonly apiHash: string;
      readonly leaseOwner: string;
      readonly leaseDurationMs: number;
      readonly claimLimit: number;
      readonly clientFactory: TelegramMtprotoSessionClientFactory;
      readonly nowProvider?: () => Date;
      readonly logger?: {
        readonly error: (message: string, meta?: Record<string, unknown>) => void;
      };
      readonly inboundMessageHandler?: (input: {
        readonly session: {
          readonly channelConnectionId: string;
          readonly astrologerUserId: string;
          readonly telegramUserId: string | null;
          readonly leaseOwner: string;
        };
        readonly message: TelegramMtprotoIncomingMessage;
        readonly now: Date;
      }) => Promise<void>;
    }
  ) {}

  getProvider(channelConnectionId: string): TelegramMtprotoMessagingProvider | null {
    return this.activeSessions.get(channelConnectionId)?.provider ?? null;
  }

  async tick(now: Date): Promise<void> {
    const claimedSessions = await this.options.store.claimAvailable({
      leaseOwner: this.options.leaseOwner,
      now,
      leaseDurationMs: this.options.leaseDurationMs,
      limit: this.options.claimLimit
    });

    for (const session of claimedSessions) {
      if (this.activeSessions.has(session.channelConnectionId)) {
        await this.options.store.heartbeat({
          channelConnectionId: session.channelConnectionId,
          leaseOwner: this.options.leaseOwner,
          now,
          leaseDurationMs: this.options.leaseDurationMs
        });
        continue;
      }

      const sessionString = this.options.cipher.decrypt({
        encrypted: session.encryptedSession,
        aad: telegramMtprotoSecretAad(session.astrologerUserId, "session")
      });
      const client = await this.options.clientFactory({
        channelConnectionId: session.channelConnectionId,
        session: sessionString
      });
      await client.connect();
      const unsubscribeNewMessages = this.subscribeToNewMessages(client, {
        channelConnectionId: session.channelConnectionId,
        astrologerUserId: session.astrologerUserId,
        telegramUserId: session.telegramUserId,
        leaseOwner: this.options.leaseOwner
      });
      this.activeSessions.set(session.channelConnectionId, {
        client,
        provider: new TelegramMtprotoMessagingProvider({
          client,
          apiHash: this.options.apiHash,
          sessionDescriptor: `telegram-mtproto-session:${session.channelConnectionId}`
        }),
        unsubscribeNewMessages
      });
    }
  }

  async shutdown(now: Date): Promise<void> {
    const sessions = Array.from(this.activeSessions.entries());
    this.activeSessions.clear();

    for (const [channelConnectionId, session] of sessions) {
      session.unsubscribeNewMessages?.();
      await session.client.disconnect();
      await this.options.store.release({
        channelConnectionId,
        leaseOwner: this.options.leaseOwner,
        now
      });
    }
  }

  private subscribeToNewMessages(
    client: TelegramMtprotoSessionClient,
    session: {
      readonly channelConnectionId: string;
      readonly astrologerUserId: string;
      readonly telegramUserId: string | null;
      readonly leaseOwner: string;
    }
  ): (() => void) | null {
    if (!client.onNewMessage || !this.options.inboundMessageHandler) return null;
    const unsubscribe = client.onNewMessage(async (message) => {
      try {
        await this.options.inboundMessageHandler?.({
          session,
          message,
          now: this.options.nowProvider?.() ?? new Date()
        });
      } catch (error) {
        this.options.logger?.error("telegram mtproto inbound processing failed", {
          error,
          channelConnectionId: session.channelConnectionId
        });
      }
    });
    return unsubscribe ?? null;
  }
}

function telegramMtprotoSecretAad(
  astrologerUserId: string,
  purpose: "phone_number" | "phone_code_hash" | "session"
): string {
  return `messaging:telegram_mtproto:${astrologerUserId}:${purpose}`;
}
