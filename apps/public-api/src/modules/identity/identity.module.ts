import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { createDrizzleCustomerAccountRegistrationSessionUnitOfWork } from "@elevenhouse/db/account-registration";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
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
  controllers: [IdentityRegistrationController],
  providers: [
    IdentityRegistrationService,
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
      provide: "REGISTRATION_SESSION_OPTIONS",
      useFactory: (configService: ConfigService) => ({
        sessionTtlSeconds: configService.getOrThrow<number>("publicApi.sessionTtlSeconds")
      }),
      inject: [ConfigService]
    }
  ]
})
export class IdentityModule {}
