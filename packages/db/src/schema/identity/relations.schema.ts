import { relations } from "drizzle-orm";
import { users } from "./accounts.schema";
import { authChallengeDeliveryAttempts } from "./auth-challenge-delivery-attempts.schema";
import { authChallengeDeliveries } from "./auth-challenge-deliveries.schema";
import { authChallenges } from "./auth-challenges.schema";
import { authIdentities } from "./auth-identities.schema";
import { userSessions } from "./auth-sessions.schema";
import { userRoleAssignments } from "./role-assignments.schema";

export const usersRelations = relations(users, ({ many }) => ({
  authIdentities: many(authIdentities),
  roleAssignments: many(userRoleAssignments),
  sessions: many(userSessions)
}));

export const authIdentitiesRelations = relations(authIdentities, ({ one }) => ({
  user: one(users, {
    fields: [authIdentities.userId],
    references: [users.id]
  })
}));

export const userRoleAssignmentsRelations = relations(userRoleAssignments, ({ one }) => ({
  user: one(users, {
    fields: [userRoleAssignments.userId],
    references: [users.id]
  })
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id]
  })
}));

export const authChallengesRelations = relations(authChallenges, ({ many }) => ({
  deliveries: many(authChallengeDeliveries)
}));

export const authChallengeDeliveriesRelations = relations(
  authChallengeDeliveries,
  ({ many, one }) => ({
    attempts: many(authChallengeDeliveryAttempts),
    challenge: one(authChallenges, {
      fields: [authChallengeDeliveries.challengeId],
      references: [authChallenges.id]
    })
  })
);

export const authChallengeDeliveryAttemptsRelations = relations(
  authChallengeDeliveryAttempts,
  ({ one }) => ({
    delivery: one(authChallengeDeliveries, {
      fields: [authChallengeDeliveryAttempts.deliveryId],
      references: [authChallengeDeliveries.id]
    })
  })
);
