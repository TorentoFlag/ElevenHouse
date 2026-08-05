import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  createDrizzleMatrixNoteStore,
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
import { PlatformEntitlementsModule } from "../platform-entitlements/platform-entitlements.module";
import { MediaModule } from "../media/media.module";
import { SecurityModule } from "../security/security.module";
import { MatrixController } from "./matrix.controller";
import { MatrixPdfController } from "./matrix-pdf.controller";
import { MatrixPdfService } from "./matrix-pdf.service";
import { MatrixNotesController } from "./matrix-notes.controller";
import { MatrixNotesService } from "./matrix-notes.service";
import { MATRIX_NOTE_STORE } from "./matrix-notes.tokens";
import { MatrixService } from "./matrix.service";
import { MatrixReportController } from "./matrix-report.controller";
import { MatrixReportService } from "./matrix-report.service";
import { MATRIX_REPORT_ID_GENERATOR, MATRIX_REPORT_STORE } from "./matrix-report.tokens";

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
    PlatformEntitlementsModule,
    SecurityModule
  ],
  controllers: [
    MatrixController,
    MatrixNotesController,
    MatrixReportController,
    MatrixPdfController
  ],
  providers: [
    MatrixService,
    MatrixNotesService,
    MatrixReportService,
    MatrixPdfService,
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
      provide: MATRIX_REPORT_ID_GENERATOR,
      useValue: randomUUID
    }
  ]
})
export class MatrixModule {}
