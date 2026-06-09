import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { createOpsApiRuntimeConfig } from "./runtime-config";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          opsApi: createOpsApiRuntimeConfig()
        })
      ]
    })
  ],
  controllers: [HealthController],
  providers: [HealthService]
})
export class AppModule {}
