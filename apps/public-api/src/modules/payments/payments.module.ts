import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createDrizzleActiveProviderAccountReader,
  createDrizzleClientCheckoutPreparationStore,
  createDrizzleClientOrderCheckoutCaptureAuthorityReader,
  createDrizzleClientOrderCheckoutPreparationUnitOfWork,
  createDrizzleFinanceOperationResourcePolicyReader,
  createDrizzleFiscalProfileReader,
  createDrizzleOrderStore,
  createDrizzleVerifiedFiscalBuyerContactReader,
  createFinanceArtifactRegistry
} from "@elevenhouse/db/finance";
import { createClientOrderCheckoutCommandFactory } from "@elevenhouse/domain/finance-core";
import {
  createFilesystemFinancePrivateObjectStorage,
  createS3FinancePrivateObjectStorage,
  type FinancePrivateObjectStorageRuntime
} from "@elevenhouse/finance-infrastructure";
import type { PublicApiRuntimeConfig } from "../../config/runtime-config.js";
import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { PaymentsController } from "./payments.controller";
import { ClientCheckoutActionService } from "./client-checkout-action.service";
import { ClientCheckoutPreparationService } from "./client-checkout-preparation.service";
import { PaymentsService } from "./payments.service";
import {
  PAYMENTS_CHECKOUT_ACTION_SERVICE,
  PAYMENTS_CHECKOUT_PREPARATION_SERVICE,
  PAYMENTS_FINANCE_PRIVATE_OBJECT_STORAGE,
  PAYMENTS_ORDER_STORE
} from "./payments.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    SystemClock,
    {
      provide: PAYMENTS_ORDER_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleOrderStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: PAYMENTS_FINANCE_PRIVATE_OBJECT_STORAGE,
      useFactory: async (configService: ConfigService) => {
        const config =
          configService.getOrThrow<PublicApiRuntimeConfig>("publicApi").financeCheckout;
        if (!config) return null;
        const privateStorage = createFinancePrivateObjectStorage(config.artifactStorage);
        await privateStorage.checkReady();
        return privateStorage;
      },
      inject: [ConfigService]
    },
    {
      provide: PAYMENTS_CHECKOUT_PREPARATION_SERVICE,
      useFactory: (
        postgresRuntime: PostgresRuntimeService,
        configService: ConfigService,
        clock: SystemClock,
        privateStorage: FinancePrivateObjectStorageRuntime | null
      ) => {
        const config =
          configService.getOrThrow<PublicApiRuntimeConfig>("publicApi").financeCheckout;
        if (!config || !privateStorage) return null;
        return new ClientCheckoutPreparationService(
          createClientOrderCheckoutCommandFactory({
            providerAccounts: createDrizzleActiveProviderAccountReader(postgresRuntime.database),
            fiscalProfiles: createDrizzleFiscalProfileReader(postgresRuntime.database),
            buyerContacts: createDrizzleVerifiedFiscalBuyerContactReader(postgresRuntime.database),
            operationPolicies: createDrizzleFinanceOperationResourcePolicyReader(
              postgresRuntime.database
            ),
            captureAuthorities: createDrizzleClientOrderCheckoutCaptureAuthorityReader(
              postgresRuntime.database
            )
          }),
          privateStorage,
          createFinanceArtifactRegistry(postgresRuntime.database),
          createDrizzleClientOrderCheckoutPreparationUnitOfWork(postgresRuntime.database),
          {
            paymentMethods: config.paymentMethods,
            requestArtifactRetention: config.requestArtifactRetention,
            clock
          }
        );
      },
      inject: [
        PostgresRuntimeService,
        ConfigService,
        SystemClock,
        PAYMENTS_FINANCE_PRIVATE_OBJECT_STORAGE
      ]
    },
    {
      provide: PAYMENTS_CHECKOUT_ACTION_SERVICE,
      useFactory: (
        postgresRuntime: PostgresRuntimeService,
        privateStorage: FinancePrivateObjectStorageRuntime | null
      ) => {
        if (!privateStorage) return null;
        return new ClientCheckoutActionService(
          createDrizzleClientCheckoutPreparationStore(postgresRuntime.database),
          createFinanceArtifactRegistry(postgresRuntime.database),
          privateStorage
        );
      },
      inject: [PostgresRuntimeService, PAYMENTS_FINANCE_PRIVATE_OBJECT_STORAGE]
    }
  ]
})
export class PaymentsModule {}

function createFinancePrivateObjectStorage(
  config: NonNullable<PublicApiRuntimeConfig["financeCheckout"]>["artifactStorage"]
): FinancePrivateObjectStorageRuntime {
  return config.kind === "filesystem"
    ? createFilesystemFinancePrivateObjectStorage({
        rootDirectory: config.rootDirectory
      })
    : createS3FinancePrivateObjectStorage(config);
}
