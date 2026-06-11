import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const userStatusValues = ["active", "suspended", "deleted"] as const;
export type UserStatus = (typeof userStatusValues)[number];

export const identityProviderValues = ["email", "phone", "telegram", "google", "apple"] as const;
export type IdentityProvider = (typeof identityProviderValues)[number];

export const databasePlatformRoleValues = [
  "client",
  "astrologer",
  "moderator",
  "admin",
  "super_admin"
] as const;
export type DatabasePlatformRole = (typeof databasePlatformRoleValues)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: text("status").notNull().default("active"),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
    deletionScheduledAt: timestamp("deletion_scheduled_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("users_status_check", sql`${table.status} in ('active', 'suspended', 'deleted')`),
    check(
      "users_deletion_schedule_check",
      sql`${table.deletionScheduledAt} is null or ${table.deletionRequestedAt} is not null`
    ),
    check(
      "users_deleted_at_check",
      sql`${table.deletedAt} is null or ${table.deletionRequestedAt} is not null`
    )
  ]
);

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

export const userRoleAssignments = pgTable(
  "user_role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "user_role_assignments_role_check",
      sql`${table.role} in ('client', 'astrologer', 'moderator', 'admin', 'super_admin')`
    ),
    uniqueIndex("user_role_assignments_user_role_unique").on(table.userId, table.role),
    index("user_role_assignments_role_index").on(table.role)
  ]
);
