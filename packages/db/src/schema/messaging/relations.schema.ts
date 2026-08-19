import { relations } from "drizzle-orm";
import { users } from "../identity/accounts.schema";
import { messagingChannelConnections } from "./channel-connections.schema";
import { messageDeliveryAttempts } from "./message-delivery-attempts.schema";
import { messagingExternalIdentities } from "./external-identities.schema";
import { messagingInstagramGraphAccounts } from "./instagram-graph-accounts.schema";
import { messagingMessages } from "./messages.schema";
import { messagingProviderWebhookEvents } from "./provider-webhook-events.schema";
import { messagingRealtimeEvents } from "./realtime-events.schema";
import { messagingThreadIdentities } from "./thread-identities.schema";
import { messagingThreads } from "./threads.schema";
import { messagingWhatsappCloudAccounts } from "./whatsapp-cloud-accounts.schema";

export const messagingChannelConnectionsRelations = relations(
  messagingChannelConnections,
  ({ many, one }) => ({
    astrologer: one(users, {
      fields: [messagingChannelConnections.astrologerUserId],
      references: [users.id]
    }),
    externalIdentities: many(messagingExternalIdentities),
    instagramGraphAccounts: many(messagingInstagramGraphAccounts),
    whatsappCloudAccounts: many(messagingWhatsappCloudAccounts),
    messages: many(messagingMessages)
  })
);

export const messagingInstagramGraphAccountsRelations = relations(
  messagingInstagramGraphAccounts,
  ({ one }) => ({
    channelConnection: one(messagingChannelConnections, {
      fields: [messagingInstagramGraphAccounts.channelConnectionId],
      references: [messagingChannelConnections.id]
    })
  })
);

export const messagingWhatsappCloudAccountsRelations = relations(
  messagingWhatsappCloudAccounts,
  ({ one }) => ({
    channelConnection: one(messagingChannelConnections, {
      fields: [messagingWhatsappCloudAccounts.channelConnectionId],
      references: [messagingChannelConnections.id]
    })
  })
);

export const messagingExternalIdentitiesRelations = relations(
  messagingExternalIdentities,
  ({ many, one }) => ({
    channelConnection: one(messagingChannelConnections, {
      fields: [messagingExternalIdentities.channelConnectionId],
      references: [messagingChannelConnections.id]
    }),
    linkedClient: one(users, {
      fields: [messagingExternalIdentities.linkedClientUserId],
      references: [users.id]
    }),
    threadIdentities: many(messagingThreadIdentities),
    messages: many(messagingMessages)
  })
);

export const messagingThreadsRelations = relations(messagingThreads, ({ many, one }) => ({
  astrologer: one(users, {
    fields: [messagingThreads.astrologerUserId],
    references: [users.id]
  }),
  client: one(users, {
    fields: [messagingThreads.clientUserId],
    references: [users.id]
  }),
  identities: many(messagingThreadIdentities),
  messages: many(messagingMessages)
}));

export const messagingThreadIdentitiesRelations = relations(
  messagingThreadIdentities,
  ({ one }) => ({
    thread: one(messagingThreads, {
      fields: [messagingThreadIdentities.threadId],
      references: [messagingThreads.id]
    }),
    externalIdentity: one(messagingExternalIdentities, {
      fields: [messagingThreadIdentities.externalIdentityId],
      references: [messagingExternalIdentities.id]
    })
  })
);

export const messagingMessagesRelations = relations(messagingMessages, ({ many, one }) => ({
  thread: one(messagingThreads, {
    fields: [messagingMessages.threadId],
    references: [messagingThreads.id]
  }),
  channelConnection: one(messagingChannelConnections, {
    fields: [messagingMessages.channelConnectionId],
    references: [messagingChannelConnections.id]
  }),
  externalIdentity: one(messagingExternalIdentities, {
    fields: [messagingMessages.externalIdentityId],
    references: [messagingExternalIdentities.id]
  }),
  deliveryAttempts: many(messageDeliveryAttempts)
}));

export const messageDeliveryAttemptsRelations = relations(messageDeliveryAttempts, ({ one }) => ({
  message: one(messagingMessages, {
    fields: [messageDeliveryAttempts.messageId],
    references: [messagingMessages.id]
  })
}));

export const messagingRealtimeEventsRelations = relations(messagingRealtimeEvents, ({ one }) => ({
  astrologer: one(users, {
    fields: [messagingRealtimeEvents.astrologerUserId],
    references: [users.id]
  })
}));

export const messagingProviderWebhookEventsRelations = relations(
  messagingProviderWebhookEvents,
  () => ({})
);
