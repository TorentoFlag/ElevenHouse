import type { MessagingStore } from "@elevenhouse/domain";
import { recordTelegramMtprotoMessage } from "@elevenhouse/domain";

export type TelegramMtprotoIncomingMessage = {
  readonly providerMessageId: string;
  readonly providerChatId: string;
  readonly providerUserId: string | null;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly isOutgoing: boolean;
  readonly text: string;
  readonly providerSentAt: string;
  readonly cursor: {
    readonly pts: number | null;
    readonly qts: number | null;
    readonly dateCursor: string | null;
    readonly seq: number | null;
  } | null;
};

export async function processTelegramMtprotoInboundMessage(input: {
  readonly store: MessagingStore;
  readonly session: {
    readonly channelConnectionId: string;
    readonly leaseOwner: string;
  };
  readonly message: TelegramMtprotoIncomingMessage;
  readonly now: Date;
}) {
  if (!input.message.text.trim()) {
    return { kind: "ignored" as const, reason: "empty_text" as const };
  }

  return recordTelegramMtprotoMessage({
    store: input.store,
    channelConnectionId: input.session.channelConnectionId,
    leaseOwner: input.session.leaseOwner,
    providerMessageId: input.message.providerMessageId,
    providerChatId: input.message.providerChatId,
    providerUserId: input.message.providerUserId,
    username: input.message.username,
    displayName: input.message.displayName,
    isOutgoing: input.message.isOutgoing,
    text: input.message.text,
    providerSentAt: input.message.providerSentAt,
    cursor: input.message.cursor,
    now: input.now
  });
}
