import { Module } from "@nestjs/common";
import { createDrizzleAuditLogStore } from "@elevenhouse/db/audit-log";
import { createDrizzlePlatformTariffAuthorityStore } from "@elevenhouse/db/platform-billing";
import { executeIdempotentFinanceCommand, type FinanceTransaction } from "@elevenhouse/db/finance";

import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { PlatformTariffsController } from "./platform-tariffs.controller";
import { PlatformTariffsService } from "./platform-tariffs.service";
import { ADMIN_TARIFF_CLOCK, ADMIN_TARIFF_UNIT_OF_WORK } from "./platform-tariffs.tokens";
import type { AdminTariffUnitOfWork } from "./platform-tariffs.unit-of-work";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [PlatformTariffsController],
  providers: [
    PlatformTariffsService,
    {
      provide: ADMIN_TARIFF_CLOCK,
      useExisting: SystemClock
    },
    {
      provide: ADMIN_TARIFF_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService): AdminTariffUnitOfWork => ({
        execute: (operation) =>
          postgresRuntime.database.transaction((transaction) =>
            operation(createUnitOfWorkContext(transaction))
          ),
        executeIdempotent: (input) =>
          executeIdempotentFinanceCommand({
            database: postgresRuntime.database,
            command: input.command,
            create: (transaction) => input.create(createUnitOfWorkContext(transaction)),
            replay: (result) =>
              postgresRuntime.database.transaction((transaction) =>
                input.replay(createUnitOfWorkContext(transaction), result)
              )
          })
      }),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class PlatformTariffsModule {}

function createUnitOfWorkContext(transaction: FinanceTransaction) {
  return {
    store: createDrizzlePlatformTariffAuthorityStore({ database: transaction }),
    auditLogStore: createDrizzleAuditLogStore(transaction)
  };
}
