import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDrizzleClientCrmReadStore, createDrizzleClientStore } from "@elevenhouse/db/clients";
import { createDrizzleFinanceClientServiceWorkSummaryReader } from "@elevenhouse/db/finance";
import { createDrizzleBookingClientServiceWorkSummaryReader } from "@elevenhouse/db/scheduling";
import { createDrizzleSessionClientServiceWorkSummaryReader } from "@elevenhouse/db/sessions";
import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { RedisModule } from "../redis/redis.module";
import { REDIS_CLIENT, type RedisClientPort } from "../redis/redis.tokens";
import { SecurityModule } from "../security/security.module";
import { type ClientBirthPlaceUpstreamProvider } from "./birth-place-search.provider";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { GeoapifyBirthPlaceSearchProvider } from "./geoapify-birth-place-search.provider";
import { RedisBirthPlaceSearchProvider } from "./redis-birth-place-search.provider";
import {
  BIRTH_PLACE_SEARCH_PROVIDER,
  CLIENT_BOOKING_SERVICE_WORK_READER,
  CLIENT_CRM_READ_STORE,
  CLIENT_FINANCE_SERVICE_WORK_READER,
  CLIENT_SESSION_SERVICE_WORK_READER,
  CLIENT_STORE
} from "./clients.tokens";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, RedisModule, SecurityModule],
  controllers: [ClientsController],
  providers: [
    ClientsService,
    GeoapifyBirthPlaceSearchProvider,
    {
      provide: CLIENT_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleClientStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CLIENT_CRM_READ_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService, configService: ConfigService) => {
        const config =
          configService.getOrThrow<AstrologerApiRuntimeConfig["clientCrm"]>(
            "astrologerApi.clientCrm"
          );
        return createDrizzleClientCrmReadStore(postgresRuntime.database, config);
      },
      inject: [PostgresRuntimeService, ConfigService]
    },
    {
      provide: CLIENT_BOOKING_SERVICE_WORK_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleBookingClientServiceWorkSummaryReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CLIENT_SESSION_SERVICE_WORK_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleSessionClientServiceWorkSummaryReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CLIENT_FINANCE_SERVICE_WORK_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFinanceClientServiceWorkSummaryReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: BIRTH_PLACE_SEARCH_PROVIDER,
      useFactory: (
        redisClient: RedisClientPort,
        geoapifyProvider: ClientBirthPlaceUpstreamProvider,
        configService: ConfigService
      ) => {
        const config = configService.getOrThrow<AstrologerApiRuntimeConfig["birthPlaceSearch"]>(
          "astrologerApi.birthPlaceSearch"
        );

        return new RedisBirthPlaceSearchProvider(redisClient, geoapifyProvider, {
          keyPrefix: config.rateLimitRedisKeyPrefix,
          cacheSuccessTtlSeconds: config.cacheSuccessTtlSeconds,
          cacheEmptyTtlSeconds: config.cacheEmptyTtlSeconds,
          lockTtlMs: config.lockTtlMs,
          rateLimits: config.rateLimits
        });
      },
      inject: [REDIS_CLIENT, GeoapifyBirthPlaceSearchProvider, ConfigService]
    }
  ],
  exports: [
    CLIENT_STORE,
    CLIENT_CRM_READ_STORE,
    CLIENT_BOOKING_SERVICE_WORK_READER,
    CLIENT_SESSION_SERVICE_WORK_READER,
    CLIENT_FINANCE_SERVICE_WORK_READER,
    BIRTH_PLACE_SEARCH_PROVIDER
  ]
})
export class ClientsModule {}
