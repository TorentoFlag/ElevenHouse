import type { CustomerAccountRegistrationSessionUnitOfWork } from "@elevenhouse/domain";
import type { ElevenHouseDatabase } from "../../../runtime";
import {
  createAuthSessionCreationStore,
  type AuthSessionCreationDrizzleExecutor
} from "../auth-sessions";
import {
  createAccountRegistrationStore,
  type AccountRegistrationDrizzleExecutor
} from "./drizzle-account-registration-unit-of-work";

export type CustomerAccountRegistrationSessionDrizzleExecutor =
  AccountRegistrationDrizzleExecutor & AuthSessionCreationDrizzleExecutor;

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
