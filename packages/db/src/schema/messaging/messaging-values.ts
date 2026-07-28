export const messagingProviderValues = ["telegram", "instagram"] as const;

export const messagingChannelModeValues = [
  "telegram_business_bot",
  "telegram_mtproto_account",
  "instagram_graph"
] as const;

export const messagingChannelConnectionStatusValues = [
  "connecting",
  "active",
  "paused",
  "revoked",
  "reauth_required",
  "error"
] as const;

export const messagingMtprotoLoginStateValues = [
  "code_required",
  "password_required",
  "authorized",
  "reauth_required",
  "revoked"
] as const;

export const messagingExternalIdentityLinkStatusValues = [
  "unlinked",
  "suggested",
  "linked",
  "ignored"
] as const;

export const messagingThreadStatusValues = ["open", "archived", "blocked"] as const;
export const messagingMessageDirectionValues = ["inbound", "outbound"] as const;
export const messagingMessageSenderKindValues = ["client", "astrologer", "system"] as const;
export const messagingMessageContentTypeValues = [
  "text",
  "image",
  "file",
  "voice",
  "video_note",
  "video",
  "unsupported"
] as const;
export const messagingMessageStatusValues = [
  "received",
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "unknown",
  "deleted"
] as const;
export const messagingDeliveryAttemptStatusValues = ["sent", "failed", "unknown"] as const;
export const messagingMediaIngestionStatusValues = [
  "pending",
  "downloading",
  "ready",
  "failed",
  "permanent_failed"
] as const;
export const messagingRealtimeEventTypeValues = [
  "thread.created",
  "thread.updated",
  "message.received",
  "message.updated",
  "message.deleted",
  "channelConnection.updated",
  "identity.linked",
  "delivery.failed"
] as const;

export function formatMessagingSqlValues(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
