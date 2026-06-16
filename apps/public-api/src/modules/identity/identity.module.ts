import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDrizzleAuthSessionAuthenticationStore } from "@elevenhouse/db/auth-sessions";
import { createDrizzlePasswordlessAuthUnitOfWork } from "@elevenhouse/db/passwordless-auth";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { RedisModule } from "../redis/redis.module";
import { REDIS_CLIENT, type RedisClientPort } from "../redis/redis.tokens";
import { IdentityCurrentAccountController } from "./identity-current-account.controller";
import { IdentityCurrentSessionService } from "./identity-current-session.service";
import { PublicSessionAuthGuard } from "./identity-auth.guard";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "./identity-auth.tokens";
import { IdentityPasswordlessController } from "./identity-passwordless.controller";
import {
  DomainPasswordlessAuthHandler,
  NumericPasswordlessCodeGenerator,
  PUBLIC_AUTH_CODE_GENERATOR
} from "./identity-passwordless.handler";
import type { PublicApiAuthCodeDeliveryProvider } from "../../config/runtime-config";
import {
  ChannelAuthCodeDeliveryProvider,
  DevAuthCodeDeliveryProvider,
  EmailAuthCodeDeliveryProvider,
  SmsAuthCodeDeliveryProvider,
  type AuthCodeHttpDeliveryOptions
} from "./identity-passwordless.delivery";
import {
  AUTH_CODE_DELIVERY,
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
  PublicSessionCookieService,
  PublicSessionTokenIssuer,
  SystemClock
} from "./identity-session.service";

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule],
  controllers: [IdentityPasswordlessController, IdentityCurrentAccountController],
  providers: [
    IdentityPasswordlessService,
    IdentityCurrentSessionService,
    PublicSessionAuthGuard,
    DevAuthCodeDeliveryProvider,
    PublicSessionTokenIssuer,
    PublicSessionCookieService,
    SystemClock,
    DomainPasswordlessAuthHandler,
    {
      provide: AUTH_CODE_DELIVERY,
      useFactory: (
        configService: ConfigService,
        devAuthCodeDeliveryProvider: DevAuthCodeDeliveryProvider
      ) => {
        const provider = configService.getOrThrow<PublicApiAuthCodeDeliveryProvider>(
          "publicApi.authCodeDeliveryProvider"
        );

        if (provider === "dev") {
          return devAuthCodeDeliveryProvider;
        }

        if (provider === "email_sms") {
          return new ChannelAuthCodeDeliveryProvider(
            new EmailAuthCodeDeliveryProvider(
              configService.getOrThrow<AuthCodeHttpDeliveryOptions>(
                "publicApi.authCodeEmailDelivery"
              )
            ),
            new SmsAuthCodeDeliveryProvider(
              configService.getOrThrow<AuthCodeHttpDeliveryOptions>("publicApi.authCodeSmsDelivery")
            )
          );
        }

        throw new Error(`Unsupported auth code delivery provider: ${provider}`);
      },
      inject: [ConfigService, DevAuthCodeDeliveryProvider]
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
      provide: PASSWORDLESS_AUTH_OPTIONS,
      useFactory: (configService: ConfigService) => ({
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
