import { Module } from "@nestjs/common";
import { createDrizzleOrderStore, createDrizzleRefundCandidateStore } from "@elevenhouse/db/finance";

import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { RefundCandidatesController } from "./refund-candidates.controller";
import { RefundCandidatesService } from "./refund-candidates.service";
import { REFUND_CANDIDATES_ORDER_STORE, REFUND_CANDIDATES_STORE } from "./refund-candidates.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [RefundCandidatesController],
  providers: [
    RefundCandidatesService,
    SystemClock,
    {
      provide: REFUND_CANDIDATES_ORDER_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleOrderStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: REFUND_CANDIDATES_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleRefundCandidateStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class RefundCandidatesModule {}
