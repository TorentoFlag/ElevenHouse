import { Module } from "@nestjs/common";
import {
  createDrizzleAstroDiaryCommandUnitOfWork,
  createDrizzleAstroDiaryJournalReader
} from "@elevenhouse/db/astro-diary";

import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { ClientAstroDiaryController } from "./astro-diary.controller";
import { ClientAstroDiaryService } from "./astro-diary.service";
import { ASTRO_DIARY_COMMAND_UNIT_OF_WORK, ASTRO_DIARY_JOURNAL_READER } from "./astro-diary.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [ClientAstroDiaryController],
  providers: [
    ClientAstroDiaryService,
    SystemClock,
    {
      provide: ASTRO_DIARY_JOURNAL_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAstroDiaryJournalReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ASTRO_DIARY_COMMAND_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAstroDiaryCommandUnitOfWork(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class ClientAstroDiaryModule {}
