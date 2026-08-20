import { Module } from "@nestjs/common";
import { createDrizzleReviewReadStore } from "@elevenhouse/db/reviews";

import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { PublicReviewsController } from "./reviews.controller";
import { PublicReviewsService } from "./reviews.service";
import { PUBLIC_REVIEWS_READ_STORE } from "./reviews.tokens";

@Module({
  imports: [DatabaseModule],
  controllers: [PublicReviewsController],
  providers: [
    PublicReviewsService,
    {
      provide: PUBLIC_REVIEWS_READ_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleReviewReadStore(runtime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class PublicReviewsModule {}
