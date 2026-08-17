import { relations } from "drizzle-orm";
import { users } from "../identity/accounts.schema";
import { clientAstrologerRelationships } from "./client-astrologer-relationships.schema";
import { clientBirthData, clientBirthDataHistory } from "./client-birth-data.schema";
import { clientJoinIntents } from "./client-join-intents.schema";
import { clientProfiles } from "./client-profiles.schema";
import {
  clientRelatedBirthProfileHistory,
  clientRelatedBirthProfiles
} from "./client-related-birth-profiles.schema";

export const clientProfilesRelations = relations(clientProfiles, ({ one }) => ({
  user: one(users, {
    fields: [clientProfiles.userId],
    references: [users.id]
  })
}));

export const clientBirthDataRelations = relations(clientBirthData, ({ many, one }) => ({
  client: one(users, {
    fields: [clientBirthData.clientUserId],
    references: [users.id]
  }),
  lastEditedBy: one(users, {
    fields: [clientBirthData.lastEditedByUserId],
    references: [users.id],
    relationName: "client_birth_data_last_editor"
  }),
  history: many(clientBirthDataHistory)
}));

export const clientBirthDataHistoryRelations = relations(clientBirthDataHistory, ({ one }) => ({
  birthData: one(clientBirthData, {
    fields: [clientBirthDataHistory.birthDataId],
    references: [clientBirthData.id]
  }),
  client: one(users, {
    fields: [clientBirthDataHistory.clientUserId],
    references: [users.id]
  }),
  actor: one(users, {
    fields: [clientBirthDataHistory.actorUserId],
    references: [users.id],
    relationName: "client_birth_data_history_actor"
  })
}));

export const clientRelatedBirthProfilesRelations = relations(
  clientRelatedBirthProfiles,
  ({ many, one }) => ({
    client: one(users, {
      fields: [clientRelatedBirthProfiles.clientUserId],
      references: [users.id]
    }),
    lastEditedBy: one(users, {
      fields: [clientRelatedBirthProfiles.lastEditedByUserId],
      references: [users.id],
      relationName: "client_related_birth_profiles_last_editor"
    }),
    history: many(clientRelatedBirthProfileHistory)
  })
);

export const clientRelatedBirthProfileHistoryRelations = relations(
  clientRelatedBirthProfileHistory,
  ({ one }) => ({
    relatedProfile: one(clientRelatedBirthProfiles, {
      fields: [clientRelatedBirthProfileHistory.relatedProfileId],
      references: [clientRelatedBirthProfiles.id]
    }),
    client: one(users, {
      fields: [clientRelatedBirthProfileHistory.clientUserId],
      references: [users.id]
    }),
    actor: one(users, {
      fields: [clientRelatedBirthProfileHistory.actorUserId],
      references: [users.id],
      relationName: "client_related_birth_profile_history_actor"
    })
  })
);

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
