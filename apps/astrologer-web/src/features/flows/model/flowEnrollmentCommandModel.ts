import {
  activateFlowVersionRequestSchema,
  flowEnrollmentCommandRejectionSchema,
  pauseFlowEnrollmentRequestSchema,
  type ActivateFlowVersionRequest,
  type FlowActivationReviewResponse,
  type FlowEnrollmentCommandRejection,
  type FlowEnrollmentControl,
  type PauseFlowEnrollmentRequest
} from "@elevenhouse/contracts";

import { HttpError } from "../../../common/http/HttpError";

export type FlowEnrollmentCommandOperation = "activate" | "pause-enrollment";

export type FlowEnrollmentCommandErrorClassification =
  | {
      readonly kind: "refetch_required";
      readonly rejection: FlowEnrollmentCommandRejection | null;
    }
  | { readonly kind: "retry_same_attempt" }
  | { readonly kind: "rejected" };

export function buildActivateFlowVersionRequest(
  review: FlowActivationReviewResponse
): ActivateFlowVersionRequest {
  if (review.decision !== "ready") {
    throw new Error("FLOW_ACTIVATION_REVIEW_NOT_READY");
  }

  return activateFlowVersionRequestSchema.parse({
    schemaVersion: "flow-activation-command.v1",
    versionId: review.versionId,
    expectedRevision: review.definitionRevision,
    expectedEnrollmentRevision: review.enrollmentRevision,
    expectedActiveVersionId: review.expectedActiveVersionId
  });
}

export function buildPauseFlowEnrollmentRequest(
  enrollment: FlowEnrollmentControl
): PauseFlowEnrollmentRequest {
  if (
    enrollment.state !== "active" ||
    enrollment.activeVersionId === null ||
    enrollment.activeActivationEpochId === null
  ) {
    throw new Error("FLOW_ENROLLMENT_NOT_ACTIVE");
  }

  return pauseFlowEnrollmentRequestSchema.parse({
    schemaVersion: "flow-enrollment-pause-command.v1",
    expectedEnrollmentRevision: enrollment.enrollmentRevision,
    expectedActiveVersionId: enrollment.activeVersionId,
    expectedActivationEpochId: enrollment.activeActivationEpochId
  });
}

export function classifyFlowEnrollmentCommandError(
  error: unknown
): FlowEnrollmentCommandErrorClassification {
  if (error instanceof HttpError) {
    if (error.status === 409) {
      const rejection = flowEnrollmentCommandRejectionSchema.safeParse(error.body);
      return {
        kind: "refetch_required",
        rejection: rejection.success ? rejection.data : null
      };
    }
    if (error.status === 429 || error.status >= 500) {
      return { kind: "retry_same_attempt" };
    }
    return { kind: "rejected" };
  }

  return error instanceof TypeError ? { kind: "retry_same_attempt" } : { kind: "rejected" };
}

export function createFlowEnrollmentCommandAttemptRegistry(
  createRequestId: () => string = () => crypto.randomUUID()
) {
  const scopes = new Map<
    string,
    {
      readonly attempts: Map<string, string>;
      refetchRequired: boolean;
    }
  >();

  return {
    acquire(operation: FlowEnrollmentCommandOperation, flowId: string, payload: unknown): string {
      const scopeKey = buildScopeKey(operation, flowId);
      const scope = scopes.get(scopeKey) ?? {
        attempts: new Map<string, string>(),
        refetchRequired: false
      };
      if (scope.refetchRequired) throw new Error("FLOW_ENROLLMENT_REFETCH_REQUIRED");

      const signature = stableJson(payload);
      const current = scope.attempts.get(signature);
      if (current) return current;

      const idempotencyKey = `flows:${operation}:${createRequestId()}`;
      scope.attempts.set(signature, idempotencyKey);
      scopes.set(scopeKey, scope);
      return idempotencyKey;
    },
    acknowledge(
      operation: FlowEnrollmentCommandOperation,
      flowId: string,
      idempotencyKey: string
    ): void {
      const scopeKey = buildScopeKey(operation, flowId);
      const scope = scopes.get(scopeKey);
      if (!scope) return;

      deleteAttempt(scope.attempts, idempotencyKey);
      if (scope.attempts.size === 0 && !scope.refetchRequired) scopes.delete(scopeKey);
    },
    markConflict(
      operation: FlowEnrollmentCommandOperation,
      flowId: string,
      idempotencyKey: string
    ): void {
      const scopeKey = buildScopeKey(operation, flowId);
      const scope = scopes.get(scopeKey) ?? {
        attempts: new Map<string, string>(),
        refetchRequired: false
      };
      deleteAttempt(scope.attempts, idempotencyKey);
      scope.refetchRequired = true;
      scopes.set(scopeKey, scope);
    },
    needsRefetch(operation: FlowEnrollmentCommandOperation, flowId: string): boolean {
      return scopes.get(buildScopeKey(operation, flowId))?.refetchRequired === true;
    },
    resetAfterRefetch(operation: FlowEnrollmentCommandOperation, flowId: string): void {
      scopes.delete(buildScopeKey(operation, flowId));
    }
  };
}

function buildScopeKey(operation: FlowEnrollmentCommandOperation, flowId: string): string {
  return `${operation}:${flowId}`;
}

function deleteAttempt(attempts: Map<string, string>, idempotencyKey: string): void {
  for (const [signature, current] of attempts) {
    if (current !== idempotencyKey) continue;
    attempts.delete(signature);
    return;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)])
  );
}
