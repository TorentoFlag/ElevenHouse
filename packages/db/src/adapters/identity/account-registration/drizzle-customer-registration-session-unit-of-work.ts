import type {
  ClientStore,
  CustomerAccountRegistrationSessionStore,
  PasswordlessCustomerAccountRegistrationSessionStore,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../../runtime";
import { createDrizzleClientStore } from "../../clients";
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

export type CustomerAccountRegistrationSessionDrizzleExecutor = AccountRegistrationDrizzleExecutor &
  AuthSessionCreationDrizzleExecutor;
export type PasswordlessCustomerAccountRegistrationSessionDrizzleExecutor =
  CustomerAccountRegistrationSessionDrizzleExecutor & PasswordlessAuthDrizzleExecutor;

export type CustomerAccountRegistrationSessionDrizzleStore =
  CustomerAccountRegistrationSessionStore & ClientStore;
export type PasswordlessCustomerAccountRegistrationSessionDrizzleStore =
  PasswordlessCustomerAccountRegistrationSessionStore & ClientStore;

export type CustomerAccountRegistrationSessionDrizzleUnitOfWork = {
  readonly transact: <T>(
    operation: (store: CustomerAccountRegistrationSessionDrizzleStore) => Promise<T>
  ) => Promise<T>;
};

export type CustomerAccountRegistrationSessionDrizzleDatabase = Pick<
  ElevenHouseDatabase,
  "transaction"
>;

export function createDrizzleCustomerAccountRegistrationSessionUnitOfWork(
  database: CustomerAccountRegistrationSessionDrizzleDatabase
): CustomerAccountRegistrationSessionDrizzleUnitOfWork {
  return {
    transact: (operation) =>
      database.transaction((executor) =>
        operation({
          ...createAccountRegistrationStore(executor),
          ...createAuthSessionCreationStore(executor),
          ...createDrizzleClientStore(executor)
        })
      )
  };
}

export function createDrizzlePasswordlessCustomerAccountRegistrationSessionUnitOfWork(
  database: CustomerAccountRegistrationSessionDrizzleDatabase
): PasswordlessCustomerAccountRegistrationSessionUnitOfWork<PasswordlessCustomerAccountRegistrationSessionDrizzleStore> {
  return {
    transact: (operation) =>
      database.transaction((executor) =>
        operation({
          ...createPasswordlessAuthStore(executor),
          ...createAccountRegistrationStore(executor),
          ...createAuthSessionCreationStore(executor),
          ...createDrizzleClientStore(executor)
        })
      )
  };
}
