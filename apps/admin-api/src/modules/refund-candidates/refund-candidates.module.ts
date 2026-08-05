import { Module } from "@nestjs/common";
import { createDrizzleRefundCandidateStore } from "@elevenhouse/db/finance";

import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { AdminRefundCandidatesController } from "./refund-candidates.controller";
import { AdminRefundCandidatesService } from "./refund-candidates.service";
import { ADMIN_REFUND_CANDIDATE_STORE } from "./refund-candidates.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [AdminRefundCandidatesController],
  providers: [
    AdminRefundCandidatesService,
    SystemClock,
    {
      provide: ADMIN_REFUND_CANDIDATE_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleRefundCandidateStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class AdminRefundCandidatesModule {}
