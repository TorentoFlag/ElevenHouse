import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createDrizzleFinanceOperationResourcePolicyReader,
  createDrizzleOnlineWalletRefundApprovalPreparationReader
} from "@elevenhouse/db/finance";
import { createFilesystemFinancePrivateObjectStorage } from "@elevenhouse/finance-infrastructure";
import type { FinancePrivateObjectStoragePort } from "@elevenhouse/domain/finance-core";

import type { AdminApiRuntimeConfig } from "../../config/runtime-config.js";
import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { AdminFinanceAuthorizationsModule } from "../finance-authorizations/finance-authorizations.module";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { AdminOnlineWalletRefundsController } from "./online-wallet-refunds.controller";
import { AdminOnlineWalletRefundsService } from "./online-wallet-refunds.service";
import { ADMIN_ONLINE_WALLET_REFUND_PRIVATE_STORAGE } from "./online-wallet-refunds.tokens";

@Module({
  imports: [
    DatabaseModule,
    IdentityModule,
    SecurityModule,
    AdminFinanceAuthorizationsModule
  ],
  controllers: [AdminOnlineWalletRefundsController],
  providers: [
    AdminOnlineWalletRefundsService,
    SystemClock,
    {
      provide: "ADMIN_ONLINE_WALLET_REFUND_PREPARATION_READER",
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleOnlineWalletRefundApprovalPreparationReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: "ADMIN_ONLINE_WALLET_REFUND_POLICY_READER",
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFinanceOperationResourcePolicyReader(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ADMIN_ONLINE_WALLET_REFUND_PRIVATE_STORAGE,
      useFactory: async (configService: ConfigService): Promise<FinancePrivateObjectStoragePort | null> => {
        const config = configService.getOrThrow<AdminApiRuntimeConfig>("adminApi").financeRefundDispatch;
        if (!config) return null;
        const storage = createFilesystemFinancePrivateObjectStorage({
          rootDirectory: config.artifactDirectory
        });
        await storage.checkReady();
        return storage;
      },
      inject: [ConfigService]
    }
  ]
})
export class AdminOnlineWalletRefundsModule {}
