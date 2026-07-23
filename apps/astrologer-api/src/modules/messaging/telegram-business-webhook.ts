import { z } from "@elevenhouse/validation";
import type { TelegramBusinessConnectionRights } from "@elevenhouse/domain";

const TelegramUserSchema = z
  .object({
    id: z.number().int(),
    is_bot: z.boolean().optional(),
    first_name: z.string().trim().min(1).optional(),
    last_name: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional()
  })
  .passthrough();

const TelegramChatSchema = z
  .object({
    id: z.number().int(),
    type: z.string().trim().min(1).optional(),
    first_name: z.string().trim().min(1).optional(),
    last_name: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional()
  })
  .passthrough();

const TelegramBusinessBotRightsSchema = z
  .object({
    can_reply: z.boolean().optional(),
    can_read_messages: z.boolean().optional(),
    can_delete_sent_messages: z.boolean().optional(),
    can_delete_all_messages: z.boolean().optional(),
    can_edit_name: z.boolean().optional(),
    can_edit_bio: z.boolean().optional(),
    can_edit_profile_photo: z.boolean().optional(),
    can_edit_username: z.boolean().optional(),
    can_change_gift_settings: z.boolean().optional(),
    can_view_gifts_and_stars: z.boolean().optional(),
    can_convert_gifts_to_stars: z.boolean().optional(),
    can_transfer_and_upgrade_gifts: z.boolean().optional(),
    can_transfer_stars: z.boolean().optional(),
    can_manage_stories: z.boolean().optional()
  })
  .passthrough()
  .default({});

const TelegramBusinessConnectionSchema = z
  .object({
    id: z.string().trim().min(1),
    user: TelegramUserSchema,
    user_chat_id: z.number().int(),
    date: z.number().int().nonnegative(),
    rights: TelegramBusinessBotRightsSchema,
    is_enabled: z.boolean()
  })
  .passthrough();

const TelegramBusinessMessageSchema = z
  .object({
    message_id: z.number().int(),
    business_connection_id: z.string().trim().min(1).optional(),
    from: TelegramUserSchema.optional(),
    chat: TelegramChatSchema,
    date: z.number().int().nonnegative(),
    text: z.string().optional()
  })
  .passthrough();

const TelegramUpdateSchema = z
  .object({
    update_id: z.number().int(),
    business_connection: TelegramBusinessConnectionSchema.optional(),
    business_message: TelegramBusinessMessageSchema.optional()
  })
  .passthrough();

export type ParsedTelegramBusinessWebhookUpdate =
  | {
      readonly kind: "business_connection";
      readonly updateId: string;
      readonly businessConnectionId: string;
      readonly userId: string;
      readonly userChatId: string;
      readonly username: string | null;
      readonly displayName: string | null;
      readonly connectedAt: string;
      readonly enabled: boolean;
      readonly rights: TelegramBusinessConnectionRights;
    }
  | {
      readonly kind: "business_message";
      readonly updateId: string;
      readonly businessConnectionId: string;
      readonly providerMessageId: string;
      readonly providerChatId: string;
      readonly providerUserId: string | null;
      readonly username: string | null;
      readonly displayName: string | null;
      readonly providerSentAt: string;
      readonly contentType: "text" | "unsupported";
      readonly text: string | null;
    }
  | {
      readonly kind: "unsupported_update";
      readonly updateId: string;
    };

export function parseTelegramBusinessWebhookUpdate(
  value: unknown
): ParsedTelegramBusinessWebhookUpdate {
  const update = TelegramUpdateSchema.parse(value);
  const updateId = String(update.update_id);

  if (update.business_connection) {
    const connection = update.business_connection;
    return {
      kind: "business_connection",
      updateId,
      businessConnectionId: connection.id,
      userId: String(connection.user.id),
      userChatId: String(connection.user_chat_id),
      username: connection.user.username ?? null,
      displayName: telegramDisplayName(connection.user),
      connectedAt: telegramUnixSecondsToIso(connection.date),
      enabled: connection.is_enabled,
      rights: toTelegramBusinessRights(connection.rights)
    };
  }

  if (update.business_message) {
    const message = update.business_message;
    if (!message.business_connection_id || !message.message_id || !message.chat.id) {
      throw new Error("Telegram business message is missing required identifiers");
    }

    const text = typeof message.text === "string" ? message.text.trim() : "";
    const sender = message.from ?? message.chat;
    return {
      kind: "business_message",
      updateId,
      businessConnectionId: message.business_connection_id,
      providerMessageId: String(message.message_id),
      providerChatId: String(message.chat.id),
      providerUserId: message.from ? String(message.from.id) : null,
      username: sender.username ?? null,
      displayName: telegramDisplayName(sender),
      providerSentAt: telegramUnixSecondsToIso(message.date),
      contentType: text ? "text" : "unsupported",
      text: text || null
    };
  }

  return { kind: "unsupported_update", updateId };
}

function toTelegramBusinessRights(
  rights: z.infer<typeof TelegramBusinessBotRightsSchema>
): TelegramBusinessConnectionRights {
  return {
    canReply: rights.can_reply ?? false,
    canReadMessages: rights.can_read_messages ?? false,
    canDeleteSentMessages: rights.can_delete_sent_messages ?? false,
    canDeleteAllMessages: rights.can_delete_all_messages ?? false,
    canEditName: rights.can_edit_name ?? false,
    canEditBio: rights.can_edit_bio ?? false,
    canEditProfilePhoto: rights.can_edit_profile_photo ?? false,
    canEditUsername: rights.can_edit_username ?? false,
    canChangeGiftSettings: rights.can_change_gift_settings ?? false,
    canViewGiftsAndStars: rights.can_view_gifts_and_stars ?? false,
    canConvertGiftsToStars: rights.can_convert_gifts_to_stars ?? false,
    canTransferAndUpgradeGifts: rights.can_transfer_and_upgrade_gifts ?? false,
    canTransferStars: rights.can_transfer_stars ?? false,
    canManageStories: rights.can_manage_stories ?? false
  };
}

function telegramDisplayName(input: {
  readonly first_name?: string;
  readonly last_name?: string;
}): string | null {
  const value = [input.first_name, input.last_name].filter(Boolean).join(" ").trim();
  return value || null;
}

function telegramUnixSecondsToIso(value: number): string {
  return new Date(value * 1000).toISOString();
}
