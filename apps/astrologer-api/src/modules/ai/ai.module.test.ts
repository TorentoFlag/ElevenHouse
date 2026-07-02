import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { REDIS_CLIENT } from "../redis/redis.tokens";
import { AiGenerationService } from "./ai-generation.service";
import { AiModule } from "./ai.module";

describe("AiModule", () => {
  it("wires AiGenerationService with overridable runtime dependencies", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AiModule]
    })
      .overrideProvider(RedisRuntimeService)
      .useValue({ eval: vi.fn(), quit: vi.fn() })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ eval: vi.fn() })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          astrologerApi: {
            ai: {
              enabled: true,
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

    await moduleRef.close();
  });
});
