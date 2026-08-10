import {
  flowDefinitionDetailV2Schema,
  flowDefinitionDetailSchema,
  flowDefinitionSummaryV2Schema,
  flowDefinitionSummarySchema,
  flowEnrollmentControlSchema,
  type FlowDefinitionDetailV2,
  type FlowDefinitionDetail,
  type FlowDefinitionEnrollmentProjection,
  type FlowDefinitionSummaryV2,
  type FlowDefinitionSummary,
  type FlowEnrollmentControl
} from "@elevenhouse/contracts";
import { FlowDefinitionIntegrityError, type FlowDefinitionReadStore } from "@elevenhouse/domain";
import { and, countDistinct, desc, eq, isNull, or, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowActivationEpochs,
  flowEnrollmentControls,
  flows,
  flowVersions
} from "../../schema/flows";

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type FlowDatabase = ElevenHouseDatabase | FlowTransaction;

const definitionSummarySelection = {
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
  publishedAt: flows.publishedAt,
  controlFlowId: flowEnrollmentControls.flowId,
  enrollmentState: flowEnrollmentControls.state,
  enrollmentRevision: flowEnrollmentControls.enrollmentRevision,
  activeVersionId: flowEnrollmentControls.activeVersionId,
  activeActivationEpochId: flowEnrollmentControls.activeActivationEpochId,
  activeSince: flowEnrollmentControls.activeSince,
  lastPausedAt: flowEnrollmentControls.lastPausedAt,
  openEpochId: flowActivationEpochs.id,
  openEpochVersionId: flowActivationEpochs.flowVersionId,
  openEpochEffectiveFrom: flowActivationEpochs.effectiveFrom
} as const;

type FlowDefinitionReadRow = {
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
  readonly controlFlowId: string | null;
  readonly enrollmentState: string | null;
  readonly enrollmentRevision: number | null;
  readonly activeVersionId: string | null;
  readonly activeActivationEpochId: string | null;
  readonly activeSince: Date | null;
  readonly lastPausedAt: Date | null;
  readonly openEpochId: string | null;
  readonly openEpochVersionId: string | null;
  readonly openEpochEffectiveFrom: Date | null;
};

type FlowDefinitionDetailReadRow = FlowDefinitionReadRow & {
  readonly draftGraph: unknown;
  readonly draftPresentation: unknown | null;
};

export function createDrizzleFlowDefinitionReadStore(
  database: ElevenHouseDatabase
): FlowDefinitionReadStore {
  return Object.freeze({
    listByOwner: async ({ ownerUserId, query }) =>
      database.transaction(
        async (transaction) => {
          const where = flowListPredicate(ownerUserId, query.state, query.enrollmentState);
          const rows = await selectSummaries(transaction)
            .where(where)
            .orderBy(desc(flows.updatedAt), desc(flows.id))
            .limit(query.limit)
            .offset(query.offset);
          const [totalRow] = await selectTotal(transaction).where(where);

          return parsePersisted(() => ({
            flows: rows.map(toSummary),
            total: Number(totalRow?.value ?? 0)
          }));
        },
        { isolationLevel: "repeatable read", accessMode: "read only" }
      ),

    getByOwner: async ({ ownerUserId, flowId }) => {
      const rows = await selectDetails(database)
        .where(and(eq(flows.ownerUserId, ownerUserId), eq(flows.id, flowId)))
        .limit(2);
      if (rows.length > 1) throw new FlowDefinitionIntegrityError();
      return rows[0] ? toDetail(rows[0]) : null;
    }
  });
}

function selectSummaries(database: FlowDatabase) {
  return database
    .select(definitionSummarySelection)
    .from(flows)
    .leftJoin(flowVersions, latestPublishedVersionJoin())
    .leftJoin(
      flowEnrollmentControls,
      and(
        eq(flowEnrollmentControls.flowId, flows.id),
        eq(flowEnrollmentControls.ownerUserId, flows.ownerUserId)
      )
    )
    .leftJoin(
      flowActivationEpochs,
      and(eq(flowActivationEpochs.flowId, flows.id), isNull(flowActivationEpochs.effectiveTo))
    );
}

function selectDetails(database: FlowDatabase) {
  return database
    .select({
      ...definitionSummarySelection,
      draftGraph: flows.draftGraph,
      draftPresentation: flows.draftPresentation
    })
    .from(flows)
    .leftJoin(flowVersions, latestPublishedVersionJoin())
    .leftJoin(
      flowEnrollmentControls,
      and(
        eq(flowEnrollmentControls.flowId, flows.id),
        eq(flowEnrollmentControls.ownerUserId, flows.ownerUserId)
      )
    )
    .leftJoin(
      flowActivationEpochs,
      and(eq(flowActivationEpochs.flowId, flows.id), isNull(flowActivationEpochs.effectiveTo))
    );
}

function selectTotal(database: FlowDatabase) {
  return database
    .select({ value: countDistinct(flows.id) })
    .from(flows)
    .leftJoin(flowVersions, latestPublishedVersionJoin())
    .leftJoin(
      flowEnrollmentControls,
      and(
        eq(flowEnrollmentControls.flowId, flows.id),
        eq(flowEnrollmentControls.ownerUserId, flows.ownerUserId)
      )
    )
    .leftJoin(
      flowActivationEpochs,
      and(eq(flowActivationEpochs.flowId, flows.id), isNull(flowActivationEpochs.effectiveTo))
    );
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
  enrollmentState: "all" | "inactive" | "active" | "paused"
) {
  const enrollmentPredicate =
    enrollmentState === "all"
      ? undefined
      : enrollmentState === "inactive"
        ? or(
            eq(flowEnrollmentControls.state, "inactive"),
            isNull(flowEnrollmentControls.flowId)
          )
        : enrollmentState === "active"
          ? eq(flowEnrollmentControls.state, "active")
          : eq(flowEnrollmentControls.state, enrollmentState);
  return and(
    eq(flows.ownerUserId, ownerUserId),
    definitionState === "all" ? undefined : eq(flows.definitionState, definitionState),
    enrollmentPredicate
  );
}

function toSummary(row: FlowDefinitionReadRow): FlowDefinitionSummary {
  return parsePersisted(() => {
    const definition = toDefinitionSummary(row);
    const { schemaVersion: _schemaVersion, runtimeStatus: _runtimeStatus, ...read } = definition;
    void _schemaVersion;
    void _runtimeStatus;
    return flowDefinitionSummarySchema.parse({
      ...read,
      enrollment: toEnrollmentProjection(row)
    });
  });
}

function toDetail(row: FlowDefinitionDetailReadRow): FlowDefinitionDetail {
  return parsePersisted(() => {
    const definition = toDefinitionDetail(row);
    const { schemaVersion: _schemaVersion, runtimeStatus: _runtimeStatus, ...read } = definition;
    void _schemaVersion;
    void _runtimeStatus;
    return flowDefinitionDetailSchema.parse({
      ...read,
      enrollment: toEnrollmentProjection(row)
    });
  });
}

function toDefinitionSummary(row: FlowDefinitionReadRow): FlowDefinitionSummaryV2 {
  const common = toDefinitionCommon(row, "flow-definition-summary.v2");
  return flowDefinitionSummaryV2Schema.parse({
    ...common,
    graphSchemaVersion: row.graphSchemaVersion,
    origin: row.origin
  });
}

function toDefinitionDetail(row: FlowDefinitionDetailReadRow): FlowDefinitionDetailV2 {
  const common = toDefinitionCommon(row, "flow-definition-detail.v2");
  return flowDefinitionDetailV2Schema.parse({
    ...common,
    graphSchemaVersion: row.graphSchemaVersion,
    origin: row.origin,
    draftGraph: row.draftGraph,
    draftPresentation: row.draftPresentation
  });
}

function toDefinitionCommon(
  row: FlowDefinitionReadRow,
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
    createdAt: requiredIsoInstant(row.createdAt),
    updatedAt: requiredIsoInstant(row.updatedAt),
    publishedAt: optionalIsoInstant(row.publishedAt)
  };
}

function toEnrollmentProjection(row: FlowDefinitionReadRow): FlowDefinitionEnrollmentProjection {
  const control = toEnrollmentControl(row);
  if (row.runtimeStatus === "active") throw new FlowDefinitionIntegrityError();
  if (control === null) {
    if (row.openEpochId !== null) throw new FlowDefinitionIntegrityError();
    return {
      schemaVersion: "flow-enrollment-read-authority.v1",
      authority: "enrollment_v1",
      control: {
        schemaVersion: "flow-enrollment-control.v1",
        flowId: row.id,
        state: "inactive",
        definitionRevision: row.revision,
        enrollmentRevision: 0,
        activeVersionId: null,
        activeActivationEpochId: null,
        activeSince: null,
        lastPausedAt: null
      }
    };
  }
  assertOpenEpochCoherence(row, control);
  return {
    schemaVersion: "flow-enrollment-read-authority.v1",
    authority: "enrollment_v1",
    control
  };
}

function toEnrollmentControl(row: FlowDefinitionReadRow): FlowEnrollmentControl | null {
  if (row.controlFlowId === null) return null;
  if (row.enrollmentState === null || row.enrollmentRevision === null) {
    throw new FlowDefinitionIntegrityError();
  }
  return flowEnrollmentControlSchema.parse({
    schemaVersion: "flow-enrollment-control.v1",
    flowId: row.id,
    state: row.enrollmentState as FlowEnrollmentControl["state"],
    definitionRevision: row.revision,
    enrollmentRevision: row.enrollmentRevision,
    activeVersionId: row.activeVersionId,
    activeActivationEpochId: row.activeActivationEpochId,
    activeSince: optionalIsoInstant(row.activeSince),
    lastPausedAt: optionalIsoInstant(row.lastPausedAt)
  });
}

function assertOpenEpochCoherence(
  row: FlowDefinitionReadRow,
  control: FlowEnrollmentControl
): void {
  if (control.state !== "active") {
    if (row.openEpochId !== null) throw new FlowDefinitionIntegrityError();
    return;
  }
  if (
    row.openEpochId !== control.activeActivationEpochId ||
    row.openEpochVersionId !== control.activeVersionId ||
    optionalIsoInstant(row.openEpochEffectiveFrom) !== control.activeSince
  ) {
    throw new FlowDefinitionIntegrityError();
  }
}

function optionalIsoInstant(value: Date | null): string | null {
  return value === null ? null : requiredIsoInstant(value);
}

function requiredIsoInstant(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new FlowDefinitionIntegrityError();
  return value.toISOString();
}

function parsePersisted<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof FlowDefinitionIntegrityError) throw error;
    throw new FlowDefinitionIntegrityError();
  }
}
