import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createAstrologerApiRuntimeConfig } from "./config/runtime-config";
import { AiModule } from "./modules/ai/ai.module";
import { AstrologerProfileModule } from "./modules/astrologer-profile/astrologer-profile.module";
import { CalculationsModule } from "./modules/calculations/calculations.module";
import { DatabaseModule } from "./modules/database/database.module";
import { DictionaryAiModule } from "./modules/dictionary-ai/dictionary-ai.module";
import { DictionaryModule } from "./modules/dictionary/dictionary.module";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { MediaModule } from "./modules/media/media.module";
import { NumerologyModule } from "./modules/numerology/numerology.module";
import { PlatformBillingModule } from "./modules/platform-billing/platform-billing.module";
import { ProductsModule } from "./modules/products/products.module";
import { RedisModule } from "./modules/redis/redis.module";
import { VerificationModule } from "./modules/verification/verification.module";

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
    MediaModule,
    PlatformBillingModule,
    ProductsModule,
    VerificationModule,
    CalculationsModule,
    NumerologyModule,
    AstrologerProfileModule,
    HealthModule
  ]
})
export class AppModule {}
