import { z } from "@elevenhouse/validation";
import { basisPointsSchema, moneySchema, nonZeroMoneySchema } from "./money";
import { productAstroDiaryConfigSchema } from "./products";

const uuidSchema = z.string().uuid();
const canonicalUuidSchema = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase(), "UUID must use canonical lowercase form");
const instantSchema = z.string().datetime({ offset: true });
const positiveVersionSchema = z.number().int().positive();
const sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const clientSubscriptionCadenceSchema = z.enum(["week", "month", "year"]);
export type ClientSubscriptionCadence = z.infer<typeof clientSubscriptionCadenceSchema>;

export const clientSubscriptionStateSchema = z.enum([
  "pending_initial_payment",
  "active",
  "ended",
  "revoked"
]);
export type ClientSubscriptionState = z.infer<typeof clientSubscriptionStateSchema>;

export const clientSubscriptionPaymentAttemptStateSchema = z.enum([
  "pending",
  "succeeded",
  "failed",
  "outcome_unknown"
]);
export type ClientSubscriptionPaymentAttemptState = z.infer<
  typeof clientSubscriptionPaymentAttemptStateSchema
>;

const economicsIdentifierSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value.trim() === value, "Economics identifier must be canonical");

export const clientSubscriptionBillingEconomicsSchema = z
  .object({
    orderId: canonicalUuidSchema,
    astrologerUserId: canonicalUuidSchema,
    planId: economicsIdentifierSchema,
    planVersionId: economicsIdentifierSchema,
    gross: nonZeroMoneySchema,
    commission: moneySchema,
    payable: moneySchema,
    commissionBps: basisPointsSchema,
    allocationRevision: z.literal("bps_half_up_v1")
  })
  .strict()
  .superRefine((value, context) => {
    const gross = BigInt(value.gross.amountMinor);
    const commission = BigInt(value.commission.amountMinor);
    const payable = BigInt(value.payable.amountMinor);
    const expectedCommission = (gross * BigInt(value.commissionBps) + 5_000n) / 10_000n;
    if (gross !== commission + payable || commission !== expectedCommission) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commission"],
        message: "Billing economics allocation must match the sealed gross amount"
      });
    }
  });
export type ClientSubscriptionBillingEconomics = z.infer<
  typeof clientSubscriptionBillingEconomicsSchema
>;

export const clientSubscriptionContractSchema = z
  .object({
    id: canonicalUuidSchema,
    orderId: canonicalUuidSchema,
    productId: canonicalUuidSchema,
    productRevision: positiveVersionSchema,
    relationshipId: canonicalUuidSchema,
    astrologerUserId: canonicalUuidSchema,
    clientUserId: canonicalUuidSchema,
    priceMinor: z.number().int().positive(),
    currency: z.literal("RUB"),
    cadence: clientSubscriptionCadenceSchema,
    billingEconomics: clientSubscriptionBillingEconomicsSchema,
    accessGrants: z.tuple([z.literal("journal")]),
    deliveryFormats: z.tuple([z.literal("chat"), z.literal("audio"), z.literal("file")]),
    requiredClientData: z.tuple([]),
    methods: z.tuple([]),
    modifiers: z.tuple([]),
    astroDiaryConfig: productAstroDiaryConfigSchema,
    canonicalDigest: sha256DigestSchema,
    createdAt: instantSchema
  })
  .strict();
export type ClientSubscriptionContract = z.infer<typeof clientSubscriptionContractSchema>;

export const clientSubscriptionPeriodSummarySchema = z
  .object({
    id: uuidSchema,
    sequence: positiveVersionSchema,
    startsAt: instantSchema,
    endsAt: instantSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.startsAt) >= Date.parse(value.endsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "Subscription period must be a non-empty half-open range"
      });
    }
  });
export type ClientSubscriptionPeriodSummary = z.infer<typeof clientSubscriptionPeriodSummarySchema>;

export const clientSubscriptionResponseSchema = z
  .object({
    id: uuidSchema,
    contract: clientSubscriptionContractSchema,
    journalEpochId: uuidSchema,
    state: clientSubscriptionStateSchema,
    version: positiveVersionSchema,
    cancellationEffectiveAt: instantSchema.nullable(),
    paidPeriods: z.array(clientSubscriptionPeriodSummarySchema)
  })
  .strict();
export type ClientSubscriptionResponse = z.infer<typeof clientSubscriptionResponseSchema>;

export const clientSubscriptionEventTypeSchema = z.enum([
  "client_subscription.capture_applied.v1",
  "client_subscription.initial_payment_ended.v1",
  "client_subscription.activated.v1",
  "client_subscription.period_ended.v1",
  "client_subscription.revoked.v1",
  "client_subscription.entitlement_changed.v1"
]);
export type ClientSubscriptionEventType = z.infer<typeof clientSubscriptionEventTypeSchema>;

const subscriptionEventDataSchema = z
  .object({ subscriptionId: uuidSchema, contractId: uuidSchema })
  .strict();
const subscriptionPeriodEventDataSchema = subscriptionEventDataSchema
  .extend({ periodId: uuidSchema })
  .strict();
const subscriptionEventEnvelope = <
  Type extends ClientSubscriptionEventType,
  Data extends z.ZodType
>(
  eventType: Type,
  data: Data
) =>
  z
    .object({
      eventId: uuidSchema,
      eventType: z.literal(eventType),
      schemaVersion: z.literal(1),
      occurredAt: instantSchema,
      data
    })
    .strict();

export const clientSubscriptionEventSchema = z.discriminatedUnion("eventType", [
  subscriptionEventEnvelope(
    "client_subscription.capture_applied.v1",
    subscriptionPeriodEventDataSchema.extend({ financeEvidenceId: uuidSchema }).strict()
  ),
  subscriptionEventEnvelope(
    "client_subscription.initial_payment_ended.v1",
    subscriptionEventDataSchema
      .extend({
        financeEvidenceId: uuidSchema,
        reason: z.enum(["checkout_expired", "payment_failed"])
      })
      .strict()
  ),
  subscriptionEventEnvelope("client_subscription.activated.v1", subscriptionPeriodEventDataSchema),
  subscriptionEventEnvelope(
    "client_subscription.period_ended.v1",
    subscriptionPeriodEventDataSchema
  ),
  subscriptionEventEnvelope(
    "client_subscription.revoked.v1",
    subscriptionPeriodEventDataSchema.extend({ financeEvidenceId: uuidSchema }).strict()
  ),
  subscriptionEventEnvelope(
    "client_subscription.entitlement_changed.v1",
    z.discriminatedUnion("scope", [
      subscriptionPeriodEventDataSchema
        .extend({
          scope: z.literal("period"),
          relationshipId: uuidSchema,
          journalEpochId: uuidSchema
        })
        .strict(),
      subscriptionEventDataSchema
        .extend({
          scope: z.literal("subscription_all"),
          relationshipId: uuidSchema,
          journalEpochId: uuidSchema
        })
        .strict()
    ])
  )
]);
export type ClientSubscriptionEvent = z.infer<typeof clientSubscriptionEventSchema>;

export const clientSubscriptionCommandSchema = z
  .object({
    expectedVersion: positiveVersionSchema,
    idempotencyKey: z.string().trim().min(1).max(160)
  })
  .strict();
export type ClientSubscriptionCommand = z.infer<typeof clientSubscriptionCommandSchema>;

export const clientSubscriptionAllowanceSchema = z
  .object({
    periodId: uuidSchema,
    total: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    consumed: z.number().int().nonnegative(),
    released: z.number().int().nonnegative()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.available + value.reserved + value.consumed + value.released !== value.total) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total"],
        message: "Allowance buckets must sum to total"
      });
    }
  });
export type ClientSubscriptionAllowance = z.infer<typeof clientSubscriptionAllowanceSchema>;

export const clientEntitlementSchema = z
  .object({
    id: uuidSchema,
    subscriptionId: uuidSchema,
    contractId: uuidSchema,
    relationshipId: uuidSchema,
    journalEpochId: uuidSchema,
    periodId: uuidSchema,
    capability: z.literal("astro_diary"),
    startsAt: instantSchema,
    endsAt: instantSchema,
    state: z.enum(["active", "ended", "revoked"]),
    version: positiveVersionSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.startsAt) >= Date.parse(value.endsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "Entitlement period must be a non-empty half-open range"
      });
    }
  });
export type ClientEntitlement = z.infer<typeof clientEntitlementSchema>;
