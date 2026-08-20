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
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { AstroDiaryController } from "./astro-diary.controller";
import { AstroDiaryService } from "./astro-diary.service";
import {
  ASTRO_DIARY_COMMAND_UNIT_OF_WORK,
  ASTRO_DIARY_JOURNAL_READER,
  ASTRO_DIARY_MEDIA_STORAGE,
  ASTRO_DIARY_MEDIA_STORE
} from "./astro-diary.tokens";

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
        new S3MediaObjectStorage({
          ...configService.getOrThrow<S3MediaObjectStorageConfig>("astrologerApi.mediaStorage"),
          bucket: configService.getOrThrow<S3MediaObjectStorageConfig>("astrologerApi.mediaStorage")
            .privateBucket
        }),
      inject: [ConfigService]
    }
  ]
})
export class AstroDiaryModule {}
