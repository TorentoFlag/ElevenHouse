import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDrizzleOrderStore, createDrizzlePaymentStore } from "@elevenhouse/db/finance";
import type { PublicApiRuntimeConfig } from "../../config/runtime-config";
import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { ArcPayCheckoutProvider } from "./arc-pay-checkout-provider";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { PAYMENTS_ORDER_STORE, PAYMENTS_PAYMENT_STORE, PAYMENTS_PROVIDER } from "./payments.tokens";

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
      provide: PAYMENTS_PAYMENT_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzlePaymentStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: PAYMENTS_PROVIDER,
      useFactory: (config: ConfigService) =>
        new ArcPayCheckoutProvider(
          config.getOrThrow<PublicApiRuntimeConfig["arcPay"]>("publicApi.arcPay")
        ),
      inject: [ConfigService]
    }
  ]
})
export class PaymentsModule {}
