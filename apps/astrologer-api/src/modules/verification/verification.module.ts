import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { createDrizzleVerificationApplicationStore } from "@elevenhouse/db/verification";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { MediaModule } from "../media/media.module";
import { SecurityModule } from "../security/security.module";
import { VerificationController } from "./verification.controller";
import { VerificationService } from "./verification.service";
import { VERIFICATION_APPLICATION_STORE, VERIFICATION_ID_GENERATOR } from "./verification.tokens";

@Module({
  imports: [ClockModule, DatabaseModule, IdentityModule, MediaModule, SecurityModule],
  controllers: [VerificationController],
  providers: [
    VerificationService,
    {
      provide: VERIFICATION_APPLICATION_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleVerificationApplicationStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: VERIFICATION_ID_GENERATOR,
      useValue: randomUUID
    }
  ]
})
export class VerificationModule {}
