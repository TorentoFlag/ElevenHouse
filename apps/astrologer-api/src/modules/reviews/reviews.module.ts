import { Module } from "@nestjs/common";
import {
  createDrizzleReviewCommandStore,
  createDrizzleReviewReadStore
} from "@elevenhouse/db/reviews";

import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { AstrologerReviewsController } from "./reviews.controller";
import { AstrologerReviewsService } from "./reviews.service";
import { ASTROLOGER_REVIEWS_COMMAND_STORE, ASTROLOGER_REVIEWS_READ_STORE } from "./reviews.tokens";

@Module({
  imports: [ClockModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [AstrologerReviewsController],
  providers: [
    AstrologerReviewsService,
    {
      provide: ASTROLOGER_REVIEWS_READ_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleReviewReadStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ASTROLOGER_REVIEWS_COMMAND_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleReviewCommandStore(runtime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class AstrologerReviewsModule {}
