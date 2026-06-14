import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createPublicApiRuntimeConfig } from "./config/runtime-config";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          publicApi: createPublicApiRuntimeConfig()
        })
      ]
    }),
    HealthModule,
    IdentityModule
  ]
})
export class AppModule {}
