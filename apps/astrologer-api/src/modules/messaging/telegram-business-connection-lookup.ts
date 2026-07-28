import { z } from "@elevenhouse/validation";
import type { TelegramBusinessConnectionRights } from "@elevenhouse/domain";

export type TelegramBusinessConnectionSnapshot = {
  readonly businessConnectionId: string;
  readonly userId: string;
  readonly userChatId: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly connectedAt: string;
  readonly enabled: boolean;
  readonly rights: TelegramBusinessConnectionRights;
};

export type TelegramBusinessConnectionLookup = {
  readonly findBusinessConnection: (
    businessConnectionId: string
  ) => Promise<TelegramBusinessConnectionSnapshot | null>;
};

export type TelegramBusinessConnectionLookupOptions = {
  readonly botToken: string;
  readonly botApiBaseUrl: string;
};

const TelegramUserSchema = z
  .object({
    id: z.number().int(),
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

const TelegramBusinessConnectionResponseSchema = z
  .object({
    ok: z.boolean(),
    result: TelegramBusinessConnectionSchema.optional(),
    error_code: z.number().int().optional()
  })
  .passthrough();

export class TelegramBusinessBotApiConnectionLookup implements TelegramBusinessConnectionLookup {
  constructor(
    private readonly options: TelegramBusinessConnectionLookupOptions,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async findBusinessConnection(
    businessConnectionId: string
  ): Promise<TelegramBusinessConnectionSnapshot | null> {
    const response = await this.fetchFn(this.getBusinessConnectionUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ business_connection_id: businessConnectionId })
    });
    const body = TelegramBusinessConnectionResponseSchema.parse(await response.json());
    if (!response.ok || !body.ok || !body.result) {
      if ([400, 401, 403, 404].includes(response.status) || isPermanentTelegramError(body.error_code)) {
        return null;
      }
      throw new Error(`Telegram Bot API getBusinessConnection failed with HTTP ${response.status}`);
    }

    return toConnectionSnapshot(body.result);
  }

  private getBusinessConnectionUrl() {
    return `${stripTrailingSlashes(this.options.botApiBaseUrl)}/bot${this.options.botToken}/getBusinessConnection`;
  }
}

function toConnectionSnapshot(
  connection: z.infer<typeof TelegramBusinessConnectionSchema>
): TelegramBusinessConnectionSnapshot {
  return {
    businessConnectionId: connection.id,
    userId: String(connection.user.id),
    userChatId: String(connection.user_chat_id),
    username: connection.user.username ?? null,
    displayName: telegramDisplayName(connection.user),
    connectedAt: new Date(connection.date * 1000).toISOString(),
    enabled: connection.is_enabled,
    rights: {
      canReply: connection.rights.can_reply === true,
      canReadMessages: connection.rights.can_read_messages === true,
      canDeleteSentMessages: connection.rights.can_delete_sent_messages === true,
      canDeleteAllMessages: connection.rights.can_delete_all_messages === true,
      canEditName: connection.rights.can_edit_name === true,
      canEditBio: connection.rights.can_edit_bio === true,
      canEditProfilePhoto: connection.rights.can_edit_profile_photo === true,
      canEditUsername: connection.rights.can_edit_username === true,
      canChangeGiftSettings: connection.rights.can_change_gift_settings === true,
      canViewGiftsAndStars: connection.rights.can_view_gifts_and_stars === true,
      canConvertGiftsToStars: connection.rights.can_convert_gifts_to_stars === true,
      canTransferAndUpgradeGifts: connection.rights.can_transfer_and_upgrade_gifts === true,
      canTransferStars: connection.rights.can_transfer_stars === true,
      canManageStories: connection.rights.can_manage_stories === true
    }
  };
}

function telegramDisplayName(user: { readonly first_name?: string; readonly last_name?: string }) {
  const value = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return value || null;
}

function stripTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function isPermanentTelegramError(errorCode: number | undefined) {
  return errorCode !== undefined && errorCode >= 400 && errorCode < 500;
}
