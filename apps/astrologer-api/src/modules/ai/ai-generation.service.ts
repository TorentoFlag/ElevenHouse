import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AiGenerationPort, AiGenerationResult, AiPromptDefinition } from "@elevenhouse/ai";
import { AI_GENERATION_PROVIDER, AI_RATE_LIMITER, AI_USAGE_RECORDER } from "./ai.tokens";
import type { AiRateLimiterPort } from "./ai-rate-limiter";
import { AiProviderUnavailableError, createDeepSeekUserKey } from "./deepseek-ai-provider";
import type { AiUsageRecord, AiUsageRecorderPort } from "./ai-usage-recorder";

type AiGenerationRuntimeConfig = {
  readonly enabled: boolean;
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
      throw new AiProviderUnavailableError("AI provider is disabled");
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
    const userKey = createDeepSeekUserKey(input.ownerUserId);
    const result = await this.provider.generateStructured({
      prompt: input.prompt.render(promptInput),
      modelProfile: input.prompt.modelProfile,
      responseSchema: input.prompt.outputSchema,
      maxOutputTokens: input.prompt.maxOutputTokens,
      thinking: input.prompt.thinking,
      userKey,
      metadata: {
        feature: input.feature,
        promptId: input.prompt.id,
        promptVersion: input.prompt.version,
        ownerUserId: userKey
      }
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
