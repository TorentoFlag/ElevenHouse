import { Module } from "@nestjs/common";
import { createDrizzleClientStore } from "@elevenhouse/db/clients";
import {
  createDrizzleFinancePolicyStore,
  createDrizzleOrderStore
} from "@elevenhouse/db/finance";
import { createDrizzleProductStore } from "@elevenhouse/db/products";
import { SystemClock } from "../../common/system-clock.js";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { SecurityModule } from "../security/security.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import {
  ORDERS_FINANCE_POLICY_STORE,
  ORDERS_ORDER_STORE,
  ORDERS_PRODUCT_STORE,
  ORDERS_RELATIONSHIP_READER
} from "./orders.tokens";

@Module({
  imports: [DatabaseModule, IdentityModule, SecurityModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    SystemClock,
    {
      provide: ORDERS_ORDER_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleOrderStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ORDERS_RELATIONSHIP_READER,
      useFactory: (postgresRuntime: PostgresRuntimeService) => {
        const clientStore = createDrizzleClientStore(postgresRuntime.database);
        return {
          hasActiveRelationship: async (input: {
            readonly clientUserId: string;
            readonly astrologerUserId: string;
          }) => Boolean(await clientStore.getAstrologerClient(input))
        };
      },
      inject: [PostgresRuntimeService]
    },
    {
      provide: ORDERS_PRODUCT_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleProductStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: ORDERS_FINANCE_POLICY_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleFinancePolicyStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class OrdersModule {}
