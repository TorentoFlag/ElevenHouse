export const platformRoles = ["client", "astrologer", "moderator", "admin"] as const;

export type PlatformRole = (typeof platformRoles)[number];

export function isPlatformRole(value: string): value is PlatformRole {
  return platformRoles.includes(value as PlatformRole);
}
