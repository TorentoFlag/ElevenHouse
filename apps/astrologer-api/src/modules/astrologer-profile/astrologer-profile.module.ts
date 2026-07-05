import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createDrizzleAstrologerProfileStore } from "@elevenhouse/db/astrologer-profile";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { MediaModule } from "../media/media.module";
import { SecurityModule } from "../security/security.module";
import { AstrologerProfileController } from "./astrologer-profile.controller";
import { AstrologerProfileService } from "./astrologer-profile.service";
import { ASTROLOGER_PROFILE_STORE } from "./astrologer-profile.tokens";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, SecurityModule, MediaModule],
  controllers: [AstrologerProfileController],
  providers: [
    AstrologerProfileService,
    {
      provide: ASTROLOGER_PROFILE_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAstrologerProfileStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class AstrologerProfileModule {}
