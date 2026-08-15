import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { REDIS_CLIENT } from "../redis/redis.tokens";
import { AiGenerationService } from "./ai-generation.service";
import { AiModule } from "./ai.module";
import { OpenAiProvider } from "./openai-ai-provider";

describe("AiModule", () => {
  it("wires AiGenerationService with overridable runtime dependencies", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AiModule]
    })
      .overrideProvider(RedisRuntimeService)
      .useValue({ eval: vi.fn(), quit: vi.fn() })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ eval: vi.fn() })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          astrologerApi: {
            ai: {
              openAiApiKey: "openai-secret",
              openAiBaseUrl: "https://api.openai.com/v1",
              fastDraftModel: "gpt-5.4-mini",
              qualityDraftModel: "gpt-5.5",
              timeoutMs: 15000,
              rateLimitRedisKeyPrefix: "elevenhouse:astrologer-api:ai",
              rateLimits: {
                userPerMinute: { limit: 3, windowSeconds: 60 },
                userPerHour: { limit: 30, windowSeconds: 3600 },
                userPerDay: { limit: 150, windowSeconds: 86400 }
              }
            }
          }
        })
      )
      .compile();

    expect(moduleRef.get(AiGenerationService)).toBeInstanceOf(AiGenerationService);
    expect(moduleRef.get(OpenAiProvider)).toBeInstanceOf(OpenAiProvider);

    await moduleRef.close();
  });
});
