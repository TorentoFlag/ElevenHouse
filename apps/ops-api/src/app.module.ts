import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { createOpsApiRuntimeConfig } from "./config/runtime-config";
import { HealthModule } from "./modules/health/health.module";

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
    HealthModule
  ]
})
export class AppModule {}
