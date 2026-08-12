import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  createDrizzleAuthSessionAuthenticationStore,
  createDrizzleAuthSessionRevocationUnitOfWork
} from "@elevenhouse/db/auth-sessions";
import {
  createDrizzleMobileSessionAuthenticationStore,
  createDrizzleMobilePasswordlessLoginUnitOfWork,
  createDrizzleMobilePasswordlessRegistrationUnitOfWork,
  createDrizzleMobileSessionManagementStore,
  createDrizzleMobileSessionUnitOfWork
} from "@elevenhouse/db/mobile-sessions";
import { createDrizzlePasswordlessCustomerAccountRegistrationSessionUnitOfWork } from "@elevenhouse/db/account-registration";
import { createDrizzlePasswordlessAuthUnitOfWork } from "@elevenhouse/db/passwordless-auth";
import { ClockModule } from "../clock/clock.module";
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
import { MobileAstrologerSessionController } from "./mobile/mobile-session.controller";
import {
  MOBILE_SESSION_AUTHENTICATION_STORE,
  MOBILE_PASSWORDLESS_LOGIN_UNIT_OF_WORK,
  MOBILE_PASSWORDLESS_REGISTRATION_UNIT_OF_WORK,
  MOBILE_SESSION_MANAGEMENT_STORE,
  MOBILE_SESSION_UNIT_OF_WORK
} from "./mobile/mobile-session.tokens";
import {
  MobileAstrologerSessionService,
  MobileAstrologerSessionTokenIssuer,
  MobileRefreshRetryReceiptCodec
} from "./mobile/mobile-session.service";
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
  AstrologerSessionTokenIssuer
} from "./session/identity-session.service";

@Module({
  imports: [ClockModule, ConfigModule, DatabaseModule, RedisModule, SecurityModule],
  controllers: [
    IdentityPasswordlessController,
    MobileAstrologerSessionController,
    IdentityRegistrationController,
    IdentityCurrentAccountController,
    IdentitySessionController
  ],
  providers: [
    IdentityPasswordlessService,
    MobileAstrologerSessionService,
    IdentityRegistrationService,
    IdentityCurrentSessionService,
    IdentityLogoutService,
    AstrologerSessionAuthGuard,
    AstrologerSessionTokenIssuer,
    MobileAstrologerSessionTokenIssuer,
    MobileRefreshRetryReceiptCodec,
    AstrologerSessionCookieService,
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
      provide: MOBILE_SESSION_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleMobileSessionUnitOfWork(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: MOBILE_PASSWORDLESS_LOGIN_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleMobilePasswordlessLoginUnitOfWork(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: MOBILE_PASSWORDLESS_REGISTRATION_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleMobilePasswordlessRegistrationUnitOfWork(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: MOBILE_SESSION_AUTHENTICATION_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleMobileSessionAuthenticationStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: MOBILE_SESSION_MANAGEMENT_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleMobileSessionManagementStore(postgresRuntime.database),
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
        codeTtlSeconds: configService.getOrThrow<number>(
          "astrologerApi.passwordlessCodeTtlSeconds"
        ),
        resendCooldownSeconds: configService.getOrThrow<number>(
          "astrologerApi.passwordlessResendCooldownSeconds"
        ),
        maxAttempts: configService.getOrThrow<number>("astrologerApi.passwordlessMaxAttempts"),
        sessionTtlSeconds: configService.getOrThrow<number>("astrologerApi.sessionTtlSeconds"),
        trustedStaticCode: configService.get("astrologerApi.passwordlessTrustedStaticCode") ?? null
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
        sessionTtlSeconds: configService.getOrThrow<number>("astrologerApi.sessionTtlSeconds"),
        trustedStaticCode: configService.get("astrologerApi.passwordlessTrustedStaticCode") ?? null
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
  ],
  exports: [AstrologerSessionAuthGuard, IdentityCurrentSessionService]
})
export class IdentityModule {}
