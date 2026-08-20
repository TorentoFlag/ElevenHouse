import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createDrizzleAstroDiaryCommandUnitOfWork,
  createDrizzleAstroDiaryJournalReader,
  createDrizzleAstroDiaryMediaStore
} from "@elevenhouse/db/astro-diary";
import {
  S3MediaObjectStorage,
  type S3MediaObjectStorageConfig
} from "@elevenhouse/media-infrastructure";

import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { ClientAstroDiaryController } from "./astro-diary.controller";
import { ClientAstroDiaryService } from "./astro-diary.service";
import {
  ASTRO_DIARY_COMMAND_UNIT_OF_WORK,
  ASTRO_DIARY_JOURNAL_READER,
  ASTRO_DIARY_MEDIA_STORAGE,
  ASTRO_DIARY_MEDIA_STORE
} from "./astro-diary.tokens";

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
    },
    {
      provide: ASTRO_DIARY_MEDIA_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAstroDiaryMediaStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ASTRO_DIARY_MEDIA_STORAGE,
      useFactory: (configService: ConfigService) =>
        new S3MediaObjectStorage(
          configService.getOrThrow<S3MediaObjectStorageConfig>("publicApi.mediaStorage")
        ),
      inject: [ConfigService]
    }
  ]
})
export class ClientAstroDiaryModule {}
