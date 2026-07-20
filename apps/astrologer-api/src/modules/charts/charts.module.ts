import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  createDrizzleChartCalculationCommandStore,
  createDrizzleChartCalculationJobStore
} from "@elevenhouse/db/charts";
import { ClockModule } from "../clock/clock.module";
import { ClientsModule } from "../clients/clients.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { ChartsController } from "./charts.controller";
import { ChartsService } from "./charts.service";
import { CHART_COMMAND_STORE, CHART_JOB_STORE } from "./charts.tokens";

@Module({
  imports: [ConfigModule, ClockModule, ClientsModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [ChartsController],
  providers: [
    ChartsService,
    {
      provide: CHART_COMMAND_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleChartCalculationCommandStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CHART_JOB_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleChartCalculationJobStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class ChartsModule {}
