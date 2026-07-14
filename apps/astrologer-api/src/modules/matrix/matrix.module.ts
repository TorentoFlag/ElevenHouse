import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  createDrizzleMatrixNoteStore,
  createDrizzleMatrixPdfJobStore,
  createDrizzleMatrixReportStore
} from "@elevenhouse/db/matrix";
import { randomUUID } from "node:crypto";
import { AiModule } from "../ai/ai.module";
import { AstrologerProfileModule } from "../astrologer-profile/astrologer-profile.module";
import { ClockModule } from "../clock/clock.module";
import { CalculationsModule } from "../calculations/calculations.module";
import { ClientsModule } from "../clients/clients.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { MediaModule } from "../media/media.module";
import { SecurityModule } from "../security/security.module";
import { MatrixController } from "./matrix.controller";
import { MatrixNotesController } from "./matrix-notes.controller";
import { MatrixNotesService } from "./matrix-notes.service";
import { MATRIX_NOTE_STORE } from "./matrix-notes.tokens";
import { MatrixService } from "./matrix.service";
import { MatrixReportController } from "./matrix-report.controller";
import { MatrixReportService } from "./matrix-report.service";
import {
  MATRIX_PDF_JOB_STORE,
  MATRIX_REPORT_ID_GENERATOR,
  MATRIX_REPORT_STORE
} from "./matrix-report.tokens";

@Module({
  imports: [
    CalculationsModule,
    AstrologerProfileModule,
    ClientsModule,
    DatabaseModule,
    ConfigModule,
    AiModule,
    MediaModule,
    ClockModule,
    IdentityModule,
    SecurityModule
  ],
  controllers: [MatrixController, MatrixNotesController, MatrixReportController],
  providers: [
    MatrixService,
    MatrixNotesService,
    MatrixReportService,
    {
      provide: MATRIX_NOTE_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleMatrixNoteStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: MATRIX_REPORT_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleMatrixReportStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: MATRIX_PDF_JOB_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleMatrixPdfJobStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: MATRIX_REPORT_ID_GENERATOR,
      useValue: randomUUID
    }
  ]
})
export class MatrixModule {}
