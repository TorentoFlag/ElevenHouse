import { Module } from "@nestjs/common";
import {
  createDrizzleReviewCommandStore,
  createDrizzleReviewReadStore
} from "@elevenhouse/db/reviews";

import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { PublicMyReviewsController, PublicReviewsController } from "./reviews.controller";
import { PublicReviewsService } from "./reviews.service";
import { PUBLIC_REVIEWS_COMMAND_STORE, PUBLIC_REVIEWS_READ_STORE } from "./reviews.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [PublicReviewsController, PublicMyReviewsController],
  providers: [
    PublicReviewsService,
    {
      provide: PUBLIC_REVIEWS_READ_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleReviewReadStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: PUBLIC_REVIEWS_COMMAND_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleReviewCommandStore(runtime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class PublicReviewsModule {}
