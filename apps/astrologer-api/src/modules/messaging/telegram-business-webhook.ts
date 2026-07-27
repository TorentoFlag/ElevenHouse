import { z } from "@elevenhouse/validation";
import type {
  TelegramBusinessConnectionRights,
  TelegramBusinessMediaAttachment
} from "@elevenhouse/domain";

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

const TelegramVoiceSchema = z
  .object({
    file_id: z.string().trim().min(1),
    file_unique_id: z.string().trim().min(1),
    duration: z.number().int().nonnegative(),
    mime_type: z.string().trim().min(1).optional(),
    file_size: z.number().int().nonnegative().optional()
  })
  .passthrough();

const TelegramPhotoSizeSchema = z
  .object({
    file_id: z.string().trim().min(1),
    file_unique_id: z.string().trim().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    file_size: z.number().int().nonnegative().optional()
  })
  .passthrough();

const TelegramVideoNoteSchema = z
  .object({
    file_id: z.string().trim().min(1),
    file_unique_id: z.string().trim().min(1),
    length: z.number().int().positive(),
    duration: z.number().int().nonnegative(),
    file_size: z.number().int().nonnegative().optional()
  })
  .passthrough();

const TelegramVideoSchema = z
  .object({
    file_id: z.string().trim().min(1),
    file_unique_id: z.string().trim().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    duration: z.number().int().nonnegative(),
    file_name: z.string().trim().min(1).optional(),
    mime_type: z.string().trim().min(1).optional(),
    file_size: z.number().int().nonnegative().optional()
  })
  .passthrough();

const TelegramDocumentSchema = z
  .object({
    file_id: z.string().trim().min(1),
    file_unique_id: z.string().trim().min(1),
    file_name: z.string().trim().min(1).optional(),
    mime_type: z.string().trim().min(1).optional(),
    file_size: z.number().int().nonnegative().optional(),
    thumbnail: TelegramPhotoSizeSchema.optional()
  })
  .passthrough();

const TelegramBusinessMessageSchema = z
  .object({
    message_id: z.number().int(),
    business_connection_id: z.string().trim().min(1).optional(),
    from: TelegramUserSchema.optional(),
    chat: TelegramChatSchema,
    date: z.number().int().nonnegative(),
    edit_date: z.number().int().nonnegative().optional(),
    text: z.string().optional(),
    caption: z.string().optional(),
    voice: TelegramVoiceSchema.optional(),
    photo: z.array(TelegramPhotoSizeSchema).min(1).optional(),
    video_note: TelegramVideoNoteSchema.optional(),
    video: TelegramVideoSchema.optional(),
    document: TelegramDocumentSchema.optional()
  })
  .passthrough();

const TelegramBusinessMessagesDeletedSchema = z
  .object({
    business_connection_id: z.string().trim().min(1),
    chat: TelegramChatSchema,
    message_ids: z.array(z.number().int()).min(1)
  })
  .passthrough();

const TelegramUpdateSchema = z
  .object({
    update_id: z.number().int(),
    business_connection: TelegramBusinessConnectionSchema.optional(),
    business_message: TelegramBusinessMessageSchema.optional(),
    edited_business_message: TelegramBusinessMessageSchema.optional(),
    deleted_business_messages: TelegramBusinessMessagesDeletedSchema.optional()
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
      readonly chatUsername: string | null;
      readonly chatDisplayName: string | null;
      readonly providerSentAt: string;
      readonly contentType: "text" | "image" | "voice" | "video_note" | "video" | "unsupported";
      readonly text: string | null;
      readonly mediaAttachment?: TelegramBusinessMediaAttachment | undefined;
    }
  | {
      readonly kind: "business_message_edited";
      readonly updateId: string;
      readonly businessConnectionId: string;
      readonly providerMessageId: string;
      readonly providerChatId: string;
      readonly providerUserId: string | null;
      readonly username: string | null;
      readonly displayName: string | null;
      readonly chatUsername: string | null;
      readonly chatDisplayName: string | null;
      readonly providerSentAt: string;
      readonly providerEditedAt: string;
      readonly contentType: "text" | "image" | "voice" | "video_note" | "video" | "unsupported";
      readonly text: string | null;
      readonly mediaAttachment?: TelegramBusinessMediaAttachment | undefined;
    }
  | {
      readonly kind: "business_messages_deleted";
      readonly updateId: string;
      readonly businessConnectionId: string;
      readonly providerChatId: string;
      readonly providerMessageIds: readonly string[];
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

  if (update.deleted_business_messages) {
    const deleted = update.deleted_business_messages;
    return {
      kind: "business_messages_deleted",
      updateId,
      businessConnectionId: deleted.business_connection_id,
      providerChatId: String(deleted.chat.id),
      providerMessageIds: deleted.message_ids.map(String)
    };
  }

  if (update.edited_business_message) {
    return parseTelegramBusinessMessage({
      kind: "business_message_edited",
      updateId,
      message: update.edited_business_message
    });
  }

  if (update.business_message) {
    return parseTelegramBusinessMessage({
      kind: "business_message",
      updateId,
      message: update.business_message
    });
  }

  return { kind: "unsupported_update", updateId };
}

function parseTelegramBusinessMessage(input: {
  readonly kind: "business_message" | "business_message_edited";
  readonly updateId: string;
  readonly message: z.infer<typeof TelegramBusinessMessageSchema>;
}): Extract<ParsedTelegramBusinessWebhookUpdate, { readonly kind: "business_message" | "business_message_edited" }> {
  const { message } = input;
  if (!message.business_connection_id || !message.message_id || !message.chat.id) {
    throw new Error("Telegram business message is missing required identifiers");
  }

  const content = telegramBusinessMessageContent(message);
  const sender = message.from ?? message.chat;
  const base = {
    kind: input.kind,
    updateId: input.updateId,
    businessConnectionId: message.business_connection_id,
    providerMessageId: String(message.message_id),
    providerChatId: String(message.chat.id),
    providerUserId: message.from ? String(message.from.id) : null,
    username: sender.username ?? null,
    displayName: telegramDisplayName(sender),
    chatUsername: message.chat.username ?? null,
    chatDisplayName: telegramDisplayName(message.chat),
    providerSentAt: telegramUnixSecondsToIso(message.date),
    contentType: content.contentType,
    text: content.text,
    ...(content.mediaAttachment ? { mediaAttachment: content.mediaAttachment } : {})
  } as const;

  if (input.kind === "business_message_edited") {
    return {
      ...base,
      kind: "business_message_edited",
      providerEditedAt: telegramUnixSecondsToIso(message.edit_date ?? message.date)
    };
  }

  return { ...base, kind: "business_message" };
}

function telegramBusinessMessageContent(
  message: z.infer<typeof TelegramBusinessMessageSchema>
): {
  readonly contentType: "text" | "image" | "voice" | "video_note" | "video" | "unsupported";
  readonly text: string | null;
  readonly mediaAttachment?: TelegramBusinessMediaAttachment | undefined;
} {
  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (text) return { contentType: "text", text };
  const caption = typeof message.caption === "string" ? message.caption.trim() : "";

  if (message.voice) {
    return {
      contentType: "voice",
      text: `Голосовое сообщение (${formatTelegramDuration(message.voice.duration)})`,
      mediaAttachment: {
        kind: "voice",
        providerFileId: message.voice.file_id,
        providerFileUniqueId: message.voice.file_unique_id,
        durationSeconds: message.voice.duration,
        width: null,
        height: null,
        providerMimeType: message.voice.mime_type ?? null,
        providerSizeBytes: message.voice.file_size ?? null
      }
    };
  }

  if (message.photo) {
    const photo = largestTelegramPhoto(message.photo);
    return {
      contentType: "image",
      text: caption || "Изображение",
      mediaAttachment: {
        kind: "image",
        providerFileId: photo.file_id,
        providerFileUniqueId: photo.file_unique_id,
        durationSeconds: null,
        width: photo.width,
        height: photo.height,
        providerMimeType: null,
        providerSizeBytes: photo.file_size ?? null
      }
    };
  }

  if (message.video_note) {
    return {
      contentType: "video_note",
      text: `Видео кружок (${formatTelegramDuration(message.video_note.duration)})`,
      mediaAttachment: {
        kind: "video_note",
        providerFileId: message.video_note.file_id,
        providerFileUniqueId: message.video_note.file_unique_id,
        durationSeconds: message.video_note.duration,
        width: message.video_note.length,
        height: message.video_note.length,
        providerMimeType: "video/mp4",
        providerSizeBytes: message.video_note.file_size ?? null
      }
    };
  }

  if (message.video) {
    return {
      contentType: "video",
      text: caption || `Видео (${formatTelegramDuration(message.video.duration)})`,
      mediaAttachment: {
        kind: "video",
        providerFileId: message.video.file_id,
        providerFileUniqueId: message.video.file_unique_id,
        durationSeconds: message.video.duration,
        width: message.video.width,
        height: message.video.height,
        providerMimeType: message.video.mime_type ?? "video/mp4",
        providerSizeBytes: message.video.file_size ?? null
      }
    };
  }

  if (message.document && isTelegramImageMimeType(message.document.mime_type)) {
    return {
      contentType: "image",
      text: caption || "Изображение",
      mediaAttachment: {
        kind: "image",
        providerFileId: message.document.file_id,
        providerFileUniqueId: message.document.file_unique_id,
        durationSeconds: null,
        width: null,
        height: null,
        providerMimeType: message.document.mime_type ?? null,
        providerSizeBytes: message.document.file_size ?? null
      }
    };
  }

  return { contentType: "unsupported", text: null };
}

function largestTelegramPhoto(
  photos: readonly z.infer<typeof TelegramPhotoSizeSchema>[]
): z.infer<typeof TelegramPhotoSizeSchema> {
  return [...photos].sort((left, right) => photoArea(right) - photoArea(left))[0]!;
}

function photoArea(photo: z.infer<typeof TelegramPhotoSizeSchema>): number {
  return photo.width * photo.height;
}

function isTelegramImageMimeType(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return (
    normalized === "image/jpeg" ||
    normalized === "image/png" ||
    normalized === "image/webp" ||
    normalized === "image/avif"
  );
}

function formatTelegramDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
