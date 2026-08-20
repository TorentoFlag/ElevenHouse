import { Module } from "@nestjs/common";
import { createDrizzleReviewCommandStore, createDrizzleReviewReadStore } from "@elevenhouse/db/reviews";

import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { AdminReviewsController } from "./reviews.controller";
import { AdminReviewsService } from "./reviews.service";
import { ADMIN_REVIEWS_COMMAND_STORE, ADMIN_REVIEWS_READ_STORE } from "./reviews.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [AdminReviewsController],
  providers: [
    AdminReviewsService,
    {
      provide: ADMIN_REVIEWS_COMMAND_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleReviewCommandStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ADMIN_REVIEWS_READ_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleReviewReadStore(runtime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class AdminReviewsModule {}
