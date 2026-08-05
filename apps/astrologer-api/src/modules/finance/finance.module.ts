import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  createDrizzleLedgerTransactionStore,
  createDrizzleOnlineWalletPayoutRequestReader,
  createDrizzleOnlineWalletPayoutRequestUnitOfWork,
  createDrizzlePayoutStore,
  executeIdempotentFinanceCommand
} from "@elevenhouse/db/finance";
import type { FinanceTransaction } from "@elevenhouse/db/finance";
import { createDrizzlePlatformTariffAuthorityStore } from "@elevenhouse/db/platform-billing";
import { createFinancePayoutDestinationVault, createS3FinancePrivateObjectStorage } from "@elevenhouse/finance-infrastructure";
import type { FinancePayoutDestinationVaultPort } from "@elevenhouse/domain/finance-core";
import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import {
  ASTROLOGER_FINANCE_OPTIONS,
  ASTROLOGER_FINANCE_UNIT_OF_WORK,
  ASTROLOGER_PAYOUT_DESTINATION_VAULT
} from "./finance.tokens";
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
      useValue: { minimumPayoutAmountMinor: 1_000_00 } satisfies AstrologerFinanceOptions
    },
    {
      provide: ASTROLOGER_PAYOUT_DESTINATION_VAULT,
      useFactory: (configService: ConfigService): FinancePayoutDestinationVaultPort | null => {
        const storage = configService.getOrThrow<AstrologerApiRuntimeConfig["billing"]["financeArtifactStorage"]>(
          "astrologerApi.billing.financeArtifactStorage"
        );
        return storage ? createFinancePayoutDestinationVault(createS3FinancePrivateObjectStorage(storage)) : null;
      },
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
    tariffStore: createDrizzlePlatformTariffAuthorityStore({ database: transaction }),
    onlineWalletPayoutRequests: createDrizzleOnlineWalletPayoutRequestUnitOfWork({
      database: transaction
    }),
    onlineWalletPayoutRequestReader: createDrizzleOnlineWalletPayoutRequestReader({
      database: transaction
    })
  };
}
