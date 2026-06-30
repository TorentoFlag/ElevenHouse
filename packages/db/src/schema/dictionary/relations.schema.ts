import { relations } from "drizzle-orm";
import { users } from "../identity/accounts.schema";
import { dictionaryAstrologerEntries } from "./dictionary-astrologer-entries.schema";
import { dictionaryCategories } from "./dictionary-categories.schema";
import { dictionaryPlatformEntries } from "./dictionary-platform-entries.schema";

export const dictionaryCategoriesRelations = relations(dictionaryCategories, ({ many }) => ({
  platformEntries: many(dictionaryPlatformEntries),
  astrologerEntries: many(dictionaryAstrologerEntries)
}));

export const dictionaryPlatformEntriesRelations = relations(
  dictionaryPlatformEntries,
  ({ many, one }) => ({
    category: one(dictionaryCategories, {
      fields: [dictionaryPlatformEntries.categoryId],
      references: [dictionaryCategories.id]
    }),
    astrologerEntries: many(dictionaryAstrologerEntries)
  })
);

export const dictionaryAstrologerEntriesRelations = relations(
  dictionaryAstrologerEntries,
  ({ one }) => ({
    owner: one(users, {
      fields: [dictionaryAstrologerEntries.ownerUserId],
      references: [users.id]
    }),
    category: one(dictionaryCategories, {
      fields: [dictionaryAstrologerEntries.categoryId],
      references: [dictionaryCategories.id]
    }),
    platformEntry: one(dictionaryPlatformEntries, {
      fields: [dictionaryAstrologerEntries.platformEntryId],
      references: [dictionaryPlatformEntries.id]
    })
  })
);
