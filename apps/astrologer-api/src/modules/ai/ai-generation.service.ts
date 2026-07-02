import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AiGenerationPort, AiGenerationResult, AiPromptDefinition } from "@elevenhouse/ai";
import { AI_GENERATION_PROVIDER, AI_RATE_LIMITER, AI_USAGE_RECORDER } from "./ai.tokens";
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
import type { AiUsageRecord, AiUsageRecorderPort } from "./ai-usage-recorder";

type AiGenerationRuntimeConfig = {
  readonly enabled: boolean;
  readonly maxOutputTokens: number;
};

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
  }): Promise<AiGenerationResult<TOutput>> {
    const aiConfig = this.configService.getOrThrow<AiGenerationRuntimeConfig>("astrologerApi.ai");

    if (!aiConfig.enabled) {
      throw createAiProviderHttpException();
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

    const startedAt = Date.now();
    const promptInput = input.prompt.inputSchema.parse(input.input);
    const safetyIdentifier = createAiSafetyIdentifier(input.ownerUserId);
    const result = await this.generateWithProvider({
      feature: input.feature,
      prompt: input.prompt,
      promptInput,
      safetyIdentifier,
      maxOutputTokens: Math.min(input.prompt.maxOutputTokens, aiConfig.maxOutputTokens)
    });

    this.usageRecorder.record(
      createUsageRecord({
        feature: input.feature,
        promptId: input.prompt.id,
        promptVersion: input.prompt.version,
        ownerUserId: input.ownerUserId,
        durationMs: Date.now() - startedAt,
        result
      })
    );

    return result;
  }

  private async generateWithProvider<TInput, TOutput>(input: {
    readonly feature: string;
    readonly prompt: AiPromptDefinition<TInput, TOutput>;
    readonly promptInput: TInput;
    readonly safetyIdentifier: string;
    readonly maxOutputTokens: number;
  }): Promise<AiGenerationResult<TOutput>> {
    try {
      return await this.provider.generateStructured({
        prompt: input.prompt.render(input.promptInput),
        modelProfile: input.prompt.modelProfile,
        responseSchema: input.prompt.outputSchema,
        maxOutputTokens: input.maxOutputTokens,
        reasoningEffort: input.prompt.reasoningEffort,
        safetyIdentifier: input.safetyIdentifier,
        structuredOutputName: input.prompt.structuredOutputName,
        structuredOutputJsonSchema: input.prompt.structuredOutputJsonSchema,
        metadata: {
          feature: input.feature,
          provider: "openai",
          promptId: input.prompt.id,
          promptVersion: input.prompt.version,
          ownerUserId: input.safetyIdentifier
        }
      });
    } catch (error) {
      const httpException = mapAiProviderError(error);
      if (httpException) {
        throw httpException;
      }

      throw error;
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
    return new HttpException({ message: "AI generation returned invalid output" }, HttpStatus.BAD_GATEWAY);
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

function createUsageRecord<TOutput>(input: {
  readonly feature: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly ownerUserId: string;
  readonly durationMs: number;
  readonly result: AiGenerationResult<TOutput>;
}): AiUsageRecord {
  return {
    feature: input.feature,
    promptId: input.promptId,
    promptVersion: input.promptVersion,
    ownerUserId: input.ownerUserId,
    provider: input.result.provider,
    model: input.result.model,
    finishReason: input.result.finishReason,
    durationMs: input.durationMs,
    ...(input.result.usage ? { usage: input.result.usage } : {})
  };
}
