import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

import { flowDefinitionCommands } from "./flow-definition-commands.schema";
import { flows, flowVersions } from "./flows.schema";

export const flowDefinitionMigrations = pgTable(
  "flow_definition_migrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flowId: uuid("flow_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    commandId: uuid("command_id").notNull(),
    sourceGraphSchemaVersion: text("source_graph_schema_version").notNull(),
    targetGraphSchemaVersion: text("target_graph_schema_version").notNull(),
    sourceVersionId: uuid("source_version_id"),
    sourceRevision: integer("source_revision").notNull(),
    sourceGraphHash: text("source_graph_hash").notNull(),
    targetRevision: integer("target_revision").notNull(),
    migratedAt: timestamp("migrated_at", { withTimezone: true }).notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.flowId, table.ownerUserId],
      foreignColumns: [flows.id, flows.ownerUserId],
      name: "flow_definition_migrations_flow_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.flowId, table.sourceVersionId, table.ownerUserId],
      foreignColumns: [flowVersions.flowId, flowVersions.id, flowVersions.ownerUserId],
      name: "flow_definition_migrations_source_version_owner_fk"
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.commandId, table.flowId, table.ownerUserId],
      foreignColumns: [
        flowDefinitionCommands.id,
        flowDefinitionCommands.resourceId,
        flowDefinitionCommands.ownerUserId
      ],
      name: "flow_definition_migrations_command_resource_owner_fk"
    }).onDelete("cascade"),
    check(
      "flow_definition_migrations_schema_versions_check",
      sql`${table.sourceGraphSchemaVersion} = 'flow-graph.v1'
        and ${table.targetGraphSchemaVersion} = 'flow-graph.v2'`
    ),
    check(
      "flow_definition_migrations_revision_check",
      sql`${table.sourceRevision} > 0
        and ${table.targetRevision} = ${table.sourceRevision} + 1`
    ),
    check(
      "flow_definition_migrations_graph_hash_check",
      sql`${table.sourceGraphHash} ~ '^sha256:[a-f0-9]{64}$'`
    ),
    uniqueIndex("flow_definition_migrations_command_unique").on(table.commandId),
    uniqueIndex("flow_definition_migrations_flow_target_revision_unique").on(
      table.flowId,
      table.targetRevision
    ),
    index("flow_definition_migrations_owner_migrated_idx").on(table.ownerUserId, table.migratedAt)
  ]
);
