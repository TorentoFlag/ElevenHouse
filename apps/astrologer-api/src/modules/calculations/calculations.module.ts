import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createDrizzleCalculationStore } from "@elevenhouse/db/calculations";
import { createDrizzleCalculationPdfJobStore } from "@elevenhouse/db/calculations";
import { randomUUID } from "node:crypto";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { MediaModule } from "../media/media.module";
import { ChartExecutionProfileProvider } from "../charts/chart-execution-profile.provider";
import { CalculationPdfService } from "./pdf/calculation-pdf.service";
import {
  CALCULATION_PDF_ID_GENERATOR,
  CALCULATION_PDF_JOB_STORE
} from "./pdf/calculation-pdf.tokens";
import { CalculationsController } from "./calculations.controller";
import { CalculationsService } from "./calculations.service";
import { CALCULATION_STORE } from "./calculations.tokens";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, MediaModule, SecurityModule],
  controllers: [CalculationsController],
  providers: [
    CalculationsService,
    CalculationPdfService,
    ChartExecutionProfileProvider,
    {
      provide: CALCULATION_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleCalculationStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CALCULATION_PDF_JOB_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleCalculationPdfJobStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CALCULATION_PDF_ID_GENERATOR,
      useValue: randomUUID
    }
  ],
  exports: [
    CalculationsService,
    CalculationPdfService,
    ChartExecutionProfileProvider,
    CALCULATION_STORE
  ]
})
export class CalculationsModule {}
