import { sql } from "drizzle-orm";
import type { FlowDefinitionOriginV1 } from "@elevenhouse/contracts";
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
import {
  flowApprovalModeValues,
  flowDefinitionStateValues,
  flowStatusValues,
  formatFlowSqlValues
} from "./flows-values";

type FlowVersionsPublishedReference = {
  readonly flowId: AnyPgColumn;
  readonly id: AnyPgColumn;
  readonly ownerUserId: AnyPgColumn;
  readonly publishedAt: AnyPgColumn;
};

export const flows = pgTable(
  "flows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    origin: jsonb("origin").$type<FlowDefinitionOriginV1>(),
    status: text("status").notNull().default("draft"),
    definitionState: text("definition_state").notNull().default("draft"),
    approvalMode: text("approval_mode").notNull().default("manual_approve"),
    revision: integer("revision").notNull().default(1),
    draftBaseVersionId: uuid("draft_base_version_id"),
    draftGraph: jsonb("draft_graph").notNull(),
    draftPresentation: jsonb("draft_presentation"),
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
        columns: [table.id, table.publishedVersionId, table.ownerUserId, table.publishedAt],
        foreignColumns: [
          publishedVersion.flowId,
          publishedVersion.id,
          publishedVersion.ownerUserId,
          publishedVersion.publishedAt
        ],
        name: "flows_published_version_owner_fk"
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.id, table.draftBaseVersionId, table.ownerUserId],
        foreignColumns: [
          publishedVersion.flowId,
          publishedVersion.id,
          publishedVersion.ownerUserId
        ],
        name: "flows_draft_base_version_owner_fk"
      }).onDelete("restrict"),
      check("flows_name_length_check", sql`length(trim(${table.name})) between 1 and 180`),
      check(
        "flows_status_check",
        sql`${table.status} in ${sql.raw(formatFlowSqlValues(flowStatusValues))}`
      ),
      check(
        "flows_definition_state_check",
        sql`${table.definitionState} in ${sql.raw(formatFlowSqlValues(flowDefinitionStateValues))}`
      ),
      check("flows_revision_check", sql`${table.revision} > 0`),
      check(
        "flows_definition_lifecycle_check",
        sql`(
          ${table.definitionState} = 'draft'
          and (
            (
              ${table.publishedVersionId} is null
              and ${table.publishedAt} is null
              and ${table.draftBaseVersionId} is null
            ) or (
              ${table.publishedVersionId} is not null
              and ${table.publishedAt} is not null
              and ${table.draftBaseVersionId} = ${table.publishedVersionId}
            )
          )
        ) or (
          ${table.definitionState} = 'versioned'
          and ${table.publishedVersionId} is not null
          and ${table.publishedAt} is not null
          and ${table.draftBaseVersionId} is null
        ) or (
          ${table.definitionState} = 'archived'
          and (
            (
              ${table.publishedVersionId} is null
              and ${table.publishedAt} is null
              and ${table.draftBaseVersionId} is null
            ) or (
              ${table.publishedVersionId} is not null
              and ${table.publishedAt} is not null
              and (
                ${table.draftBaseVersionId} is null
                or ${table.draftBaseVersionId} = ${table.publishedVersionId}
              )
            )
          )
        )`
      ),
      check(
        "flows_approval_mode_check",
        sql`${table.approvalMode} in ${sql.raw(formatFlowSqlValues(flowApprovalModeValues))}`
      ),
      check("flows_draft_graph_object_check", sql`jsonb_typeof(${table.draftGraph}) = 'object'`),
      check(
        "flows_graph_origin_check",
        sql`(
          ${table.draftGraph}->>'schemaVersion' = 'flow-graph.v1'
          and ${table.origin} is null
          and ${table.draftPresentation} is null
        ) or (
          ${table.draftGraph}->>'schemaVersion' = 'flow-graph.v2'
          and jsonb_typeof(${table.origin}) = 'object'
          and ${table.origin}->>'schemaVersion' = 'flow-definition-origin.v1'
          and ${table.origin}->>'type' in ('blank', 'template', 'migration')
        )`
      ),
      check(
        "flows_draft_presentation_object_check",
        sql`${table.draftPresentation} is null or jsonb_typeof(${table.draftPresentation}) = 'object'`
      ),
      index("flows_owner_status_updated_idx").on(table.ownerUserId, table.status, table.updatedAt),
      index("flows_owner_definition_state_updated_idx").on(
        table.ownerUserId,
        table.definitionState,
        table.updatedAt,
        table.id
      ),
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
    sourceRevision: integer("source_revision"),
    approvalMode: text("approval_mode").notNull(),
    graphSchemaVersion: text("graph_schema_version"),
    graph: jsonb("graph").notNull(),
    presentation: jsonb("presentation"),
    capabilityManifest: jsonb("capability_manifest"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("flow_versions_id_owner_unique").on(table.id, table.ownerUserId),
    unique("flow_versions_flow_id_id_owner_unique").on(table.flowId, table.id, table.ownerUserId),
    unique("flow_versions_flow_id_id_owner_published_unique").on(
      table.flowId,
      table.id,
      table.ownerUserId,
      table.publishedAt
    ),
    foreignKey({
      columns: [table.flowId, table.ownerUserId],
      foreignColumns: [flows.id, flows.ownerUserId],
      name: "flow_versions_flow_owner_fk"
    }).onDelete("cascade"),
    check("flow_versions_positive_version_check", sql`${table.version} > 0`),
    check(
      "flow_versions_source_revision_check",
      sql`${table.sourceRevision} is null or ${table.sourceRevision} > 0`
    ),
    check(
      "flow_versions_approval_mode_check",
      sql`${table.approvalMode} in ${sql.raw(formatFlowSqlValues(flowApprovalModeValues))}`
    ),
    check("flow_versions_graph_object_check", sql`jsonb_typeof(${table.graph}) = 'object'`),
    check(
      "flow_versions_presentation_object_check",
      sql`${table.presentation} is null or jsonb_typeof(${table.presentation}) = 'object'`
    ),
    check(
      "flow_versions_v2_metadata_check",
      sql`(
        ${table.sourceRevision} is null
        and ${table.graphSchemaVersion} is null
        and ${table.capabilityManifest} is null
      ) or (
        ${table.sourceRevision} > 0
        and ${table.graphSchemaVersion} = 'flow-graph.v2'
        and ${table.graph}->>'schemaVersion' = 'flow-graph.v2'
        and jsonb_typeof(${table.capabilityManifest}) = 'object'
      )`
    ),
    index("flow_versions_owner_published_idx").on(table.ownerUserId, table.publishedAt),
    uniqueIndex("flow_versions_flow_version_unique").on(table.flowId, table.version),
    uniqueIndex("flow_versions_flow_source_revision_unique")
      .on(table.flowId, table.sourceRevision)
      .where(sql`${table.sourceRevision} is not null`)
  ]
);

function flowVersionsForPublishedReference(): FlowVersionsPublishedReference {
  return flowVersions as unknown as FlowVersionsPublishedReference;
}
