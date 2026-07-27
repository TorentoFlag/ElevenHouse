import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { flows } from "./flows.schema";
import { flowApprovalModeValues, formatFlowSqlValues } from "./flows-values";

export const flowVersions = pgTable(
  "flow_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => flows.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    approvalMode: text("approval_mode").notNull(),
    graph: jsonb("graph").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull()
  },
  (table) => [
    check("flow_versions_positive_version_check", sql`${table.version} > 0`),
    check(
      "flow_versions_approval_mode_check",
      sql`${table.approvalMode} in ${sql.raw(formatFlowSqlValues(flowApprovalModeValues))}`
    ),
    check("flow_versions_graph_object_check", sql`jsonb_typeof(${table.graph}) = 'object'`),
    index("flow_versions_owner_published_idx").on(table.ownerUserId, table.publishedAt),
    uniqueIndex("flow_versions_flow_version_unique").on(table.flowId, table.version)
  ]
);
