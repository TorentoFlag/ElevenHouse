import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createOpsApiRuntimeConfig } from "./config/runtime-config";
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
          opsApi: createOpsApiRuntimeConfig()
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
