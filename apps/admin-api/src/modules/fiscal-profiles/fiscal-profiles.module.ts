import { Module } from "@nestjs/common";
import { createDrizzleAuditLogStore } from "@elevenhouse/db/audit-log";
import {
  createDrizzleFiscalProfileAuthorityStore,
  createDrizzleFinanceReadinessEvidenceReader,
  executeIdempotentFinanceCommand,
  type FinanceTransaction
} from "@elevenhouse/db/finance";

import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { FiscalProfilesController } from "./fiscal-profiles.controller";
import { FiscalProfilesService } from "./fiscal-profiles.service";
import { ADMIN_FISCAL_PROFILE_CLOCK, ADMIN_FISCAL_PROFILE_UNIT_OF_WORK } from "./fiscal-profiles.tokens";
import type { AdminFiscalProfileUnitOfWork } from "./fiscal-profiles.unit-of-work";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [FiscalProfilesController],
  providers: [
    FiscalProfilesService,
    { provide: ADMIN_FISCAL_PROFILE_CLOCK, useExisting: SystemClock },
    {
      provide: ADMIN_FISCAL_PROFILE_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService): AdminFiscalProfileUnitOfWork => ({
        execute: (operation) => postgresRuntime.database.transaction((transaction) =>
          operation(createUnitOfWorkContext(transaction))
        ),
        executeIdempotent: (input) => executeIdempotentFinanceCommand({
          database: postgresRuntime.database,
          command: input.command,
          create: (transaction) => input.create(createUnitOfWorkContext(transaction)),
          replay: (result) => postgresRuntime.database.transaction((transaction) =>
            input.replay(createUnitOfWorkContext(transaction), result)
          )
        })
      }),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class FiscalProfilesModule {}

function createUnitOfWorkContext(transaction: FinanceTransaction) {
  return {
    store: createDrizzleFiscalProfileAuthorityStore(transaction),
    auditLogStore: createDrizzleAuditLogStore(transaction),
    readinessReader: createDrizzleFinanceReadinessEvidenceReader({ database: transaction })
  };
}
