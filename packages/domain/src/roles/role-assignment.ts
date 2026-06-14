import type { CustomerPlatformRole } from "@elevenhouse/auth";

export type UserRoleAssignment = {
  readonly id: string;
  readonly userId: string;
  readonly role: CustomerPlatformRole;
  readonly assignedByUserId?: string;
  readonly assignedAt: string;
};
