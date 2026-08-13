import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createPublicApiRuntimeConfig } from "./config/runtime-config";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { ClientJoinModule } from "./modules/client-join/client-join.module";
import { ClientProfileModule } from "./modules/client-profile/client-profile.module";
import { BookingModule } from "./modules/booking/booking.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { ClientCommerceModule } from "./modules/client-commerce/client-commerce.module";
import { RefundCandidatesModule } from "./modules/refund-candidates/refund-candidates.module";
import { SessionsModule } from "./modules/sessions/sessions.module";

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
    ClientCommerceModule,
    RefundCandidatesModule,
    BookingModule,
    OrdersModule,
    PaymentsModule,
    SessionsModule
  ]
})
export class AppModule {}
