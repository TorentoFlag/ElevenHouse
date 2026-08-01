import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { flowApprovalModeValues, flowStatusValues, formatFlowSqlValues } from "./flows-values";

type FlowVersionsPublishedReference = {
  readonly flowId: AnyPgColumn;
  readonly id: AnyPgColumn;
  readonly ownerUserId: AnyPgColumn;
};

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
  (table) => {
    const publishedVersion = flowVersionsForPublishedReference();

    return [
      unique("flows_id_owner_unique").on(table.id, table.ownerUserId),
      foreignKey({
        columns: [table.id, table.publishedVersionId, table.ownerUserId],
        foreignColumns: [publishedVersion.flowId, publishedVersion.id, publishedVersion.ownerUserId],
        name: "flows_published_version_owner_fk"
      }).onDelete("restrict"),
      check("flows_name_length_check", sql`length(trim(${table.name})) between 1 and 180`),
      check("flows_status_check", sql`${table.status} in ${sql.raw(formatFlowSqlValues(flowStatusValues))}`),
      check(
        "flows_approval_mode_check",
        sql`${table.approvalMode} in ${sql.raw(formatFlowSqlValues(flowApprovalModeValues))}`
      ),
      check("flows_draft_graph_object_check", sql`jsonb_typeof(${table.draftGraph}) = 'object'`),
      index("flows_owner_status_updated_idx").on(table.ownerUserId, table.status, table.updatedAt),
      index("flows_owner_name_idx").on(table.ownerUserId, table.name)
    ];
  }
);

export const flowVersions = pgTable(
  "flow_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id").notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    approvalMode: text("approval_mode").notNull(),
    graph: jsonb("graph").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("flow_versions_id_owner_unique").on(table.id, table.ownerUserId),
    unique("flow_versions_flow_id_id_owner_unique").on(table.flowId, table.id, table.ownerUserId),
    foreignKey({
      columns: [table.flowId, table.ownerUserId],
      foreignColumns: [flows.id, flows.ownerUserId],
      name: "flow_versions_flow_owner_fk"
    }).onDelete("cascade"),
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

function flowVersionsForPublishedReference(): FlowVersionsPublishedReference {
  return flowVersions as unknown as FlowVersionsPublishedReference;
}
