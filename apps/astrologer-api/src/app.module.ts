import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createAstrologerApiRuntimeConfig } from "./config/runtime-config";
import { DatabaseModule } from "./modules/database/database.module";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
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
    HealthModule
  ]
})
export class AppModule {}
