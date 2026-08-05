import { and, count, desc, eq, sql } from "drizzle-orm";

import {
  flowDefinitionDetailV2Schema,
  flowDefinitionSummaryV2Schema,
  type FlowDefinitionDetailV2,
  type FlowDefinitionSummaryV2
} from "@elevenhouse/contracts";
import { FlowDefinitionIntegrityError, type FlowDefinitionQueryStore } from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import { flowVersions, flows } from "../../schema/flows";

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type FlowDatabase = ElevenHouseDatabase | FlowTransaction;

const summarySelection = {
  id: flows.id,
  ownerUserId: flows.ownerUserId,
  name: flows.name,
  origin: flows.origin,
  runtimeStatus: flows.status,
  definitionState: flows.definitionState,
  approvalMode: flows.approvalMode,
  revision: flows.revision,
  draftBaseVersionId: flows.draftBaseVersionId,
  latestPublishedVersionId: flows.publishedVersionId,
  latestPublishedVersion: flowVersions.version,
  graphSchemaVersion: sql<string | null>`${flows.draftGraph}->>'schemaVersion'`,
  createdAt: flows.createdAt,
  updatedAt: flows.updatedAt,
  publishedAt: flows.publishedAt
} as const;

type FlowSummaryRow = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly origin: unknown | null;
  readonly runtimeStatus: string;
  readonly definitionState: string;
  readonly approvalMode: string;
  readonly revision: number;
  readonly draftBaseVersionId: string | null;
  readonly latestPublishedVersionId: string | null;
  readonly latestPublishedVersion: number | null;
  readonly graphSchemaVersion: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt: Date | null;
};

type FlowDetailRow = FlowSummaryRow & {
  readonly draftGraph: unknown;
  readonly draftPresentation: unknown | null;
};

export function createDrizzleFlowDefinitionQueryStore(
  database: ElevenHouseDatabase
): FlowDefinitionQueryStore {
  return {
    listByOwner: async ({ ownerUserId, query }) =>
      database.transaction(
        async (transaction) => {
          const where = flowListPredicate(ownerUserId, query.state, query.runtimeStatus);
          const rows = await selectSummaries(transaction)
            .where(where)
            .orderBy(desc(flows.updatedAt), desc(flows.id))
            .limit(query.limit)
            .offset(query.offset);
          const [totalRow] = await transaction.select({ value: count() }).from(flows).where(where);

          return parsePersisted(() => ({
            flows: rows.map(toSummary),
            total: Number(totalRow?.value ?? 0)
          }));
        },
        { isolationLevel: "repeatable read", accessMode: "read only" }
      ),

    getByOwner: async ({ ownerUserId, flowId }) => {
      const [row] = await selectDetails(database)
        .where(and(eq(flows.ownerUserId, ownerUserId), eq(flows.id, flowId)))
        .limit(1);
      return row ? toDetail(row) : null;
    }
  };
}

function selectSummaries(database: FlowDatabase) {
  return database
    .select(summarySelection)
    .from(flows)
    .leftJoin(flowVersions, latestPublishedVersionJoin());
}

function selectDetails(database: FlowDatabase) {
  return database
    .select({
      ...summarySelection,
      draftGraph: flows.draftGraph,
      draftPresentation: flows.draftPresentation
    })
    .from(flows)
    .leftJoin(flowVersions, latestPublishedVersionJoin());
}

function latestPublishedVersionJoin() {
  return and(
    eq(flowVersions.id, flows.publishedVersionId),
    eq(flowVersions.flowId, flows.id),
    eq(flowVersions.ownerUserId, flows.ownerUserId),
    eq(flowVersions.publishedAt, flows.publishedAt)
  );
}

function flowListPredicate(
  ownerUserId: string,
  definitionState: "all" | "draft" | "versioned" | "archived",
  runtimeStatus: "all" | "draft" | "published" | "active" | "paused" | "archived"
) {
  return and(
    eq(flows.ownerUserId, ownerUserId),
    definitionState === "all" ? undefined : eq(flows.definitionState, definitionState),
    runtimeStatus === "all" ? undefined : eq(flows.status, runtimeStatus)
  );
}

function toSummary(row: FlowSummaryRow): FlowDefinitionSummaryV2 {
  return parsePersisted(() => {
    const common = toCommonReadFields(row, "flow-definition-summary.v2");
    return flowDefinitionSummaryV2Schema.parse({
      ...common,
      graphSchemaVersion: row.graphSchemaVersion,
      origin: row.origin
    });
  });
}

function toDetail(row: FlowDetailRow): FlowDefinitionDetailV2 {
  return parsePersisted(() => {
    const common = toCommonReadFields(row, "flow-definition-detail.v2");
    return flowDefinitionDetailV2Schema.parse({
      ...common,
      graphSchemaVersion: row.graphSchemaVersion,
      origin: row.origin,
      draftGraph: row.draftGraph,
      draftPresentation: row.draftPresentation
    });
  });
}

function toCommonReadFields(
  row: FlowSummaryRow,
  schemaVersion: "flow-definition-summary.v2" | "flow-definition-detail.v2"
) {
  return {
    schemaVersion,
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    state: row.definitionState,
    runtimeStatus: row.runtimeStatus,
    approvalMode: row.approvalMode,
    revision: row.revision,
    draftBaseVersionId: row.draftBaseVersionId,
    latestPublishedVersionId: row.latestPublishedVersionId,
    latestPublishedVersion: row.latestPublishedVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null
  };
}

function parsePersisted<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof FlowDefinitionIntegrityError) throw error;
    throw new FlowDefinitionIntegrityError();
  }
}
