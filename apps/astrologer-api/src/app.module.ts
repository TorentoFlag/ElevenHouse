import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createAstrologerApiRuntimeConfig } from "./config/runtime-config";
import { AiModule } from "./modules/ai/ai.module";
import { AstrologerProfileModule } from "./modules/astrologer-profile/astrologer-profile.module";
import { DatabaseModule } from "./modules/database/database.module";
import { DictionaryAiModule } from "./modules/dictionary-ai/dictionary-ai.module";
import { DictionaryModule } from "./modules/dictionary/dictionary.module";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { ProductsModule } from "./modules/products/products.module";
import { RedisModule } from "./modules/redis/redis.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          astrologerApi: createAstrologerApiRuntimeConfig()
        })
      ]
    }),
    DatabaseModule,
    RedisModule,
    IdentityModule,
    AiModule,
    DictionaryModule,
    DictionaryAiModule,
    ProductsModule,
    AstrologerProfileModule,
    HealthModule
  ]
})
export class AppModule {}
