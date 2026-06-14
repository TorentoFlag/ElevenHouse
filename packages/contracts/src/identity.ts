import { customerPlatformRoles } from "@elevenhouse/auth";
import { z } from "@elevenhouse/validation";

export const customerAccountRoleSchema = z.enum(customerPlatformRoles);

export const customerAccountPasswordSchema = z.string().min(8).max(1024);

export const authenticatedCustomerAccountResponseSchema = z.object({
  account: z.object({
    id: z.string().uuid(),
    status: z.literal("active"),
    roles: z.array(customerAccountRoleSchema).min(1)
  })
});

export type AuthenticatedCustomerAccountResponse = z.infer<
  typeof authenticatedCustomerAccountResponseSchema
>;

export const registerCustomerAccountRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: customerAccountPasswordSchema,
  roles: z.array(customerAccountRoleSchema).min(1)
});

export type RegisterCustomerAccountRequest = z.infer<
  typeof registerCustomerAccountRequestSchema
>;

export const registerCustomerAccountResponseSchema = authenticatedCustomerAccountResponseSchema;

export type RegisterCustomerAccountResponse = z.infer<
  typeof registerCustomerAccountResponseSchema
>;

export const loginCustomerAccountRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(1024)
});

export type LoginCustomerAccountRequest = z.infer<typeof loginCustomerAccountRequestSchema>;
