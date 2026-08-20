import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDrizzleMediaAssetStore } from "@elevenhouse/db/media";
import {
  S3MediaObjectStorage,
  type S3MediaObjectStorageConfig
} from "@elevenhouse/media-infrastructure";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { PlatformEntitlementsModule } from "../platform-entitlements/platform-entitlements.module";
import { SecurityModule } from "../security/security.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import {
  MEDIA_ASSET_STORE,
  MEDIA_ID_GENERATOR,
  MEDIA_OBJECT_STORAGE,
  MEDIA_PRIVATE_OBJECT_STORAGE,
  MEDIA_PUBLIC_URL_RESOLVER
} from "./media.tokens";

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    DatabaseModule,
    IdentityModule,
    PlatformEntitlementsModule,
    SecurityModule
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: MEDIA_ASSET_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleMediaAssetStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: S3MediaObjectStorage,
      useFactory: (configService: ConfigService) =>
        new S3MediaObjectStorage(
          configService.getOrThrow<S3MediaObjectStorageConfig>("astrologerApi.mediaStorage")
        ),
      inject: [ConfigService]
    },
    {
      provide: MEDIA_OBJECT_STORAGE,
      useExisting: S3MediaObjectStorage
    },
    {
      provide: MEDIA_PUBLIC_URL_RESOLVER,
      useExisting: S3MediaObjectStorage
    },
    {
      provide: MEDIA_PRIVATE_OBJECT_STORAGE,
      useExisting: S3MediaObjectStorage
    },
    {
      provide: MEDIA_ID_GENERATOR,
      useValue: randomUUID
    }
  ],
  exports: [
    MediaService,
    MEDIA_ASSET_STORE,
    MEDIA_PUBLIC_URL_RESOLVER,
    MEDIA_PRIVATE_OBJECT_STORAGE
  ]
})
export class MediaModule {}
