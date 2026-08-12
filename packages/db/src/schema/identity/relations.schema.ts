import { relations } from "drizzle-orm";
import { users } from "./accounts.schema";
import { authChallengeDeliveryAttempts } from "./auth-challenge-delivery-attempts.schema";
import { authChallengeDeliveries } from "./auth-challenge-deliveries.schema";
import { authChallenges } from "./auth-challenges.schema";
import { authIdentities } from "./auth-identities.schema";
import { userSessions } from "./auth-sessions.schema";
import {
  mobileRefreshRetryReceipts,
  mobileRefreshTokens,
  mobileSessions
} from "./mobile-sessions.schema";
import { userRoleAssignments } from "./role-assignments.schema";
import { userProfiles } from "./user-profiles.schema";

export const usersRelations = relations(users, ({ many, one }) => ({
  authIdentities: many(authIdentities),
  roleAssignments: many(userRoleAssignments),
  sessions: many(userSessions),
  mobileSessions: many(mobileSessions),
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId]
  })
}));

export const mobileSessionsRelations = relations(mobileSessions, ({ many, one }) => ({
  user: one(users, { fields: [mobileSessions.userId], references: [users.id] }),
  refreshTokens: many(mobileRefreshTokens)
}));

export const mobileRefreshTokensRelations = relations(mobileRefreshTokens, ({ many, one }) => ({
  session: one(mobileSessions, { fields: [mobileRefreshTokens.sessionId], references: [mobileSessions.id] }),
  retryReceipts: many(mobileRefreshRetryReceipts)
}));

export const mobileRefreshRetryReceiptsRelations = relations(mobileRefreshRetryReceipts, ({ one }) => ({
  refreshToken: one(mobileRefreshTokens, {
    fields: [mobileRefreshRetryReceipts.refreshTokenId],
    references: [mobileRefreshTokens.id]
  })
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id]
  })
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
