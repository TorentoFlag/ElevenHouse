import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./accounts.schema";

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    email: text("email"),
    phoneNumber: text("phone_number"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "auth_identities_provider_check",
      sql`${table.provider} in ('email', 'phone', 'telegram', 'google', 'apple')`
    ),
    check(
      "auth_identities_email_provider_email_check",
      sql`${table.provider} <> 'email' or ${table.email} is not null`
    ),
    check(
      "auth_identities_phone_provider_phone_check",
      sql`${table.provider} <> 'phone' or ${table.phoneNumber} is not null`
    ),
    uniqueIndex("auth_identities_provider_subject_unique").on(
      table.provider,
      table.providerSubject
    ),
    uniqueIndex("auth_identities_email_login_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.provider} = 'email' and ${table.email} is not null`),
    uniqueIndex("auth_identities_phone_login_unique")
      .on(table.phoneNumber)
      .where(sql`${table.provider} = 'phone' and ${table.phoneNumber} is not null`),
    index("auth_identities_user_id_index").on(table.userId),
    index("auth_identities_email_index").on(table.email),
    index("auth_identities_phone_number_index").on(table.phoneNumber)
  ]
);
