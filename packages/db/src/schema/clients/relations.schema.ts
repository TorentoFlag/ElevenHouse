import { relations } from "drizzle-orm";
import { users } from "../identity/accounts.schema";
import { clientAstrologerRelationships } from "./client-astrologer-relationships.schema";
import { clientBirthData } from "./client-birth-data.schema";
import { clientJoinIntents } from "./client-join-intents.schema";
import { clientProfiles } from "./client-profiles.schema";

export const clientProfilesRelations = relations(clientProfiles, ({ one }) => ({
  user: one(users, {
    fields: [clientProfiles.userId],
    references: [users.id]
  })
}));

export const clientBirthDataRelations = relations(clientBirthData, ({ one }) => ({
  client: one(users, {
    fields: [clientBirthData.clientUserId],
    references: [users.id]
  })
}));

export const clientAstrologerRelationshipsRelations = relations(
  clientAstrologerRelationships,
  ({ one }) => ({
    client: one(users, {
      fields: [clientAstrologerRelationships.clientUserId],
      references: [users.id]
    }),
    astrologer: one(users, {
      fields: [clientAstrologerRelationships.astrologerUserId],
      references: [users.id]
    })
  })
);

export const clientJoinIntentsRelations = relations(clientJoinIntents, ({ one }) => ({
  astrologer: one(users, {
    fields: [clientJoinIntents.astrologerUserId],
    references: [users.id]
  }),
  claimedByClient: one(users, {
    fields: [clientJoinIntents.claimedByClientUserId],
    references: [users.id]
  })
}));
