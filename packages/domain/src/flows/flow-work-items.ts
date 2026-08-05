import {
  completeFlowWorkItemRequestSchema,
  flowWorkItemMutationResponseSchema,
  listFlowWorkItemsQuerySchema,
  listFlowWorkItemsResponseSchema,
  snoozeFlowWorkItemRequestSchema,
  startFlowWorkItemRequestSchema,
  type CompleteFlowWorkItemRequest,
  type FlowWorkItemCommandRejectionResponse as ContractFlowWorkItemCommandRejectionResponse,
  type FlowWorkItemMutationResponse,
  type ListFlowWorkItemsQuery,
  type ListFlowWorkItemsResponse,
  type SnoozeFlowWorkItemRequest,
  type StartFlowWorkItemRequest
} from "@elevenhouse/contracts";
import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import { FlowRuntimeIdempotencyKeyInvalidError } from "./flow-run-cancellation";

type FlowWorkItemCommandBase = {
  readonly apiSurface: "astrologer-api";
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly resourceId: string;
  readonly idempotencyKey: string;
  readonly requestHash: `sha256:${string}`;
};

export type FlowWorkItemCommand =
  | (FlowWorkItemCommandBase & {
      readonly routeTemplate: "/flow-work-items/:workItemId/start";
      readonly scope: "flows.work-items.start.v1";
      readonly request: {
        readonly schemaVersion: "flow-work-item-start-request.v1";
        readonly body: StartFlowWorkItemRequest;
      };
    })
  | (FlowWorkItemCommandBase & {
      readonly routeTemplate: "/flow-work-items/:workItemId/snooze";
      readonly scope: "flows.work-items.snooze.v1";
      readonly request: {
        readonly schemaVersion: "flow-work-item-snooze-request.v1";
        readonly body: SnoozeFlowWorkItemRequest;
      };
    })
  | (FlowWorkItemCommandBase & {
      readonly routeTemplate: "/flow-work-items/:workItemId/complete";
      readonly scope: "flows.work-items.complete.v1";
      readonly request: {
        readonly schemaVersion: "flow-work-item-complete-request.v1";
        readonly body: CompleteFlowWorkItemRequest;
      };
    });

export type FlowWorkItemCommandRejectionResponse = ContractFlowWorkItemCommandRejectionResponse;

export type FlowWorkItemCommandOutcome =
  | {
      readonly kind: "succeeded";
      readonly response: {
        readonly statusCode: 200;
        readonly body: FlowWorkItemMutationResponse;
      };
    }
  | {
      readonly kind: "rejected";
      readonly response: FlowWorkItemCommandRejectionResponse;
    };

export type FlowWorkItemCommandResult = {
  readonly kind: "created" | "replayed";
  readonly outcome: FlowWorkItemCommandOutcome;
};

export type FlowWorkItemStore = {
  readonly list: (input: {
    readonly ownerUserId: string;
    readonly query: ListFlowWorkItemsQuery;
  }) => Promise<ListFlowWorkItemsResponse>;
  readonly execute: (input: {
    readonly command: FlowWorkItemCommand;
  }) => Promise<FlowWorkItemCommandResult>;
};

export type FlowWorkItemWakeSweepResult = {
  readonly asOf: string;
  readonly wokenCount: number;
  readonly staleCount: number;
  readonly integrityFailureCount: number;
  readonly hasMore: boolean;
};

export type FlowWorkItemWakeStore = {
  readonly wakeDue: (input: { readonly limit: number }) => Promise<FlowWorkItemWakeSweepResult>;
};

export async function listOwnerFlowWorkItems(input: {
  readonly store: FlowWorkItemStore;
  readonly ownerUserId: string;
  readonly query: ListFlowWorkItemsQuery;
}): Promise<ListFlowWorkItemsResponse> {
  const ownerUserId = normalizeRequiredIdentifier(input.ownerUserId, "owner user id");
  const query = listFlowWorkItemsQuerySchema.parse(input.query);
  return listFlowWorkItemsResponseSchema.parse(await input.store.list({ ownerUserId, query }));
}

export async function startFlowWorkItem(input: {
  readonly store: FlowWorkItemStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly workItemId: string;
  readonly idempotencyKey: string;
  readonly request: StartFlowWorkItemRequest;
}): Promise<FlowWorkItemCommandResult> {
  return executeFlowWorkItemCommand({
    ...input,
    routeTemplate: "/flow-work-items/:workItemId/start",
    scope: "flows.work-items.start.v1",
    request: {
      schemaVersion: "flow-work-item-start-request.v1",
      body: startFlowWorkItemRequestSchema.parse(input.request)
    }
  });
}

export async function snoozeFlowWorkItem(input: {
  readonly store: FlowWorkItemStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly workItemId: string;
  readonly idempotencyKey: string;
  readonly request: SnoozeFlowWorkItemRequest;
}): Promise<FlowWorkItemCommandResult> {
  return executeFlowWorkItemCommand({
    ...input,
    routeTemplate: "/flow-work-items/:workItemId/snooze",
    scope: "flows.work-items.snooze.v1",
    request: {
      schemaVersion: "flow-work-item-snooze-request.v1",
      body: snoozeFlowWorkItemRequestSchema.parse(input.request)
    }
  });
}

export async function completeFlowWorkItem(input: {
  readonly store: FlowWorkItemStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly workItemId: string;
  readonly idempotencyKey: string;
  readonly request: CompleteFlowWorkItemRequest;
}): Promise<FlowWorkItemCommandResult> {
  return executeFlowWorkItemCommand({
    ...input,
    routeTemplate: "/flow-work-items/:workItemId/complete",
    scope: "flows.work-items.complete.v1",
    request: {
      schemaVersion: "flow-work-item-complete-request.v1",
      body: completeFlowWorkItemRequestSchema.parse(input.request)
    }
  });
}

async function executeFlowWorkItemCommand(input: {
  readonly store: FlowWorkItemStore;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly workItemId: string;
  readonly idempotencyKey: string;
  readonly routeTemplate: FlowWorkItemCommand["routeTemplate"];
  readonly scope: FlowWorkItemCommand["scope"];
  readonly request: FlowWorkItemCommand["request"];
}): Promise<FlowWorkItemCommandResult> {
  const actorUserId = normalizeRequiredIdentifier(input.actorUserId, "actor user id");
  const ownerUserId = normalizeRequiredIdentifier(input.ownerUserId, "owner user id");
  const resourceId = normalizeRequiredIdentifier(input.workItemId, "work-item id");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const identity = {
    schemaVersion: "flow-work-item-command.v1",
    apiSurface: "astrologer-api",
    actorUserId,
    ownerUserId,
    routeTemplate: input.routeTemplate,
    resourceId,
    scope: input.scope,
    request: canonicalFlowWorkItemCommandRequest(input.request)
  } as const;
  const command = {
    apiSurface: identity.apiSurface,
    actorUserId: identity.actorUserId,
    ownerUserId: identity.ownerUserId,
    routeTemplate: identity.routeTemplate,
    resourceId: identity.resourceId,
    scope: identity.scope,
    idempotencyKey,
    requestHash: sha256CanonicalJson(identity),
    request: input.request
  } as FlowWorkItemCommand;
  return input.store.execute({ command });
}

function canonicalFlowWorkItemCommandRequest(
  request: FlowWorkItemCommand["request"]
): CanonicalJson {
  if (request.schemaVersion === "flow-work-item-start-request.v1") {
    return {
      schemaVersion: request.schemaVersion,
      body:
        request.body.expectedBookingLifecycleRevision === undefined
          ? { expectedRevision: request.body.expectedRevision }
          : {
              expectedRevision: request.body.expectedRevision,
              expectedBookingLifecycleRevision: request.body.expectedBookingLifecycleRevision
            }
    };
  }
  if (request.schemaVersion === "flow-work-item-snooze-request.v1") {
    return {
      schemaVersion: request.schemaVersion,
      body:
        request.body.expectedBookingLifecycleRevision === undefined
          ? {
              expectedRevision: request.body.expectedRevision,
              snoozedUntil: request.body.snoozedUntil
            }
          : {
              expectedRevision: request.body.expectedRevision,
              expectedBookingLifecycleRevision: request.body.expectedBookingLifecycleRevision,
              snoozedUntil: request.body.snoozedUntil
            }
    };
  }
  return {
    schemaVersion: request.schemaVersion,
    body:
      request.body.resultSummary === undefined
        ? request.body.expectedBookingLifecycleRevision === undefined
          ? { expectedRevision: request.body.expectedRevision }
          : {
              expectedRevision: request.body.expectedRevision,
              expectedBookingLifecycleRevision: request.body.expectedBookingLifecycleRevision
            }
        : request.body.expectedBookingLifecycleRevision === undefined
          ? {
              expectedRevision: request.body.expectedRevision,
              resultSummary: request.body.resultSummary
            }
          : {
              expectedRevision: request.body.expectedRevision,
              expectedBookingLifecycleRevision: request.body.expectedBookingLifecycleRevision,
              resultSummary: request.body.resultSummary
            }
  };
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
  if (!normalized) throw new TypeError(`Flow work-item ${label} is required`);
  return normalized;
}

export function parseFlowWorkItemMutationResponse(input: unknown): FlowWorkItemMutationResponse {
  return flowWorkItemMutationResponseSchema.parse(input);
}
