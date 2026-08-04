import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  GeoapifyBirthPlaceSearchProvider,
  RedisBirthPlaceSearchProvider
} from "@elevenhouse/birth-place-search";
import {
  createDrizzleClientProfileReader,
  createDrizzleClientStore
} from "@elevenhouse/db/clients";
import { SystemClock } from "../../common/system-clock.js";
import type { PublicApiRuntimeConfig } from "../../config/runtime-config";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { RedisModule } from "../redis/redis.module";
import { REDIS_CLIENT, type RedisClientPort } from "../redis/redis.tokens";
import { SecurityModule } from "../security/security.module";
import { ClientBirthPlaceSearchService } from "./client-birth-place-search.service";
import { ClientProfileController } from "./client-profile.controller";
import { ClientProfileService } from "./client-profile.service";
import {
  CLIENT_BIRTH_PLACE_SEARCH_PROVIDER,
  CLIENT_PROFILE_READER,
  CLIENT_PROFILE_STORE
} from "./client-profile.tokens";

@Module({
  imports: [ConfigModule, DatabaseModule, IdentityModule, RedisModule, SecurityModule],
  controllers: [ClientProfileController],
  providers: [
    ClientProfileService,
    ClientBirthPlaceSearchService,
    SystemClock,
    {
      provide: CLIENT_BIRTH_PLACE_SEARCH_PROVIDER,
      useFactory: (redisClient: RedisClientPort, configService: ConfigService) => {
        const config = configService.getOrThrow<PublicApiRuntimeConfig["birthPlaceSearch"]>(
          "publicApi.birthPlaceSearch"
        );
        const geoapify = new GeoapifyBirthPlaceSearchProvider({
          enabled: config.enabled,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          timeoutMs: config.timeoutMs
        });

        return new RedisBirthPlaceSearchProvider(redisClient, geoapify, {
          keyPrefix: config.rateLimitRedisKeyPrefix,
          cacheSuccessTtlSeconds: config.cacheSuccessTtlSeconds,
          cacheEmptyTtlSeconds: config.cacheEmptyTtlSeconds,
          lockTtlMs: config.lockTtlMs,
          rateLimits: config.rateLimits
        });
      },
      inject: [REDIS_CLIENT, ConfigService]
    },
    {
      provide: CLIENT_PROFILE_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleClientProfileReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CLIENT_PROFILE_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleClientStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class ClientProfileModule {}
