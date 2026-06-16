import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REDIS_CLIENT } from "./redis.tokens";
import { RedisModule } from "./redis.module";

const redisMock = vi.hoisted(() => ({
  createClient: vi.fn()
}));

vi.mock("redis", () => ({
  createClient: redisMock.createClient
}));

describe("RedisModule", () => {
  beforeEach(() => {
    redisMock.createClient.mockReset();
  });

  it("connects and exports the shared Redis client from runtime config", async () => {
    const client = {
      connect: vi.fn(async () => undefined),
      eval: vi.fn(async () => 0),
      quit: vi.fn(async () => undefined)
    };

    redisMock.createClient.mockReturnValue(client);

    const moduleRef = await Test.createTestingModule({
      imports: [RedisModule]
    })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: vi.fn((key: string) => {
          if (key === "publicApi.redisUrl") {
            return "redis://redis.internal:6379/2";
          }

          throw new Error(`Unexpected config key: ${key}`);
        })
      })
      .compile();

    const redisClient = moduleRef.get(REDIS_CLIENT);

    expect(redisMock.createClient).toHaveBeenCalledWith({
      url: "redis://redis.internal:6379/2"
    });
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(redisClient).toBeDefined();

    await moduleRef.close();

    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});
