import type {
  CreateFlowRequest,
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
