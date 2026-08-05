import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  createDrizzleChartAiDraftCommandStore,
  createDrizzleChartCalculationCommandStore,
  createDrizzleChartCalculationJobStore
} from "@elevenhouse/db/charts";
import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import { ClockModule } from "../clock/clock.module";
import { AiModule } from "../ai/ai.module";
import { AstrologerProfileModule } from "../astrologer-profile/astrologer-profile.module";
import { CalculationsModule } from "../calculations/calculations.module";
import { ClientsModule } from "../clients/clients.module";
import { DatabaseModule } from "../database/database.module";
import { DictionaryStoreModule } from "../dictionary/dictionary-store.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { PlatformEntitlementsModule } from "../platform-entitlements/platform-entitlements.module";
import { SecurityModule } from "../security/security.module";
import { ChartsController } from "./charts.controller";
import { ChartsPdfController } from "./charts-pdf.controller";
import { ChartsPdfService } from "./charts-pdf.service";
import { ChartAiDraftCommandReconciliationService } from "./chart-ai-draft-command-reconciliation.service";
import { ChartsService } from "./charts.service";
import {
  CHART_AI_CONFIG,
  CHART_AI_DRAFT_COMMAND_STORE,
  CHART_COMMAND_STORE,
  CHART_JOB_STORE
} from "./charts.tokens";

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
    PlatformEntitlementsModule,
    SecurityModule
  ],
  controllers: [ChartsController, ChartsPdfController],
  providers: [
    ChartsService,
    ChartsPdfService,
    ChartAiDraftCommandReconciliationService,
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
    },
    {
      provide: CHART_AI_DRAFT_COMMAND_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleChartAiDraftCommandStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CHART_AI_CONFIG,
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow<AstrologerApiRuntimeConfig["chartAi"]>("astrologerApi.chartAi"),
      inject: [ConfigService]
    }
  ]
})
export class ChartsModule {}
