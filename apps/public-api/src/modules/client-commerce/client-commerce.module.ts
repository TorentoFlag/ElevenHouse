import { Module } from "@nestjs/common";
import { createDrizzleClientStore } from "@elevenhouse/db/clients";
import { createDrizzleProductStore } from "@elevenhouse/db/products";
import { createDrizzleAvailabilityStore } from "@elevenhouse/db/scheduling";
import { createDrizzlePlatformTariffAuthorityStore } from "@elevenhouse/db/platform-billing";
import { createDrizzleFinancePolicyStore } from "@elevenhouse/db/finance";
import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { ClientCommerceController } from "./client-commerce.controller";
import { ClientCommerceService } from "./client-commerce.service";
import {
  CLIENT_COMMERCE_AVAILABILITY_STORE,
  CLIENT_COMMERCE_FINANCE_POLICY_STORE,
  CLIENT_COMMERCE_PRODUCT_STORE,
  CLIENT_COMMERCE_RELATIONSHIP_READER,
  CLIENT_COMMERCE_TARIFF_AUTHORITY_STORE
} from "./client-commerce.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ClientCommerceController],
  providers: [
    ClientCommerceService,
    SystemClock,
    {
      provide: CLIENT_COMMERCE_RELATIONSHIP_READER,
      useFactory: (runtime: PostgresRuntimeService) => {
        const clients = createDrizzleClientStore(runtime.database);
        return {
          hasActiveRelationship: async ({ clientUserId, astrologerUserId }: {
            readonly clientUserId: string;
            readonly astrologerUserId: string;
          }) => Boolean(await clients.getAstrologerClient({ clientUserId, astrologerUserId }))
        };
      },
      inject: [PostgresRuntimeService]
    },
    {
      provide: CLIENT_COMMERCE_PRODUCT_STORE,
      useFactory: (runtime: PostgresRuntimeService) => createDrizzleProductStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CLIENT_COMMERCE_TARIFF_AUTHORITY_STORE,
      useFactory: (runtime: PostgresRuntimeService) =>
        createDrizzlePlatformTariffAuthorityStore({ database: runtime.database }),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CLIENT_COMMERCE_FINANCE_POLICY_STORE,
      useFactory: (runtime: PostgresRuntimeService) => createDrizzleFinancePolicyStore(runtime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: CLIENT_COMMERCE_AVAILABILITY_STORE,
      useFactory: (runtime: PostgresRuntimeService) => createDrizzleAvailabilityStore(runtime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class ClientCommerceModule {}
