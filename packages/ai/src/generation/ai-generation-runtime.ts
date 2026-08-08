import type { AiGenerationPort } from "./ai-generation-port";
import type { AiGenerationResult, AiPromptDefinition } from "./ai-generation-types";

export type AiGenerationFeaturePolicy = {
  readonly usageEvidence: "forbidden" | "required";
  readonly availability: "enabled" | "blocked_pending_purpose_authority";
};

export type AiGenerationRateLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export type AiGenerationRateLimiter = {
  readonly consume: (input: { readonly ownerUserId: string }) => Promise<AiGenerationRateLimitDecision>;
};

export type AiGenerationUsageRecorder<TResourceEvidence, TSafeError extends string> = {
  readonly start: (record: {
    readonly attemptId: string;
    readonly feature: string;
    readonly promptId: string;
    readonly promptVersion: number;
    readonly provider: "openai";
    readonly ownerSafetyId: string;
    readonly resourceEvidence: TResourceEvidence | null;
    readonly startedAt: Date;
  }) => Promise<string>;
  readonly complete: (record: {
    readonly attemptId: string;
    readonly model: string;
    readonly finishReason: string;
    readonly durationMs: number;
    readonly usage?: AiGenerationResult<unknown>["usage"];
    readonly completedAt: Date;
  }) => Promise<void>;
  readonly fail: (record: {
    readonly attemptId: string;
    readonly safeErrorCode: TSafeError;
    readonly durationMs: number;
    readonly completedAt: Date;
  }) => Promise<void>;
};

export class AiGenerationUnavailableError extends Error {
  constructor() {
    super("AI generation is temporarily unavailable");
    this.name = "AiGenerationUnavailableError";
  }
}

export class AiGenerationFeatureUnavailableError extends Error {
  constructor() {
    super("AI feature processing authority is unavailable");
    this.name = "AiGenerationFeatureUnavailableError";
  }
}

export class AiGenerationUsageEvidenceError extends Error {
  constructor() {
    super("AI generation evidence is temporarily unavailable");
    this.name = "AiGenerationUsageEvidenceError";
  }
}

export class AiGenerationRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("AI generation rate limit reached");
    this.name = "AiGenerationRateLimitedError";
  }
}

export function createAiGenerationRuntime<TResourceEvidence, TSafeError extends string>(input: {
  readonly provider: AiGenerationPort;
  readonly rateLimiter: AiGenerationRateLimiter;
  readonly usageRecorder: AiGenerationUsageRecorder<TResourceEvidence, TSafeError>;
  readonly getRuntimeConfig: () => { readonly enabled: boolean; readonly maxOutputTokens: number };
  readonly getFeaturePolicy: (feature: string) => AiGenerationFeaturePolicy | null;
  readonly normalizeResourceEvidence: (
    evidence: TResourceEvidence | undefined
  ) => TResourceEvidence | null;
  readonly createSafetyIdentifier: (ownerUserId: string) => string;
  readonly toSafeErrorCode: (error: unknown) => TSafeError;
  readonly idGenerator: () => string;
  readonly now?: () => Date;
  readonly monotonicNow?: () => number;
  readonly usageEvidenceWriteAttempts?: number;
}) {
  const now = input.now ?? (() => new Date());
  const monotonicNow = input.monotonicNow ?? (() => performance.now());
  const usageEvidenceWriteAttempts = input.usageEvidenceWriteAttempts ?? 2;

  return {
    generate: async <TInput, TOutput>(request: {
      readonly prompt: AiPromptDefinition<TInput, TOutput>;
      readonly input: TInput;
      readonly ownerUserId: string;
      readonly feature: string;
      readonly resourceEvidence?: TResourceEvidence;
    }): Promise<AiGenerationResult<TOutput>> => {
      const config = input.getRuntimeConfig();
      if (!config.enabled) throw new AiGenerationUnavailableError();

      const featurePolicy = input.getFeaturePolicy(request.feature);
      if (!featurePolicy || featurePolicy.availability !== "enabled") {
        throw new AiGenerationFeatureUnavailableError();
      }
      const hasUsageEvidence = request.resourceEvidence !== undefined;
      if (
        (featurePolicy.usageEvidence === "required" && !hasUsageEvidence) ||
        (featurePolicy.usageEvidence === "forbidden" && hasUsageEvidence)
      ) {
        throw new AiGenerationUsageEvidenceError();
      }

      let resourceEvidence: TResourceEvidence | null;
      try {
        resourceEvidence = input.normalizeResourceEvidence(request.resourceEvidence);
      } catch {
        throw new AiGenerationUsageEvidenceError();
      }

      const rateLimit = await input.rateLimiter.consume({ ownerUserId: request.ownerUserId });
      if (!rateLimit.allowed) throw new AiGenerationRateLimitedError(rateLimit.retryAfterSeconds);

      const promptInput = request.prompt.inputSchema.parse(request.input);
      const renderedPrompt = request.prompt.render(promptInput);
      const safetyIdentifier = input.createSafetyIdentifier(request.ownerUserId);
      const startedAt = now();
      const monotonicStartedAt = monotonicNow();
      const attemptId = input.idGenerator();
      try {
        const persistedAttemptId = await persistUsageEvidence(
          () =>
            input.usageRecorder.start({
              attemptId,
              feature: request.feature,
              promptId: request.prompt.id,
              promptVersion: request.prompt.version,
              provider: "openai",
              ownerSafetyId: safetyIdentifier,
              resourceEvidence,
              startedAt
            }),
          usageEvidenceWriteAttempts
        );
        if (persistedAttemptId !== attemptId) throw new Error("AI usage attempt id mismatch");
      } catch {
        throw new AiGenerationUsageEvidenceError();
      }

      try {
        const result = await input.provider.generateStructured<TOutput>({
          prompt: renderedPrompt,
          modelProfile: request.prompt.modelProfile,
          responseSchema: request.prompt.outputSchema,
          maxOutputTokens: Math.min(request.prompt.maxOutputTokens, config.maxOutputTokens),
          reasoningEffort: request.prompt.reasoningEffort,
          safetyIdentifier,
          structuredOutputName: request.prompt.structuredOutputName,
          structuredOutputJsonSchema: request.prompt.structuredOutputJsonSchema,
          metadata: {
            feature: request.feature,
            provider: "openai",
            promptId: request.prompt.id,
            promptVersion: request.prompt.version,
            ownerUserId: safetyIdentifier
          }
        });
        const timing = terminalTiming(startedAt, monotonicStartedAt, now, monotonicNow);
        try {
          await persistUsageEvidence(
            () =>
              input.usageRecorder.complete({
                attemptId,
                model: result.model,
                finishReason: result.finishReason,
                durationMs: timing.durationMs,
                ...(result.usage ? { usage: result.usage } : {}),
                completedAt: timing.completedAt
              }),
            usageEvidenceWriteAttempts
          );
        } catch {
          throw new AiGenerationUsageEvidenceError();
        }
        return result;
      } catch (error) {
        if (error instanceof AiGenerationUsageEvidenceError) throw error;
        const timing = terminalTiming(startedAt, monotonicStartedAt, now, monotonicNow);
        try {
          await persistUsageEvidence(
            () =>
              input.usageRecorder.fail({
                attemptId,
                safeErrorCode: input.toSafeErrorCode(error),
                durationMs: timing.durationMs,
                completedAt: timing.completedAt
              }),
            usageEvidenceWriteAttempts
          );
        } catch {
          throw new AiGenerationUsageEvidenceError();
        }
        throw error;
      }
    }
  };
}

async function persistUsageEvidence<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function terminalTiming(
  startedAt: Date,
  monotonicStartedAt: number,
  now: () => Date,
  monotonicNow: () => number
): { readonly durationMs: number; readonly completedAt: Date } {
  const elapsed = monotonicNow() - monotonicStartedAt;
  const durationMs = Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0;
  return { durationMs, completedAt: new Date(Math.max(now().getTime(), startedAt.getTime())) };
}
