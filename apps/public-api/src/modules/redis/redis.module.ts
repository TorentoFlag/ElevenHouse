import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RedisRuntimeService } from "./redis-runtime.service";
import { REDIS_CLIENT } from "./redis.tokens";

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: RedisRuntimeService,
      useFactory: (configService: ConfigService) => RedisRuntimeService.connect(configService),
      inject: [ConfigService]
    },
    {
      provide: REDIS_CLIENT,
      useExisting: RedisRuntimeService
    }
  ],
  exports: [REDIS_CLIENT]
})
export class RedisModule {}
