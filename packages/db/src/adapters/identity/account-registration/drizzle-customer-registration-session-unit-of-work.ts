import type {
  CustomerAccountRegistrationSessionUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../../runtime";
import {
  createAuthSessionCreationStore,
  type AuthSessionCreationDrizzleExecutor
} from "../auth-sessions";
import {
  createPasswordlessAuthStore,
  type PasswordlessAuthDrizzleExecutor
} from "../passwordless-auth";
import {
  createAccountRegistrationStore,
  type AccountRegistrationDrizzleExecutor
} from "./drizzle-account-registration-unit-of-work";

export type CustomerAccountRegistrationSessionDrizzleExecutor =
  AccountRegistrationDrizzleExecutor & AuthSessionCreationDrizzleExecutor;
export type PasswordlessCustomerAccountRegistrationSessionDrizzleExecutor =
  CustomerAccountRegistrationSessionDrizzleExecutor & PasswordlessAuthDrizzleExecutor;

export type CustomerAccountRegistrationSessionDrizzleDatabase = Pick<
  ElevenHouseDatabase,
  "transaction"
>;

export function createDrizzleCustomerAccountRegistrationSessionUnitOfWork(
  database: CustomerAccountRegistrationSessionDrizzleDatabase
): CustomerAccountRegistrationSessionUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((executor) =>
        operation({
          ...createAccountRegistrationStore(executor),
          ...createAuthSessionCreationStore(executor)
        })
      )
  };
}

export function createDrizzlePasswordlessCustomerAccountRegistrationSessionUnitOfWork(
  database: CustomerAccountRegistrationSessionDrizzleDatabase
): PasswordlessCustomerAccountRegistrationSessionUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((executor) =>
        operation({
          ...createPasswordlessAuthStore(executor),
          ...createAccountRegistrationStore(executor),
          ...createAuthSessionCreationStore(executor)
        })
      )
  };
}
