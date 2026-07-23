import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { messagingExternalIdentities } from "./external-identities.schema";
import { formatMessagingSqlValues, messagingProviderValues } from "./messaging-values";
import { messagingThreads } from "./threads.schema";

export const messagingThreadIdentities = pgTable(
  "messaging_thread_identities",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => messagingThreads.id, { onDelete: "cascade" }),
    externalIdentityId: uuid("external_identity_id").notNull(),
    provider: text("provider").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.externalIdentityId, table.provider],
      foreignColumns: [messagingExternalIdentities.id, messagingExternalIdentities.provider],
      name: "messaging_thread_identities_external_identity_provider_fk"
    }).onDelete("cascade"),
    uniqueIndex("messaging_thread_identities_thread_identity_unique").on(
      table.threadId,
      table.externalIdentityId
    ),
    uniqueIndex("messaging_thread_identities_external_identity_unique").on(
      table.externalIdentityId
    ),
    check(
      "messaging_thread_identities_provider_check",
      sql`${table.provider} in ${sql.raw(formatMessagingSqlValues(messagingProviderValues))}`
    ),
    uniqueIndex("messaging_thread_identities_primary_thread_provider_unique")
      .on(table.threadId, table.provider)
      .where(sql`${table.isPrimary} = true`)
  ]
);
