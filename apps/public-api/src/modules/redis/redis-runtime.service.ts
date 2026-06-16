import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "redis";
import type { RedisClientPort } from "./redis.tokens";

type RuntimeRedisClient = RedisClientPort & {
  readonly quit: () => Promise<unknown>;
};

@Injectable()
export class RedisRuntimeService implements RedisClientPort, OnModuleDestroy {
  private constructor(private readonly client: RuntimeRedisClient) {}

  static async connect(configService: ConfigService): Promise<RedisRuntimeService> {
    const client = createClient({
      url: configService.getOrThrow<string>("publicApi.redisUrl")
    });

    await client.connect();

    return new RedisRuntimeService(client as RuntimeRedisClient);
  }

  eval(
    script: string,
    options: {
      readonly keys: string[];
      readonly arguments: string[];
    }
  ): Promise<unknown> {
    return this.client.eval(script, options);
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}
