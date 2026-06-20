import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  createDrizzleAuthSessionAuthenticationStore,
  createDrizzleAuthSessionRevocationUnitOfWork
} from "@elevenhouse/db/auth-sessions";
import {
  createDrizzlePasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/db/account-registration";
import { createDrizzlePasswordlessAuthUnitOfWork } from "@elevenhouse/db/passwordless-auth";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { RedisModule } from "../redis/redis.module";
import { REDIS_CLIENT, type RedisClientPort } from "../redis/redis.tokens";
import { SecurityModule } from "../security/security.module";
import { AstrologerSessionAuthGuard } from "./auth/identity-auth.guard";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  AUTH_SESSION_REVOCATION_UNIT_OF_WORK
} from "./auth/identity-auth.tokens";
import { IdentityPasswordlessController } from "./passwordless/identity-passwordless.controller";
import {
  AesGcmAuthCodeEncryption,
  DomainPasswordlessAuthHandler,
  NumericPasswordlessCodeGenerator,
  ASTROLOGER_AUTH_CODE_GENERATOR
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
import { IdentityRegistrationController } from "./registration/identity-registration.controller";
import { DomainRegistrationHandler } from "./registration/identity-registration.handler";
import { IdentityRegistrationService } from "./registration/identity-registration.service";
import {
  ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK,
  REGISTRATION_AUTH_OPTIONS
} from "./registration/identity-registration.tokens";
import { IdentityCurrentAccountController } from "./session/identity-current-account.controller";
import { IdentityCurrentSessionService } from "./session/identity-current-session.service";
import { IdentityLogoutService } from "./session/identity-logout.service";
import { IdentitySessionController } from "./session/identity-session.controller";
import {
  AstrologerSessionCookieService,
  AstrologerSessionTokenIssuer,
  SystemClock
} from "./session/identity-session.service";

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, SecurityModule],
  controllers: [
    IdentityPasswordlessController,
    IdentityRegistrationController,
    IdentityCurrentAccountController,
    IdentitySessionController
  ],
  providers: [
    IdentityPasswordlessService,
    IdentityRegistrationService,
    IdentityCurrentSessionService,
    IdentityLogoutService,
    AstrologerSessionAuthGuard,
    AstrologerSessionTokenIssuer,
    AstrologerSessionCookieService,
    SystemClock,
    DomainPasswordlessAuthHandler,
    DomainRegistrationHandler,
    {
      provide: PASSWORDLESS_AUTH_CODE_ENCRYPTION,
      useClass: AesGcmAuthCodeEncryption
    },
    {
      provide: ASTROLOGER_AUTH_CODE_GENERATOR,
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
      provide: ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzlePasswordlessCustomerAccountRegistrationSessionUnitOfWork(
          postgresRuntime.database
        ),
      inject: [PostgresRuntimeService]
    },
    {
      provide: PASSWORDLESS_AUTH_OPTIONS,
      useFactory: (configService: ConfigService) => ({
        authCodeDeliveryEncryptionKey: configService.getOrThrow<Buffer>(
          "astrologerApi.authCodeDeliveryEncryptionKey"
        ),
        codeSecret: configService.getOrThrow<string>("astrologerApi.passwordlessCodeSecret"),
        codeTtlSeconds: configService.getOrThrow<number>("astrologerApi.passwordlessCodeTtlSeconds"),
        resendCooldownSeconds: configService.getOrThrow<number>(
          "astrologerApi.passwordlessResendCooldownSeconds"
        ),
        maxAttempts: configService.getOrThrow<number>("astrologerApi.passwordlessMaxAttempts"),
        sessionTtlSeconds: configService.getOrThrow<number>("astrologerApi.sessionTtlSeconds")
      }),
      inject: [ConfigService]
    },
    {
      provide: PASSWORDLESS_RATE_LIMIT_OPTIONS,
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow("astrologerApi.passwordlessRateLimits"),
      inject: [ConfigService]
    },
    {
      provide: REGISTRATION_AUTH_OPTIONS,
      useFactory: (configService: ConfigService) => ({
        codeSecret: configService.getOrThrow<string>("astrologerApi.passwordlessCodeSecret"),
        sessionTtlSeconds: configService.getOrThrow<number>("astrologerApi.sessionTtlSeconds")
      }),
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
            "astrologerApi.passwordlessRateLimitRedisKeyPrefix"
          )
        }),
      inject: [PASSWORDLESS_RATE_LIMIT_OPTIONS, REDIS_CLIENT, ConfigService]
    }
  ]
})
export class IdentityModule {}
