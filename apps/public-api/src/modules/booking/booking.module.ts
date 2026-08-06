import { Module } from "@nestjs/common";
import { createDrizzleClientStore } from "@elevenhouse/db/clients";
import {
  createDrizzleAvailabilityStore,
  createDrizzleBookingCommandStore
} from "@elevenhouse/db/scheduling";
import { createDrizzleProductStore } from "@elevenhouse/db/products";
import type { BookingProduct, Product } from "@elevenhouse/domain";
import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { BookingController } from "./booking.controller";
import { BookingService } from "./booking.service";
import {
  PUBLIC_BOOKING_AVAILABILITY_STORE,
  PUBLIC_BOOKING_CLIENT_READER,
  PUBLIC_BOOKING_COMMAND_STORE,
  PUBLIC_BOOKING_PRODUCT_READER
} from "./booking.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [BookingController],
  providers: [
    BookingService,
    SystemClock,
    {
      provide: PUBLIC_BOOKING_COMMAND_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleBookingCommandStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: PUBLIC_BOOKING_AVAILABILITY_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleAvailabilityStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: PUBLIC_BOOKING_CLIENT_READER,
      useFactory: (runtime: PostgresRuntimeService) => {
        const clients = createDrizzleClientStore(runtime.database);
        return {
          hasActiveRelationship: async (input: {
            ownerUserId: string;
            clientUserId: string;
          }) =>
            (await clients.getAstrologerClient({
              astrologerUserId: input.ownerUserId,
              clientUserId: input.clientUserId
            }))?.relationshipStatus === "active"
        };
      },
      inject: [PostgresRuntimeService]
    },
    {
      provide: PUBLIC_BOOKING_PRODUCT_READER,
      useFactory: (runtime: PostgresRuntimeService) => {
        const products = createDrizzleProductStore(runtime.database);
        return {
          findByOwnerAndId: async (input: { ownerUserId: string; productId: string }) => {
            const product = await products.findByOwnerAndId(input);
            return product ? toBookingProduct(product) : null;
          }
        };
      },
      inject: [PostgresRuntimeService]
    }
  ]
})
export class BookingModule {}

export function toBookingProduct(product: Product): BookingProduct {
  return {
    id: product.id,
    title: product.title,
    status: product.status,
    executionMode: product.executionMode,
    participantMode: product.participantMode,
    durationMinutes: product.durationMinutes,
    deliveryFormats: product.deliveryFormats,
    requiredClientData: product.requiredClientData,
    methods: product.methods,
    priceMinor: product.priceMinor,
    currency: product.currency
  };
}
