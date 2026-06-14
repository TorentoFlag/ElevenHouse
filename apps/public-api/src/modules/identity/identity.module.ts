import { Module } from "@nestjs/common";
import { createDrizzleAccountRegistrationUnitOfWork } from "@elevenhouse/db/account-registration";
import { DatabaseModule } from "../database/database.module";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { IdentityRegistrationController } from "./identity-registration.controller";
import {
  Argon2PasswordHasher,
  DomainCustomerAccountRegistrationHandler
} from "./identity-registration.handler";
import { ACCOUNT_REGISTRATION_UNIT_OF_WORK } from "./identity-registration.tokens";
import { IdentityRegistrationService } from "./identity-registration.service";

@Module({
  imports: [DatabaseModule],
  controllers: [IdentityRegistrationController],
  providers: [
    IdentityRegistrationService,
    Argon2PasswordHasher,
    DomainCustomerAccountRegistrationHandler,
    {
      provide: ACCOUNT_REGISTRATION_UNIT_OF_WORK,
      useFactory: (postgresRuntime: PostgresRuntimeService) =>
        createDrizzleAccountRegistrationUnitOfWork(postgresRuntime.database),
      inject: [PostgresRuntimeService]
    }
  ]
})
export class IdentityModule {}
