export const userAccountStatusValues = ["active", "suspended", "deleted"] as const;
export type UserAccountStatus = (typeof userAccountStatusValues)[number];

export type UserAccount = {
  readonly id: string;
  readonly status: UserAccountStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};

const userAccountStatusSet = new Set<string>(userAccountStatusValues);

export function isUserAccountStatus(value: string): value is UserAccountStatus {
  return userAccountStatusSet.has(value);
}
