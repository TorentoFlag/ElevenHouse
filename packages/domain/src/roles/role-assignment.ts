import type { PlatformRole } from "@elevenhouse/auth";

export type UserRoleAssignment = {
  readonly id: string;
  readonly userId: string;
  readonly role: PlatformRole;
  readonly assignedByUserId?: string;
  readonly assignedAt: string;
};
