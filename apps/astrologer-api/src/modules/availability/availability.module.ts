import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createDrizzleAvailabilityStore } from "@elevenhouse/db/scheduling";
import { createDrizzleProductStore } from "@elevenhouse/db/products";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityService } from "./availability.service";
import { AVAILABILITY_PRODUCT_READER, AVAILABILITY_STORE } from "./availability.tokens";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, SecurityModule],
  controllers: [AvailabilityController],
  providers: [
    AvailabilityService,
    {
      provide: AVAILABILITY_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzleAvailabilityStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: AVAILABILITY_PRODUCT_READER,
      useFactory: (runtime: PostgresRuntimeService) => {
        const products = createDrizzleProductStore(runtime.database);
        return {
          findBookableProductIds: async (input: {
            ownerUserId: string;
            productIds: readonly string[];
          }) => {
            const resolved = await Promise.all(
              input.productIds.map((productId) =>
                products.findByOwnerAndId({ ownerUserId: input.ownerUserId, productId })
              )
            );
            return resolved
              .filter((product) => product?.status === "active")
              .map((product) => product!.id);
          }
        };
      },
      inject: [PostgresRuntimeService]
    }
  ],
  exports: [AVAILABILITY_STORE]
})
export class AvailabilityModule {}
