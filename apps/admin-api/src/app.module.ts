import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createAdminApiRuntimeConfig } from "./config/runtime-config";
import { FinancePoliciesModule } from "./modules/finance-policies/finance-policies.module";
import { HealthModule } from "./modules/health/health.module";

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
    FinancePoliciesModule
  ]
})
export class AppModule {}
