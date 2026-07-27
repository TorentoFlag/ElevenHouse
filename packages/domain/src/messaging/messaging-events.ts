import type { MessagingOutboxEvent, MessagingRealtimeEventType } from "./messaging-types";

export const messagingMessageDeliveryRequestedEventType =
  "messaging.message.delivery_requested" as const;
export const messagingMessageReceivedEventType = "message.received" as const;
export const messagingMessageUpdatedEventType = "message.updated" as const;
export const messagingMessageDeletedEventType = "message.deleted" as const;
export const messagingThreadUpdatedEventType = "thread.updated" as const;

export type MessagingMessageDeliveryRequestedPayload = {
  readonly messageId: string;
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
};

export type MessagingMessageDeliveryRequestedEvent =
  MessagingOutboxEvent<MessagingMessageDeliveryRequestedPayload> & {
    readonly type: typeof messagingMessageDeliveryRequestedEventType;
  };

export const messagingRealtimeEventTypes: readonly MessagingRealtimeEventType[] = [
  "thread.created",
  messagingMessageReceivedEventType,
  messagingMessageUpdatedEventType,
  messagingMessageDeletedEventType,
  "channelConnection.updated",
  "identity.linked",
  "delivery.failed",
  messagingThreadUpdatedEventType
];
