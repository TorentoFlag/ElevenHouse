import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  createDrizzleAuthSessionAuthenticationStore,
  createDrizzleAuthSessionRevocationUnitOfWork
} from "@elevenhouse/db/auth-sessions";
import { createDrizzlePasswordlessAuthUnitOfWork } from "@elevenhouse/db/passwordless-auth";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { RedisModule } from "../redis/redis.module";
import { REDIS_CLIENT, type RedisClientPort } from "../redis/redis.tokens";
import { SecurityModule } from "../security/security.module";
import { IdentityCurrentAccountController } from "./identity-current-account.controller";
import { IdentityCurrentSessionService } from "./identity-current-session.service";
import { OpsSessionAuthGuard } from "./identity-auth.guard";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  AUTH_SESSION_REVOCATION_UNIT_OF_WORK
} from "./identity-auth.tokens";
import { IdentityLogoutService } from "./identity-logout.service";
import { IdentityPasswordlessController } from "./identity-passwordless.controller";
import { IdentitySessionController } from "./identity-session.controller";
import {
  AesGcmAuthCodeEncryption,
  DomainPasswordlessAuthHandler,
  NumericPasswordlessCodeGenerator,
  OPS_AUTH_CODE_GENERATOR
} from "./identity-passwordless.handler";
import {
  PASSWORDLESS_AUTH_CODE_ENCRYPTION,
  PASSWORDLESS_AUTH_OPTIONS,
  PASSWORDLESS_RATE_LIMITER,
  PASSWORDLESS_RATE_LIMIT_OPTIONS,
  PASSWORDLESS_AUTH_UNIT_OF_WORK
} from "./identity-passwordless.tokens";
import {
  RedisPasswordlessRateLimiter,
  type PasswordlessRateLimitOptions
} from "./identity-passwordless.rate-limit";
import { IdentityPasswordlessService } from "./identity-passwordless.service";
import {
  OpsSessionCookieService,
  OpsSessionTokenIssuer,
  SystemClock
} from "./identity-session.service";

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, SecurityModule],
  controllers: [
    IdentityPasswordlessController,
    IdentityCurrentAccountController,
    IdentitySessionController
  ],
  providers: [
    IdentityPasswordlessService,
    IdentityCurrentSessionService,
    IdentityLogoutService,
    OpsSessionAuthGuard,
    OpsSessionTokenIssuer,
    OpsSessionCookieService,
    SystemClock,
    DomainPasswordlessAuthHandler,
    {
      provide: PASSWORDLESS_AUTH_CODE_ENCRYPTION,
      useClass: AesGcmAuthCodeEncryption
    },
    {
      provide: OPS_AUTH_CODE_GENERATOR,
      useClass: NumericPasswordlessCodeGenerator
    },
    {
      provide: PASSWORDLESS_AUTH_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzlePasswordlessAuthUnitOfWork(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: AUTH_SESSION_AUTHENTICATION_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAuthSessionAuthenticationStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: AUTH_SESSION_REVOCATION_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAuthSessionRevocationUnitOfWork(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: PASSWORDLESS_AUTH_OPTIONS,
      useFactory: (configService: ConfigService) => ({
        authCodeDeliveryEncryptionKey: configService.getOrThrow<Buffer>(
          "opsApi.authCodeDeliveryEncryptionKey"
        ),
        codeSecret: configService.getOrThrow<string>("opsApi.passwordlessCodeSecret"),
        codeTtlSeconds: configService.getOrThrow<number>("opsApi.passwordlessCodeTtlSeconds"),
        resendCooldownSeconds: configService.getOrThrow<number>(
          "opsApi.passwordlessResendCooldownSeconds"
        ),
        maxAttempts: configService.getOrThrow<number>("opsApi.passwordlessMaxAttempts"),
        sessionTtlSeconds: configService.getOrThrow<number>("opsApi.sessionTtlSeconds")
      }),
      inject: [ConfigService]
    },
    {
      provide: PASSWORDLESS_RATE_LIMIT_OPTIONS,
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow("opsApi.passwordlessRateLimits"),
      inject: [ConfigService]
    },
    {
      provide: PASSWORDLESS_RATE_LIMITER,
      useFactory: (
        options: PasswordlessRateLimitOptions,
        redisClient: RedisClientPort,
        configService: ConfigService
      ) =>
        new RedisPasswordlessRateLimiter(redisClient, options, {
          keyPrefix: configService.getOrThrow<string>(
            "opsApi.passwordlessRateLimitRedisKeyPrefix"
          )
        }),
      inject: [PASSWORDLESS_RATE_LIMIT_OPTIONS, REDIS_CLIENT, ConfigService]
    }
  ]
})
export class IdentityModule {}
