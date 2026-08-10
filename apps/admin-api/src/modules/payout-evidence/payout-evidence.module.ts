import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createFilesystemFinancePrivateObjectStorage,
  createS3FinancePrivateObjectStorage
} from "@elevenhouse/finance-infrastructure";
import type { AdminApiRuntimeConfig } from "../../config/runtime-config.js";
import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { PayoutEvidenceController } from "./payout-evidence.controller";
import { PayoutEvidenceService } from "./payout-evidence.service";
import { PAYOUT_EVIDENCE_PRIVATE_STORAGE } from "./payout-evidence.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [PayoutEvidenceController],
  providers: [
    PayoutEvidenceService,
    {
      provide: "ADMIN_API_RUNTIME_CONFIG",
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow<AdminApiRuntimeConfig>("adminApi"),
      inject: [ConfigService]
    },
    {
      provide: PAYOUT_EVIDENCE_PRIVATE_STORAGE,
      useFactory: async (configService: ConfigService) => {
        const config = configService.getOrThrow<AdminApiRuntimeConfig>("adminApi").financePayoutEvidence;
        if (!config) return null;
        const storage = config.artifactStorage.kind === "filesystem"
          ? createFilesystemFinancePrivateObjectStorage({
              rootDirectory: config.artifactStorage.rootDirectory
            })
          : createS3FinancePrivateObjectStorage(config.artifactStorage);
        await storage.checkReady();
        return storage;
      },
      inject: [ConfigService]
    },
    SystemClock
  ]
})
export class PayoutEvidenceModule {}
