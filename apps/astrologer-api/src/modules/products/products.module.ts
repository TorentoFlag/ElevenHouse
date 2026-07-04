import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createDrizzleProductStore } from "@elevenhouse/db/products";
import { ClockModule } from "../clock/clock.module";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityModule } from "../identity/identity.module";
import { MediaModule } from "../media/media.module";
import { SecurityModule } from "../security/security.module";
import { NullProductAnalyticsReader } from "./null-product-analytics-reader";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { PRODUCT_ANALYTICS_READER, PRODUCT_STORE } from "./products.tokens";

@Module({
  imports: [ConfigModule, ClockModule, DatabaseModule, IdentityModule, SecurityModule, MediaModule],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    {
      provide: PRODUCT_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleProductStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: PRODUCT_ANALYTICS_READER,
      useClass: NullProductAnalyticsReader
    }
  ]
})
export class ProductsModule {}
