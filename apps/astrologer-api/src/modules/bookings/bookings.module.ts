import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createDrizzleClientStore } from "@elevenhouse/db/clients";
import { createDrizzleProductStore } from "@elevenhouse/db/products";
import { createDrizzleBookingCommandStore } from "@elevenhouse/db/scheduling";
import { AvailabilityModule } from "../availability/availability.module";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import {
  BOOKING_CLIENT_READER,
  BOOKING_COMMAND_STORE,
  BOOKING_PRODUCT_READER
} from "./bookings.tokens";

@Module({
  imports: [
    AvailabilityModule,
    ClockModule,
    ConfigModule,
    DatabaseModule,
    IdentityModule,
    SecurityModule
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    {
      provide: BOOKING_COMMAND_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleBookingCommandStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: BOOKING_CLIENT_READER,
      useFactory: (runtime: PostgresRuntimeService) => {
        const clients = createDrizzleClientStore(runtime.database);
        return {
          hasActiveRelationship: async (input: {
            ownerUserId: string;
            clientUserId: string;
          }) => {
            const client = await clients.getAstrologerClient({
              astrologerUserId: input.ownerUserId,
              clientUserId: input.clientUserId
            });
            return client?.relationshipStatus === "active";
          }
        };
      },
      inject: [PostgresRuntimeService]
    },
    {
      provide: BOOKING_PRODUCT_READER,
      useFactory: (runtime: PostgresRuntimeService) => {
        const products = createDrizzleProductStore(runtime.database);
        return {
          findByOwnerAndId: async (input: { ownerUserId: string; productId: string }) => {
            const product = await products.findByOwnerAndId(input);
            return product
              ? {
                  id: product.id,
                  title: product.title,
                  status: product.status,
                  executionMode: product.executionMode,
                  participantMode: product.participantMode,
                  durationMinutes: product.durationMinutes,
                  deliveryFormats: product.deliveryFormats,
                  priceMinor: product.priceMinor,
                  currency: product.currency
                }
              : null;
          }
        };
      },
      inject: [PostgresRuntimeService]
    }
  ]
})
export class BookingsModule {}
