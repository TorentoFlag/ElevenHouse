import type { PasswordlessCodeRequestStore } from "./passwordless-request";
import type { PasswordlessVerificationStore } from "./passwordless-verify";

export type PasswordlessAuthStore = PasswordlessCodeRequestStore & PasswordlessVerificationStore;

export type PasswordlessAuthUnitOfWork<TStore extends PasswordlessAuthStore = PasswordlessAuthStore> = {
  readonly transact: <T>(operation: (store: TStore) => Promise<T>) => Promise<T>;
};
