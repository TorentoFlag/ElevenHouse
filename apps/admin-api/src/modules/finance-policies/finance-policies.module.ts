import { Module } from "@nestjs/common";
import { createDrizzleAuditLogStore } from "@elevenhouse/db/audit-log";
import {
  createDrizzleFinancePolicyStore,
  createDrizzleOnlineWalletPayoutRequestReader,
  createDrizzleOnlineWalletPayoutReleaseUnitOfWork,
  createDrizzleOnlineWalletPayoutReviewUnitOfWork,
  createDrizzleOrderTransactionStore,
  createDrizzlePaymentReversalCaseStore,
  createDrizzleReconciliationStore,
  transactDrizzleFinanceAuthorizationCommand,
  executeIdempotentFinanceCommand
} from "@elevenhouse/db/finance";
import { consumeFinanceAuthorizationGrant } from "@elevenhouse/domain";
import type { FinanceTransaction } from "@elevenhouse/db/finance";
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
          }),
        executeAuthorized: (input) =>
          transactDrizzleFinanceAuthorizationCommand({
            database: postgresRuntime.database,
            operation: async ({ transaction, authorizationStore }) => {
              const proof = await consumeFinanceAuthorizationGrant({
                actorUserId: input.authorization.actorUserId,
                sessionId: input.authorization.sessionId,
                sessionKind: "standard",
                actionKind: input.authorization.actionKind,
                aggregateId: input.authorization.aggregateId,
                expectedVersion: input.authorization.expectedVersion,
                payload: input.authorization.payload,
                authorizationId: input.authorization.authorizationId,
                store: authorizationStore,
                clock: { now: () => input.authorization.occurredAt }
              });
              return input.operation(createUnitOfWorkContext(transaction), proof);
            }
          })
      }),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class FinancePoliciesModule {}

function createUnitOfWorkContext(transaction: FinanceTransaction) {
  return {
    store: createDrizzleFinancePolicyStore(transaction),
    orderStore: createDrizzleOrderTransactionStore(transaction),
    reversalCaseStore: createDrizzlePaymentReversalCaseStore(transaction),
    reconciliationStore: createDrizzleReconciliationStore(transaction),
    onlineWalletPayoutRequestReader: createDrizzleOnlineWalletPayoutRequestReader({
      database: transaction
    }),
    onlineWalletPayoutRelease: createDrizzleOnlineWalletPayoutReleaseUnitOfWork({
      database: transaction
    }),
    onlineWalletPayoutReview: createDrizzleOnlineWalletPayoutReviewUnitOfWork({
      database: transaction
    }),
    auditSink: new DurableAdminFinancePolicyAuditSink(createDrizzleAuditLogStore(transaction))
  };
}
