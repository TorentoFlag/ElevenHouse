import { randomUUID } from "node:crypto";

export const aiUsageStatusValues = ["started", "succeeded", "failed", "indeterminate"] as const;
export type AiUsageStatus = (typeof aiUsageStatusValues)[number];

export const aiUsageSafeErrorCodeValues = [
  "AI_PROVIDER_REFUSED",
  "AI_PROVIDER_BAD_REQUEST",
  "AI_PROVIDER_RESPONSE_INVALID",
  "AI_PROVIDER_INCOMPLETE_RESPONSE",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_PROVIDER_AUTHENTICATION_FAILED",
  "AI_PROVIDER_BILLING_FAILED",
  "AI_PROVIDER_RATE_LIMITED",
  "AI_PROVIDER_SERVER_ERROR",
  "AI_PROVIDER_TIMEOUT",
  "AI_PROVIDER_UNKNOWN_FAILURE",
  "AI_USAGE_OUTCOME_INDETERMINATE"
] as const;
export type AiUsageSafeErrorCode = (typeof aiUsageSafeErrorCodeValues)[number];

export type AiUsageTokenEvidence = {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
};

export type AiUsageAttempt = {
  readonly id: string;
  readonly status: AiUsageStatus;
  readonly feature: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly provider: string;
  readonly ownerSafetyId: string;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly sourceChecksum: string | null;
  readonly model: string | null;
  readonly finishReason: string | null;
  readonly safeErrorCode: AiUsageSafeErrorCode | null;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
  readonly durationMs: number | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
};

export type AiUsageResourceEvidence = {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly sourceChecksum: string;
};

export type AiUsageAttemptStartInput = Pick<
  AiUsageAttempt,
  "id" | "feature" | "promptId" | "promptVersion" | "provider" | "ownerSafetyId" | "startedAt"
> & {
  readonly resourceEvidence: AiUsageResourceEvidence | null;
};

export type AiUsageAttemptCompleteInput = {
  readonly attemptId: string;
  readonly model: string;
  readonly finishReason: string;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
  readonly durationMs: number;
  readonly completedAt: string;
};

export type AiUsageAttemptFailInput = {
  readonly attemptId: string;
  readonly safeErrorCode: AiUsageSafeErrorCode;
  readonly durationMs: number;
  readonly completedAt: string;
};

export type AiUsageAttemptReconcileInput = {
  readonly startedBefore: string;
  readonly reconciledAt: string;
  readonly limit: number;
};

export type AiUsageStore = {
  readonly startAttempt: (input: AiUsageAttemptStartInput) => Promise<AiUsageAttempt>;
  readonly completeAttempt: (input: AiUsageAttemptCompleteInput) => Promise<AiUsageAttempt | null>;
  readonly failAttempt: (input: AiUsageAttemptFailInput) => Promise<AiUsageAttempt | null>;
  readonly reconcileStaleAttempts: (
    input: AiUsageAttemptReconcileInput
  ) => Promise<readonly AiUsageAttempt[]>;
};

export class AiUsageValidationError extends Error {
  readonly code = "AI_USAGE_VALIDATION_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "AiUsageValidationError";
  }
}

export class AiUsageLifecycleError extends Error {
  readonly code = "AI_USAGE_LIFECYCLE_FAILED";

  constructor(message = "AI usage attempt is missing or already finalized") {
    super(message);
    this.name = "AiUsageLifecycleError";
  }
}

export async function startAiUsageAttempt(input: {
  readonly store: Pick<AiUsageStore, "startAttempt">;
  readonly idGenerator?: () => string;
  readonly feature: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly provider: string;
  readonly ownerSafetyId: string;
  readonly resourceEvidence: AiUsageResourceEvidence | null;
  readonly now: Date;
}): Promise<AiUsageAttempt> {
  const resourceEvidence = normalizeAiUsageResourceEvidence(input.resourceEvidence);
  const command: AiUsageAttemptStartInput = {
    id: uuid((input.idGenerator ?? randomUUID)(), "AI usage attempt id is invalid"),
    feature: required(input.feature, "AI usage feature is required", 160),
    promptId: required(input.promptId, "AI usage prompt id is required", 160),
    promptVersion: positiveInteger(input.promptVersion, "AI usage prompt version is invalid"),
    provider: required(input.provider, "AI usage provider is required", 80),
    ownerSafetyId: safetyIdentifier(input.ownerSafetyId),
    resourceEvidence,
    startedAt: timestamp(input.now, "AI usage start time is invalid")
  };
  const record = await input.store.startAttempt(command);
  assertStartedAttempt(record, command);
  return record;
}

export function normalizeAiUsageResourceEvidence(
  resourceEvidence: AiUsageResourceEvidence | null
): AiUsageResourceEvidence | null {
  return normalizeResourceEvidence(resourceEvidence);
}

export async function completeAiUsageAttempt(input: {
  readonly store: Pick<AiUsageStore, "completeAttempt">;
  readonly attemptId: string;
  readonly model: string;
  readonly finishReason: string;
  readonly durationMs: number;
  readonly usage?: AiUsageTokenEvidence;
  readonly now: Date;
}): Promise<AiUsageAttempt> {
  const usage = normalizeTokenEvidence(input.usage);
  const command: AiUsageAttemptCompleteInput = {
    attemptId: uuid(input.attemptId, "AI usage attempt id is invalid"),
    model: required(input.model, "AI usage model is required", 160),
    finishReason: required(input.finishReason, "AI usage finish reason is required", 120),
    ...usage,
    durationMs: nonNegativeInteger(input.durationMs, "AI usage duration is invalid"),
    completedAt: timestamp(input.now, "AI usage completion time is invalid")
  };
  const record = await input.store.completeAttempt(command);
  if (!record) throw new AiUsageLifecycleError();
  assertCompletedAttempt(record, command);
  return record;
}

export async function failAiUsageAttempt(input: {
  readonly store: Pick<AiUsageStore, "failAttempt">;
  readonly attemptId: string;
  readonly safeErrorCode: AiUsageSafeErrorCode;
  readonly durationMs: number;
  readonly now: Date;
}): Promise<AiUsageAttempt> {
  if (!aiUsageSafeErrorCodeValues.includes(input.safeErrorCode)) {
    throw new AiUsageValidationError("AI usage safe error code is invalid");
  }
  const command: AiUsageAttemptFailInput = {
    attemptId: uuid(input.attemptId, "AI usage attempt id is invalid"),
    safeErrorCode: input.safeErrorCode,
    durationMs: nonNegativeInteger(input.durationMs, "AI usage duration is invalid"),
    completedAt: timestamp(input.now, "AI usage completion time is invalid")
  };
  const record = await input.store.failAttempt(command);
  if (!record) throw new AiUsageLifecycleError();
  assertFailedAttempt(record, command);
  return record;
}

export async function reconcileStaleAiUsageAttempts(input: {
  readonly store: Pick<AiUsageStore, "reconcileStaleAttempts">;
  readonly startedBefore: Date;
  readonly now: Date;
  readonly limit: number;
}): Promise<readonly AiUsageAttempt[]> {
  const command: AiUsageAttemptReconcileInput = {
    startedBefore: timestamp(input.startedBefore, "AI usage stale cutoff is invalid"),
    reconciledAt: timestamp(input.now, "AI usage reconciliation time is invalid"),
    limit: boundedPositiveInteger(input.limit, 1_000, "AI usage reconciliation limit is invalid")
  };
  if (Date.parse(command.startedBefore) > Date.parse(command.reconciledAt)) {
    throw new AiUsageValidationError(
      "AI usage stale cutoff must not follow reconciliation time"
    );
  }
  const records = await input.store.reconcileStaleAttempts(command);
  if (records.length > command.limit) {
    throw new AiUsageLifecycleError("AI usage reconciliation exceeded its bounded claim");
  }
  const seenIds = new Set<string>();
  for (const record of records) {
    if (seenIds.has(record.id)) {
      throw new AiUsageLifecycleError("AI usage reconciliation returned duplicate evidence");
    }
    seenIds.add(record.id);
    assertIndeterminateAttempt(record, command);
  }
  return records;
}

function normalizeTokenEvidence(
  usage: AiUsageTokenEvidence | undefined
): Pick<AiUsageAttemptCompleteInput, "promptTokens" | "completionTokens" | "totalTokens"> {
  if (!usage) {
    return { promptTokens: null, completionTokens: null, totalTokens: null };
  }
  const promptTokens = nonNegativeInteger(usage.promptTokens, "AI usage prompt tokens are invalid");
  const completionTokens = nonNegativeInteger(
    usage.completionTokens,
    "AI usage completion tokens are invalid"
  );
  const totalTokens = nonNegativeInteger(usage.totalTokens, "AI usage total tokens are invalid");
  if (totalTokens !== promptTokens + completionTokens) {
    throw new AiUsageValidationError(
      "AI usage total tokens must equal prompt and completion tokens"
    );
  }
  return { promptTokens, completionTokens, totalTokens };
}

function assertStartedAttempt(record: AiUsageAttempt, command: AiUsageAttemptStartInput): void {
  if (
    record.id !== command.id ||
    record.status !== "started" ||
    record.feature !== command.feature ||
    record.promptId !== command.promptId ||
    record.promptVersion !== command.promptVersion ||
    record.provider !== command.provider ||
    record.ownerSafetyId !== command.ownerSafetyId ||
    record.resourceType !== (command.resourceEvidence?.resourceType ?? null) ||
    record.resourceId !== (command.resourceEvidence?.resourceId ?? null) ||
    record.sourceChecksum !== (command.resourceEvidence?.sourceChecksum ?? null) ||
    record.startedAt !== command.startedAt ||
    record.model !== null ||
    record.finishReason !== null ||
    record.safeErrorCode !== null ||
    record.promptTokens !== null ||
    record.completionTokens !== null ||
    record.totalTokens !== null ||
    record.durationMs !== null ||
    record.completedAt !== null
  ) {
    throw new AiUsageLifecycleError("Started AI usage evidence does not match its command");
  }
}

function normalizeResourceEvidence(
  value: AiUsageResourceEvidence | null
): AiUsageResourceEvidence | null {
  if (value === null) return null;
  return {
    resourceType: required(value.resourceType, "AI usage resource type is invalid", 80),
    resourceId: uuid(value.resourceId, "AI usage resource id is invalid"),
    sourceChecksum: digest(value.sourceChecksum, "AI usage source checksum is invalid")
  };
}

function assertCompletedAttempt(
  record: AiUsageAttempt,
  command: AiUsageAttemptCompleteInput
): void {
  if (
    record.id !== command.attemptId ||
    record.status !== "succeeded" ||
    record.model !== command.model ||
    record.finishReason !== command.finishReason ||
    record.safeErrorCode !== null ||
    record.promptTokens !== command.promptTokens ||
    record.completionTokens !== command.completionTokens ||
    record.totalTokens !== command.totalTokens ||
    record.durationMs !== command.durationMs ||
    record.completedAt !== command.completedAt ||
    !isChronological(record.startedAt, record.completedAt)
  ) {
    throw new AiUsageLifecycleError("Completed AI usage evidence does not match its command");
  }
}

function assertFailedAttempt(record: AiUsageAttempt, command: AiUsageAttemptFailInput): void {
  if (
    record.id !== command.attemptId ||
    record.status !== "failed" ||
    record.safeErrorCode !== command.safeErrorCode ||
    record.durationMs !== command.durationMs ||
    record.completedAt !== command.completedAt ||
    record.model !== null ||
    record.finishReason !== null ||
    record.promptTokens !== null ||
    record.completionTokens !== null ||
    record.totalTokens !== null ||
    !isChronological(record.startedAt, record.completedAt)
  ) {
    throw new AiUsageLifecycleError("Failed AI usage evidence does not match its command");
  }
}

function assertIndeterminateAttempt(
  record: AiUsageAttempt,
  command: AiUsageAttemptReconcileInput
): void {
  const expectedDurationMs = Math.min(
    2_147_483_647,
    Date.parse(command.reconciledAt) - Date.parse(record.startedAt)
  );
  if (
    record.status !== "indeterminate" ||
    record.safeErrorCode !== "AI_USAGE_OUTCOME_INDETERMINATE" ||
    record.model !== null ||
    record.finishReason !== null ||
    record.promptTokens !== null ||
    record.completionTokens !== null ||
    record.totalTokens !== null ||
    record.startedAt > command.startedBefore ||
    record.completedAt !== command.reconciledAt ||
    record.durationMs !== expectedDurationMs ||
    expectedDurationMs < 0
  ) {
    throw new AiUsageLifecycleError(
      "Indeterminate AI usage evidence does not match its reconciliation claim"
    );
  }
}

function isChronological(startedAt: string, completedAt: string | null): boolean {
  if (completedAt === null) return false;
  const startedAtMs = Date.parse(startedAt);
  const completedAtMs = Date.parse(completedAt);
  return (
    Number.isFinite(startedAtMs) && Number.isFinite(completedAtMs) && completedAtMs >= startedAtMs
  );
}

function required(value: string, message: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new AiUsageValidationError(message);
  return normalized;
}

function boundedPositiveInteger(value: number, maximum: number, message: string): number {
  const normalized = positiveInteger(value, message);
  if (normalized > maximum) throw new AiUsageValidationError(message);
  return normalized;
}

function digest(value: string, message: string): string {
  const normalized = value.trim();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    throw new AiUsageValidationError(message);
  }
  return normalized;
}

function uuid(value: string, message: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
  ) {
    throw new AiUsageValidationError(message);
  }
  return normalized;
}

function safetyIdentifier(value: string): string {
  const normalized = value.trim();
  if (!/^eh_[0-9a-f]{61}$/.test(normalized)) {
    throw new AiUsageValidationError("AI usage owner safety id is invalid");
  }
  return normalized;
}

function positiveInteger(value: number, message: string): number {
  if (!Number.isInteger(value) || value < 1) throw new AiUsageValidationError(message);
  return value;
}

function nonNegativeInteger(value: number, message: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new AiUsageValidationError(message);
  return value;
}

function timestamp(value: Date, message: string): string {
  if (Number.isNaN(value.getTime())) throw new AiUsageValidationError(message);
  return value.toISOString();
}
