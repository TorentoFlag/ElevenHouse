import { sha256CanonicalJson, type CanonicalJson } from "../calculations";

export const chartAiDraftCommandScope = "charts.ai-draft.v1" as const;
export const chartAiDraftCommandTtlMs = 24 * 60 * 60 * 1_000;

export type ChartAiDraftCommandSuccess = {
  readonly schemaVersion: "chart-ai-draft-command-result.v1";
  readonly kind: "success";
  readonly calculationId: string;
  readonly interpretationId: string;
};

export type ChartAiDraftCommandKnownFailure = {
  readonly schemaVersion: "chart-ai-draft-command-result.v1";
  readonly kind: "known_failure";
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
};

export type ChartAiDraftCommandUnknownOutcome = {
  readonly schemaVersion: "chart-ai-draft-command-result.v1";
  readonly kind: "unknown_outcome";
  readonly code: "CHART_AI_DRAFT_OUTCOME_UNKNOWN";
  readonly message: string;
};

export type ChartAiDraftCommandResult =
  | ChartAiDraftCommandSuccess
  | ChartAiDraftCommandKnownFailure
  | ChartAiDraftCommandUnknownOutcome;

export type ChartAiDraftCommandAcquireOutcome =
  | { readonly kind: "acquired"; readonly commandId: string }
  | { readonly kind: "processing"; readonly commandId: string; readonly updatedAt: string }
  | {
      readonly kind: "completed";
      readonly commandId: string;
      readonly result: ChartAiDraftCommandResult;
    };

export type ChartAiDraftCommandStore = {
  /** The insert is committed before this method resolves, before any provider call. */
  readonly acquire: (input: {
    readonly actorUserId: string;
    readonly key: string;
    readonly requestHash: string;
    readonly now: string;
    readonly expiresAt: string;
  }) => Promise<ChartAiDraftCommandAcquireOutcome>;
  /** Completes or recovers success only when the deterministic interpretation exists. */
  readonly completeSuccess: (input: {
    readonly commandId: string;
    readonly actorUserId: string;
    readonly calculationId: string;
    readonly expectedResultChecksum: string;
    readonly now: string;
  }) => Promise<ChartAiDraftCommandResult | null>;
  readonly completeKnownFailure: (input: {
    readonly commandId: string;
    readonly actorUserId: string;
    readonly failure: Omit<ChartAiDraftCommandKnownFailure, "schemaVersion" | "kind">;
    readonly now: string;
  }) => Promise<ChartAiDraftCommandResult>;
  readonly completeUnknownOutcome: (input: {
    readonly commandId: string;
    readonly actorUserId: string;
    readonly now: string;
  }) => Promise<ChartAiDraftCommandResult>;
  /** DB-clock recovery for crashed provider commands; never infers success or provider failure. */
  readonly reconcileExpiredProcessing: (input: {
    readonly retentionMs: number;
    readonly limit: number;
  }) => Promise<number>;
};

export function buildChartAiDraftCommandRequestHash(input: {
  readonly actorUserId: string;
  readonly calculationId: string;
  readonly body: { readonly expectedResultChecksum: string };
}): `sha256:${string}` {
  return sha256CanonicalJson({
    apiSurface: "astrologer-api",
    commandScope: chartAiDraftCommandScope,
    actorUserId: input.actorUserId,
    calculationId: input.calculationId,
    body: {
      expectedResultChecksum: input.body.expectedResultChecksum
    }
  } satisfies CanonicalJson);
}

export class ChartAiDraftIdempotencyKeyReuseError extends Error {
  readonly code = "CHART_AI_DRAFT_IDEMPOTENCY_KEY_REUSED" as const;

  constructor() {
    super("Idempotency key was already used for a different chart AI draft request");
    this.name = "ChartAiDraftIdempotencyKeyReuseError";
  }
}

export class ChartAiDraftInProgressError extends Error {
  readonly code = "CHART_AI_DRAFT_IN_PROGRESS" as const;

  constructor() {
    super("Chart AI draft generation is already in progress");
    this.name = "ChartAiDraftInProgressError";
  }
}

export class ChartAiDraftOutcomeUnknownError extends Error {
  readonly code = "CHART_AI_DRAFT_OUTCOME_UNKNOWN" as const;

  constructor() {
    super("Chart AI draft provider outcome requires reconciliation");
    this.name = "ChartAiDraftOutcomeUnknownError";
  }
}
