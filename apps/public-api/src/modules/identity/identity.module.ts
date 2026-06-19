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
import { IdentityCurrentAccountController } from "./session/identity-current-account.controller";
import { IdentityCurrentSessionService } from "./session/identity-current-session.service";
import { PublicSessionAuthGuard } from "./auth/identity-auth.guard";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  AUTH_SESSION_REVOCATION_UNIT_OF_WORK
} from "./auth/identity-auth.tokens";
import { IdentityLogoutService } from "./session/identity-logout.service";
import { IdentityPasswordlessController } from "./passwordless/identity-passwordless.controller";
import { IdentitySessionController } from "./session/identity-session.controller";
import {
  AesGcmAuthCodeEncryption,
  DomainPasswordlessAuthHandler,
  NumericPasswordlessCodeGenerator,
  PUBLIC_AUTH_CODE_GENERATOR
} from "./passwordless/identity-passwordless.handler";
import {
  PASSWORDLESS_AUTH_CODE_ENCRYPTION,
  PASSWORDLESS_AUTH_OPTIONS,
  PASSWORDLESS_RATE_LIMITER,
  PASSWORDLESS_RATE_LIMIT_OPTIONS,
  PASSWORDLESS_AUTH_UNIT_OF_WORK
} from "./passwordless/identity-passwordless.tokens";
import {
  RedisPasswordlessRateLimiter,
  type PasswordlessRateLimitOptions
} from "./passwordless/identity-passwordless.rate-limit";
import { IdentityPasswordlessService } from "./passwordless/identity-passwordless.service";
import {
  PublicSessionCookieService,
  PublicSessionTokenIssuer,
  SystemClock
} from "./session/identity-session.service";

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
    PublicSessionAuthGuard,
    PublicSessionTokenIssuer,
    PublicSessionCookieService,
    SystemClock,
    DomainPasswordlessAuthHandler,
    {
      provide: PASSWORDLESS_AUTH_CODE_ENCRYPTION,
      useClass: AesGcmAuthCodeEncryption
    },
    {
      provide: PUBLIC_AUTH_CODE_GENERATOR,
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
          "publicApi.authCodeDeliveryEncryptionKey"
        ),
        codeSecret: configService.getOrThrow<string>("publicApi.passwordlessCodeSecret"),
        codeTtlSeconds: configService.getOrThrow<number>("publicApi.passwordlessCodeTtlSeconds"),
        resendCooldownSeconds: configService.getOrThrow<number>(
          "publicApi.passwordlessResendCooldownSeconds"
        ),
        maxAttempts: configService.getOrThrow<number>("publicApi.passwordlessMaxAttempts"),
        sessionTtlSeconds: configService.getOrThrow<number>("publicApi.sessionTtlSeconds")
      }),
      inject: [ConfigService]
    },
    {
      provide: PASSWORDLESS_RATE_LIMIT_OPTIONS,
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow("publicApi.passwordlessRateLimits"),
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
            "publicApi.passwordlessRateLimitRedisKeyPrefix"
          )
        }),
      inject: [PASSWORDLESS_RATE_LIMIT_OPTIONS, REDIS_CLIENT, ConfigService]
    }
  ]
})
export class IdentityModule {}
