import {
  activateFlowVersionResponseSchema,
  activateFlowVersionRequestSchema,
  flowActivationReviewResponseSchema,
  flowDefinitionStateSchema,
  flowEnrollmentCommandRejectionResponseSchema,
  flowEnrollmentStateSchema,
  pauseFlowEnrollmentResponseSchema,
  pauseFlowEnrollmentRequestSchema,
  type ActivateFlowVersionRequest,
  type ActivateFlowVersionResponse,
  type FlowActivationBlocker,
  type FlowDefinitionState,
  type FlowEnrollmentCommandRejectionResponse,
  type FlowEnrollmentState,
  type PauseFlowEnrollmentRequest,
  type PauseFlowEnrollmentResponse
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";

import { sha256CanonicalJson } from "../calculations/canonical-json";
import { FlowRuntimeIdempotencyKeyInvalidError } from "./flow-run-cancellation";

export type FlowEnrollmentCommandScope =
  | "flows.enrollment.activate.v1"
  | "flows.enrollment.pause.v1";

export type FlowEnrollmentCommandRouteTemplate =
  | "/flows/:flowId/activate"
  | "/flows/:flowId/pause-enrollment";

export type FlowEnrollmentCommand = {
  readonly apiSurface: "astrologer-api";
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly routeTemplate: FlowEnrollmentCommandRouteTemplate;
  readonly resourceId: string;
  readonly scope: FlowEnrollmentCommandScope;
  readonly idempotencyKey: string;
  readonly requestHash: `sha256:${string}`;
};

export type FlowEnrollmentCommandOutcome<T> =
  | {
      readonly kind: "succeeded";
      readonly response: { readonly statusCode: 200; readonly body: T };
    }
  | {
      readonly kind: "rejected";
      readonly response: FlowEnrollmentCommandRejectionResponse;
    };

export type FlowEnrollmentCommandResult<T> = {
  readonly kind: "created" | "replayed";
  readonly outcome: FlowEnrollmentCommandOutcome<T>;
};

export type FlowEnrollmentControlStore = {
  readonly executeActivate: (input: {
    readonly command: FlowEnrollmentCommand;
    readonly request: ActivateFlowVersionRequest;
    /** Invoke only after locking the owner-scoped authority and evaluating readiness in the same transaction. */
    readonly prepare: (
      context: FlowActivationPreparationContext
    ) => FlowEnrollmentTransitionPreparation<FlowActivationTransitionPlan>;
  }) => Promise<FlowEnrollmentCommandResult<ActivateFlowVersionResponse>>;
  readonly executePause: (input: {
    readonly command: FlowEnrollmentCommand;
    readonly request: PauseFlowEnrollmentRequest;
    /** Invoke only after locking the owner-scoped authority in the command transaction. */
    readonly prepare: (
      context: FlowEnrollmentPausePreparationContext
    ) => FlowEnrollmentTransitionPreparation<FlowEnrollmentPauseTransitionPlan>;
  }) => Promise<FlowEnrollmentCommandResult<PauseFlowEnrollmentResponse>>;
};

export type FlowEnrollmentAuthoritySnapshot = {
  readonly flowId: string;
  readonly ownerUserId: string;
  readonly definitionState: FlowDefinitionState;
  readonly definitionRevision: number;
  readonly enrollmentState: FlowEnrollmentState;
  readonly enrollmentRevision: number;
  readonly activeVersionId: string | null;
  readonly activeActivationEpochId: string | null;
};

export type FlowActivationTargetVersion = {
  readonly id: string;
  readonly flowId: string;
  readonly ownerUserId: string;
  readonly graphSchemaVersion: string;
  readonly manifestSchemaVersion: string;
};

export type FlowActivationPreparationContext = {
  readonly current: FlowEnrollmentAuthoritySnapshot;
  readonly target: FlowActivationTargetVersion;
  readonly readiness: FlowActivationTransactionalReadiness;
};

export type FlowEnrollmentPausePreparationContext = {
  readonly current: FlowEnrollmentAuthoritySnapshot;
};

export type FlowActivationTransitionPlan = {
  readonly closeActivationEpochId: string | null;
  readonly targetVersionId: string;
  readonly nextEnrollmentRevision: number;
  readonly rolloutPolicyRevision: number;
};

export type FlowEnrollmentPauseTransitionPlan = {
  readonly closeActivationEpochId: string;
  readonly nextEnrollmentRevision: number;
};

export type FlowEnrollmentTransitionPreparation<T> =
  | { readonly kind: "accepted"; readonly value: T }
  | {
      readonly kind: "rejected";
      readonly response: FlowEnrollmentCommandRejectionResponse;
    };

export type FlowActivationTransactionalReadiness = {
  readonly schemaVersion: "flow-activation-transaction-readiness.v1";
  readonly flowId: string;
  readonly versionId: string;
  readonly definitionRevision: number;
  readonly enrollmentRevision: number;
  readonly runtimeMode: "definition_only" | "canary" | "enabled";
  readonly rolloutPolicyRevision: number;
  readonly checkedAt: string;
  readonly decision: "ready" | "blocked";
  readonly blockers: readonly FlowActivationBlocker[];
};

const activateCommandResultSchema = z
  .object({
    kind: z.enum(["created", "replayed"]),
    outcome: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("succeeded"),
          response: z
            .object({ statusCode: z.literal(200), body: activateFlowVersionResponseSchema })
            .strict()
        })
        .strict(),
      z
        .object({
          kind: z.literal("rejected"),
          response: flowEnrollmentCommandRejectionResponseSchema
        })
        .strict()
    ])
  })
  .strict();

const pauseCommandResultSchema = z
  .object({
    kind: z.enum(["created", "replayed"]),
    outcome: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("succeeded"),
          response: z
            .object({ statusCode: z.literal(200), body: pauseFlowEnrollmentResponseSchema })
            .strict()
        })
        .strict(),
      z
        .object({
          kind: z.literal("rejected"),
          response: flowEnrollmentCommandRejectionResponseSchema
        })
        .strict()
    ])
  })
  .strict();

export class FlowEnrollmentAuthorityIntegrityError extends Error {
  override readonly name = "FlowEnrollmentAuthorityIntegrityError";
  readonly code = "FLOW_ENROLLMENT_AUTHORITY_INTEGRITY_ERROR";

  constructor() {
    super("Persisted flow enrollment authority is inconsistent");
  }
}

export async function activateFlowVersionEnrollment(input: {
  readonly store: FlowEnrollmentControlStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly idempotencyKey: string;
  readonly request: ActivateFlowVersionRequest;
}): Promise<FlowEnrollmentCommandResult<ActivateFlowVersionResponse>> {
  const request = activateFlowVersionRequestSchema.parse(input.request);
  const command = createEnrollmentCommand({
    actorUserId: input.actorUserId,
    ownerUserId: input.ownerUserId,
    flowId: input.flowId,
    idempotencyKey: input.idempotencyKey,
    routeTemplate: "/flows/:flowId/activate",
    scope: "flows.enrollment.activate.v1",
    requestSchemaVersion: request.schemaVersion,
    request
  });
  let preparationInvoked = false;
  const rawResult = await input.store.executeActivate({
    command,
    request,
    prepare: ({ current, target, readiness }) => {
      if (preparationInvoked) throw new FlowEnrollmentAuthorityIntegrityError();
      preparationInvoked = true;
      return planFlowActivationTransition({ command, current, target, readiness, request });
    }
  });
  const result = parseActivationCommandResult(rawResult, command, request);
  assertPreparationUsage(result, preparationInvoked);
  return result;
}

export async function pauseFlowEnrollment(input: {
  readonly store: FlowEnrollmentControlStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly idempotencyKey: string;
  readonly request: PauseFlowEnrollmentRequest;
}): Promise<FlowEnrollmentCommandResult<PauseFlowEnrollmentResponse>> {
  const request = pauseFlowEnrollmentRequestSchema.parse(input.request);
  const command = createEnrollmentCommand({
    actorUserId: input.actorUserId,
    ownerUserId: input.ownerUserId,
    flowId: input.flowId,
    idempotencyKey: input.idempotencyKey,
    routeTemplate: "/flows/:flowId/pause-enrollment",
    scope: "flows.enrollment.pause.v1",
    requestSchemaVersion: request.schemaVersion,
    request
  });
  let preparationInvoked = false;
  const rawResult = await input.store.executePause({
    command,
    request,
    prepare: ({ current }) => {
      if (preparationInvoked) throw new FlowEnrollmentAuthorityIntegrityError();
      preparationInvoked = true;
      return planFlowEnrollmentPauseTransition({ command, current, request });
    }
  });
  const result = parsePauseCommandResult(rawResult, command, request);
  assertPreparationUsage(result, preparationInvoked);
  return result;
}

function planFlowActivationTransition(input: {
  readonly command: Pick<FlowEnrollmentCommand, "ownerUserId" | "resourceId">;
  readonly current: FlowEnrollmentAuthoritySnapshot;
  readonly target: FlowActivationTargetVersion;
  readonly readiness: FlowActivationTransactionalReadiness;
  readonly request: ActivateFlowVersionRequest;
}): FlowEnrollmentTransitionPreparation<FlowActivationTransitionPlan> {
  const request = activateFlowVersionRequestSchema.parse(input.request);
  const readiness = parseTransactionalReadiness(input.readiness);
  assertEnrollmentAuthority(input.current, input.command);
  assertTargetAuthority(input.current, input.target);

  if (request.expectedRevision !== input.current.definitionRevision) {
    return conflict("FLOW_DEFINITION_REVISION_CONFLICT", {
      expectedRevision: request.expectedRevision,
      currentRevision: input.current.definitionRevision
    });
  }
  if (request.expectedEnrollmentRevision !== input.current.enrollmentRevision) {
    return conflict("FLOW_ENROLLMENT_REVISION_CONFLICT", {
      expectedRevision: request.expectedEnrollmentRevision,
      currentRevision: input.current.enrollmentRevision
    });
  }
  if (request.expectedActiveVersionId !== input.current.activeVersionId) {
    return conflict("FLOW_ACTIVE_VERSION_CONFLICT", {
      expectedActiveVersionId: request.expectedActiveVersionId,
      currentActiveVersionId: input.current.activeVersionId
    });
  }
  if (input.current.definitionState === "archived") {
    return conflict("FLOW_DEFINITION_ARCHIVED");
  }
  if (request.versionId !== input.target.id) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
  if (
    input.target.graphSchemaVersion !== "flow-graph.v2" ||
    input.target.manifestSchemaVersion !== "flow-capability-manifest.v2"
  ) {
    return conflict("FLOW_ACTIVATION_VERSION_UNSUPPORTED");
  }
  if (
    input.current.enrollmentState === "active" &&
    input.current.activeVersionId === request.versionId
  ) {
    return conflict("FLOW_ACTIVATION_ALREADY_ACTIVE");
  }

  assertReadinessAuthority(input.current, input.target, readiness);
  if (readiness.decision === "blocked") {
    return conflict("FLOW_ACTIVATION_BLOCKED", { blockers: readiness.blockers });
  }

  return {
    kind: "accepted",
    value: {
      closeActivationEpochId: input.current.activeActivationEpochId,
      targetVersionId: input.target.id,
      nextEnrollmentRevision: nextEnrollmentRevision(input.current.enrollmentRevision),
      rolloutPolicyRevision: readiness.rolloutPolicyRevision
    }
  };
}

function planFlowEnrollmentPauseTransition(input: {
  readonly command: Pick<FlowEnrollmentCommand, "ownerUserId" | "resourceId">;
  readonly current: FlowEnrollmentAuthoritySnapshot;
  readonly request: PauseFlowEnrollmentRequest;
}): FlowEnrollmentTransitionPreparation<FlowEnrollmentPauseTransitionPlan> {
  const request = pauseFlowEnrollmentRequestSchema.parse(input.request);
  assertEnrollmentAuthority(input.current, input.command);

  if (request.expectedEnrollmentRevision !== input.current.enrollmentRevision) {
    return conflict("FLOW_ENROLLMENT_REVISION_CONFLICT", {
      expectedRevision: request.expectedEnrollmentRevision,
      currentRevision: input.current.enrollmentRevision
    });
  }
  if (input.current.enrollmentState !== "active") {
    return conflict("FLOW_ENROLLMENT_NOT_ACTIVE");
  }
  if (request.expectedActiveVersionId !== input.current.activeVersionId) {
    return conflict("FLOW_ACTIVE_VERSION_CONFLICT", {
      expectedActiveVersionId: request.expectedActiveVersionId,
      currentActiveVersionId: input.current.activeVersionId
    });
  }
  if (request.expectedActivationEpochId !== input.current.activeActivationEpochId) {
    return conflict("FLOW_ACTIVE_EPOCH_CONFLICT", {
      expectedActivationEpochId: request.expectedActivationEpochId,
      currentActivationEpochId: input.current.activeActivationEpochId
    });
  }

  return {
    kind: "accepted",
    value: {
      closeActivationEpochId: request.expectedActivationEpochId,
      nextEnrollmentRevision: nextEnrollmentRevision(input.current.enrollmentRevision)
    }
  };
}

function createEnrollmentCommand(input: {
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly idempotencyKey: string;
  readonly routeTemplate: FlowEnrollmentCommandRouteTemplate;
  readonly scope: FlowEnrollmentCommandScope;
  readonly requestSchemaVersion: string;
  readonly request: ActivateFlowVersionRequest | PauseFlowEnrollmentRequest;
}): FlowEnrollmentCommand {
  const actorUserId = normalizeRequiredIdentifier(input.actorUserId);
  const ownerUserId = normalizeRequiredIdentifier(input.ownerUserId);
  const resourceId = normalizeRequiredIdentifier(input.flowId);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const identity = {
    schemaVersion: "flow-enrollment-command.v1",
    apiSurface: "astrologer-api" as const,
    actorUserId,
    ownerUserId,
    routeTemplate: input.routeTemplate,
    resourceId,
    scope: input.scope,
    request: {
      schemaVersion: input.requestSchemaVersion,
      body: input.request
    }
  };
  return {
    apiSurface: identity.apiSurface,
    actorUserId,
    ownerUserId,
    routeTemplate: input.routeTemplate,
    resourceId,
    scope: input.scope,
    idempotencyKey,
    requestHash: sha256CanonicalJson(identity)
  };
}

function assertEnrollmentAuthority(
  current: FlowEnrollmentAuthoritySnapshot,
  command: Pick<FlowEnrollmentCommand, "ownerUserId" | "resourceId">
): void {
  const activeFieldsPresent =
    current.activeVersionId !== null && current.activeActivationEpochId !== null;
  const activeFieldsAbsent =
    current.activeVersionId === null && current.activeActivationEpochId === null;
  if (
    current.flowId !== command.resourceId ||
    current.ownerUserId !== command.ownerUserId ||
    !current.flowId.trim() ||
    !current.ownerUserId.trim() ||
    !flowDefinitionStateSchema.safeParse(current.definitionState).success ||
    !flowEnrollmentStateSchema.safeParse(current.enrollmentState).success ||
    !Number.isSafeInteger(current.definitionRevision) ||
    current.definitionRevision < 1 ||
    !Number.isSafeInteger(current.enrollmentRevision) ||
    current.enrollmentRevision < 0 ||
    (current.enrollmentState === "inactive" && current.enrollmentRevision !== 0) ||
    (current.enrollmentState !== "inactive" && current.enrollmentRevision === 0) ||
    (current.enrollmentState === "active" ? !activeFieldsPresent : !activeFieldsAbsent)
  ) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
}

function assertTargetAuthority(
  current: FlowEnrollmentAuthoritySnapshot,
  target: FlowActivationTargetVersion
): void {
  if (
    !target.id.trim() ||
    target.flowId !== current.flowId ||
    target.ownerUserId !== current.ownerUserId
  ) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
}

function assertReadinessAuthority(
  current: FlowEnrollmentAuthoritySnapshot,
  target: FlowActivationTargetVersion,
  readiness: FlowActivationTransactionalReadiness
): void {
  if (
    readiness.flowId !== current.flowId ||
    readiness.versionId !== target.id ||
    readiness.definitionRevision !== current.definitionRevision ||
    readiness.enrollmentRevision !== current.enrollmentRevision
  ) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
}

function parseTransactionalReadiness(
  input: FlowActivationTransactionalReadiness
): FlowActivationTransactionalReadiness {
  return parseTransactionalReadinessShape(input);
}

function parseTransactionalReadinessShape(
  input: FlowActivationTransactionalReadiness
): FlowActivationTransactionalReadiness {
  try {
    if (input.schemaVersion !== "flow-activation-transaction-readiness.v1") {
      throw new FlowEnrollmentAuthorityIntegrityError();
    }
    const review = flowActivationReviewResponseSchema.parse({
      schemaVersion: "flow-activation-review.v1",
      flowId: input.flowId,
      versionId: input.versionId,
      definitionRevision: input.definitionRevision,
      enrollmentRevision: input.enrollmentRevision,
      runtimeMode: input.runtimeMode,
      rolloutPolicyRevision: input.rolloutPolicyRevision,
      evaluatedAt: input.checkedAt,
      decision: input.decision,
      blockers: input.blockers
    });
    return {
      schemaVersion: input.schemaVersion,
      flowId: review.flowId,
      versionId: review.versionId,
      definitionRevision: review.definitionRevision,
      enrollmentRevision: review.enrollmentRevision,
      runtimeMode: review.runtimeMode,
      rolloutPolicyRevision: review.rolloutPolicyRevision,
      checkedAt: review.evaluatedAt,
      decision: review.decision,
      blockers: review.blockers
    };
  } catch (error) {
    if (error instanceof FlowEnrollmentAuthorityIntegrityError) throw error;
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
}

function parseActivationCommandResult(
  input: unknown,
  command: FlowEnrollmentCommand,
  request: ActivateFlowVersionRequest
): FlowEnrollmentCommandResult<ActivateFlowVersionResponse> {
  try {
    const result = activateCommandResultSchema.parse(input);
    if (result.outcome.kind === "rejected") return result;
    const body = result.outcome.response.body;
    if (
      body.enrollment.flowId !== command.resourceId ||
      body.enrollment.definitionRevision !== request.expectedRevision ||
      body.enrollment.enrollmentRevision !==
        nextEnrollmentRevision(request.expectedEnrollmentRevision) ||
      body.enrollment.activeVersionId !== request.versionId ||
      body.activationEpoch.flowVersionId !== request.versionId ||
      body.activationEpoch.activatedByActorUserId !== command.actorUserId
    ) {
      throw new FlowEnrollmentAuthorityIntegrityError();
    }
    return result;
  } catch (error) {
    if (error instanceof FlowEnrollmentAuthorityIntegrityError) throw error;
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
}

function parsePauseCommandResult(
  input: unknown,
  command: FlowEnrollmentCommand,
  request: PauseFlowEnrollmentRequest
): FlowEnrollmentCommandResult<PauseFlowEnrollmentResponse> {
  try {
    const result = pauseCommandResultSchema.parse(input);
    if (result.outcome.kind === "rejected") return result;
    const body = result.outcome.response.body;
    if (
      body.enrollment.flowId !== command.resourceId ||
      body.enrollment.enrollmentRevision !==
        nextEnrollmentRevision(request.expectedEnrollmentRevision) ||
      body.closedEpoch.id !== request.expectedActivationEpochId ||
      body.closedEpoch.flowVersionId !== request.expectedActiveVersionId ||
      body.closedEpoch.closedByActorUserId !== command.actorUserId
    ) {
      throw new FlowEnrollmentAuthorityIntegrityError();
    }
    return result;
  } catch (error) {
    if (error instanceof FlowEnrollmentAuthorityIntegrityError) throw error;
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
}

function assertPreparationUsage<T>(
  result: FlowEnrollmentCommandResult<T>,
  preparationInvoked: boolean
): void {
  if (
    (result.kind === "replayed" && preparationInvoked) ||
    (result.kind === "created" && result.outcome.kind === "succeeded" && !preparationInvoked)
  ) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }
}

function conflict(
  code: FlowEnrollmentCommandRejectionResponse["body"]["code"],
  fields: Record<string, unknown> = {}
): { readonly kind: "rejected"; readonly response: FlowEnrollmentCommandRejectionResponse } {
  const response = flowEnrollmentCommandRejectionResponseSchema.parse({
    statusCode:
      code === "FLOW_DEFINITION_NOT_FOUND" || code === "FLOW_ACTIVATION_VERSION_NOT_FOUND"
        ? 404
        : 409,
    body: { code, ...fields }
  });
  return {
    kind: "rejected",
    response
  };
}

function nextEnrollmentRevision(current: number): number {
  const next = current + 1;
  if (!Number.isSafeInteger(next)) throw new FlowEnrollmentAuthorityIntegrityError();
  return next;
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new FlowRuntimeIdempotencyKeyInvalidError();
  }
  return normalized;
}

function normalizeRequiredIdentifier(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError("Flow enrollment command identity is required");
  return normalized;
}
