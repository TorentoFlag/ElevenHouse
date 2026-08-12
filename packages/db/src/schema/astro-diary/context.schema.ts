import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

import { clientBirthDataHistory } from "../clients/client-birth-data.schema";
import { users } from "../identity/accounts.schema";
import { astroDiaryJournals } from "./core.schema";
import { astroDiaryTimelineItemRevisions } from "./timeline.schema";

export const astroDiaryContextSnapshots = pgTable(
  "astro_diary_context_snapshots",
  {
    id: uuid("id").primaryKey(),
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    itemId: uuid("item_id").notNull(),
    sourceItemRevision: integer("source_item_revision").notNull(),
    sourceItemDigest: varchar("source_item_digest", { length: 71 }).notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
    eventTimezone: text("event_timezone").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    engineRevision: text("engine_revision"),
    globalContextRef: uuid("global_context_ref"),
    birthProfileId: uuid("birth_profile_id"),
    birthProfileRevision: integer("birth_profile_revision"),
    personalChartRef: uuid("personal_chart_ref"),
    contextDigest: varchar("context_digest", { length: 71 }),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }),
    failureCode: varchar("failure_code", { length: 160 })
  },
  (table) => [
    unique("astro_diary_context_snapshots_source_unique").on(
      table.itemId,
      table.sourceItemRevision
    ),
    unique("astro_diary_context_snapshots_journal_identity_unique").on(table.id, table.journalId),
    unique("astro_diary_context_snapshots_version_journal_unique").on(
      table.id,
      table.version,
      table.journalId
    ),
    foreignKey({
      columns: [table.itemId, table.sourceItemRevision, table.journalId],
      foreignColumns: [
        astroDiaryTimelineItemRevisions.itemId,
        astroDiaryTimelineItemRevisions.revision,
        astroDiaryTimelineItemRevisions.journalId
      ],
      name: "astro_diary_context_snapshots_source_revision_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.birthProfileId, table.birthProfileRevision],
      foreignColumns: [clientBirthDataHistory.birthDataId, clientBirthDataHistory.revision],
      name: "astro_diary_context_snapshots_birth_profile_revision_fk"
    }).onDelete("restrict"),
    check("astro_diary_context_snapshots_version_check", sql`${table.version} >= 1`),
    check(
      "astro_diary_context_snapshots_source_digest_check",
      sql`${table.sourceItemDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "astro_diary_context_snapshots_event_timezone_check",
      sql`length(trim(${table.eventTimezone})) between 1 and 100`
    ),
    check(
      "astro_diary_context_snapshots_shape_check",
      sql`(
        ${table.status} = 'pending'
        and ${table.engineRevision} is null
        and ${table.globalContextRef} is null
        and ${table.birthProfileId} is null
        and ${table.birthProfileRevision} is null
        and ${table.personalChartRef} is null
        and ${table.contextDigest} is null
        and ${table.calculatedAt} is null
        and ${table.failureCode} is null
      ) or (
        ${table.status} = 'global_only'
        and length(trim(${table.engineRevision})) between 1 and 200
        and ${table.globalContextRef} is not null
        and ${table.birthProfileId} is null
        and ${table.birthProfileRevision} is null
        and ${table.personalChartRef} is null
        and ${table.contextDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.calculatedAt} is not null
        and ${table.failureCode} is null
      ) or (
        ${table.status} = 'personal'
        and length(trim(${table.engineRevision})) between 1 and 200
        and ${table.globalContextRef} is not null
        and ${table.birthProfileId} is not null
        and ${table.birthProfileRevision} >= 1
        and ${table.personalChartRef} is not null
        and ${table.contextDigest} ~ '^sha256:[a-f0-9]{64}$'
        and ${table.calculatedAt} is not null
        and ${table.failureCode} is null
      ) or (
        ${table.status} in ('failed', 'source_stale')
        and ${table.engineRevision} is null
        and ${table.globalContextRef} is null
        and ${table.birthProfileId} is null
        and ${table.birthProfileRevision} is null
        and ${table.personalChartRef} is null
        and ${table.contextDigest} is null
        and ${table.calculatedAt} is not null
        and length(trim(${table.failureCode})) between 1 and 160
        and (${table.status} <> 'source_stale' or ${table.failureCode} = 'source_stale')
      )`
    ),
    index("astro_diary_context_snapshots_journal_status_idx").on(
      table.journalId,
      table.status,
      table.itemId
    )
  ]
);

const zodiacSignCheckSql = (column: AnyPgColumn) =>
  sql`${column} in (
    'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
    'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
  )`;

export const astroDiaryContextDisplays = pgTable(
  "astro_diary_context_displays",
  {
    contextId: uuid("context_id").notNull(),
    contextVersion: integer("context_version").notNull(),
    journalId: uuid("journal_id").notNull(),
    sourceContextDigest: varchar("source_context_digest", { length: 71 }).notNull(),
    lunarPhaseId: text("lunar_phase_id").notNull(),
    moonSign: text("moon_sign").notNull(),
    birthProfileRevision: integer("birth_profile_revision")
  },
  (table) => [
    primaryKey({
      columns: [table.contextId, table.contextVersion],
      name: "astro_diary_context_displays_pk"
    }),
    unique("astro_diary_context_displays_version_journal_unique").on(
      table.contextId,
      table.contextVersion,
      table.journalId
    ),
    foreignKey({
      columns: [table.contextId, table.contextVersion, table.journalId],
      foreignColumns: [
        astroDiaryContextSnapshots.id,
        astroDiaryContextSnapshots.version,
        astroDiaryContextSnapshots.journalId
      ],
      name: "astro_diary_context_displays_snapshot_version_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_context_displays_digest_check",
      sql`${table.sourceContextDigest} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    check(
      "astro_diary_context_displays_phase_check",
      sql`${table.lunarPhaseId} in (
        'new_moon', 'waxing_crescent', 'first_quarter', 'waxing_gibbous',
        'full_moon', 'waning_gibbous', 'last_quarter', 'waning_crescent'
      )`
    ),
    check("astro_diary_context_displays_moon_sign_check", zodiacSignCheckSql(table.moonSign)),
    check(
      "astro_diary_context_displays_birth_revision_check",
      sql`${table.birthProfileRevision} is null or ${table.birthProfileRevision} >= 1`
    )
  ]
);

export const astroDiaryContextDisplayTransits = pgTable(
  "astro_diary_context_display_transits",
  {
    contextId: uuid("context_id").notNull(),
    contextVersion: integer("context_version").notNull(),
    journalId: uuid("journal_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    transitPoint: varchar("transit_point", { length: 80 }).notNull(),
    natalPoint: varchar("natal_point", { length: 80 }),
    aspect: varchar("aspect", { length: 80 }),
    sign: text("sign").notNull(),
    applying: boolean("applying")
  },
  (table) => [
    primaryKey({
      columns: [table.contextId, table.contextVersion, table.ordinal],
      name: "astro_diary_context_display_transits_pk"
    }),
    foreignKey({
      columns: [table.contextId, table.contextVersion, table.journalId],
      foreignColumns: [
        astroDiaryContextDisplays.contextId,
        astroDiaryContextDisplays.contextVersion,
        astroDiaryContextDisplays.journalId
      ],
      name: "astro_diary_context_display_transits_display_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_context_display_transits_ordinal_check",
      sql`${table.ordinal} between 0 and 19`
    ),
    check(
      "astro_diary_context_display_transits_point_check",
      sql`length(trim(${table.transitPoint})) between 1 and 80
        and (${table.natalPoint} is null or length(trim(${table.natalPoint})) between 1 and 80)
        and (${table.aspect} is null or length(trim(${table.aspect})) between 1 and 80)`
    ),
    check("astro_diary_context_display_transits_sign_check", zodiacSignCheckSql(table.sign))
  ]
);

export const astroDiaryContextDisplayPersonalHighlights = pgTable(
  "astro_diary_context_display_personal_highlights",
  {
    contextId: uuid("context_id").notNull(),
    contextVersion: integer("context_version").notNull(),
    journalId: uuid("journal_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    transitPoint: varchar("transit_point", { length: 80 }).notNull(),
    natalPoint: varchar("natal_point", { length: 80 }).notNull(),
    aspect: varchar("aspect", { length: 80 }).notNull(),
    applying: boolean("applying")
  },
  (table) => [
    primaryKey({
      columns: [table.contextId, table.contextVersion, table.ordinal],
      name: "astro_diary_context_display_personal_highlights_pk"
    }),
    foreignKey({
      columns: [table.contextId, table.contextVersion, table.journalId],
      foreignColumns: [
        astroDiaryContextDisplays.contextId,
        astroDiaryContextDisplays.contextVersion,
        astroDiaryContextDisplays.journalId
      ],
      name: "astro_diary_context_display_personal_highlights_display_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_context_display_personal_highlights_ordinal_check",
      sql`${table.ordinal} between 0 and 19`
    ),
    check(
      "astro_diary_context_display_personal_highlights_points_check",
      sql`length(trim(${table.transitPoint})) between 1 and 80
        and length(trim(${table.natalPoint})) between 1 and 80
        and length(trim(${table.aspect})) between 1 and 80`
    )
  ]
);

export const astroDiaryContextInvalidations = pgTable(
  "astro_diary_context_invalidations",
  {
    itemId: uuid("item_id").notNull(),
    journalId: uuid("journal_id").notNull(),
    previousRevision: integer("previous_revision").notNull(),
    nextRevision: integer("next_revision").notNull(),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.itemId, table.previousRevision, table.nextRevision],
      name: "astro_diary_context_invalidations_pk"
    }),
    foreignKey({
      columns: [table.itemId, table.previousRevision, table.journalId],
      foreignColumns: [
        astroDiaryTimelineItemRevisions.itemId,
        astroDiaryTimelineItemRevisions.revision,
        astroDiaryTimelineItemRevisions.journalId
      ],
      name: "astro_diary_context_invalidations_previous_revision_fk"
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.itemId, table.nextRevision, table.journalId],
      foreignColumns: [
        astroDiaryTimelineItemRevisions.itemId,
        astroDiaryTimelineItemRevisions.revision,
        astroDiaryTimelineItemRevisions.journalId
      ],
      name: "astro_diary_context_invalidations_next_revision_fk"
    }).onDelete("restrict"),
    check(
      "astro_diary_context_invalidations_contiguous_revision_check",
      sql`${table.previousRevision} >= 1 and ${table.nextRevision} = ${table.previousRevision} + 1`
    )
  ]
);

export const astroDiaryReadCursors = pgTable(
  "astro_diary_read_cursors",
  {
    journalId: uuid("journal_id")
      .notNull()
      .references(() => astroDiaryJournals.id, { onDelete: "restrict" }),
    participantUserId: uuid("participant_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lastReadCursor: bigint("last_read_cursor", { mode: "number" }).notNull(),
    version: integer("version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    primaryKey({
      columns: [table.journalId, table.participantUserId],
      name: "astro_diary_read_cursors_pk"
    }),
    check("astro_diary_read_cursors_cursor_check", sql`${table.lastReadCursor} >= 0`),
    check(
      "astro_diary_read_cursors_cursor_safe_integer_check",
      sql`${table.lastReadCursor} <= 9007199254740991`
    ),
    check("astro_diary_read_cursors_version_check", sql`${table.version} >= 1`),
    index("astro_diary_read_cursors_participant_idx").on(
      table.participantUserId,
      table.updatedAt,
      table.journalId
    )
  ]
);
