import type {
  CalculationArtifact,
  CalculationClientLink,
  CalculationInterpretation,
  CalculationInterpretationSource,
  CalculationMode,
  CalculationModule,
  CalculationParticipant,
  CalculationStatus,
  CalculationStatusFilter,
  CalculationVersion
} from "./calculation-types";

export type CalculationRecord = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly module: CalculationModule;
  readonly mode: CalculationMode;
  readonly methodCode: string;
  readonly currentMethodVersion: string;
  readonly title: string;
  readonly status: CalculationStatus;
  readonly participants: readonly CalculationParticipant[];
  readonly versions: readonly CalculationVersion[];
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

export type CalculationStoreCreateInput = {
  readonly ownerUserId: string;
  readonly module: CalculationModule;
  readonly mode: CalculationMode;
  readonly methodCode: string;
  readonly methodVersion: string;
  readonly title: string;
  readonly participants: readonly CalculationParticipant[];
  readonly settingsSnapshot: unknown;
  readonly inputSnapshot: unknown;
  readonly resultSnapshot: unknown;
  readonly resultSummary: unknown;
  readonly resultChecksum: string;
  readonly idGenerator: () => string;
  readonly versionIdGenerator: () => string;
  readonly now: string;
};

export type CalculationStoreAppendVersionInput = {
  readonly ownerUserId: string;
  readonly calculationId: string;
  readonly methodVersion: string;
  readonly settingsSnapshot: unknown;
  readonly inputSnapshot: unknown;
  readonly resultSnapshot: unknown;
  readonly resultSummary: unknown;
  readonly resultChecksum: string;
  readonly versionIdGenerator: () => string;
  readonly now: string;
};

export type CalculationStore = {
  readonly listByOwner: (query: {
    readonly ownerUserId: string;
    readonly status: CalculationStatusFilter;
    readonly limit: number;
    readonly offset: number;
  }) => Promise<CalculationListResult>;
  readonly findByOwnerAndId: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
  }) => Promise<CalculationRecord | null>;
  readonly create: (input: CalculationStoreCreateInput) => Promise<CalculationRecord>;
  /**
   * Appends a new immutable version. Implementations must also demote any
   * visible client links transactionally so stale published results are no
   * longer visible after recalculation, then set status to "linked" when
   * links remain or "calculated" when they do not.
   */
  readonly appendVersion: (
    input: CalculationStoreAppendVersionInput
  ) => Promise<CalculationRecord | null>;
  /**
   * Links a CRM client idempotently. Adapters must enforce uniqueness for
   * (calculationId, clientId), because the use-case precheck cannot prevent
   * concurrent duplicate inserts by itself.
   */
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
    readonly now: string;
  }) => Promise<CalculationRecord | null>;
  readonly saveInterpretation: (input: {
    readonly ownerUserId: string;
    readonly calculationId: string;
    readonly versionId: string;
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
