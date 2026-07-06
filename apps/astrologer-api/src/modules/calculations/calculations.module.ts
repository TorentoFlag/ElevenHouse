import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createDrizzleCalculationStore } from "@elevenhouse/db/calculations";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { CalculationsController } from "./calculations.controller";
import { CalculationsService } from "./calculations.service";
import { CALCULATION_STORE } from "./calculations.tokens";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [CalculationsController],
  providers: [
    CalculationsService,
    {
      provide: CALCULATION_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleCalculationStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ],
  exports: [CalculationsService, CALCULATION_STORE]
})
export class CalculationsModule {}
