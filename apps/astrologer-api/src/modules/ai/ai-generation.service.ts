import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import {
  AiGenerationFeatureUnavailableError,
  AiGenerationRateLimitedError,
  AiGenerationUnavailableError,
  AiGenerationUsageEvidenceError,
  createAiGenerationRuntime,
  type AiGenerationResult,
  type AiPromptDefinition
} from "@elevenhouse/ai";
import type { AiUsageResourceEvidence, AiUsageSafeErrorCode } from "@elevenhouse/domain";
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

@Injectable()
export class AiGenerationService {
  private readonly runtime;

  constructor(
    @Inject(AI_GENERATION_PROVIDER) private readonly provider: import("@elevenhouse/ai").AiGenerationPort,
    @Inject(AI_RATE_LIMITER) private readonly rateLimiter: AiRateLimiterPort,
    @Inject(AI_USAGE_RECORDER) private readonly usageRecorder: AiUsageRecorderPort,
    private readonly configService: ConfigService
  ) {
    this.runtime = createAiGenerationRuntime<AiUsageResourceEvidence, AiUsageSafeErrorCode>({
      provider: this.provider,
      rateLimiter: this.rateLimiter,
      usageRecorder: this.usageRecorder,
      getRuntimeConfig: () =>
        this.configService.getOrThrow<AiGenerationRuntimeConfig>("astrologerApi.ai"),
      getFeaturePolicy: getAiFeaturePolicy,
      normalizeResourceEvidence: (evidence) =>
        normalizeAiUsageResourceEvidence(evidence ?? null),
      createSafetyIdentifier: createAiSafetyIdentifier,
      toSafeErrorCode: toSafeAiUsageErrorCode,
      idGenerator: randomUUID
    });
  }

  async generate<TInput, TOutput>(input: {
    readonly prompt: AiPromptDefinition<TInput, TOutput>;
    readonly input: TInput;
    readonly ownerUserId: string;
    readonly feature: string;
    readonly resourceEvidence?: AiUsageResourceEvidence;
  }): Promise<AiGenerationResult<TOutput>> {
    try {
      return await this.runtime.generate(input);
    } catch (error) {
      if (error instanceof AiGenerationRateLimitedError) {
        throw new HttpException(
          { message: "AI generation rate limit reached", retryAfterSeconds: error.retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      if (error instanceof AiGenerationUsageEvidenceError) throw createAiUsageEvidenceHttpException();
      if (error instanceof AiGenerationFeatureUnavailableError) {
        throw createAiFeaturePolicyHttpException();
      }
      if (error instanceof AiGenerationUnavailableError) throw createAiProviderHttpException();
      const mapped = mapAiProviderError(error);
      if (mapped) throw mapped;
      throw createAiProviderHttpException();
    }
  }
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

function toSafeAiUsageErrorCode(error: unknown): AiUsageSafeErrorCode {
  if (error instanceof AiProviderRefusalError) return "AI_PROVIDER_REFUSED";
  if (error instanceof AiProviderBadRequestError) return "AI_PROVIDER_BAD_REQUEST";
  if (error instanceof AiProviderResponseFormatError) return "AI_PROVIDER_RESPONSE_INVALID";
  if (error instanceof AiProviderIncompleteResponseError) return "AI_PROVIDER_INCOMPLETE_RESPONSE";
  if (error instanceof AiProviderUnavailableError) return "AI_PROVIDER_UNAVAILABLE";
  if (error instanceof AiProviderAuthenticationError) return "AI_PROVIDER_AUTHENTICATION_FAILED";
  if (error instanceof AiProviderBillingError) return "AI_PROVIDER_BILLING_FAILED";
  if (error instanceof AiProviderRateLimitError) return "AI_PROVIDER_RATE_LIMITED";
  if (error instanceof AiProviderServerError) return "AI_PROVIDER_SERVER_ERROR";
  if (error instanceof AiProviderTimeoutError) return "AI_PROVIDER_TIMEOUT";
  return "AI_PROVIDER_UNKNOWN_FAILURE";
}
