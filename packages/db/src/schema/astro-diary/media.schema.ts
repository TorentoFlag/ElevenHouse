import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

import { mediaAssets } from "../media/media-assets.schema";
import { astroDiaryJournals } from "./core.schema";

export const astroDiaryMediaAuthorities = pgTable(
  "astro_diary_media_authorities",
  {
    mediaId: uuid("media_id").primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    ownerUserId: uuid("owner_user_id").notNull(),
    purpose: text("purpose").notNull(),
    visibility: text("visibility").notNull().default("private"),
    state: text("state").notNull().default("pending"),
    boundItemId: uuid("bound_item_id"),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    boundAt: timestamp("bound_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.mediaId, table.ownerUserId],
      foreignColumns: [mediaAssets.id, mediaAssets.ownerUserId],
      name: "astro_diary_media_authorities_media_owner_fk"
    }).onDelete("restrict"),
    unique("astro_diary_media_authorities_binding_identity_unique").on(
      table.mediaId,
      table.journalId,
      table.ownerUserId,
      table.purpose
    ),
    unique("astro_diary_media_authorities_media_journal_unique").on(
      table.mediaId,
      table.journalId
    ),
    check(
      "astro_diary_media_authorities_purpose_check",
      sql`${table.purpose} in ('astro_diary_attachment', 'astro_diary_voice')`
    ),
    check("astro_diary_media_authorities_private_check", sql`${table.visibility} = 'private'`),
    check(
      "astro_diary_media_authorities_state_check",
      sql`(
        ${table.state} = 'pending' and ${table.readyAt} is null
        and ${table.boundItemId} is null and ${table.boundAt} is null
      ) or (
        ${table.state} = 'ready' and ${table.readyAt} is not null
        and ${table.boundItemId} is null and ${table.boundAt} is null
      ) or (
        ${table.state} = 'bound' and ${table.readyAt} is not null
        and ${table.boundItemId} is not null and ${table.boundAt} is not null
        and ${table.boundAt} >= ${table.readyAt}
      ) or (
        ${table.state} = 'failed' and ${table.readyAt} is null
        and ${table.boundItemId} is null and ${table.boundAt} is null
      ) or (
        ${table.state} = 'deleted'
        and ((${table.boundItemId} is null) = (${table.boundAt} is null))
      )`
    ),
    check(
      "astro_diary_media_authorities_time_check",
      sql`${table.updatedAt} >= ${table.createdAt}
        and (${table.readyAt} is null or ${table.readyAt} >= ${table.createdAt})`
    ),
    index("astro_diary_media_authorities_journal_owner_state_idx").on(
      table.journalId,
      table.ownerUserId,
      table.state,
      table.mediaId
    )
  ]
);
