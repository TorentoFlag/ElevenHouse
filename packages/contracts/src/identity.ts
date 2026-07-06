import { customerPlatformRoles } from "@elevenhouse/auth/roles";
import { displayNameSchema, emailSchema, z } from "@elevenhouse/validation";
import { clientJoinIntentTokenSchema } from "./clients";

export const customerAccountRoleSchema = z.enum(customerPlatformRoles);
const publicRegistrationRoleSchema = z.literal("client");
export const passwordlessAuthChannelSchema = z.enum(["email", "phone"]);

const phoneIdentifierSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/));

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

export const requestPasswordlessCodeRequestSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("email"),
    identifier: emailSchema,
    roles: z.array(customerAccountRoleSchema).min(1)
  }).strict(),
  z.object({
    channel: z.literal("phone"),
    identifier: phoneIdentifierSchema,
    roles: z.array(customerAccountRoleSchema).min(1)
  }).strict()
]);

export type RequestPasswordlessCodeRequest = z.infer<
  typeof requestPasswordlessCodeRequestSchema
>;

export const requestPasswordlessCodeResponseSchema = z.object({
  challengeId: z.string().uuid(),
  channel: passwordlessAuthChannelSchema,
  maskedIdentifier: z.string().min(1),
  expiresAt: z.string().datetime(),
  resendAvailableAt: z.string().datetime()
});

export type RequestPasswordlessCodeResponse = z.infer<
  typeof requestPasswordlessCodeResponseSchema
>;

const baseVerifyPasswordlessCodeRequestSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/)
}).strict();

export const verifyPasswordlessCodeRequestSchema = baseVerifyPasswordlessCodeRequestSchema
  .extend({
    clientJoinIntentToken: clientJoinIntentTokenSchema.optional()
  })
  .strict();

export type VerifyPasswordlessCodeRequest = z.infer<
  typeof verifyPasswordlessCodeRequestSchema
>;

export const verifyPasswordlessCodeResponseSchema = authenticatedCustomerAccountResponseSchema;

export type VerifyPasswordlessCodeResponse = z.infer<
  typeof verifyPasswordlessCodeResponseSchema
>;

export const registeredCustomerAccountResponseSchema = z.object({
  account: z.object({
    id: z.string().uuid(),
    status: z.literal("active"),
    roles: z.array(customerAccountRoleSchema).min(1),
    displayName: displayNameSchema
  })
});

export type RegisteredCustomerAccountResponse = z.infer<
  typeof registeredCustomerAccountResponseSchema
>;

export const verifyRegistrationPasswordlessCodeRequestSchema =
  verifyPasswordlessCodeRequestSchema.extend({
    displayName: displayNameSchema,
    roles: z.tuple([publicRegistrationRoleSchema])
  }).strict();

export type VerifyRegistrationPasswordlessCodeRequest = z.infer<
  typeof verifyRegistrationPasswordlessCodeRequestSchema
>;

export const verifyRegistrationPasswordlessCodeResponseSchema =
  registeredCustomerAccountResponseSchema;

export type VerifyRegistrationPasswordlessCodeResponse = z.infer<
  typeof verifyRegistrationPasswordlessCodeResponseSchema
>;

export const registeredAstrologerAccountResponseSchema = z
  .object({
    account: z.object({
      id: z.string().uuid(),
      status: z.literal("active"),
      roles: z.array(customerAccountRoleSchema).min(1),
      displayName: displayNameSchema
    })
  })
  .refine(
    (value) => value.account.roles.includes("astrologer"),
    "Registered account must have the astrologer role"
  );

export type RegisteredAstrologerAccountResponse = z.infer<
  typeof registeredAstrologerAccountResponseSchema
>;

export const requestAstrologerPasswordlessCodeRequestSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("email"),
    identifier: emailSchema
  }).strict(),
  z.object({
    channel: z.literal("phone"),
    identifier: phoneIdentifierSchema
  }).strict()
]);

export type RequestAstrologerPasswordlessCodeRequest = z.infer<
  typeof requestAstrologerPasswordlessCodeRequestSchema
>;

export const requestAstrologerPasswordlessCodeResponseSchema =
  requestPasswordlessCodeResponseSchema;

export type RequestAstrologerPasswordlessCodeResponse = z.infer<
  typeof requestAstrologerPasswordlessCodeResponseSchema
>;

export const authenticatedAstrologerAccountResponseSchema =
  authenticatedCustomerAccountResponseSchema.refine(
    (value) => value.account.roles.includes("astrologer"),
    "Authenticated account must have the astrologer role"
  );

export type AuthenticatedAstrologerAccountResponse = z.infer<
  typeof authenticatedAstrologerAccountResponseSchema
>;

export const verifyAstrologerPasswordlessCodeRequestSchema =
  baseVerifyPasswordlessCodeRequestSchema;

export type VerifyAstrologerPasswordlessCodeRequest = z.infer<
  typeof verifyAstrologerPasswordlessCodeRequestSchema
>;

export const verifyAstrologerPasswordlessCodeResponseSchema =
  authenticatedAstrologerAccountResponseSchema;

export type VerifyAstrologerPasswordlessCodeResponse = z.infer<
  typeof verifyAstrologerPasswordlessCodeResponseSchema
>;

export const verifyAstrologerRegistrationPasswordlessCodeRequestSchema =
  baseVerifyPasswordlessCodeRequestSchema.extend({
    displayName: displayNameSchema
  }).strict();

export type VerifyAstrologerRegistrationPasswordlessCodeRequest = z.infer<
  typeof verifyAstrologerRegistrationPasswordlessCodeRequestSchema
>;

export const verifyAstrologerRegistrationPasswordlessCodeResponseSchema =
  registeredAstrologerAccountResponseSchema;

export type VerifyAstrologerRegistrationPasswordlessCodeResponse = z.infer<
  typeof verifyAstrologerRegistrationPasswordlessCodeResponseSchema
>;
