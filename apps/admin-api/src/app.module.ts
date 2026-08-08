import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createAdminApiRuntimeConfig } from "./config/runtime-config";
import { FinancePoliciesModule } from "./modules/finance-policies/finance-policies.module";
import { FlowRuntimeControlModule } from "./modules/flow-runtime-control/flow-runtime-control.module";
import { FiscalProfilesModule } from "./modules/fiscal-profiles/fiscal-profiles.module";
import { HealthModule } from "./modules/health/health.module";
import { PlatformTariffsModule } from "./modules/platform-tariffs/platform-tariffs.module";
import { PayoutEvidenceModule } from "./modules/payout-evidence/payout-evidence.module";
import { SavedCardDisclosuresModule } from "./modules/saved-card-disclosures/saved-card-disclosures.module";
import { AdminRefundCandidatesModule } from "./modules/refund-candidates/refund-candidates.module";
import { AdminFinanceAuthorizationsModule } from "./modules/finance-authorizations/finance-authorizations.module";
import { AdminOnlineWalletRefundsModule } from "./modules/online-wallet-refunds/online-wallet-refunds.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          adminApi: createAdminApiRuntimeConfig()
        })
      ]
    }),
    HealthModule,
    FinancePoliciesModule,
    FlowRuntimeControlModule,
    FiscalProfilesModule,
    PlatformTariffsModule,
    PayoutEvidenceModule,
    SavedCardDisclosuresModule,
    AdminRefundCandidatesModule,
    AdminFinanceAuthorizationsModule,
    AdminOnlineWalletRefundsModule
  ]
})
export class AppModule {}
