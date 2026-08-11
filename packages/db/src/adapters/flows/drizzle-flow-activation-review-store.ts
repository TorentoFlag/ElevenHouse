import {
  flowActivationReviewResponseSchema,
  type FlowActivationBlocker,
  type FlowActivationReviewResponse,
  type FlowEnrollmentState
} from "@elevenhouse/contracts";
import {
  FlowEnrollmentAuthorityIntegrityError,
  type FlowActivationReviewStore,
  type FlowEnrollmentAuthoritySnapshot
} from "@elevenhouse/domain";
import { and, eq, isNull } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowActivationEpochs,
  flowAutomationQuotaAuthorities,
  flowEnrollmentControls,
  flowRuntimeOwnerSubjects,
  flows,
  flowVersions
} from "../../schema/flows";
import { readFlowActivationReadiness } from "./drizzle-flow-activation-readiness";

export function createDrizzleFlowActivationReviewStore(
  database: ElevenHouseDatabase
): FlowActivationReviewStore {
  return Object.freeze({
    getByOwner: (input) =>
      database.transaction(
        async (transaction) => {
          const rows = await transaction
            .select({
              flowId: flows.id,
              ownerUserId: flows.ownerUserId,
              definitionState: flows.definitionState,
              definitionRevision: flows.revision,
              targetId: flowVersions.id,
              targetOwnerUserId: flowVersions.ownerUserId,
              targetGraphSchemaVersion: flowVersions.graphSchemaVersion,
              targetGraph: flowVersions.graph,
              targetCapabilityManifest: flowVersions.capabilityManifest,
              ownerSubjectId: flowRuntimeOwnerSubjects.ownerSubjectId,
              quotaOwnerSubjectId: flowAutomationQuotaAuthorities.ownerSubjectId,
              activeAllocations: flowAutomationQuotaAuthorities.activeAllocations,
              controlFlowId: flowEnrollmentControls.flowId,
              controlOwnerUserId: flowEnrollmentControls.ownerUserId,
              controlOwnerSubjectId: flowEnrollmentControls.ownerSubjectId,
              enrollmentState: flowEnrollmentControls.state,
              enrollmentRevision: flowEnrollmentControls.enrollmentRevision,
              activeVersionId: flowEnrollmentControls.activeVersionId,
              activeActivationEpochId: flowEnrollmentControls.activeActivationEpochId,
              openEpochId: flowActivationEpochs.id,
              openEpochVersionId: flowActivationEpochs.flowVersionId
            })
            .from(flows)
            .innerJoin(
              flowVersions,
              and(
                eq(flowVersions.id, input.versionId),
                eq(flowVersions.flowId, flows.id),
                eq(flowVersions.ownerUserId, flows.ownerUserId)
              )
            )
            .leftJoin(
              flowRuntimeOwnerSubjects,
              and(
                eq(flowRuntimeOwnerSubjects.ownerUserId, flows.ownerUserId),
                eq(flowRuntimeOwnerSubjects.state, "active")
              )
            )
            .leftJoin(
              flowAutomationQuotaAuthorities,
              eq(
                flowAutomationQuotaAuthorities.ownerSubjectId,
                flowRuntimeOwnerSubjects.ownerSubjectId
              )
            )
            .leftJoin(
              flowEnrollmentControls,
              and(
                eq(flowEnrollmentControls.flowId, flows.id),
                eq(flowEnrollmentControls.ownerUserId, flows.ownerUserId)
              )
            )
            .leftJoin(
              flowActivationEpochs,
              and(
                eq(flowActivationEpochs.flowId, flows.id),
                isNull(flowActivationEpochs.effectiveTo)
              )
            )
            .where(and(eq(flows.id, input.flowId), eq(flows.ownerUserId, input.ownerUserId)))
            .limit(2);
          if (rows.length > 1) throw new FlowEnrollmentAuthorityIntegrityError();
          const row = rows[0];
          if (!row) return null;
          if (
            row.ownerSubjectId === null ||
            row.quotaOwnerSubjectId !== row.ownerSubjectId ||
            row.activeAllocations === null
          ) {
            throw new FlowEnrollmentAuthorityIntegrityError();
          }

          const current = enrollmentSnapshot(row);
          const readiness = await readFlowActivationReadiness(
            transaction,
            {
              current,
              target: {
                id: row.targetId,
                flowId: row.flowId,
                ownerUserId: row.targetOwnerUserId,
                graphSchemaVersion: row.targetGraphSchemaVersion,
                graph: row.targetGraph,
                capabilityManifest: row.targetCapabilityManifest
              },
              ownerSubjectId: row.ownerSubjectId,
              activeAutomationAllocations: row.activeAllocations
            },
            { lockRows: false }
          );
          return toReview(current, readiness.readiness, input.versionId);
        },
        { isolationLevel: "repeatable read", accessMode: "read only" }
      )
  });
}

function enrollmentSnapshot(row: {
  readonly flowId: string;
  readonly ownerUserId: string;
  readonly definitionState: string;
  readonly definitionRevision: number;
  readonly ownerSubjectId: string | null;
  readonly controlFlowId: string | null;
  readonly controlOwnerUserId: string | null;
  readonly controlOwnerSubjectId: string | null;
  readonly enrollmentState: string | null;
  readonly enrollmentRevision: number | null;
  readonly activeVersionId: string | null;
  readonly activeActivationEpochId: string | null;
  readonly openEpochId: string | null;
  readonly openEpochVersionId: string | null;
}): FlowEnrollmentAuthoritySnapshot {
  if (row.controlFlowId === null) {
    if (
      row.enrollmentState !== null ||
      row.enrollmentRevision !== null ||
      row.activeVersionId !== null ||
      row.activeActivationEpochId !== null ||
      row.openEpochId !== null
    ) {
      throw new FlowEnrollmentAuthorityIntegrityError();
    }
    return {
      flowId: row.flowId,
      ownerUserId: row.ownerUserId,
      definitionState: row.definitionState as FlowEnrollmentAuthoritySnapshot["definitionState"],
      definitionRevision: row.definitionRevision,
      enrollmentState: "inactive",
      enrollmentRevision: 0,
      activeVersionId: null,
      activeActivationEpochId: null
    };
  }
  if (
    row.ownerSubjectId === null ||
    row.controlFlowId !== row.flowId ||
    row.controlOwnerUserId !== row.ownerUserId ||
    row.controlOwnerSubjectId !== row.ownerSubjectId ||
    row.enrollmentState === null ||
    row.enrollmentRevision === null
  ) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
  const enrollmentState = row.enrollmentState as FlowEnrollmentState;
  const activeFieldsPresent =
    row.activeVersionId !== null &&
    row.activeActivationEpochId !== null &&
    row.openEpochId === row.activeActivationEpochId &&
    row.openEpochVersionId === row.activeVersionId;
  const activeFieldsAbsent =
    row.activeVersionId === null &&
    row.activeActivationEpochId === null &&
    row.openEpochId === null;
  if (enrollmentState === "active" ? !activeFieldsPresent : !activeFieldsAbsent) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
  return {
    flowId: row.flowId,
    ownerUserId: row.ownerUserId,
    definitionState: row.definitionState as FlowEnrollmentAuthoritySnapshot["definitionState"],
    definitionRevision: row.definitionRevision,
    enrollmentState,
    enrollmentRevision: row.enrollmentRevision,
    activeVersionId: row.activeVersionId,
    activeActivationEpochId: row.activeActivationEpochId
  };
}

function toReview(
  current: FlowEnrollmentAuthoritySnapshot,
  readiness: {
    readonly flowId: string;
    readonly versionId: string;
    readonly definitionRevision: number;
    readonly enrollmentRevision: number;
    readonly expectedActiveVersionId: string | null;
    readonly runtimeMode: "definition_only" | "canary" | "enabled";
    readonly rolloutPolicyRevision: number;
    readonly checkedAt: string;
    readonly blockers: readonly FlowActivationBlocker[];
  },
  versionId: string
): FlowActivationReviewResponse {
  const localBlockers: FlowActivationBlocker[] = [];
  if (current.definitionState === "archived") {
    localBlockers.push(blocker("FLOW_DEFINITION_ARCHIVED", "definition.state"));
  }
  if (current.enrollmentState === "active" && current.activeVersionId === versionId) {
    localBlockers.push(blocker("FLOW_ACTIVATION_ALREADY_ACTIVE", "enrollment.activeVersionId"));
  }
  const blockers = uniqueBlockers([...localBlockers, ...readiness.blockers]);
  return flowActivationReviewResponseSchema.parse({
    schemaVersion: "flow-activation-review.v1",
    flowId: readiness.flowId,
    versionId: readiness.versionId,
    definitionRevision: readiness.definitionRevision,
    enrollmentRevision: readiness.enrollmentRevision,
    expectedActiveVersionId: readiness.expectedActiveVersionId,
    runtimeMode: readiness.runtimeMode,
    rolloutPolicyRevision: readiness.rolloutPolicyRevision,
    evaluatedAt: readiness.checkedAt,
    decision: blockers.length === 0 ? "ready" : "blocked",
    blockers
  });
}

function blocker(code: FlowActivationBlocker["code"], path: string): FlowActivationBlocker {
  return { code, path, capabilityKey: null };
}

function uniqueBlockers(
  blockers: readonly FlowActivationBlocker[]
): readonly FlowActivationBlocker[] {
  return [
    ...new Map(
      blockers.map((item) => [`${item.code}:${item.path}:${item.capabilityKey}`, item])
    ).values()
  ];
}
