import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createPublicApiRuntimeConfig } from "./config/runtime-config";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { ClientJoinModule } from "./modules/client-join/client-join.module";
import { ClientProfileModule } from "./modules/client-profile/client-profile.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { PaymentsModule } from "./modules/payments/payments.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          publicApi: createPublicApiRuntimeConfig()
        })
      ]
    }),
    HealthModule,
    IdentityModule,
    ClientJoinModule,
    ClientProfileModule,
    OrdersModule,
    PaymentsModule
  ]
})
export class AppModule {}
