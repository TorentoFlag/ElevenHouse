import { relations } from "drizzle-orm";
import { users } from "../identity/accounts.schema";
import { mediaAssets } from "./media-assets.schema";
import { mediaVariants } from "./media-variants.schema";

export const mediaAssetsRelations = relations(mediaAssets, ({ many, one }) => ({
  owner: one(users, {
    fields: [mediaAssets.ownerUserId],
    references: [users.id]
  }),
  variants: many(mediaVariants)
}));

export const mediaVariantsRelations = relations(mediaVariants, ({ one }) => ({
  asset: one(mediaAssets, {
    fields: [mediaVariants.assetId],
    references: [mediaAssets.id]
  })
}));
