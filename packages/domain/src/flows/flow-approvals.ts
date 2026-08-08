import {
  decideFlowApprovalRequestSchema,
  decideFlowApprovalResponseSchema,
  type DecideFlowApprovalRequest,
  type DecideFlowApprovalResponse
} from "@elevenhouse/contracts";

import { sha256CanonicalJson } from "../calculations/canonical-json";
import { FlowRuntimeIdempotencyKeyInvalidError } from "./flow-run-cancellation";

export type FlowApprovalCommand = {
  readonly apiSurface: "astrologer-api";
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly routeTemplate: "/flow-approvals/:approvalId/decision";
  readonly resourceId: string;
  readonly scope: "flows.approvals.decide.v1";
  readonly idempotencyKey: string;
  readonly requestHash: `sha256:${string}`;
  readonly request: {
    readonly schemaVersion: "flow-approval-decision-request.v1";
    readonly body: DecideFlowApprovalRequest;
  };
};

export type FlowApprovalCommandRejectionResponse =
  | { readonly statusCode: 404; readonly body: { readonly code: "FLOW_APPROVAL_NOT_FOUND" } }
  | {
      readonly statusCode: 409;
      readonly body:
        | { readonly code: "FLOW_APPROVAL_REVISION_CONFLICT"; readonly currentRevision: number }
        | { readonly code: "FLOW_APPROVAL_TRANSITION_NOT_ALLOWED"; readonly status: string }
        | { readonly code: "FLOW_APPROVAL_SNOOZE_NOT_FUTURE" }
        | { readonly code: "FLOW_RUNTIME_EXECUTION_UNAVAILABLE" };
    };

export type FlowApprovalCommandOutcome =
  | {
      readonly kind: "succeeded";
      readonly response: { readonly statusCode: 200; readonly body: DecideFlowApprovalResponse };
    }
  | { readonly kind: "rejected"; readonly response: FlowApprovalCommandRejectionResponse };

export type FlowApprovalCommandResult = {
  readonly kind: "created" | "replayed";
  readonly outcome: FlowApprovalCommandOutcome;
};

export type FlowApprovalStore = {
  readonly execute: (input: {
    readonly command: FlowApprovalCommand;
  }) => Promise<FlowApprovalCommandResult>;
};

export type FlowApprovalWakeSweepResult = {
  readonly asOf: string;
  readonly wokenCount: number;
  readonly expiredCount: number;
  readonly staleCount: number;
  readonly integrityFailureCount: number;
  readonly hasMore: boolean;
};

/** Database-time authority for snooze and expiry transitions. */
export type FlowApprovalWakeStore = {
  readonly wakeDue: (input: { readonly limit: number }) => Promise<FlowApprovalWakeSweepResult>;
};

export async function decideDurableFlowApproval(input: {
  readonly store: FlowApprovalStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly approvalId: string;
  readonly idempotencyKey: string;
  readonly request: DecideFlowApprovalRequest;
}): Promise<FlowApprovalCommandResult> {
  const actorUserId = normalizeRequiredIdentifier(input.actorUserId, "actor user id");
  const ownerUserId = normalizeRequiredIdentifier(input.ownerUserId, "owner user id");
  const resourceId = normalizeRequiredIdentifier(input.approvalId, "approval id");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const request = decideFlowApprovalRequestSchema.parse(input.request);
  const command: FlowApprovalCommand = {
    apiSurface: "astrologer-api",
    actorUserId,
    ownerUserId,
    routeTemplate: "/flow-approvals/:approvalId/decision",
    resourceId,
    scope: "flows.approvals.decide.v1",
    idempotencyKey,
    requestHash: sha256CanonicalJson({
      schemaVersion: "flow-approval-command.v1",
      apiSurface: "astrologer-api",
      actorUserId,
      ownerUserId,
      routeTemplate: "/flow-approvals/:approvalId/decision",
      resourceId,
      scope: "flows.approvals.decide.v1",
      request: {
        schemaVersion: "flow-approval-decision-request.v1",
        body: request
      }
    }),
    request: { schemaVersion: "flow-approval-decision-request.v1", body: request }
  };
  return input.store.execute({ command });
}

export function projectFlowApprovalCommandOutcome(
  outcome: FlowApprovalCommandOutcome
): DecideFlowApprovalResponse {
  if (outcome.kind !== "succeeded") throw new TypeError("Flow approval command was rejected");
  return decideFlowApprovalResponseSchema.parse(outcome.response.body);
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new FlowRuntimeIdempotencyKeyInvalidError();
  }
  return normalized;
}

function normalizeRequiredIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`Flow approval ${label} is required`);
  return normalized;
}
