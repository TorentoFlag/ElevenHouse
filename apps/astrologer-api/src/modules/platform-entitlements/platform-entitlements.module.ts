import { Module } from "@nestjs/common";
import { createDrizzlePlatformTariffAuthorityStore } from "@elevenhouse/db/platform-billing";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { PLATFORM_TARIFF_ENTITLEMENT_STORE } from "./platform-entitlements.tokens";
import { PlatformTariffCapabilityGuard } from "./platform-tariff-capability.guard";

@Module({
  imports: [ClockModule, DatabaseModule],
  providers: [
    PlatformTariffCapabilityGuard,
    {
      provide: PLATFORM_TARIFF_ENTITLEMENT_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzlePlatformTariffAuthorityStore({ database: postgresRuntime.database }),
      inject: [PostgresRuntimeService]
    }
  ],
  exports: [ClockModule, PlatformTariffCapabilityGuard, PLATFORM_TARIFF_ENTITLEMENT_STORE]
})
export class PlatformEntitlementsModule {}
