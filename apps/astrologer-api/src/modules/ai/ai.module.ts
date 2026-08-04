import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDrizzleAiUsageStore } from "@elevenhouse/db";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { RedisModule } from "../redis/redis.module";
import { REDIS_CLIENT } from "../redis/redis.tokens";
import { AiGenerationService } from "./ai-generation.service";
import { AiUsageReconciliationService } from "./ai-usage-reconciliation.service";
import { RedisAiRateLimiter, type RedisAiRateLimitClient } from "./ai-rate-limiter";
import { DrizzleAiUsageRecorder } from "./drizzle-ai-usage-recorder";
import {
  AI_GENERATION_PROVIDER,
  AI_RATE_LIMITER,
  AI_USAGE_RECORDER,
  AI_USAGE_STORE
} from "./ai.tokens";
import { OpenAiProvider } from "./openai-ai-provider";

type AiRateLimitRuntimeConfig = {
  readonly rateLimitRedisKeyPrefix: string;
  readonly rateLimits: {
    readonly userPerMinute: { readonly limit: number; readonly windowSeconds: number };
    readonly userPerHour: { readonly limit: number; readonly windowSeconds: number };
    readonly userPerDay: { readonly limit: number; readonly windowSeconds: number };
  };
};

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule],
  providers: [
    AiGenerationService,
    AiUsageReconciliationService,
    OpenAiProvider,
    {
      provide: AI_GENERATION_PROVIDER,
      useClass: OpenAiProvider
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
      provide: AI_USAGE_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAiUsageStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: AI_USAGE_RECORDER,
      useClass: DrizzleAiUsageRecorder
    }
  ],
  exports: [AiGenerationService]
})
export class AiModule {}
