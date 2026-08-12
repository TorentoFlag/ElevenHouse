import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { users } from "../identity/accounts.schema";
import { mediaAssets } from "../media/media-assets.schema";
import { astroDiaryCycles, astroDiaryJournals } from "./core.schema";
import { astroDiaryMediaAuthorities } from "./media.schema";

const visibleKindsSql = "('client_entry', 'astrologer_reply', 'reflection_prompt', 'correction')";
const moodsSql = "('inspired', 'joy', 'calm', 'tired', 'anxious', 'sad')";
const contextStatusesSql = "('pending', 'global_only', 'personal', 'failed', 'source_stale')";

export const astroDiaryTimelineItems = pgTable(
  "astro_diary_timeline_items",
  {
    id: uuid("id").primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    cycleId: uuid("cycle_id").notNull(),
    currentRevision: integer("current_revision").notNull(),
    cursor: bigint("cursor", { mode: "number" }).notNull(),
    kind: text("kind").notNull(),
    originalKind: text("original_kind"),
    authorRole: text("author_role").notNull(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body"),
    moodId: text("mood_id"),
    contextStatus: text("context_status"),
    correctsItemId: uuid("corrects_item_id"),
    tombstoneReason: text("tombstone_reason"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("astro_diary_timeline_items_journal_identity_unique").on(table.id, table.journalId),
    unique("astro_diary_timeline_items_revision_identity_unique").on(
      table.id,
      table.currentRevision
    ),
    foreignKey({
      columns: [table.cycleId, table.journalId],
      foreignColumns: [astroDiaryCycles.id, astroDiaryCycles.journalId],
      name: "astro_diary_timeline_items_cycle_journal_fk"
    }).onDelete("restrict"),
    check("astro_diary_timeline_items_revision_check", sql`${table.currentRevision} >= 1`),
    check("astro_diary_timeline_items_cursor_check", sql`${table.cursor} >= 1`),
    check(
      "astro_diary_timeline_items_cursor_safe_integer_check",
      sql`${table.cursor} <= 9007199254740991`
    ),
    check(
      "astro_diary_timeline_items_shape_check",
      sql`(
        ${table.kind} = 'client_entry'
        and ${table.authorRole} = 'client'
        and ${table.body} is not null
        and length(trim(${table.body})) between 1 and 20000
        and (${table.moodId} is null or ${table.moodId} in ${sql.raw(moodsSql)})
        and ${table.contextStatus} in ${sql.raw(contextStatusesSql)}
        and ${table.correctsItemId} is null
        and ${table.originalKind} is null
        and ${table.tombstoneReason} is null
      ) or (
        ${table.kind} in ('astrologer_reply', 'reflection_prompt')
        and ${table.authorRole} = 'astrologer'
        and ${table.body} is not null
        and length(trim(${table.body})) between 1 and 20000
        and ${table.moodId} is null
        and ${table.contextStatus} is null
        and ${table.correctsItemId} is null
        and ${table.originalKind} is null
        and ${table.tombstoneReason} is null
      ) or (
        ${table.kind} = 'correction'
        and ${table.authorRole} in ('client', 'astrologer')
        and ${table.body} is not null
        and length(trim(${table.body})) between 1 and 20000
        and ${table.moodId} is null
        and ${table.contextStatus} is null
        and ${table.correctsItemId} is not null
        and ${table.correctsItemId} <> ${table.id}
        and ${table.originalKind} is null
        and ${table.tombstoneReason} is null
      ) or (
        ${table.kind} = 'tombstone'
        and ${table.authorRole} in ('client', 'astrologer')
        and ${table.body} is null
        and ${table.moodId} is null
        and ${table.contextStatus} is null
        and ${table.correctsItemId} is null
        and ${table.originalKind} in ${sql.raw(visibleKindsSql)}
        and ${table.tombstoneReason} in ('hidden_by_author', 'content_erased')
        and ${table.editedAt} is null
      )`
    ),
    uniqueIndex("astro_diary_timeline_items_server_cursor_unique").on(
      table.journalId,
      table.cursor
    ),
    index("astro_diary_timeline_items_journal_cursor_idx").on(
      table.journalId,
      table.cursor,
      table.id
    )
  ]
);

export const astroDiaryTimelineItemRevisions = pgTable(
  "astro_diary_timeline_item_revisions",
  {
    itemId: uuid("item_id").notNull(),
    journalId: uuid("journal_id").notNull(),
    cycleId: uuid("cycle_id").notNull(),
    revision: integer("revision").notNull(),
    cursor: bigint("cursor", { mode: "number" }).notNull(),
    kind: text("kind").notNull(),
    originalKind: text("original_kind"),
    authorRole: text("author_role").notNull(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body"),
    moodId: text("mood_id"),
    contextStatus: text("context_status"),
    correctsItemId: uuid("corrects_item_id"),
    tombstoneReason: text("tombstone_reason"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    sourceDigest: varchar("source_digest", { length: 71 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.itemId, table.revision],
      name: "astro_diary_timeline_item_revisions_pk"
    }),
    unique("astro_diary_timeline_item_revisions_journal_identity_unique").on(
      table.itemId,
      table.revision,
      table.journalId
    ),
    foreignKey({
      columns: [table.itemId, table.journalId],
      foreignColumns: [astroDiaryTimelineItems.id, astroDiaryTimelineItems.journalId],
      name: "astro_diary_timeline_item_revisions_item_journal_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.cycleId, table.journalId],
      foreignColumns: [astroDiaryCycles.id, astroDiaryCycles.journalId],
      name: "astro_diary_timeline_item_revisions_cycle_journal_fk"
    }).onDelete("restrict"),
    check("astro_diary_timeline_item_revisions_revision_check", sql`${table.revision} >= 1`),
    check("astro_diary_timeline_item_revisions_cursor_check", sql`${table.cursor} >= 1`),
    check(
      "astro_diary_timeline_item_revisions_digest_check",
      sql`${table.sourceDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "astro_diary_timeline_item_revisions_shape_check",
      sql`(
        ${table.kind} = 'client_entry'
        and ${table.authorRole} = 'client'
        and ${table.body} is not null
        and length(trim(${table.body})) between 1 and 20000
        and (${table.moodId} is null or ${table.moodId} in ${sql.raw(moodsSql)})
        and ${table.contextStatus} in ${sql.raw(contextStatusesSql)}
        and ${table.correctsItemId} is null
        and ${table.originalKind} is null
        and ${table.tombstoneReason} is null
      ) or (
        ${table.kind} in ('astrologer_reply', 'reflection_prompt')
        and ${table.authorRole} = 'astrologer'
        and ${table.body} is not null
        and length(trim(${table.body})) between 1 and 20000
        and ${table.moodId} is null
        and ${table.contextStatus} is null
        and ${table.correctsItemId} is null
        and ${table.originalKind} is null
        and ${table.tombstoneReason} is null
      ) or (
        ${table.kind} = 'correction'
        and ${table.authorRole} in ('client', 'astrologer')
        and ${table.body} is not null
        and length(trim(${table.body})) between 1 and 20000
        and ${table.moodId} is null
        and ${table.contextStatus} is null
        and ${table.correctsItemId} is not null
        and ${table.correctsItemId} <> ${table.itemId}
        and ${table.originalKind} is null
        and ${table.tombstoneReason} is null
      ) or (
        ${table.kind} = 'tombstone'
        and ${table.authorRole} in ('client', 'astrologer')
        and ${table.body} is null
        and ${table.moodId} is null
        and ${table.contextStatus} is null
        and ${table.correctsItemId} is null
        and ${table.originalKind} in ${sql.raw(visibleKindsSql)}
        and ${table.tombstoneReason} in ('hidden_by_author', 'content_erased')
        and ${table.editedAt} is null
      )`
    ),
    index("astro_diary_timeline_item_revisions_journal_recorded_idx").on(
      table.journalId,
      table.recordedAt,
      table.itemId,
      table.revision
    )
  ]
);

export const astroDiaryTimelineRevisionAttachments = pgTable(
  "astro_diary_timeline_revision_attachments",
  {
    itemId: uuid("item_id").notNull(),
    revision: integer("revision").notNull(),
    journalId: uuid("journal_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" })
  },
  (table) => [
    primaryKey({
      columns: [table.itemId, table.revision, table.ordinal],
      name: "astro_diary_timeline_revision_attachments_pk"
    }),
    unique("astro_diary_timeline_revision_attachments_media_unique").on(
      table.itemId,
      table.revision,
      table.mediaId
    ),
    foreignKey({
      columns: [table.itemId, table.revision, table.journalId],
      foreignColumns: [
        astroDiaryTimelineItemRevisions.itemId,
        astroDiaryTimelineItemRevisions.revision,
        astroDiaryTimelineItemRevisions.journalId
      ],
      name: "astro_diary_timeline_revision_attachments_revision_journal_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_timeline_revision_attachments_ordinal_check",
      sql`${table.ordinal} between 0 and 19`
    )
  ]
);

export const astroDiaryDrafts = pgTable(
  "astro_diary_drafts",
  {
    id: uuid("id").primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    cycleId: uuid("cycle_id"),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    authorRole: text("author_role").notNull(),
    kind: text("kind").notNull(),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    moodId: text("mood_id"),
    correctsItemId: uuid("corrects_item_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("astro_diary_drafts_journal_identity_unique").on(table.id, table.journalId),
    unique("astro_diary_drafts_author_purpose_unique")
      .on(
        table.journalId,
        table.authorUserId,
        table.kind,
        table.cycleId,
        table.correctsItemId
      )
      .nullsNotDistinct(),
    foreignKey({
      columns: [table.cycleId, table.journalId],
      foreignColumns: [astroDiaryCycles.id, astroDiaryCycles.journalId],
      name: "astro_diary_drafts_cycle_journal_fk"
    }).onDelete("restrict"),
    check("astro_diary_drafts_version_check", sql`${table.version} >= 1`),
    check("astro_diary_drafts_body_check", sql`char_length(${table.body}) <= 20000`),
    check(
      "astro_diary_drafts_shape_check",
      sql`(
        ${table.kind} = 'client_entry' and ${table.authorRole} = 'client'
        and (${table.moodId} is null or ${table.moodId} in ${sql.raw(moodsSql)})
        and ${table.correctsItemId} is null
      ) or (
        ${table.kind} in ('astrologer_reply', 'reflection_prompt')
        and ${table.authorRole} = 'astrologer'
        and ${table.moodId} is null and ${table.correctsItemId} is null
      ) or (
        ${table.kind} = 'correction'
        and ${table.authorRole} in ('client', 'astrologer')
        and ${table.moodId} is null and ${table.correctsItemId} is not null
      )`
    ),
    index("astro_diary_drafts_author_updated_idx").on(
      table.journalId,
      table.authorUserId,
      table.updatedAt,
      table.id
    )
  ]
);

export const astroDiaryDraftVersionFacts = pgTable(
  "astro_diary_draft_version_facts",
  {
    draftId: uuid("draft_id").notNull(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.draftId, table.version],
      name: "astro_diary_draft_version_facts_pk"
    }),
    unique("astro_diary_draft_version_facts_result_identity_unique").on(
      table.draftId,
      table.version,
      table.journalId
    ),
    check("astro_diary_draft_version_facts_version_check", sql`${table.version} >= 1`)
  ]
);

export const astroDiaryDraftAttachments = pgTable(
  "astro_diary_draft_attachments",
  {
    draftId: uuid("draft_id").notNull(),
    journalId: uuid("journal_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    mediaId: uuid("media_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    purpose: text("purpose").notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.draftId, table.ordinal],
      name: "astro_diary_draft_attachments_pk"
    }),
    unique("astro_diary_draft_attachments_media_unique").on(table.draftId, table.mediaId),
    foreignKey({
      columns: [table.draftId, table.journalId],
      foreignColumns: [astroDiaryDrafts.id, astroDiaryDrafts.journalId],
      name: "astro_diary_draft_attachments_draft_journal_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.mediaId, table.ownerUserId],
      foreignColumns: [mediaAssets.id, mediaAssets.ownerUserId],
      name: "astro_diary_draft_attachments_media_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.mediaId, table.journalId, table.ownerUserId, table.purpose],
      foreignColumns: [
        astroDiaryMediaAuthorities.mediaId,
        astroDiaryMediaAuthorities.journalId,
        astroDiaryMediaAuthorities.ownerUserId,
        astroDiaryMediaAuthorities.purpose
      ],
      name: "astro_diary_draft_attachments_media_authority_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_draft_attachments_purpose_check",
      sql`${table.purpose} in ('astro_diary_attachment', 'astro_diary_voice')`
    ),
    check("astro_diary_draft_attachments_ordinal_check", sql`${table.ordinal} between 0 and 19`)
  ]
);

export const astroDiaryEntryAttachments = pgTable(
  "astro_diary_entry_attachments",
  {
    mediaId: uuid("media_id").primaryKey(),
    journalId: uuid("journal_id").notNull(),
    itemId: uuid("item_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    purpose: text("purpose").notNull(),
    state: text("state").notNull(),
    boundAt: timestamp("bound_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      columns: [table.itemId, table.journalId],
      foreignColumns: [astroDiaryTimelineItems.id, astroDiaryTimelineItems.journalId],
      name: "astro_diary_entry_attachments_item_journal_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.mediaId, table.ownerUserId],
      foreignColumns: [mediaAssets.id, mediaAssets.ownerUserId],
      name: "astro_diary_entry_attachments_media_owner_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.mediaId, table.journalId, table.ownerUserId, table.purpose],
      foreignColumns: [
        astroDiaryMediaAuthorities.mediaId,
        astroDiaryMediaAuthorities.journalId,
        astroDiaryMediaAuthorities.ownerUserId,
        astroDiaryMediaAuthorities.purpose
      ],
      name: "astro_diary_entry_attachments_media_authority_fk"
    }).onDelete("restrict"),
    unique("astro_diary_entry_attachments_exact_binding_unique").on(
      table.mediaId,
      table.itemId,
      table.journalId
    ),
    check(
      "astro_diary_entry_attachments_purpose_check",
      sql`${table.purpose} in ('astro_diary_attachment', 'astro_diary_voice')`
    ),
    check(
      "astro_diary_entry_attachments_state_check",
      sql`(${table.state} = 'bound' and ${table.releasedAt} is null)
        or (${table.state} = 'released' and ${table.releasedAt} is not null
          and ${table.releasedAt} >= ${table.boundAt})`
    ),
    index("astro_diary_entry_attachments_item_idx").on(table.itemId, table.mediaId)
  ]
);

export const astroDiaryMediaAccessRevocations = pgTable(
  "astro_diary_media_access_revocations",
  {
    mediaId: uuid("media_id").notNull(),
    itemId: uuid("item_id").notNull(),
    journalId: uuid("journal_id").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.mediaId, table.itemId],
      name: "astro_diary_media_access_revocations_pk"
    }),
    foreignKey({
      columns: [table.mediaId, table.itemId, table.journalId],
      foreignColumns: [
        astroDiaryEntryAttachments.mediaId,
        astroDiaryEntryAttachments.itemId,
        astroDiaryEntryAttachments.journalId
      ],
      name: "astro_diary_media_access_revocations_binding_fk"
    }).onDelete("restrict")
  ]
);

export const astroDiaryJournalMediaAccessRevocations = pgTable(
  "astro_diary_journal_media_access_revocations",
  {
    mediaId: uuid("media_id").notNull(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.mediaId, table.journalId],
      name: "astro_diary_journal_media_access_revocations_pk"
    }),
    foreignKey({
      columns: [table.mediaId, table.journalId],
      foreignColumns: [astroDiaryMediaAuthorities.mediaId, astroDiaryMediaAuthorities.journalId],
      name: "astro_diary_journal_media_access_revocations_authority_fk"
    }).onDelete("restrict")
  ]
);

export const astroDiaryItemReadAccessRevocations = pgTable(
  "astro_diary_item_read_access_revocations",
  {
    itemId: uuid("item_id").notNull(),
    sourceRevision: integer("source_revision").notNull(),
    journalId: uuid("journal_id").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.itemId, table.sourceRevision],
      name: "astro_diary_item_read_access_revocations_pk"
    }),
    foreignKey({
      columns: [table.itemId, table.sourceRevision, table.journalId],
      foreignColumns: [
        astroDiaryTimelineItemRevisions.itemId,
        astroDiaryTimelineItemRevisions.revision,
        astroDiaryTimelineItemRevisions.journalId
      ],
      name: "astro_diary_item_read_access_revocations_revision_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_item_read_access_revocations_revision_check",
      sql`${table.sourceRevision} >= 1`
    )
  ]
);
