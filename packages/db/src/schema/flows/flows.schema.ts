import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { flowApprovalModeValues, flowStatusValues, formatFlowSqlValues } from "./flows-values";

export const flows = pgTable(
  "flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    approvalMode: text("approval_mode").notNull().default("manual_approve"),
    draftGraph: jsonb("draft_graph").notNull(),
    publishedVersionId: uuid("published_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true })
  },
  (table) => [
    check("flows_name_length_check", sql`length(trim(${table.name})) between 1 and 180`),
    check("flows_status_check", sql`${table.status} in ${sql.raw(formatFlowSqlValues(flowStatusValues))}`),
    check(
      "flows_approval_mode_check",
      sql`${table.approvalMode} in ${sql.raw(formatFlowSqlValues(flowApprovalModeValues))}`
    ),
    check("flows_draft_graph_object_check", sql`jsonb_typeof(${table.draftGraph}) = 'object'`),
    index("flows_owner_status_updated_idx").on(table.ownerUserId, table.status, table.updatedAt),
    index("flows_owner_name_idx").on(table.ownerUserId, table.name)
  ]
);
