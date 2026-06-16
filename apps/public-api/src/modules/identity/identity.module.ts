import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDrizzleAuthSessionAuthenticationStore } from "@elevenhouse/db/auth-sessions";
import { createDrizzlePasswordlessAuthUnitOfWork } from "@elevenhouse/db/passwordless-auth";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
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
import { DevAuthCodeDeliveryProvider } from "./identity-passwordless.delivery";
import {
  AUTH_CODE_DELIVERY,
  PASSWORDLESS_AUTH_OPTIONS,
  PASSWORDLESS_AUTH_UNIT_OF_WORK
} from "./identity-passwordless.tokens";
import { IdentityPasswordlessService } from "./identity-passwordless.service";
import {
  PublicSessionCookieService,
  PublicSessionTokenIssuer,
  SystemClock
} from "./identity-session.service";

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [IdentityPasswordlessController, IdentityCurrentAccountController],
  providers: [
    IdentityPasswordlessService,
    IdentityCurrentSessionService,
    PublicSessionAuthGuard,
    DevAuthCodeDeliveryProvider,
    {
      provide: AUTH_CODE_DELIVERY,
      useFactory: (
        configService: ConfigService,
        devAuthCodeDeliveryProvider: DevAuthCodeDeliveryProvider
      ) => {
        const provider = configService.getOrThrow<"dev">("publicApi.authCodeDeliveryProvider");

        if (provider !== "dev") {
          throw new Error(`Unsupported auth code delivery provider: ${provider}`);
        }

        return devAuthCodeDeliveryProvider;
      },
      inject: [ConfigService, DevAuthCodeDeliveryProvider]
    },
    {
      provide: PUBLIC_AUTH_CODE_GENERATOR,
      useClass: NumericPasswordlessCodeGenerator
    },
    PublicSessionTokenIssuer,
    PublicSessionCookieService,
    SystemClock,
    DomainPasswordlessAuthHandler,
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
        codeTtlSeconds: configService.getOrThrow<number>(
          "publicApi.passwordlessCodeTtlSeconds"
        ),
        resendCooldownSeconds: configService.getOrThrow<number>(
          "publicApi.passwordlessResendCooldownSeconds"
        ),
        maxAttempts: configService.getOrThrow<number>("publicApi.passwordlessMaxAttempts"),
        sessionTtlSeconds: configService.getOrThrow<number>("publicApi.sessionTtlSeconds")
      }),
      inject: [ConfigService]
    }
  ]
})
export class IdentityModule {}
