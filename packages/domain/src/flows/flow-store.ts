import type {
  FlowApprovalMode,
  FlowGraph,
  FlowResponse,
  FlowStatus,
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
  readonly updateDraft: (input: FlowStoreUpdateDraftInput) => Promise<FlowRecord | null>;
  readonly publishDraft: (
    input: FlowStorePublishDraftInput
  ) => Promise<FlowStorePublishResult | null>;
};
