import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  createDrizzleChartCalculationCommandStore,
  createDrizzleChartCalculationJobStore
} from "@elevenhouse/db/charts";
import { ClockModule } from "../clock/clock.module";
import { AiModule } from "../ai/ai.module";
import { AstrologerProfileModule } from "../astrologer-profile/astrologer-profile.module";
import { CalculationsModule } from "../calculations/calculations.module";
import { ClientsModule } from "../clients/clients.module";
import { DatabaseModule } from "../database/database.module";
import { DictionaryStoreModule } from "../dictionary/dictionary-store.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { ChartsController } from "./charts.controller";
import { ChartsPdfController } from "./charts-pdf.controller";
import { ChartsPdfService } from "./charts-pdf.service";
import { ChartsService } from "./charts.service";
import { CHART_COMMAND_STORE, CHART_JOB_STORE } from "./charts.tokens";

@Module({
  imports: [
    AiModule,
    AstrologerProfileModule,
    CalculationsModule,
    ConfigModule,
    ClockModule,
    ClientsModule,
    DatabaseModule,
    DictionaryStoreModule,
    IdentityModule,
    SecurityModule
  ],
  controllers: [ChartsController, ChartsPdfController],
  providers: [
    ChartsService,
    ChartsPdfService,
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
