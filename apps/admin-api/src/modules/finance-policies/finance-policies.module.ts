import { Module } from "@nestjs/common";
import { createDrizzleFinancePolicyStore } from "@elevenhouse/db/finance";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import {
  ConsoleAdminFinancePolicyAuditSink
} from "./finance-policies.audit";
import { FinancePoliciesController } from "./finance-policies.controller";
import { FinancePoliciesService } from "./finance-policies.service";
import {
  ADMIN_FINANCE_POLICY_AUDIT_SINK,
  ADMIN_FINANCE_POLICY_STORE
} from "./finance-policies.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [FinancePoliciesController],
  providers: [
    FinancePoliciesService,
    {
      provide: ADMIN_FINANCE_POLICY_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFinancePolicyStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ADMIN_FINANCE_POLICY_AUDIT_SINK,
      useClass: ConsoleAdminFinancePolicyAuditSink
    }
  ]
})
export class FinancePoliciesModule {}
