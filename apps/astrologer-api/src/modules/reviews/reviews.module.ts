import { Module } from "@nestjs/common";
import {
  createDrizzleReviewAiReplyDraftStore,
  createDrizzleReviewCommandStore,
  createDrizzleReviewableInstanceReceiptStore,
  createDrizzleReviewReadStore
} from "@elevenhouse/db/reviews";
import { createDrizzleMessagingStore } from "@elevenhouse/db/messaging";

import { AiModule } from "../ai/ai.module";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { PlatformEntitlementsModule } from "../platform-entitlements/platform-entitlements.module";
import { SecurityModule } from "../security/security.module";
import { AstrologerReviewsController } from "./reviews.controller";
import { AstrologerReviewsService } from "./reviews.service";
import {
  ASTROLOGER_REVIEWS_AI_REPLY_DRAFT_STORE,
  ASTROLOGER_REVIEWS_COMMAND_STORE,
  ASTROLOGER_REVIEWS_MESSAGING_STORE,
  ASTROLOGER_REVIEWS_READ_STORE,
  ASTROLOGER_REVIEWS_SOURCE_RECEIPT_STORE
} from "./reviews.tokens";

@Module({
  imports: [
    AiModule,
    ClockModule,
    DatabaseModule,
    IdentityModule,
    PlatformEntitlementsModule,
    SecurityModule
  ],
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
    },
    {
      provide: ASTROLOGER_REVIEWS_AI_REPLY_DRAFT_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleReviewAiReplyDraftStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ASTROLOGER_REVIEWS_MESSAGING_STORE,
      useFactory: (runtime: PostgresRuntimeService) => createDrizzleMessagingStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ASTROLOGER_REVIEWS_SOURCE_RECEIPT_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleReviewableInstanceReceiptStore(runtime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class AstrologerReviewsModule {}
