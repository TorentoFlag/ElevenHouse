import type {
  FlowApprovalMode,
  FlowGraph,
  FlowResponse,
  FlowStatus,
  FlowTriggerKind,
  FlowVersion
} from "@elevenhouse/contracts";

export type FlowRecord = FlowResponse;

export type FlowStoreListInput = {
  readonly ownerUserId: string;
  readonly status: FlowStatus | "all";
  readonly limit: number;
  readonly offset: number;
};

export type FlowStoreCreateDraftInput = {
  readonly ownerUserId: string;
  readonly name: string;
  readonly approvalMode: FlowApprovalMode;
  readonly graph: FlowGraph;
  readonly now: string;
};

export type FlowStoreUpdateDraftInput = {
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly patch: {
    readonly name?: string;
    readonly approvalMode?: FlowApprovalMode;
    readonly graph?: FlowGraph;
  };
  readonly now: string;
};

export type FlowStorePublishDraftInput = {
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly now: string;
};

export type FlowStoreTransitionStatusInput = {
  readonly ownerUserId: string;
  readonly flowId: string;
  readonly fromStatuses: readonly FlowStatus[];
  readonly toStatus: FlowStatus;
  readonly now: string;
};

export type FlowStoreListActiveByTriggerKindInput = {
  readonly ownerUserId: string;
  readonly triggerKind: FlowTriggerKind;
};

export type FlowStorePublishResult = {
  readonly flow: FlowRecord;
  readonly version: FlowVersion;
};

export type FlowStore = {
  readonly createDraft: (input: FlowStoreCreateDraftInput) => Promise<FlowRecord>;
  readonly listByOwner: (
    input: FlowStoreListInput
  ) => Promise<{ readonly flows: readonly FlowRecord[]; readonly total: number }>;
  readonly findByOwnerAndId: (input: {
    readonly ownerUserId: string;
    readonly flowId: string;
  }) => Promise<FlowRecord | null>;
  readonly findPublishedVersionByFlowId: (input: {
    readonly ownerUserId: string;
    readonly flowId: string;
  }) => Promise<FlowVersion | null>;
  readonly listActiveByTriggerKind: (
    input: FlowStoreListActiveByTriggerKindInput
  ) => Promise<readonly FlowRecord[]>;
  readonly transitionStatus: (input: FlowStoreTransitionStatusInput) => Promise<FlowRecord | null>;
  readonly updateDraft: (input: FlowStoreUpdateDraftInput) => Promise<FlowRecord | null>;
  readonly publishDraft: (
    input: FlowStorePublishDraftInput
  ) => Promise<FlowStorePublishResult | null>;
};
