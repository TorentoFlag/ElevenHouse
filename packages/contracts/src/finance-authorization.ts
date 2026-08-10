import { z } from "@elevenhouse/validation";
import { financeOperationKindSchema, type FinanceOperationKind } from "./finance-operations";

export const financeSensitiveActionKindValues = [
  "tariff_publish",
  "fiscal_policy_publish",
  "risk_policy_publish",
  "refund_execute",
  "chargeback_principal_allocate",
  "chargeback_resolution",
  "payout_destination_reveal",
  "payout_destination_change",
  "payout_approve",
  "payout_start_processing",
  "payout_confirm_paid",
  "bank_snapshot_attest",
  "bank_statement_match",
  "ledger_correction"
] as const satisfies readonly FinanceOperationKind[];

export type FinanceSensitiveActionKind = (typeof financeSensitiveActionKindValues)[number];

const sensitiveActionKinds = new Set<FinanceOperationKind>(financeSensitiveActionKindValues);
export const financeSensitiveActionKindSchema = financeOperationKindSchema.refine(
  (value): value is FinanceSensitiveActionKind => sensitiveActionKinds.has(value),
  "Finance operation does not require transaction authorization"
);

export type FinanceAuthorizationCanonicalPayload =
  | null
  | boolean
  | string
  | number
  | readonly FinanceAuthorizationCanonicalPayload[]
  | { readonly [key: string]: FinanceAuthorizationCanonicalPayload };

const plainObjectSchema = z.custom<Record<string, unknown>>(
  (value) => isPlainObject(value),
  "Expected a plain JSON object"
);
export const financeAuthorizationCanonicalPayloadSchema: z.ZodType<FinanceAuthorizationCanonicalPayload> =
  z.lazy(() =>
    z.union([
      z.null(),
      z.boolean(),
      z.string(),
      z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
      z.array(financeAuthorizationCanonicalPayloadSchema),
      plainObjectSchema.pipe(z.record(z.string(), financeAuthorizationCanonicalPayloadSchema))
    ])
  );

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const rpIdSchema = z.string().trim().min(1).max(253);
const base64UrlSchema = z
  .string()
  .min(1)
  .max(4_096)
  .regex(/^[A-Za-z0-9_-]+$/);
const challengeSchema = z
  .string()
  .length(43)
  .regex(/^[A-Za-z0-9_-]{43}$/);
const webAuthnTransportSchema = z.enum([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb"
]);

export const beginFinanceAuthorizationRequestSchema = z
  .object({
    actionKind: financeSensitiveActionKindSchema,
    aggregateId: uuidSchema,
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    payload: financeAuthorizationCanonicalPayloadSchema
  })
  .strict();
export type BeginFinanceAuthorizationRequest = z.infer<
  typeof beginFinanceAuthorizationRequestSchema
>;

export const beginFinanceAuthorizationResponseSchema = z
  .object({
    challengeId: uuidSchema,
    expiresAt: instantSchema,
    publicKey: z
      .object({
        challenge: challengeSchema,
        rpId: rpIdSchema,
        timeout: z.literal(300_000),
        userVerification: z.literal("required")
      })
      .strict()
  })
  .strict();
export type BeginFinanceAuthorizationResponse = z.infer<
  typeof beginFinanceAuthorizationResponseSchema
>;

export const financeWebAuthnAssertionSchema = z
  .object({
    id: base64UrlSchema,
    rawId: base64UrlSchema,
    type: z.literal("public-key"),
    response: z
      .object({
        clientDataJSON: base64UrlSchema,
        authenticatorData: base64UrlSchema,
        signature: base64UrlSchema,
        userHandle: base64UrlSchema.nullable()
      })
      .strict(),
    clientExtensionResults: z.record(z.string().min(1), z.unknown()),
    authenticatorAttachment: z.enum(["platform", "cross-platform"]).nullable().optional()
  })
  .strict();
export type FinanceWebAuthnAssertion = z.infer<typeof financeWebAuthnAssertionSchema>;

export const verifyFinanceAuthorizationRequestSchema = z
  .object({
    challengeId: uuidSchema,
    assertion: financeWebAuthnAssertionSchema
  })
  .strict();
export type VerifyFinanceAuthorizationRequest = z.infer<
  typeof verifyFinanceAuthorizationRequestSchema
>;

export const verifyFinanceAuthorizationResponseSchema = z
  .object({
    authorizationId: uuidSchema,
    expiresAt: instantSchema
  })
  .strict();
export type VerifyFinanceAuthorizationResponse = z.infer<
  typeof verifyFinanceAuthorizationResponseSchema
>;

/** The creation options are vendor/browser defined; their envelope remains a plain JSON object. */
export const beginFinanceWebAuthnRegistrationResponseSchema = z
  .object({
    registrationChallengeId: uuidSchema,
    expiresAt: instantSchema,
    publicKey: z.record(z.string(), z.unknown())
  })
  .strict();
export type BeginFinanceWebAuthnRegistrationResponse = z.infer<
  typeof beginFinanceWebAuthnRegistrationResponseSchema
>;

export const financeWebAuthnRegistrationResponseSchema = z
  .object({
    id: base64UrlSchema,
    rawId: base64UrlSchema,
    type: z.literal("public-key"),
    response: z
      .object({
        clientDataJSON: base64UrlSchema,
        attestationObject: base64UrlSchema,
        authenticatorData: base64UrlSchema.optional(),
        transports: z.array(webAuthnTransportSchema).optional(),
        publicKeyAlgorithm: z.number().int().optional(),
        publicKey: base64UrlSchema.optional()
      })
      .strict(),
    clientExtensionResults: z.record(z.string().min(1), z.unknown()),
    authenticatorAttachment: z.enum(["platform", "cross-platform"]).nullable().optional()
  })
  .strict();
export type FinanceWebAuthnRegistrationResponse = z.infer<
  typeof financeWebAuthnRegistrationResponseSchema
>;

export const verifyFinanceWebAuthnRegistrationRequestSchema = z
  .object({
    registrationChallengeId: uuidSchema,
    registration: financeWebAuthnRegistrationResponseSchema
  })
  .strict();
export type VerifyFinanceWebAuthnRegistrationRequest = z.infer<
  typeof verifyFinanceWebAuthnRegistrationRequestSchema
>;

export const verifyFinanceWebAuthnRegistrationResponseSchema = z
  .object({ credentialId: base64UrlSchema })
  .strict();
export type VerifyFinanceWebAuthnRegistrationResponse = z.infer<
  typeof verifyFinanceWebAuthnRegistrationResponseSchema
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
