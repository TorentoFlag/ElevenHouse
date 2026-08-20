import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { clientAstrologerRelationships } from "./client-astrologer-relationships.schema";

export const clientCrmPrivateProfiles = pgTable(
  "client_crm_private_profiles",
  {
    relationshipId: uuid("relationship_id").primaryKey(),
    clientUserId: uuid("client_user_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.relationshipId, table.clientUserId, table.astrologerUserId],
      foreignColumns: [
        clientAstrologerRelationships.id,
        clientAstrologerRelationships.clientUserId,
        clientAstrologerRelationships.astrologerUserId
      ],
      name: "client_crm_private_profiles_relationship_pair_fk"
    }).onDelete("cascade"),
    index("client_crm_private_profiles_astrologer_client_idx").on(
      table.astrologerUserId,
      table.clientUserId
    ),
    check(
      "client_crm_private_profiles_note_length_check",
      sql`${table.note} is null or length(${table.note}) <= 2000`
    )
  ]
);

export const clientCrmPrivateTags = pgTable(
  "client_crm_private_tags",
  {
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => clientCrmPrivateProfiles.relationshipId, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [table.relationshipId, table.tag],
      name: "client_crm_private_tags_relationship_tag_pk"
    }),
    uniqueIndex("client_crm_private_tags_relationship_lower_tag_unique").on(
      table.relationshipId,
      sql`lower(${table.tag})`
    ),
    check(
      "client_crm_private_tags_tag_length_check",
      sql`length(trim(${table.tag})) between 1 and 64`
    )
  ]
);
