import type {
  CalculationArtifact,
  CalculationClientLink,
  CalculationInterpretation,
  CalculationInterpretationSource,
  CalculationMode,
  CalculationModule,
  CalculationModuleFilter,
  CalculationParticipant,
  CalculationSavedData,
  CalculationStatus,
  CalculationStatusFilter
} from "./calculation-types";

export type CalculationRecord = CalculationSavedData & {
  readonly id: string;
  readonly ownerUserId: string;
  readonly module: CalculationModule;
  readonly mode: CalculationMode;
  readonly methodCode: string;
  readonly title: string;
  readonly status: CalculationStatus;
  readonly participants: readonly CalculationParticipant[];
  readonly links: readonly CalculationClientLink[];
  readonly interpretations: readonly CalculationInterpretation[];
  readonly artifacts: readonly CalculationArtifact[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CalculationListResult = {
  readonly calculations: readonly CalculationRecord[];
  readonly total: number;
};

export type CalculationStoreCreateInput = CalculationSavedData & {
  readonly ownerUserId: string;
  readonly module: CalculationModule;
  readonly mode: CalculationMode;
  readonly methodCode: string;
  readonly title: string;
  readonly participants: readonly CalculationParticipant[];
  readonly idGenerator: () => string;
  readonly now: string;
};

export type CalculationStoreReplaceResultInput = CalculationSavedData & {
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly participants: readonly CalculationParticipant[];
  readonly now: string;
};

export type CalculationStoreReplaceResultOutcome =
  | { readonly status: "updated"; readonly calculation: CalculationRecord }
  | { readonly status: "not_found" }
  | { readonly status: "exact_key_conflict" };

export type CalculationStore = {
  readonly listByOwner: (query: {
    readonly ownerUserId: string;
    readonly module: CalculationModuleFilter;
    readonly status: CalculationStatusFilter;
    readonly limit: number;
    readonly offset: number;
  }) => Promise<CalculationListResult>;
  readonly findByOwnerAndId: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
  }) => Promise<CalculationRecord | null>;
  readonly findExact: (input: {
    readonly ownerUserId: string;
    readonly module: CalculationModule;
    readonly mode: CalculationMode;
    readonly methodCode: string;
    readonly requestFingerprint: string;
  }) => Promise<CalculationRecord | null>;
  readonly create: (input: CalculationStoreCreateInput) => Promise<CalculationRecord>;
  readonly replaceResult: (
    input: CalculationStoreReplaceResultInput
  ) => Promise<CalculationStoreReplaceResultOutcome>;
  readonly ensureClientLinks: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly clientIds: readonly string[];
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
  readonly linkClient: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly clientId: string;
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
  readonly publishClientLink: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly clientId: string;
    readonly expectedResultChecksum: string;
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
  readonly saveInterpretation: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly source: CalculationInterpretationSource;
    readonly text: string;
    readonly modelId: string | null;
    readonly promptVersion: string | null;
    readonly interpretationIdGenerator: () => string;
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
  readonly approveInterpretation: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly interpretationId: string;
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
  readonly archive: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
};
