/* eslint-disable no-control-regex -- Command validation intentionally rejects ASCII control characters. */
import {
  sha256CanonicalJson,
  stableJson,
  type CanonicalJson
} from "../calculations/canonical-json";
import {
  createFlowRuntimeRolloutPolicyEvidence,
  verifyFlowRuntimeRolloutPolicyEvidence,
  type FlowRuntimeRolloutPolicy,
  type FlowRuntimeRolloutPolicyEvidence
} from "./flow-runtime-control";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export type FlowRuntimeControlCommand = {
  readonly schemaVersion: "flow-runtime-control-replace-policy-command.v1";
  readonly actorSubjectId: string;
  readonly idempotencyKey: string;
  readonly requestHash: `sha256:${string}`;
  readonly expectedRevision: number;
  readonly targetRevision: number;
  readonly requestedPolicyEvidence: FlowRuntimeRolloutPolicyEvidence;
  readonly reason: string;
};

export type FlowRuntimeControlReplacePolicyRequest = {
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
  readonly targetRevision: number;
  readonly requestedPolicyEvidence: FlowRuntimeRolloutPolicyEvidence;
  readonly reason: string;
};

export type FlowRuntimeControlCommandOutcome =
  | {
      readonly kind: "applied";
      readonly controlRevision: number;
      readonly policyEvidence: FlowRuntimeRolloutPolicyEvidence;
      readonly completedAt: string;
    }
  | {
      readonly kind: "revision_conflict";
      readonly expectedRevision: number;
      readonly currentRevision: number;
      readonly completedAt: string;
    };

export type FlowRuntimeControlCommandResult = {
  readonly kind: "created" | "replayed";
  readonly outcome: FlowRuntimeControlCommandOutcome;
};

export type FlowRuntimeControlCommandStore = {
  readonly executeReplacePolicy: (
    request: FlowRuntimeControlReplacePolicyRequest
  ) => Promise<FlowRuntimeControlCommandResult>;
};

export class FlowRuntimeControlCommandIntegrityError extends Error {
  override readonly name = "FlowRuntimeControlCommandIntegrityError";
  readonly code = "FLOW_RUNTIME_CONTROL_COMMAND_INTEGRITY_ERROR";

  constructor() {
    super("Persisted Flow runtime control command outcome is inconsistent");
  }
}

export class FlowRuntimeControlCommandIdempotencyConflictError extends Error {
  override readonly name = "FlowRuntimeControlCommandIdempotencyConflictError";
  readonly code = "FLOW_RUNTIME_CONTROL_COMMAND_IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Flow runtime control idempotency key was already used for another request");
  }
}

export class FlowRuntimeControlCommandReplayExpiredError extends Error {
  override readonly name = "FlowRuntimeControlCommandReplayExpiredError";
  readonly code = "FLOW_RUNTIME_CONTROL_COMMAND_REPLAY_EXPIRED";

  constructor() {
    super("Flow runtime control command outcome is outside its replay window");
  }
}

export async function replaceFlowRuntimeRolloutPolicy(input: {
  readonly store: FlowRuntimeControlCommandStore;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
  readonly policy: Omit<FlowRuntimeRolloutPolicy, "revision">;
  readonly reason: string;
}): Promise<FlowRuntimeControlCommandResult> {
  const expectedRevision = positiveSafeInteger(input.expectedRevision);
  const targetRevision = positiveSafeInteger(expectedRevision + 1);
  const requestedPolicyEvidence = createFlowRuntimeRolloutPolicyEvidence({
    ...input.policy,
    revision: targetRevision
  });
  const request = normalizeReplacePolicyRequest({
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    expectedRevision,
    targetRevision,
    requestedPolicyEvidence,
    reason: input.reason
  });

  return parseCommandResult(await input.store.executeReplacePolicy(request), request);
}

export function createFlowRuntimeControlCommand(input: {
  readonly request: FlowRuntimeControlReplacePolicyRequest;
  readonly actorSubjectId: string;
}): FlowRuntimeControlCommand {
  const request = normalizeReplacePolicyRequest(input.request);
  const actorSubjectId = normalizeUuid(input.actorSubjectId);
  const requestedPolicy = JSON.parse(
    request.requestedPolicyEvidence.canonicalPreimage
  ) as CanonicalJson;
  return {
    schemaVersion: "flow-runtime-control-replace-policy-command.v1",
    actorSubjectId,
    idempotencyKey: request.idempotencyKey,
    requestHash: sha256CanonicalJson({
      schemaVersion: "flow-runtime-control-replace-policy-command.v1",
      actorSubjectId,
      expectedRevision: request.expectedRevision,
      targetRevision: request.targetRevision,
      policy: requestedPolicy,
      reason: request.reason
    }),
    expectedRevision: request.expectedRevision,
    targetRevision: request.targetRevision,
    requestedPolicyEvidence: request.requestedPolicyEvidence,
    reason: request.reason
  };
}

function parseCommandResult(
  result: FlowRuntimeControlCommandResult,
  request: FlowRuntimeControlReplacePolicyRequest
): FlowRuntimeControlCommandResult {
  if (
    (result.kind !== "created" && result.kind !== "replayed") ||
    !isInstant(result.outcome.completedAt)
  ) {
    failIntegrity();
  }

  if (result.outcome.kind === "applied") {
    const policy = verifyFlowRuntimeRolloutPolicyEvidence(result.outcome.policyEvidence);
    if (
      result.outcome.controlRevision !== request.targetRevision ||
      policy.revision !== request.targetRevision ||
      stableJson(result.outcome.policyEvidence as unknown as CanonicalJson) !==
        stableJson(request.requestedPolicyEvidence as unknown as CanonicalJson)
    ) {
      failIntegrity();
    }
    return result;
  }

  if (
    result.outcome.kind !== "revision_conflict" ||
    result.outcome.expectedRevision !== request.expectedRevision ||
    !Number.isSafeInteger(result.outcome.currentRevision) ||
    result.outcome.currentRevision < 1 ||
    result.outcome.currentRevision === request.expectedRevision
  ) {
    failIntegrity();
  }
  return result;
}

function normalizeReplacePolicyRequest(
  input: FlowRuntimeControlReplacePolicyRequest
): FlowRuntimeControlReplacePolicyRequest {
  const actorUserId = normalizeUuid(input.actorUserId);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const expectedRevision = positiveSafeInteger(input.expectedRevision);
  const targetRevision = positiveSafeInteger(input.targetRevision);
  const reason = normalizeReason(input.reason);
  const policy = verifyFlowRuntimeRolloutPolicyEvidence(input.requestedPolicyEvidence);
  if (targetRevision !== expectedRevision + 1 || policy.revision !== targetRevision) {
    failIntegrity();
  }
  return {
    actorUserId,
    idempotencyKey,
    expectedRevision,
    targetRevision,
    requestedPolicyEvidence: input.requestedPolicyEvidence,
    reason
  };
}

function normalizeUuid(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) failIntegrity();
  return normalized;
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 8 ||
    normalized.length > 128 ||
    !IDEMPOTENCY_KEY_PATTERN.test(normalized)
  ) {
    failIntegrity();
  }
  return normalized;
}

function normalizeReason(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 500 ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    failIntegrity();
  }
  return normalized;
}

function positiveSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) failIntegrity();
  return value;
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function failIntegrity(): never {
  throw new FlowRuntimeControlCommandIntegrityError();
}
