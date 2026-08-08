import type { MessagingOutboxEvent, MessagingRealtimeEventType } from "./messaging-types";
import { z } from "@elevenhouse/validation";

export const messagingMessageDeliveryRequestedEventType =
  "messaging.message.delivery_requested" as const;
export const messagingMessageDeliveryTerminalEventType =
  "messaging.message.delivery_terminal.v1" as const;
export const messagingMessageDeliveryReconciliationRequestedEventType =
  "messaging.message.delivery_reconciliation_requested.v1" as const;
export const messagingMessageReceivedEventType = "message.received" as const;
export const messagingMessageUpdatedEventType = "message.updated" as const;
export const messagingMessageDeletedEventType = "message.deleted" as const;
export const messagingThreadUpdatedEventType = "thread.updated" as const;

export type MessagingMessageDeliveryRequestedPayload = {
  readonly messageId: string;
  readonly threadId: string;
  readonly channelConnectionId: string;
  readonly astrologerUserId: string;
  /** A Flow-originated message requires a durable terminal delivery signal. */
  readonly flowTerminalSignal?: "flow_delivery_terminal.v1";
};

export type MessagingMessageDeliveryTerminalPayload = {
  readonly schemaVersion: "messaging-message-delivery-terminal.v1";
  readonly messageId: string;
  readonly ownerUserId: string;
  readonly outcome: "succeeded" | "failed";
  readonly occurredAt: string;
};

export const messagingMessageDeliveryTerminalPayloadSchema = z
  .object({
    schemaVersion: z.literal("messaging-message-delivery-terminal.v1"),
    messageId: z.string().uuid(),
    ownerUserId: z.string().uuid(),
    outcome: z.enum(["succeeded", "failed"]),
    occurredAt: z.string().datetime({ offset: true })
  })
  .strict();

export type MessagingMessageDeliveryReconciliationRequestedPayload = {
  readonly schemaVersion: "messaging-message-delivery-reconciliation-request.v1";
  readonly messageId: string;
};

export const messagingMessageDeliveryReconciliationRequestedPayloadSchema = z
  .object({
    schemaVersion: z.literal("messaging-message-delivery-reconciliation-request.v1"),
    messageId: z.string().uuid()
  })
  .strict();

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
