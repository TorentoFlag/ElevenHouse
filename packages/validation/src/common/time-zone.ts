import { z } from "zod";

export const ianaTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isIanaTimeZone, "Invalid IANA time zone");

function isIanaTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return value === "UTC" || value.includes("/");
  } catch {
    return false;
  }
}
