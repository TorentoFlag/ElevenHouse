import { customerPlatformRoles } from "@elevenhouse/auth";
import { z } from "@elevenhouse/validation";

export const healthResponseSchema = z.object({
  service: z.string().min(1),
  status: z.literal("ok"),
  timestamp: z.string().datetime()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const customerAccountRoleSchema = z.enum(customerPlatformRoles);

export const registerCustomerAccountRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(1024),
  roles: z.array(customerAccountRoleSchema).min(1)
});

export type RegisterCustomerAccountRequest = z.infer<
  typeof registerCustomerAccountRequestSchema
>;

export const registerCustomerAccountResponseSchema = z.object({
  account: z.object({
    id: z.string().uuid(),
    status: z.literal("active"),
    roles: z.array(customerAccountRoleSchema).min(1)
  })
});

export type RegisterCustomerAccountResponse = z.infer<
  typeof registerCustomerAccountResponseSchema
>;
