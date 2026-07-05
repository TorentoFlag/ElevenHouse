import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDrizzlePlatformBillingStore } from "@elevenhouse/db/platform-billing";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { PlatformBillingController } from "./platform-billing.controller";
import { PlatformBillingService } from "./platform-billing.service";
import {
  PLATFORM_BILLING_OPTIONS,
  PLATFORM_BILLING_STORE,
  type PlatformBillingOptions
} from "./platform-billing.tokens";

@Module({
  imports: [ConfigModule, DatabaseModule, IdentityModule],
  controllers: [PlatformBillingController],
  providers: [
    PlatformBillingService,
    {
      provide: PLATFORM_BILLING_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzlePlatformBillingStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: PLATFORM_BILLING_OPTIONS,
      useFactory: (configService: ConfigService): PlatformBillingOptions => ({
        providerConfigured: configService.getOrThrow<boolean>(
          "astrologerApi.billing.arcPayConfigured"
        )
      }),
      inject: [ConfigService]
    }
  ]
})
export class PlatformBillingModule {}
