import {
  flowEnrollmentDetailResponseSchema,
  type FlowActivationEpoch,
  type FlowEnrollmentControl
} from "@elevenhouse/contracts";
import {
  FlowEnrollmentAuthorityIntegrityError,
  type FlowEnrollmentQueryStore
} from "@elevenhouse/domain";
import { and, eq } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import { flowActivationEpochs, flowEnrollmentControls, flows } from "../../schema/flows";

export function createDrizzleFlowEnrollmentQueryStore(
  database: ElevenHouseDatabase
): FlowEnrollmentQueryStore {
  return {
    getByOwner: async ({ ownerUserId, flowId }) => {
      const [row] = await database
        .select({
          flowId: flows.id,
          definitionRevision: flows.revision,
          controlFlowId: flowEnrollmentControls.flowId,
          enrollmentState: flowEnrollmentControls.state,
          enrollmentRevision: flowEnrollmentControls.enrollmentRevision,
          activeVersionId: flowEnrollmentControls.activeVersionId,
          activeActivationEpochId: flowEnrollmentControls.activeActivationEpochId,
          activeSince: flowEnrollmentControls.activeSince,
          lastPausedAt: flowEnrollmentControls.lastPausedAt,
          epochId: flowActivationEpochs.id,
          epochFlowId: flowActivationEpochs.flowId,
          epochFlowVersionId: flowActivationEpochs.flowVersionId,
          epochSequence: flowActivationEpochs.sequence,
          epochEffectiveFrom: flowActivationEpochs.effectiveFrom,
          epochEffectiveTo: flowActivationEpochs.effectiveTo,
          epochManifestDigest: flowActivationEpochs.manifestDigest,
          epochRolloutPolicyRevision: flowActivationEpochs.rolloutPolicyRevision,
          epochActivatedByActorSubjectId: flowActivationEpochs.activatedByActorSubjectId,
          epochActivateCommandId: flowActivationEpochs.activateCommandId,
          epochCloseReason: flowActivationEpochs.closeReason,
          epochClosedByActorSubjectId: flowActivationEpochs.closedByActorSubjectId,
          epochCloseCommandId: flowActivationEpochs.closeCommandId
        })
        .from(flows)
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
            eq(flowActivationEpochs.id, flowEnrollmentControls.activeActivationEpochId),
            eq(flowActivationEpochs.flowId, flows.id),
            eq(flowActivationEpochs.flowVersionId, flowEnrollmentControls.activeVersionId)
          )
        )
        .where(and(eq(flows.ownerUserId, ownerUserId), eq(flows.id, flowId)))
        .limit(1);
      if (!row) return null;

      try {
        const enrollment = mapEnrollment(row);
        return flowEnrollmentDetailResponseSchema.parse({
          schemaVersion: "flow-enrollment-detail.v1",
          enrollment,
          activeActivationEpoch: mapActiveEpoch(row)
        });
      } catch (error) {
        if (error instanceof FlowEnrollmentAuthorityIntegrityError) throw error;
        throw new FlowEnrollmentAuthorityIntegrityError({ cause: error });
      }
    }
  };
}

type EnrollmentQueryRow = {
  readonly flowId: string;
  readonly definitionRevision: number;
  readonly controlFlowId: string | null;
  readonly enrollmentState: string | null;
  readonly enrollmentRevision: number | null;
  readonly activeVersionId: string | null;
  readonly activeActivationEpochId: string | null;
  readonly activeSince: Date | null;
  readonly lastPausedAt: Date | null;
  readonly epochId: string | null;
  readonly epochFlowId: string | null;
  readonly epochFlowVersionId: string | null;
  readonly epochSequence: number | null;
  readonly epochEffectiveFrom: Date | null;
  readonly epochEffectiveTo: Date | null;
  readonly epochManifestDigest: string | null;
  readonly epochRolloutPolicyRevision: number | null;
  readonly epochActivatedByActorSubjectId: string | null;
  readonly epochActivateCommandId: string | null;
  readonly epochCloseReason: string | null;
  readonly epochClosedByActorSubjectId: string | null;
  readonly epochCloseCommandId: string | null;
};

function mapEnrollment(row: EnrollmentQueryRow): FlowEnrollmentControl {
  if (row.controlFlowId === null) {
    return {
      schemaVersion: "flow-enrollment-control.v1",
      flowId: row.flowId,
      state: "inactive",
      definitionRevision: row.definitionRevision,
      enrollmentRevision: 0,
      activeVersionId: null,
      activeActivationEpochId: null,
      activeSince: null,
      lastPausedAt: null
    };
  }
  if (row.enrollmentState === null || row.enrollmentRevision === null) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
  return {
    schemaVersion: "flow-enrollment-control.v1",
    flowId: row.flowId,
    state: row.enrollmentState as FlowEnrollmentControl["state"],
    definitionRevision: row.definitionRevision,
    enrollmentRevision: row.enrollmentRevision,
    activeVersionId: row.activeVersionId,
    activeActivationEpochId: row.activeActivationEpochId,
    activeSince: optionalIsoInstant(row.activeSince),
    lastPausedAt: optionalIsoInstant(row.lastPausedAt)
  };
}

function mapActiveEpoch(row: EnrollmentQueryRow): FlowActivationEpoch | null {
  if (row.epochId === null) return null;
  if (
    row.epochFlowId === null ||
    row.epochFlowVersionId === null ||
    row.epochSequence === null ||
    row.epochEffectiveFrom === null ||
    row.epochManifestDigest === null ||
    row.epochRolloutPolicyRevision === null ||
    row.epochActivatedByActorSubjectId === null ||
    row.epochActivateCommandId === null
  ) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
  return {
    schemaVersion: "flow-activation-epoch.v1",
    id: row.epochId,
    flowId: row.epochFlowId,
    flowVersionId: row.epochFlowVersionId,
    sequence: row.epochSequence,
    effectiveFrom: requiredIsoInstant(row.epochEffectiveFrom),
    effectiveTo: optionalIsoInstant(row.epochEffectiveTo),
    manifestDigest: row.epochManifestDigest as FlowActivationEpoch["manifestDigest"],
    rolloutPolicyRevision: row.epochRolloutPolicyRevision,
    activatedByActorSubjectId: row.epochActivatedByActorSubjectId,
    activateCommandId: row.epochActivateCommandId,
    closeReason: row.epochCloseReason as FlowActivationEpoch["closeReason"],
    closedByActorSubjectId: row.epochClosedByActorSubjectId,
    closeCommandId: row.epochCloseCommandId
  };
}

function optionalIsoInstant(value: Date | null): string | null {
  return value === null ? null : requiredIsoInstant(value);
}

function requiredIsoInstant(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new FlowEnrollmentAuthorityIntegrityError();
  return value.toISOString();
}
