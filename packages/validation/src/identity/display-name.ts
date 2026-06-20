import { z } from "zod";

export const displayNameSchema = z.string().trim().min(2).max(200);

export function isValidDisplayName(value: string): boolean {
  return displayNameSchema.safeParse(value).success;
}
