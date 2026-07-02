import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RedisModule } from "../redis/redis.module";
import { REDIS_CLIENT } from "../redis/redis.tokens";
import { AiGenerationService } from "./ai-generation.service";
import { RedisAiRateLimiter, type RedisAiRateLimitClient } from "./ai-rate-limiter";
import { NoopAiUsageRecorder } from "./ai-usage-recorder";
import { AI_GENERATION_PROVIDER, AI_RATE_LIMITER, AI_USAGE_RECORDER } from "./ai.tokens";
import { DeepSeekAiProvider } from "./deepseek-ai-provider";

type AiRateLimitRuntimeConfig = {
  readonly rateLimitRedisKeyPrefix: string;
  readonly rateLimits: {
    readonly userPerMinute: { readonly limit: number; readonly windowSeconds: number };
    readonly userPerHour: { readonly limit: number; readonly windowSeconds: number };
    readonly userPerDay: { readonly limit: number; readonly windowSeconds: number };
  };
};

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [
    AiGenerationService,
    {
      provide: AI_GENERATION_PROVIDER,
      useClass: DeepSeekAiProvider
    },
    {
      provide: AI_RATE_LIMITER,
      useFactory: (client: RedisAiRateLimitClient, configService: ConfigService) => {
        const aiConfig = configService.getOrThrow<AiRateLimitRuntimeConfig>("astrologerApi.ai");

        return new RedisAiRateLimiter(client, {
          keyPrefix: aiConfig.rateLimitRedisKeyPrefix,
          userPerMinute: aiConfig.rateLimits.userPerMinute,
          userPerHour: aiConfig.rateLimits.userPerHour,
          userPerDay: aiConfig.rateLimits.userPerDay
        });
      },
      inject: [REDIS_CLIENT, ConfigService]
    },
    {
      provide: AI_USAGE_RECORDER,
      useClass: NoopAiUsageRecorder
    }
  ],
  exports: [AiGenerationService]
})
export class AiModule {}
