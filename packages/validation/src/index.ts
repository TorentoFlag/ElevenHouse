import { z } from "zod";

export { z };
export type { ZodType } from "zod";

export const nonEmptyStringSchema = z.string().trim().min(1);
