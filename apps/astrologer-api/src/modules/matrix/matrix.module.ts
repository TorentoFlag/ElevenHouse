import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createDrizzleMatrixNoteStore } from "@elevenhouse/db/matrix";
import { AstrologerProfileModule } from "../astrologer-profile/astrologer-profile.module";
import { ClockModule } from "../clock/clock.module";
import { CalculationsModule } from "../calculations/calculations.module";
import { ClientsModule } from "../clients/clients.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { MatrixController } from "./matrix.controller";
import { MatrixNotesController } from "./matrix-notes.controller";
import { MatrixNotesService } from "./matrix-notes.service";
import { MATRIX_NOTE_STORE } from "./matrix-notes.tokens";
import { MatrixService } from "./matrix.service";

@Module({
  imports: [
    CalculationsModule,
    AstrologerProfileModule,
    ClientsModule,
    DatabaseModule,
    ConfigModule,
    ClockModule,
    IdentityModule,
    SecurityModule
  ],
  controllers: [MatrixController, MatrixNotesController],
  providers: [
    MatrixService,
    MatrixNotesService,
    {
      provide: MATRIX_NOTE_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleMatrixNoteStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class MatrixModule {}
