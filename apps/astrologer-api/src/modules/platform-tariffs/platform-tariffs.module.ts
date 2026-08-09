import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDrizzleAuditLogStore } from "@elevenhouse/db/audit-log";
import {
  createDrizzleSavedCardSetupInitiationUnitOfWork,
  createDrizzleSavedCardSetupExecutionUnitOfWork,
  createDrizzleSavedCardSetupThreeDsMethodCompletionUnitOfWork,
  createDrizzlePlatformTariffInvoiceThreeDsMethodCompletionUnitOfWork,
  createDrizzleSavedCardSetupSessionReader,
  createDrizzleSavedCardSetupCustomerActionReader,
  createDrizzlePlatformTariffInvoiceCustomerActionReader,
  createFinanceArtifactRegistry,
  createDrizzleSavedCardDisclosureReader,
  createDrizzleFinanceOperationResourcePolicyReader,
  executeIdempotentFinanceCommand,
  type FinanceTransaction
} from "@elevenhouse/db/finance";
import {
  createFinanceTransientSecretVault,
  createFilesystemFinancePrivateObjectStorage
} from "@elevenhouse/finance-infrastructure";
import type {
  FinanceOperationResourcePolicyReader,
  FinancePrivateObjectStoragePort,
  FinanceTransientSecretVaultPort
} from "@elevenhouse/domain/finance-core";
import type { AstrologerApiRuntimeConfig } from "../../config/runtime-config";
import { createDrizzlePlatformTariffAuthorityStore } from "@elevenhouse/db/platform-billing";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { AstrologerTariffsController } from "./platform-tariffs.controller";
import { AstrologerTariffsService } from "./platform-tariffs.service";
import { TariffInvoicePaymentStatusService } from "./tariff-invoice-payment-status.service";
import { TariffInvoiceThreeDsMethodService } from "./tariff-invoice-three-ds-method.service";
import {
  ASTROLOGER_FINANCE_OPERATION_RESOURCE_POLICY_READER,
  ASTROLOGER_FINANCE_ARTIFACT_REGISTRY,
  ASTROLOGER_FINANCE_PRIVATE_OBJECT_STORAGE,
  ASTROLOGER_FINANCE_TRANSIENT_SECRET_VAULT,
  ASTROLOGER_SAVED_CARD_SETUP_CUSTOMER_ACTION_READER,
  ASTROLOGER_TARIFF_INVOICE_CUSTOMER_ACTION_READER,
  ASTROLOGER_SAVED_CARD_SETUP_SESSION_READER,
  ASTROLOGER_TARIFF_STORE,
  ASTROLOGER_TARIFF_UNIT_OF_WORK
} from "./platform-tariffs.tokens";
import type { AstrologerTariffUnitOfWork } from "./platform-tariffs.unit-of-work";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [AstrologerTariffsController],
  providers: [
    AstrologerTariffsService,
    TariffInvoicePaymentStatusService,
    TariffInvoiceThreeDsMethodService,
    {
      provide: ASTROLOGER_TARIFF_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzlePlatformTariffAuthorityStore({ database: postgresRuntime.database }),
      inject: [PostgresRuntimeService]
    },
    {
      provide: "ASTROLOGER_SAVED_CARD_DISCLOSURE_READER",
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleSavedCardDisclosureReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ASTROLOGER_SAVED_CARD_SETUP_SESSION_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleSavedCardSetupSessionReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ASTROLOGER_SAVED_CARD_SETUP_CUSTOMER_ACTION_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleSavedCardSetupCustomerActionReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ASTROLOGER_TARIFF_INVOICE_CUSTOMER_ACTION_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzlePlatformTariffInvoiceCustomerActionReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ASTROLOGER_FINANCE_ARTIFACT_REGISTRY,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createFinanceArtifactRegistry(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ASTROLOGER_FINANCE_OPERATION_RESOURCE_POLICY_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService): FinanceOperationResourcePolicyReader =>
        createDrizzleFinanceOperationResourcePolicyReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ASTROLOGER_FINANCE_PRIVATE_OBJECT_STORAGE,
      useFactory: async (configService: ConfigService): Promise<FinancePrivateObjectStoragePort | null> => {
        const storage = configService.getOrThrow<AstrologerApiRuntimeConfig["billing"]["financeArtifactStorage"]>(
          "astrologerApi.billing.financeArtifactStorage"
        );
        if (!storage) return null;
        const privateStorage = createFilesystemFinancePrivateObjectStorage({
          rootDirectory: storage.artifactDirectory
        });
        await privateStorage.checkReady();
        return privateStorage;
      },
      inject: [ConfigService]
    },
    {
      provide: ASTROLOGER_FINANCE_TRANSIENT_SECRET_VAULT,
      useFactory: (storage: FinancePrivateObjectStoragePort | null): FinanceTransientSecretVaultPort | null =>
        storage ? createFinanceTransientSecretVault(storage) : null,
      inject: [ASTROLOGER_FINANCE_PRIVATE_OBJECT_STORAGE]
    },
    {
      provide: ASTROLOGER_TARIFF_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService): AstrologerTariffUnitOfWork => ({
        executeIdempotent: (input) =>
          executeIdempotentFinanceCommand({
            database: postgresRuntime.database,
            command: input.command,
            create: (transaction) => input.create(context(transaction)),
            replay: (result) => input.replay(result)
          })
      }),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class AstrologerTariffsModule {}

function context(transaction: FinanceTransaction) {
  return {
    store: createDrizzlePlatformTariffAuthorityStore({ database: transaction }),
    auditLogStore: createDrizzleAuditLogStore(transaction),
    savedCardSetupInitiation: createDrizzleSavedCardSetupInitiationUnitOfWork({ database: transaction }),
    savedCardSetupExecution: createDrizzleSavedCardSetupExecutionUnitOfWork({ database: transaction }),
    savedCardSetupThreeDsMethodCompletion:
      createDrizzleSavedCardSetupThreeDsMethodCompletionUnitOfWork({ database: transaction }),
    tariffInvoiceThreeDsMethodCompletion:
      createDrizzlePlatformTariffInvoiceThreeDsMethodCompletionUnitOfWork({ database: transaction })
  };
}
