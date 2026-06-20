import { z } from "zod";
export {
  isPopularFirstName,
  isPopularFemaleFirstName,
  normalizeFirstName,
  popularFirstNames,
  popularFemaleFirstNames,
  popularMaleFirstNames,
  type PopularFirstName,
  type PopularFemaleFirstName,
  type PopularMaleFirstName
} from "./first-names.js";

export { z };
export type { ZodType } from "zod";

export const nonEmptyStringSchema = z.string().trim().min(1);
export const displayNameSchema = z.string().trim().min(2).max(200);
export const emailSchema = z.string().trim().toLowerCase().email().max(320);

export const popularEmailTopLevelDomains = [
  ".com",
  ".cn",
  ".de",
  ".net",
  ".org",
  ".uk",
  ".xyz",
  ".ru",
  ".top",
  ".nl",
  ".br",
  ".info",
  ".fr",
  ".au",
  ".shop",
  ".eu",
  ".ca",
  ".in",
  ".online",
  ".it",
  ".co",
  ".ch",
  ".pl",
  ".cc",
  ".es",
  ".store",
  ".jp",
  ".us",
  ".vip",
  ".site",
  ".io",
  ".ai",
  ".app",
  ".dev"
] as const;

export type PopularEmailTopLevelDomain = (typeof popularEmailTopLevelDomains)[number];

const popularEmailTopLevelDomainSet = new Set<string>(popularEmailTopLevelDomains);

export function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value).success;
}

export function isValidDisplayName(value: string): boolean {
  return displayNameSchema.safeParse(value).success;
}

export function getEmailTopLevelDomain(value: string): string | null {
  const emailResult = emailSchema.safeParse(value);

  if (!emailResult.success) {
    return null;
  }

  const domain = emailResult.data.slice(emailResult.data.lastIndexOf("@") + 1);
  const lastDotIndex = domain.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return null;
  }

  return domain.slice(lastDotIndex);
}

export function isEmailCompleteWithKnownTld(value: string): boolean {
  const topLevelDomain = getEmailTopLevelDomain(value);

  return topLevelDomain !== null && popularEmailTopLevelDomainSet.has(topLevelDomain);
}
