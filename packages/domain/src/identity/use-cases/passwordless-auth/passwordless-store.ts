import type { PasswordlessCodeRequestStore } from "./passwordless-request";
import type { PasswordlessVerificationStore } from "./passwordless-verify";

export type PasswordlessAuthStore = PasswordlessCodeRequestStore & PasswordlessVerificationStore;

export type PasswordlessAuthUnitOfWork = {
  readonly transact: <T>(operation: (store: PasswordlessAuthStore) => Promise<T>) => Promise<T>;
};
