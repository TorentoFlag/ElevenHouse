import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { clientAstrologerRelationships } from "./client-astrologer-relationships.schema";

export const clientDataConsents = pgTable(
  "client_data_consents",
  {
    id: uuid("id").primaryKey(),
    relationshipId: uuid("relationship_id").notNull(),
    clientUserId: uuid("client_user_id").notNull(),
    astrologerUserId: uuid("astrologer_user_id").notNull(),
    purpose: text("purpose").notNull(),
    policyVersion: text("policy_version").notNull(),
    processorCode: text("processor_code").notNull(),
    noticeLocale: text("notice_locale").notNull(),
    noticeSha256: text("notice_sha256").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => [
    foreignKey({
      name: "client_data_consents_relationship_identity_fk",
      columns: [table.relationshipId, table.clientUserId, table.astrologerUserId],
      foreignColumns: [
        clientAstrologerRelationships.id,
        clientAstrologerRelationships.clientUserId,
        clientAstrologerRelationships.astrologerUserId
      ]
    }).onDelete("restrict"),
    uniqueIndex("client_data_consents_one_current_unique")
      .on(table.relationshipId, table.purpose)
      .where(sql`${table.revokedAt} is null`),
    index("client_data_consents_client_relationship_index").on(
      table.clientUserId,
      table.relationshipId,
      table.grantedAt
    ),
    index("client_data_consents_astrologer_client_index").on(
      table.astrologerUserId,
      table.clientUserId,
      table.grantedAt
    ),
    check(
      "client_data_consents_purpose_check",
      sql`length(trim(${table.purpose})) between 1 and 160`
    ),
    check(
      "client_data_consents_policy_version_check",
      sql`length(trim(${table.policyVersion})) between 1 and 160`
    ),
    check(
      "client_data_consents_processor_code_check",
      sql`length(trim(${table.processorCode})) between 1 and 80`
    ),
    check("client_data_consents_notice_locale_check", sql`${table.noticeLocale} in ('ru', 'en')`),
    check(
      "client_data_consents_notice_sha256_check",
      sql`${table.noticeSha256} ~ '^sha256:[0-9a-f]{64}$'`
    ),
    check(
      "client_data_consents_revocation_time_check",
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.grantedAt}`
    )
  ]
);
