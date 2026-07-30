import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  createDrizzleLedgerTransactionStore,
  createDrizzlePayoutStore,
  executeIdempotentFinanceCommand
} from "@elevenhouse/db/finance";
import type { FinanceTransaction } from "@elevenhouse/db/finance";
import { createDrizzlePlatformBillingStore } from "@elevenhouse/db/platform-billing";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { ASTROLOGER_FINANCE_OPTIONS, ASTROLOGER_FINANCE_UNIT_OF_WORK } from "./finance.tokens";
import type {
  AstrologerFinanceOptions,
  AstrologerFinanceUnitOfWork,
  AstrologerFinanceUnitOfWorkContext
} from "./finance.unit-of-work";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [FinanceController],
  providers: [
    FinanceService,
    {
      provide: ASTROLOGER_FINANCE_OPTIONS,
      useFactory: (configService: ConfigService): AstrologerFinanceOptions => ({
        minimumPayoutAmountMinor: 1_000_00,
        platformBillingProviderConfigured: configService.getOrThrow<boolean>(
          "astrologerApi.billing.arcPayConfigured"
        )
      }),
      inject: [ConfigService]
    },
    {
      provide: ASTROLOGER_FINANCE_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService): AstrologerFinanceUnitOfWork => ({
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
export class FinanceModule {}

function createUnitOfWorkContext(
  transaction: FinanceTransaction
): AstrologerFinanceUnitOfWorkContext {
  return {
    payoutStore: createDrizzlePayoutStore(transaction),
    ledgerStore: createDrizzleLedgerTransactionStore(transaction),
    platformBillingStore: createDrizzlePlatformBillingStore(transaction)
  };
}
