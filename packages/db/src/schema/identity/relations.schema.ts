import { relations } from "drizzle-orm";
import { users } from "./accounts.schema";
import { userSessions } from "./auth-sessions.schema";
import { userRoleAssignments } from "./role-assignments.schema";

export const usersRelations = relations(users, ({ many }) => ({
  roleAssignments: many(userRoleAssignments),
  sessions: many(userSessions)
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
