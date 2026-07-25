import { Module } from "@nestjs/common";
import { createDrizzleAuditLogStore } from "@elevenhouse/db/audit-log";
import {
  createDrizzleFinancePolicyStore,
  createDrizzleOrderTransactionStore
} from "@elevenhouse/db/finance";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { DurableAdminFinancePolicyAuditSink } from "./finance-policies.audit";
import { FinancePoliciesController } from "./finance-policies.controller";
import { FinancePoliciesService } from "./finance-policies.service";
import { ADMIN_FINANCE_POLICY_UNIT_OF_WORK } from "./finance-policies.tokens";
import type { AdminFinancePolicyUnitOfWork } from "./finance-policies.unit-of-work";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [FinancePoliciesController],
  providers: [
    FinancePoliciesService,
    {
      provide: ADMIN_FINANCE_POLICY_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService): AdminFinancePolicyUnitOfWork => ({
        execute: (operation) =>
          postgresRuntime.database.transaction((transaction) =>
            operation({
              store: createDrizzleFinancePolicyStore(transaction as never),
              orderStore: createDrizzleOrderTransactionStore(transaction as never),
              auditSink: new DurableAdminFinancePolicyAuditSink(
                createDrizzleAuditLogStore(transaction as never)
              )
            })
          )
      }),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class FinancePoliciesModule {}
