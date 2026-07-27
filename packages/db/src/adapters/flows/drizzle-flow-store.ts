import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { FlowGraph, FlowStatus, FlowVersion } from "@elevenhouse/contracts";
import type { FlowRecord, FlowStore } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../runtime";
import { flowVersions, flows } from "../../schema";
import { insertReturningOne } from "../../shared";

type FlowRow = typeof flows.$inferSelect;
type FlowVersionRow = typeof flowVersions.$inferSelect;
type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type FlowDatabase = ElevenHouseDatabase | FlowTransaction;

export function createDrizzleFlowStore(database: ElevenHouseDatabase): FlowStore {
  return {
    createDraft: async (input) => {
      const now = new Date(input.now);
      const row = await insertReturningOne(
        () =>
          database
            .insert(flows)
            .values({
              ownerUserId: input.ownerUserId,
              name: input.name,
              status: "draft",
              approvalMode: input.approvalMode,
              draftGraph: input.graph,
              createdAt: now,
              updatedAt: now
            })
            .returning(),
        "flows"
      );
      return toFlowRecord(row, null);
    },
    listByOwner: async (input) => {
      const where =
        input.status === "all"
          ? eq(flows.ownerUserId, input.ownerUserId)
          : and(eq(flows.ownerUserId, input.ownerUserId), eq(flows.status, input.status));
      const rows = await database
        .select()
        .from(flows)
        .where(where)
        .orderBy(desc(flows.updatedAt), desc(flows.id))
        .limit(input.limit)
        .offset(input.offset);
      const [totalRow] = await database.select({ value: count() }).from(flows).where(where);
      return {
        flows: await hydrateFlows(database, rows),
        total: Number(totalRow?.value ?? 0)
      };
    },
    findByOwnerAndId: async (input) => {
      const [row] = await database
        .select()
        .from(flows)
        .where(and(eq(flows.ownerUserId, input.ownerUserId), eq(flows.id, input.flowId)))
        .limit(1);
      if (!row) return null;
      const [flow] = await hydrateFlows(database, [row]);
      return flow ?? null;
    },
    updateDraft: async (input) => {
      const patch: Partial<typeof flows.$inferInsert> = {
        updatedAt: new Date(input.now)
      };
      if (input.patch.name !== undefined) patch.name = input.patch.name;
      if (input.patch.approvalMode !== undefined) patch.approvalMode = input.patch.approvalMode;
      if (input.patch.graph !== undefined) patch.draftGraph = input.patch.graph;

      const [row] = await database
        .update(flows)
        .set(patch)
        .where(
          and(
            eq(flows.ownerUserId, input.ownerUserId),
            eq(flows.id, input.flowId),
            eq(flows.status, "draft")
          )
        )
        .returning();
      return row ? toFlowRecord(row, null) : null;
    },
    publishDraft: async (input) =>
      database.transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(flows)
          .where(
            and(
              eq(flows.ownerUserId, input.ownerUserId),
              eq(flows.id, input.flowId),
              eq(flows.status, "draft")
            )
          )
          .limit(1);
        if (!current) return null;

        const [latestVersionRow] = await transaction
          .select({ value: flowVersions.version })
          .from(flowVersions)
          .where(eq(flowVersions.flowId, input.flowId))
          .orderBy(desc(flowVersions.version))
          .limit(1);
        const versionNumber = Number(latestVersionRow?.value ?? 0) + 1;
        const publishedAt = new Date(input.now);
        const version = await insertReturningOne(
          () =>
            transaction
              .insert(flowVersions)
              .values({
                flowId: current.id,
                ownerUserId: current.ownerUserId,
                version: versionNumber,
                approvalMode: current.approvalMode,
                graph: current.draftGraph,
                publishedAt
              })
              .returning(),
          "flow_versions"
        );
        const [updated] = await transaction
          .update(flows)
          .set({
            status: "published",
            publishedVersionId: version.id,
            publishedAt,
            updatedAt: publishedAt
          })
          .where(
            and(
              eq(flows.ownerUserId, input.ownerUserId),
              eq(flows.id, input.flowId),
              eq(flows.status, "draft")
            )
          )
          .returning();
        if (!updated) return null;

        return {
          flow: toFlowRecord(updated, version.version),
          version: toFlowVersion(version)
        };
      })
  };
}

async function hydrateFlows(database: FlowDatabase, rows: readonly FlowRow[]): Promise<FlowRecord[]> {
  const publishedVersionIds = rows
    .map((row) => row.publishedVersionId)
    .filter((value): value is string => value !== null);
  if (publishedVersionIds.length === 0) return rows.map((row) => toFlowRecord(row, null));

  const versionRows = await database
    .select()
    .from(flowVersions)
    .where(inArray(flowVersions.id, publishedVersionIds));
  const versionById = new Map(versionRows.map((row) => [row.id, row.version]));

  return rows.map((row) =>
    toFlowRecord(row, row.publishedVersionId ? (versionById.get(row.publishedVersionId) ?? null) : null)
  );
}

function toFlowRecord(row: FlowRow, publishedVersion: number | null): FlowRecord {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    status: row.status as FlowStatus,
    approvalMode: row.approvalMode as FlowRecord["approvalMode"],
    draftGraph: row.draftGraph as FlowGraph,
    publishedVersionId: row.publishedVersionId,
    publishedVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null
  };
}

function toFlowVersion(row: FlowVersionRow): FlowVersion {
  return {
    id: row.id,
    flowId: row.flowId,
    version: row.version,
    status: "published",
    approvalMode: row.approvalMode as FlowVersion["approvalMode"],
    graph: row.graph as FlowGraph,
    publishedAt: row.publishedAt.toISOString()
  };
}
