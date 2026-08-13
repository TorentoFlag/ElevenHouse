import { relations } from "drizzle-orm";

import { users } from "../identity/accounts.schema";
import { bookings } from "../scheduling/bookings.schema";
import { sessionCommands } from "./session-commands.schema";
import { sessionMessages } from "./session-messages.schema";
import { sessionParticipants } from "./session-participants.schema";
import { sessionProviderEvents } from "./session-provider-events.schema";
import { sessionRealtimeEvents } from "./session-realtime-events.schema";
import { sessions } from "./sessions.schema";

export const sessionsRelations = relations(sessions, ({ many, one }) => ({
  booking: one(bookings, { fields: [sessions.bookingId], references: [bookings.id] }),
  owner: one(users, {
    fields: [sessions.ownerUserId],
    references: [users.id],
    relationName: "session_owner"
  }),
  client: one(users, {
    fields: [sessions.clientUserId],
    references: [users.id],
    relationName: "session_client"
  }),
  participants: many(sessionParticipants),
  messages: many(sessionMessages),
  commands: many(sessionCommands),
  providerEvents: many(sessionProviderEvents),
  realtimeEvents: many(sessionRealtimeEvents)
}));

export const sessionParticipantsRelations = relations(sessionParticipants, ({ one }) => ({
  session: one(sessions, {
    fields: [sessionParticipants.sessionId],
    references: [sessions.id]
  }),
  user: one(users, { fields: [sessionParticipants.userId], references: [users.id] })
}));

export const sessionMessagesRelations = relations(sessionMessages, ({ one }) => ({
  session: one(sessions, { fields: [sessionMessages.sessionId], references: [sessions.id] }),
  sender: one(users, { fields: [sessionMessages.senderUserId], references: [users.id] })
}));

export const sessionCommandsRelations = relations(sessionCommands, ({ one }) => ({
  session: one(sessions, { fields: [sessionCommands.sessionId], references: [sessions.id] }),
  actor: one(users, { fields: [sessionCommands.actorUserId], references: [users.id] })
}));

export const sessionProviderEventsRelations = relations(sessionProviderEvents, ({ one }) => ({
  session: one(sessions, {
    fields: [sessionProviderEvents.sessionId],
    references: [sessions.id]
  })
}));

export const sessionRealtimeEventsRelations = relations(sessionRealtimeEvents, ({ one }) => ({
  session: one(sessions, {
    fields: [sessionRealtimeEvents.sessionId],
    references: [sessions.id]
  })
}));
