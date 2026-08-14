import { Module } from "@nestjs/common";
import { createDrizzleAstroDiaryJournalReader } from "@elevenhouse/db/astro-diary";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { AstroDiaryController } from "./astro-diary.controller";
import { AstroDiaryService } from "./astro-diary.service";
import { ASTRO_DIARY_JOURNAL_READER } from "./astro-diary.tokens";

@Module({
  imports: [ClockModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [AstroDiaryController],
  providers: [
    AstroDiaryService,
    {
      provide: ASTRO_DIARY_JOURNAL_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAstroDiaryJournalReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class AstroDiaryModule {}
