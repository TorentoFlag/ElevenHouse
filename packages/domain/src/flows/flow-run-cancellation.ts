import {
  cancelFlowRunRequestSchema,
  type CancelFlowRunRequest,
  type CancelFlowRunResponse
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";

import { sha256CanonicalJson } from "../calculations/canonical-json";

export type FlowRunCancellationCommand = {
  readonly apiSurface: "astrologer-api";
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly routeTemplate: "/flow-runs/:runId/cancel";
  readonly resourceId: string;
  readonly flowRunId: string;
  readonly scope: "flows.runtime.cancel.v1";
  readonly idempotencyKey: string;
  readonly requestHash: `sha256:${string}`;
};

export const flowRunCancellationRejectionResponseSchema = z.union([
  z
    .object({
      statusCode: z.literal(404),
      body: z.object({ code: z.literal("FLOW_RUN_NOT_FOUND") }).strict()
    })
    .strict(),
  z
    .object({
      statusCode: z.literal(409),
      body: z.object({ code: z.literal("FLOW_RUNTIME_EXECUTION_UNAVAILABLE") }).strict()
    })
    .strict(),
  z
    .object({
      statusCode: z.literal(409),
      body: z
        .object({
          code: z.literal("FLOW_RUN_CANCEL_NOT_ALLOWED"),
          status: z.string().trim().min(1).max(80)
        })
        .strict()
    })
    .strict()
]);

export type FlowRunCancellationRejectionResponse = z.infer<
  typeof flowRunCancellationRejectionResponseSchema
>;

export type FlowRunCancellationCommandOutcome =
  | {
      readonly kind: "succeeded";
      readonly response: { readonly statusCode: 200; readonly body: CancelFlowRunResponse };
    }
  | { readonly kind: "rejected"; readonly response: FlowRunCancellationRejectionResponse };

export type FlowRunCancellationCommandResult = {
  readonly kind: "created" | "replayed";
  readonly outcome: FlowRunCancellationCommandOutcome;
};

export type FlowRunCancellationStore = {
  readonly executeCancel: (input: {
    readonly command: FlowRunCancellationCommand;
  }) => Promise<FlowRunCancellationCommandResult>;
};

export class FlowRuntimeIdempotencyKeyInvalidError extends Error {
  override readonly name = "FlowRuntimeIdempotencyKeyInvalidError";
  readonly code = "FLOW_IDEMPOTENCY_KEY_INVALID";

  constructor() {
    super("Flow runtime command requires a valid idempotency key");
  }
}

export class FlowRuntimeIdempotencyConflictError extends Error {
  override readonly name = "FlowRuntimeIdempotencyConflictError";
  readonly code = "FLOW_IDEMPOTENCY_KEY_REUSED";

  constructor() {
    super("Flow runtime idempotency key was already used for another request");
  }
}

export class FlowRuntimeIdempotencyExpiredError extends Error {
  override readonly name = "FlowRuntimeIdempotencyExpiredError";
  readonly code = "FLOW_IDEMPOTENCY_KEY_EXPIRED";

  constructor() {
    super("Flow runtime idempotency replay window has expired and the key cannot be reused");
  }
}

export class FlowRuntimeCommandIntegrityError extends Error {
  override readonly name = "FlowRuntimeCommandIntegrityError";
  readonly code = "FLOW_RUNTIME_COMMAND_INTEGRITY_ERROR";

  constructor() {
    super("Persisted flow runtime command state is inconsistent");
  }
}

export class FlowRuntimeCommandBusyError extends Error {
  override readonly name = "FlowRuntimeCommandBusyError";
  readonly code = "FLOW_RUNTIME_COMMAND_BUSY";

  constructor() {
    super("Flow runtime command could not acquire its database authority in time");
  }
}

export async function cancelDurableFlowRun(input: {
  readonly store: FlowRunCancellationStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly request: CancelFlowRunRequest;
}): Promise<FlowRunCancellationCommandResult> {
  const actorUserId = normalizeRequiredIdentifier(input.actorUserId, "actor user id");
  const ownerUserId = normalizeRequiredIdentifier(input.ownerUserId, "owner user id");
  const resourceId = normalizeRequiredIdentifier(input.runId, "run id");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const request = cancelFlowRunRequestSchema.parse(input.request);
  const command: FlowRunCancellationCommand = {
    apiSurface: "astrologer-api",
    actorUserId,
    ownerUserId,
    routeTemplate: "/flow-runs/:runId/cancel",
    resourceId,
    flowRunId: resourceId,
    scope: "flows.runtime.cancel.v1",
    idempotencyKey,
    requestHash: sha256CanonicalJson({
      schemaVersion: "flow-runtime-command.v1",
      apiSurface: "astrologer-api",
      actorUserId,
      ownerUserId,
      routeTemplate: "/flow-runs/:runId/cancel",
      resourceId,
      scope: "flows.runtime.cancel.v1",
      request: {
        schemaVersion: "flow-run-cancel-request.v1",
        body: request
      }
    })
  };
  return input.store.executeCancel({ command });
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
  if (!normalized) throw new TypeError(`Flow runtime ${label} is required`);
  return normalized;
}
