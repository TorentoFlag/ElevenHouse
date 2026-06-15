import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDrizzleCustomerAccountRegistrationSessionUnitOfWork } from "@elevenhouse/db/account-registration";
import { createDrizzleAuthSessionAuthenticationStore } from "@elevenhouse/db/auth-sessions";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityCurrentAccountController } from "./identity-current-account.controller";
import { IdentityCurrentSessionService } from "./identity-current-session.service";
import { PublicSessionAuthGuard } from "./identity-auth.guard";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "./identity-auth.tokens";
import { IdentityRegistrationController } from "./identity-registration.controller";
import {
  Argon2PasswordHasher,
  DomainCustomerAccountRegistrationHandler
} from "./identity-registration.handler";
import { CUSTOMER_ACCOUNT_REGISTRATION_SESSION_UNIT_OF_WORK } from "./identity-registration.tokens";
import { IdentityRegistrationService } from "./identity-registration.service";
import {
  PublicSessionCookieService,
  PublicSessionTokenIssuer,
  SystemClock
} from "./identity-session.service";

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [IdentityRegistrationController, IdentityCurrentAccountController],
  providers: [
    IdentityRegistrationService,
    IdentityCurrentSessionService,
    PublicSessionAuthGuard,
    Argon2PasswordHasher,
    PublicSessionTokenIssuer,
    PublicSessionCookieService,
    SystemClock,
    DomainCustomerAccountRegistrationHandler,
    {
      provide: CUSTOMER_ACCOUNT_REGISTRATION_SESSION_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleCustomerAccountRegistrationSessionUnitOfWork(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: AUTH_SESSION_AUTHENTICATION_STORE,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAuthSessionAuthenticationStore(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: "REGISTRATION_SESSION_OPTIONS",
      useFactory: (configService: ConfigService) => ({
        sessionTtlSeconds: configService.getOrThrow<number>("publicApi.sessionTtlSeconds")
      }),
      inject: [ConfigService]
    }
  ]
})
export class IdentityModule {}
