import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { AiGenerationPort, AiGenerationResult, AiPromptDefinition } from "@elevenhouse/ai";
import type {
  AiUsageResourceEvidence,
  AiUsageSafeErrorCode
} from "@elevenhouse/domain";
import { normalizeAiUsageResourceEvidence } from "@elevenhouse/domain";
import { AI_GENERATION_PROVIDER, AI_RATE_LIMITER, AI_USAGE_RECORDER } from "./ai.tokens";
import { getAiFeaturePolicy } from "./ai-feature-policy";
import type { AiRateLimiterPort } from "./ai-rate-limiter";
import { createAiSafetyIdentifier } from "./ai-safety-identifier";
import {
  AiProviderAuthenticationError,
  AiProviderBadRequestError,
  AiProviderBillingError,
  AiProviderIncompleteResponseError,
  AiProviderRateLimitError,
  AiProviderRefusalError,
  AiProviderResponseFormatError,
  AiProviderServerError,
  AiProviderTimeoutError,
  AiProviderUnavailableError
} from "./openai-ai-provider";
import type { AiUsageRecorderPort } from "./ai-usage-recorder";

type AiGenerationRuntimeConfig = {
  readonly enabled: boolean;
  readonly maxOutputTokens: number;
};

const AI_USAGE_EVIDENCE_WRITE_ATTEMPTS = 2;

@Injectable()
export class AiGenerationService {
  constructor(
    @Inject(AI_GENERATION_PROVIDER) private readonly provider: AiGenerationPort,
    @Inject(AI_RATE_LIMITER) private readonly rateLimiter: AiRateLimiterPort,
    @Inject(AI_USAGE_RECORDER) private readonly usageRecorder: AiUsageRecorderPort,
    private readonly configService: ConfigService
  ) {}

  async generate<TInput, TOutput>(input: {
    readonly prompt: AiPromptDefinition<TInput, TOutput>;
    readonly input: TInput;
    readonly ownerUserId: string;
    readonly feature: string;
    readonly resourceEvidence?: AiUsageResourceEvidence;
  }): Promise<AiGenerationResult<TOutput>> {
    const aiConfig = this.configService.getOrThrow<AiGenerationRuntimeConfig>("astrologerApi.ai");

    if (!aiConfig.enabled) {
      throw createAiProviderHttpException();
    }

    const featurePolicy = getAiFeaturePolicy(input.feature);
    if (!featurePolicy || featurePolicy.availability !== "enabled") {
      throw createAiFeaturePolicyHttpException();
    }
    const hasUsageEvidence = input.resourceEvidence !== undefined;
    if (
      (featurePolicy.usageEvidence === "required" && !hasUsageEvidence) ||
      (featurePolicy.usageEvidence === "forbidden" && hasUsageEvidence)
    ) {
      throw createAiUsageEvidenceHttpException();
    }

    let resourceEvidence: AiUsageResourceEvidence | null;
    try {
      resourceEvidence = normalizeAiUsageResourceEvidence(input.resourceEvidence ?? null);
    } catch {
      throw createAiUsageEvidenceHttpException();
    }

    const rateLimit = await this.rateLimiter.consume({ ownerUserId: input.ownerUserId });

    if (!rateLimit.allowed) {
      throw new HttpException(
        {
          message: "AI generation rate limit reached",
          retryAfterSeconds: rateLimit.retryAfterSeconds
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const promptInput = input.prompt.inputSchema.parse(input.input);
    const renderedPrompt = input.prompt.render(promptInput);
    const safetyIdentifier = createAiSafetyIdentifier(input.ownerUserId);
    const startedAt = new Date();
    const monotonicStartedAt = performance.now();
    const attemptId = randomUUID();
    await this.startUsageAttempt({
      attemptId,
      feature: input.feature,
      promptId: input.prompt.id,
      promptVersion: input.prompt.version,
      safetyIdentifier,
      resourceEvidence,
      startedAt
    });

    try {
      const result = await this.provider.generateStructured({
        prompt: renderedPrompt,
        modelProfile: input.prompt.modelProfile,
        responseSchema: input.prompt.outputSchema,
        maxOutputTokens: Math.min(input.prompt.maxOutputTokens, aiConfig.maxOutputTokens),
        reasoningEffort: input.prompt.reasoningEffort,
        safetyIdentifier,
        structuredOutputName: input.prompt.structuredOutputName,
        structuredOutputJsonSchema: input.prompt.structuredOutputJsonSchema,
        metadata: {
          feature: input.feature,
          provider: "openai",
          promptId: input.prompt.id,
          promptVersion: input.prompt.version,
          ownerUserId: safetyIdentifier
        }
      });
      const terminalTiming = createTerminalTiming(startedAt, monotonicStartedAt);
      await this.completeUsageAttempt({
        attemptId,
        result,
        ...terminalTiming
      });
      return result;
    } catch (error) {
      if (isUsageEvidenceHttpException(error)) throw error;
      const terminalTiming = createTerminalTiming(startedAt, monotonicStartedAt);
      await this.failUsageAttempt({
        attemptId,
        safeErrorCode: toSafeAiUsageErrorCode(error),
        ...terminalTiming
      });
      const httpException = mapAiProviderError(error);
      if (httpException) throw httpException;
      throw createAiProviderHttpException();
    }
  }

  private async startUsageAttempt(input: {
    readonly attemptId: string;
    readonly feature: string;
    readonly promptId: string;
    readonly promptVersion: number;
    readonly safetyIdentifier: string;
    readonly resourceEvidence: AiUsageResourceEvidence | null;
    readonly startedAt: Date;
  }): Promise<string> {
    const record = {
      attemptId: input.attemptId,
      feature: input.feature,
      promptId: input.promptId,
      promptVersion: input.promptVersion,
      provider: "openai" as const,
      ownerSafetyId: input.safetyIdentifier,
      resourceEvidence: input.resourceEvidence,
      startedAt: input.startedAt
    };
    try {
      const persistedAttemptId = await persistAiUsageEvidence(() =>
        this.usageRecorder.start(record)
      );
      if (persistedAttemptId !== input.attemptId) throw new Error("AI usage attempt id mismatch");
      return persistedAttemptId;
    } catch {
      throw createAiUsageEvidenceHttpException();
    }
  }

  private async completeUsageAttempt<TOutput>(input: {
    readonly attemptId: string;
    readonly result: AiGenerationResult<TOutput>;
    readonly durationMs: number;
    readonly completedAt: Date;
  }): Promise<void> {
    const record = {
      attemptId: input.attemptId,
      model: input.result.model,
      finishReason: input.result.finishReason,
      durationMs: input.durationMs,
      ...(input.result.usage ? { usage: input.result.usage } : {}),
      completedAt: input.completedAt
    };
    try {
      await persistAiUsageEvidence(() => this.usageRecorder.complete(record));
    } catch {
      throw createAiUsageEvidenceHttpException();
    }
  }

  private async failUsageAttempt(input: {
    readonly attemptId: string;
    readonly safeErrorCode: AiUsageSafeErrorCode;
    readonly durationMs: number;
    readonly completedAt: Date;
  }): Promise<void> {
    const record = {
      attemptId: input.attemptId,
      safeErrorCode: input.safeErrorCode,
      durationMs: input.durationMs,
      completedAt: input.completedAt
    };
    try {
      await persistAiUsageEvidence(() => this.usageRecorder.fail(record));
    } catch {
      throw createAiUsageEvidenceHttpException();
    }
  }
}

async function persistAiUsageEvidence<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < AI_USAGE_EVIDENCE_WRITE_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function createTerminalTiming(
  startedAt: Date,
  monotonicStartedAt: number
): { readonly durationMs: number; readonly completedAt: Date } {
  const elapsed = performance.now() - monotonicStartedAt;
  const durationMs = Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0;
  return {
    durationMs,
    completedAt: new Date(Math.max(Date.now(), startedAt.getTime()))
  };
}

function mapAiProviderError(error: unknown): HttpException | undefined {
  if (error instanceof AiProviderRefusalError) {
    return new HttpException(
      { message: "AI generation was refused for this input" },
      HttpStatus.UNPROCESSABLE_ENTITY
    );
  }

  if (
    error instanceof AiProviderBadRequestError ||
    error instanceof AiProviderResponseFormatError ||
    error instanceof AiProviderIncompleteResponseError
  ) {
    return new HttpException(
      { message: "AI generation returned invalid output" },
      HttpStatus.BAD_GATEWAY
    );
  }

  if (
    error instanceof AiProviderUnavailableError ||
    error instanceof AiProviderAuthenticationError ||
    error instanceof AiProviderBillingError ||
    error instanceof AiProviderRateLimitError ||
    error instanceof AiProviderServerError ||
    error instanceof AiProviderTimeoutError
  ) {
    return createAiProviderHttpException();
  }

  return undefined;
}

function createAiProviderHttpException(): HttpException {
  return new HttpException(
    { message: "AI generation is temporarily unavailable" },
    HttpStatus.SERVICE_UNAVAILABLE
  );
}

function createAiUsageEvidenceHttpException(): HttpException {
  return new HttpException(
    {
      message: "AI generation evidence is temporarily unavailable",
      code: "AI_USAGE_EVIDENCE_UNAVAILABLE"
    },
    HttpStatus.SERVICE_UNAVAILABLE
  );
}

function createAiFeaturePolicyHttpException(): HttpException {
  return new HttpException(
    {
      message: "AI feature processing authority is unavailable",
      code: "AI_FEATURE_PROCESSING_AUTHORITY_UNAVAILABLE"
    },
    HttpStatus.SERVICE_UNAVAILABLE
  );
}

function isUsageEvidenceHttpException(error: unknown): boolean {
  if (!(error instanceof HttpException) || error.getStatus() !== HttpStatus.SERVICE_UNAVAILABLE) {
    return false;
  }
  const response = error.getResponse();
  return (
    typeof response === "object" &&
    response !== null &&
    "code" in response &&
    response.code === "AI_USAGE_EVIDENCE_UNAVAILABLE"
  );
}

function toSafeAiUsageErrorCode(error: unknown): AiUsageSafeErrorCode {
  if (error instanceof AiProviderRefusalError) return "AI_PROVIDER_REFUSED";
  if (error instanceof AiProviderBadRequestError) return "AI_PROVIDER_BAD_REQUEST";
  if (error instanceof AiProviderResponseFormatError) return "AI_PROVIDER_RESPONSE_INVALID";
  if (error instanceof AiProviderIncompleteResponseError) {
    return "AI_PROVIDER_INCOMPLETE_RESPONSE";
  }
  if (error instanceof AiProviderUnavailableError) return "AI_PROVIDER_UNAVAILABLE";
  if (error instanceof AiProviderAuthenticationError) {
    return "AI_PROVIDER_AUTHENTICATION_FAILED";
  }
  if (error instanceof AiProviderBillingError) return "AI_PROVIDER_BILLING_FAILED";
  if (error instanceof AiProviderRateLimitError) return "AI_PROVIDER_RATE_LIMITED";
  if (error instanceof AiProviderServerError) return "AI_PROVIDER_SERVER_ERROR";
  if (error instanceof AiProviderTimeoutError) return "AI_PROVIDER_TIMEOUT";
  return "AI_PROVIDER_UNKNOWN_FAILURE";
}
