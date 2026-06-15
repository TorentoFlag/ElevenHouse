import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDrizzleAccountRegistrationUnitOfWork } from "@elevenhouse/db/account-registration";
import { createDrizzleAuthSessionCreationUnitOfWork } from "@elevenhouse/db/auth-sessions";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityRegistrationController } from "./identity-registration.controller";
import {
  Argon2PasswordHasher,
  DomainCustomerAccountRegistrationHandler
} from "./identity-registration.handler";
import {
  ACCOUNT_REGISTRATION_UNIT_OF_WORK,
  AUTH_SESSION_CREATION_UNIT_OF_WORK
} from "./identity-registration.tokens";
import { IdentityRegistrationService } from "./identity-registration.service";
import {
  PublicSessionCookieService,
  PublicSessionTokenIssuer,
  SystemClock
} from "./identity-session.service";

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [IdentityRegistrationController],
  providers: [
    IdentityRegistrationService,
    Argon2PasswordHasher,
    PublicSessionTokenIssuer,
    PublicSessionCookieService,
    SystemClock,
    DomainCustomerAccountRegistrationHandler,
    {
      provide: ACCOUNT_REGISTRATION_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAccountRegistrationUnitOfWork(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    },
    {
      provide: AUTH_SESSION_CREATION_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAuthSessionCreationUnitOfWork(postgresRuntime.database),
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
