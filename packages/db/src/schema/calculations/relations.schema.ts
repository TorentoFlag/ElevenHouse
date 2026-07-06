import { relations } from "drizzle-orm";
import { users } from "../identity/accounts.schema";
import { mediaAssets } from "../media/media-assets.schema";
import { calculationArtifacts } from "./calculation-artifacts.schema";
import { calculationClientLinks } from "./calculation-client-links.schema";
import { calculationInterpretations } from "./calculation-interpretations.schema";
import { calculationParticipants } from "./calculation-participants.schema";
import { calculationRecords } from "./calculation-records.schema";
import { calculationVersions } from "./calculation-versions.schema";

export const calculationRecordsRelations = relations(calculationRecords, ({ many, one }) => ({
  owner: one(users, {
    fields: [calculationRecords.ownerUserId],
    references: [users.id]
  }),
  participants: many(calculationParticipants),
  versions: many(calculationVersions),
  links: many(calculationClientLinks),
  interpretations: many(calculationInterpretations),
  artifacts: many(calculationArtifacts)
}));

export const calculationParticipantsRelations = relations(calculationParticipants, ({ one }) => ({
  calculation: one(calculationRecords, {
    fields: [calculationParticipants.calculationId],
    references: [calculationRecords.id]
  })
}));

export const calculationVersionsRelations = relations(calculationVersions, ({ many, one }) => ({
  calculation: one(calculationRecords, {
    fields: [calculationVersions.calculationId],
    references: [calculationRecords.id]
  }),
  interpretations: many(calculationInterpretations),
  artifacts: many(calculationArtifacts)
}));

export const calculationClientLinksRelations = relations(calculationClientLinks, ({ one }) => ({
  calculation: one(calculationRecords, {
    fields: [calculationClientLinks.calculationId],
    references: [calculationRecords.id]
  })
}));

export const calculationInterpretationsRelations = relations(
  calculationInterpretations,
  ({ one }) => ({
    calculation: one(calculationRecords, {
      fields: [calculationInterpretations.calculationId],
      references: [calculationRecords.id]
    }),
    version: one(calculationVersions, {
      fields: [calculationInterpretations.versionId],
      references: [calculationVersions.id]
    })
  })
);

export const calculationArtifactsRelations = relations(calculationArtifacts, ({ one }) => ({
  calculation: one(calculationRecords, {
    fields: [calculationArtifacts.calculationId],
    references: [calculationRecords.id]
  }),
  version: one(calculationVersions, {
    fields: [calculationArtifacts.versionId],
    references: [calculationVersions.id]
  }),
  media: one(mediaAssets, {
    fields: [calculationArtifacts.mediaAssetId],
    references: [mediaAssets.id]
  })
}));
