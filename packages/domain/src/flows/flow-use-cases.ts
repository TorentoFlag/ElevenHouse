import type {
  CreateFlowRequest,
  FlowStatus,
  ListFlowsQuery,
  UpdateFlowDraftRequest
} from "@elevenhouse/contracts";

import type { FlowRecord, FlowStore, FlowStorePublishResult } from "./flow-store";
import { assertFlowGraphPublishable } from "./flow-validation";

export type CreateFlowDraftInput = {
  readonly store: FlowStore;
  readonly ownerUserId: string;
  readonly input: CreateFlowRequest;
  readonly now: string;
};

export type ListFlowsInput = {
  readonly store: FlowStore;
  readonly ownerUserId: string;
  readonly query: ListFlowsQuery;
};

export type GetFlowInput = {
  readonly store: FlowStore;
  readonly ownerUserId: string;
  readonly flowId: string;
};

export type UpdateFlowDraftInput = GetFlowInput & {
  readonly patch: UpdateFlowDraftRequest;
  readonly now: string;
};

export type PublishFlowInput = GetFlowInput & {
  readonly now: string;
};

export type FlowStatusCommandInput = GetFlowInput & {
  readonly now: string;
};

export class FlowStatusTransitionError extends Error {
  constructor(
    readonly code: "FLOW_NOT_PUBLISHED" | "FLOW_NOT_ACTIVE" | "FLOW_ARCHIVED",
    message: string
  ) {
    super(message);
    this.name = "FlowStatusTransitionError";
  }
}

export async function createFlowDraft(input: CreateFlowDraftInput): Promise<FlowRecord> {
  return input.store.createDraft({
    ownerUserId: input.ownerUserId,
    name: input.input.name,
    approvalMode: input.input.approvalMode,
    graph: input.input.graph,
    now: input.now
  });
}

export function listFlows(input: ListFlowsInput) {
  return input.store.listByOwner({
    ownerUserId: input.ownerUserId,
    status: input.query.status,
    limit: input.query.limit,
    offset: input.query.offset
  });
}

export function getFlow(input: GetFlowInput): Promise<FlowRecord | null> {
  return input.store.findByOwnerAndId({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId
  });
}

export function updateFlowDraft(input: UpdateFlowDraftInput): Promise<FlowRecord | null> {
  return input.store.updateDraft({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId,
    patch: input.patch,
    now: input.now
  });
}

export async function publishFlow(input: PublishFlowInput): Promise<FlowStorePublishResult | null> {
  const current = await input.store.findByOwnerAndId({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId
  });
  if (!current) return null;

  assertFlowGraphPublishable(current.draftGraph);

  return input.store.publishDraft({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId,
    now: input.now
  });
}

export async function activateFlow(input: FlowStatusCommandInput): Promise<FlowRecord | null> {
  const current = await input.store.findByOwnerAndId({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId
  });
  if (!current) return null;
  if (current.status === "active") return current;

  assertCanActivateFlow(current);

  return input.store.transitionStatus({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId,
    fromStatuses: ["published", "paused"],
    toStatus: "active",
    now: input.now
  });
}

export async function pauseFlow(input: FlowStatusCommandInput): Promise<FlowRecord | null> {
  const current = await input.store.findByOwnerAndId({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId
  });
  if (!current) return null;
  if (current.status === "paused") return current;

  if (current.status !== "active") {
    throw new FlowStatusTransitionError(
      "FLOW_NOT_ACTIVE",
      "Only active flows can be paused."
    );
  }

  return input.store.transitionStatus({
    ownerUserId: input.ownerUserId,
    flowId: input.flowId,
    fromStatuses: ["active"],
    toStatus: "paused",
    now: input.now
  });
}

function assertCanActivateFlow(flow: Pick<FlowRecord, "status" | "publishedVersionId">): void {
  if (!flow.publishedVersionId) {
    throw new FlowStatusTransitionError(
      "FLOW_NOT_PUBLISHED",
      "Flow must be published before activation."
    );
  }
  if (flow.status === "archived") {
    throw new FlowStatusTransitionError("FLOW_ARCHIVED", "Archived flows cannot be activated.");
  }
  if (!isActivatableStatus(flow.status)) {
    throw new FlowStatusTransitionError(
      "FLOW_NOT_PUBLISHED",
      "Only published or paused flows can be activated."
    );
  }
}

function isActivatableStatus(status: FlowStatus): status is "published" | "paused" {
  return status === "published" || status === "paused";
}
