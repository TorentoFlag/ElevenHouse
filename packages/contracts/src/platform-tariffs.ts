/* eslint-disable no-control-regex -- Contract validation intentionally rejects ASCII control characters. */
import { z } from "@elevenhouse/validation";

import { platformPlanFeatureCodeSchema } from "./platform-billing";

const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().min(0);
const nullablePositiveInteger = positiveInteger.nullable();
const recurringFrequencyDaysSchema = z.number().int().min(1).max(366).nullable();
const isoDateTimeSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();
const tariffSeriesIdSchema = z.string().min(1).max(160).refine(
  (value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value),
  "Tariff series ID must be a trimmed visible identifier"
);
const tariffFeaturesSchema = z.array(platformPlanFeatureCodeSchema).max(40).refine(
  (features) => new Set(features).size === features.length,
  "Tariff capabilities must be unique"
);

const adminTariffTermsSchema = z
  .object({
    tariffSeriesId: tariffSeriesIdSchema,
    version: positiveInteger,
    name: z.string().min(1).max(120),
    tagline: z.string().min(1).max(240),
    monthlyPriceMinor: nonNegativeInteger,
    yearlyPriceMinor: nonNegativeInteger,
    monthlyRecurringFrequencyDays: recurringFrequencyDaysSchema,
    yearlyRecurringFrequencyDays: recurringFrequencyDaysSchema,
    clientSaleCommissionBps: z.number().int().min(0).max(10_000),
    seatsLimit: nullablePositiveInteger,
    bookingsLimit: nullablePositiveInteger,
    aiRequestsLimit: nullablePositiveInteger,
    automationLimit: nullablePositiveInteger,
    isPopular: z.boolean(),
    displayOrder: nonNegativeInteger,
    features: tariffFeaturesSchema
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.monthlyPriceMinor === 0) !== (value.monthlyRecurringFrequencyDays === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlyRecurringFrequencyDays"],
        message: "A recurring interval is required exactly when the monthly tariff price is positive"
      });
    }
    if ((value.yearlyPriceMinor === 0) !== (value.yearlyRecurringFrequencyDays === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["yearlyRecurringFrequencyDays"],
        message: "A recurring interval is required exactly when the yearly tariff price is positive"
      });
    }
  });

export const adminTariffDraftRequestSchema = adminTariffTermsSchema;
export type AdminTariffDraftRequest = z.infer<typeof adminTariffDraftRequestSchema>;

export const adminTariffUpdateRequestSchema = adminTariffTermsSchema
  .extend({ expectedDraftRevision: positiveInteger })
  .strict();
export type AdminTariffUpdateRequest = z.infer<typeof adminTariffUpdateRequestSchema>;

export const adminTariffPublishRequestSchema = z
  .object({ expectedDraftRevision: positiveInteger })
  .strict();
export type AdminTariffPublishRequest = z.infer<typeof adminTariffPublishRequestSchema>;

export const adminTariffResponseSchema = adminTariffTermsSchema
  .extend({
    draftRevision: positiveInteger,
    lifecycle: z.enum(["draft", "published", "retired"]),
    canonicalDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/)
  })
  .strict();
export type AdminTariffResponse = z.infer<typeof adminTariffResponseSchema>;

export const adminTariffListResponseSchema = z
  .object({ tariffs: z.array(adminTariffResponseSchema).max(500) })
  .strict();
export type AdminTariffListResponse = z.infer<typeof adminTariffListResponseSchema>;

export const platformTariffBillingCycleSchema = z.enum(["month", "year"]);
export type PlatformTariffBillingCycle = z.infer<typeof platformTariffBillingCycleSchema>;
const tariffSubscriptionStateSchema = z.enum([
  "incomplete_setup",
  "awaiting_initial_payment",
  "active",
  "past_due",
  "cancelled",
  "expired"
]);

export const astrologerTariffResponseSchema = adminTariffTermsSchema
  .extend({ lifecycle: z.literal("published") })
  .strict();
export type AstrologerTariffResponse = z.infer<typeof astrologerTariffResponseSchema>;

export const astrologerTariffSubscriptionResponseSchema = z
  .object({
    subscriptionId: uuidSchema,
    tariffSeriesId: tariffSeriesIdSchema,
    tariffVersion: positiveInteger,
    state: tariffSubscriptionStateSchema,
    commissionBpsSnapshot: z.number().int().min(0).max(10_000),
    startsAt: isoDateTimeSchema.nullable(),
    endsAt: isoDateTimeSchema.nullable()
  })
  .strict();
export type AstrologerTariffSubscriptionResponse = z.infer<
  typeof astrologerTariffSubscriptionResponseSchema
>;

export const astrologerTariffCatalogResponseSchema = z
  .object({
    tariffs: z.array(astrologerTariffResponseSchema).max(500),
    currentSubscription: astrologerTariffSubscriptionResponseSchema.nullable()
  })
  .strict();
export type AstrologerTariffCatalogResponse = z.infer<typeof astrologerTariffCatalogResponseSchema>;

/**
 * A capability decision is calculated by the server from the exact immutable
 * subscription/tariff snapshot. Clients must not derive it from the catalogue.
 */
export const astrologerTariffEntitlementDecisionSchema = z.enum(["allow", "read_only", "deny"]);
export type AstrologerTariffEntitlementDecision = z.infer<
  typeof astrologerTariffEntitlementDecisionSchema
>;

export const astrologerTariffEntitlementsResponseSchema = z
  .object({
    products: z
      .object({
        read: astrologerTariffEntitlementDecisionSchema,
        mutation: astrologerTariffEntitlementDecisionSchema
      })
      .strict()
  })
  .strict();
export type AstrologerTariffEntitlementsResponse = z.infer<
  typeof astrologerTariffEntitlementsResponseSchema
>;

export const startAstrologerTariffSubscriptionRequestSchema = z
  .object({
    tariffSeriesId: tariffSeriesIdSchema,
    version: positiveInteger,
    billingCycle: platformTariffBillingCycleSchema
  })
  .strict();
export type StartAstrologerTariffSubscriptionRequest = z.infer<
  typeof startAstrologerTariffSubscriptionRequestSchema
>;

export const startAstrologerTariffSubscriptionResponseSchema = z
  .object({
    subscription: astrologerTariffSubscriptionResponseSchema,
    billingCycle: platformTariffBillingCycleSchema,
    nextAction: z.enum(["active", "saved_card_setup_required"])
  })
  .strict();
export type StartAstrologerTariffSubscriptionResponse = z.infer<
  typeof startAstrologerTariffSubscriptionResponseSchema
>;

const disclosureDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const localeSchema = z.enum(["ru", "en"]);
const fiscalBuyerContactSchema = z.union([
  z.object({
    kind: z.literal("email"),
    value: z.string().trim().min(3).max(254).email()
  }).strict(),
  z.object({
    kind: z.literal("phone"),
    value: z.string().regex(/^\+[1-9]\d{1,14}$/)
  }).strict()
]);

export const savedCardSetupDisclosureResponseSchema = z
  .object({
    subscriptionId: uuidSchema,
    expectedSubscriptionVersion: positiveInteger,
    disclosure: z.object({
      disclosureSeriesId: z.string().min(1).max(160),
      version: positiveInteger,
      locale: localeSchema,
      body: z.string().min(1).max(20_000),
      canonicalDigest: disclosureDigestSchema
    }).strict()
  })
  .strict();
export type SavedCardSetupDisclosureResponse = z.infer<typeof savedCardSetupDisclosureResponseSchema>;

export const initiateSavedCardSetupRequestSchema = z
  .object({
    expectedSubscriptionVersion: positiveInteger,
    disclosureVersion: positiveInteger,
    disclosureDigest: disclosureDigestSchema,
    noticeLocale: localeSchema,
    acceptedDisclosure: z.literal(true),
    /** Explicit receipt contact; server verifies it against the authenticated identity. */
    buyerContact: fiscalBuyerContactSchema
  })
  .strict();
export type InitiateSavedCardSetupRequest = z.infer<typeof initiateSavedCardSetupRequestSchema>;

export const initiateSavedCardSetupResponseSchema = z
  .object({
    setupSessionId: uuidSchema,
    setupSessionVersion: positiveInteger,
    state: z.literal("setup_requested")
  })
  .strict();
export type InitiateSavedCardSetupResponse = z.infer<typeof initiateSavedCardSetupResponseSchema>;

/** Current browser attestation required by ArcPay 3DS; it is sealed server-side immediately. */
export const arcPayBrowserInfoSchema = z
  .object({
    acceptHeader: z.string().trim().min(1).max(4096),
    language: z.string().trim().min(1).max(64),
    screenWidth: z.number().int().min(1).max(20_000),
    screenHeight: z.number().int().min(1).max(20_000),
    colorDepth: z.union([z.literal(1), z.literal(4), z.literal(8), z.literal(15), z.literal(16), z.literal(24), z.literal(32), z.literal(48)]),
    timezoneOffsetMinutes: z.number().int().min(-1_440).max(1_440),
    userAgent: z.string().trim().min(1).max(2048),
    javaEnabled: z.boolean().optional(),
    windowSize: z.enum(["01", "02", "03", "04", "05"]).optional()
  })
  .strict();
export type ArcPayBrowserInfoRequest = z.infer<typeof arcPayBrowserInfoSchema>;

/** The token is sent once to the authenticated server and sealed immediately; it is never durable API state. */
export const executeSavedCardSetupRequestSchema = z
  .object({
    expectedSetupSessionVersion: positiveInteger,
    cardTokenId: uuidSchema,
    browserInfo: arcPayBrowserInfoSchema
  })
  .strict();
export type ExecuteSavedCardSetupRequest = z.infer<typeof executeSavedCardSetupRequestSchema>;

export const executeSavedCardSetupResponseSchema = z
  .object({
    setupSessionId: uuidSchema,
    setupSessionVersion: positiveInteger,
    state: z.literal("execution_pending")
  })
  .strict();
export type ExecuteSavedCardSetupResponse = z.infer<typeof executeSavedCardSetupResponseSchema>;

/** The browser can attest only its Method iframe outcome; provider 3DS data stays server-side. */
export const completeSavedCardSetupThreeDsMethodRequestSchema = z
  .object({
    expectedSetupSessionVersion: positiveInteger,
    completionIndicator: z.enum(["Y", "N", "U"])
  })
  .strict();
export type CompleteSavedCardSetupThreeDsMethodRequest = z.infer<
  typeof completeSavedCardSetupThreeDsMethodRequestSchema
>;

export const completeSavedCardSetupThreeDsMethodResponseSchema = z
  .object({
    setupSessionId: uuidSchema,
    setupSessionVersion: positiveInteger,
    state: z.literal("execution_pending")
  })
  .strict();
export type CompleteSavedCardSetupThreeDsMethodResponse = z.infer<
  typeof completeSavedCardSetupThreeDsMethodResponseSchema
>;

const savedCardSetupStateSchema = z.enum([
  "setup_requested",
  "preparation_pending",
  "tokenization_required",
  "execution_pending",
  "requires_customer_action",
  "credential_active",
  "setup_failed",
  "expired",
  "provider_unknown"
]);

/** A browser receives ArcPay's public key only after its server-owned setup ID exists. */
export const savedCardSetupStatusResponseSchema = z
  .object({
    setupSessionId: uuidSchema,
    subscriptionId: uuidSchema,
    setupSessionVersion: positiveInteger,
    state: savedCardSetupStateSchema,
    nextAction: z.enum([
      "provider_setup_pending",
      "tokenize_card",
      "provider_confirmation_pending",
      "complete_3ds",
      "initial_payment_pending",
      "setup_failed",
      "configuration_unavailable"
    ]),
    tokenization: z
      .object({
        providerSetupId: uuidSchema,
        apiBaseUrl: z.string().url().refine((value) => new URL(value).protocol === "https:"),
        publishableKey: z.string().trim().min(1).max(512)
      })
      .strict()
      .nullable()
    ,
    customerAction: z
      .object({
        type: z.enum(["three_ds_method", "three_ds_challenge"]),
        threeDs: z
          .object({
            version: z.enum(["1", "2"]),
            phase: z.enum(["method", "challenge"]),
            submit: z
              .object({
                method: z.literal("POST"),
                url: z.string().url().refine((value) => new URL(value).protocol === "https:"),
                target: z.enum(["hidden_iframe", "browser"]),
                fields: z.array(z.object({ name: z.string().min(1).max(8192), value: z.string().min(1).max(8192) }).strict()).min(1).max(32)
              })
              .strict()
          })
          .strict()
      })
      .strict()
      .nullable()
  })
  .strict()
  .superRefine((value, context) => {
    const hasTokenization = value.tokenization !== null;
    if ((value.nextAction === "tokenize_card") !== hasTokenization) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Tokenization must match the next action" });
    }
    if ((value.nextAction === "complete_3ds") !== (value.customerAction !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "3DS action must match the next action" });
    }
  });
export type SavedCardSetupStatusResponse = z.infer<typeof savedCardSetupStatusResponseSchema>;

const tariffInvoicePaymentStateSchema = z.enum([
  "open",
  "payment_pending",
  "requires_customer_action",
  "captured",
  "declined",
  "failed",
  "provider_unknown",
  "void",
  "uncollectible"
]);

const tariffInvoiceThreeDsActionSchema = z
  .object({
    type: z.enum(["three_ds_method", "three_ds_challenge"]),
    threeDs: z
      .object({
        version: z.enum(["1", "2"]),
        phase: z.enum(["method", "challenge"]),
        submit: z
          .object({
            method: z.literal("POST"),
            url: z.string().url().refine((value) => new URL(value).protocol === "https:"),
            target: z.enum(["hidden_iframe", "browser"]),
            fields: z
              .array(z.object({ name: z.string().min(1).max(8192), value: z.string().min(1).max(8192) }).strict())
              .min(1)
              .max(32)
          })
          .strict()
      })
      .strict()
  })
  .strict();

/** Status of one server-created tariff invoice; browser gets only the public ArcPay 3DS handoff. */
export const tariffInvoicePaymentStatusResponseSchema = z
  .object({
    invoiceId: uuidSchema,
    subscriptionId: uuidSchema,
    invoiceVersion: positiveInteger,
    state: tariffInvoicePaymentStateSchema,
    nextAction: z.enum([
      "provider_confirmation_pending",
      "complete_3ds",
      "payment_captured",
      "payment_declined",
      "payment_failed",
      "configuration_unavailable"
    ]),
    customerAction: tariffInvoiceThreeDsActionSchema.nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.nextAction === "complete_3ds") !== (value.customerAction !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "3DS action must match the next action"
      });
    }
    if (value.customerAction !== null && value.state !== "requires_customer_action") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerAction"],
        message: "3DS action requires invoice customer-action state"
      });
    }
  });
export type TariffInvoicePaymentStatusResponse = z.infer<
  typeof tariffInvoicePaymentStatusResponseSchema
>;

/**
 * The Method form is submitted by the browser first. This request contains only that outcome
 * and fresh browser facts; the action ID, server transaction ID and provider payment ID stay
 * server-side and are recovered from the exact pending action.
 */
export const completeTariffInvoiceThreeDsMethodRequestSchema = z
  .object({
    expectedInvoiceVersion: positiveInteger,
    completionIndicator: z.enum(["Y", "N", "U"]),
    browserInfo: arcPayBrowserInfoSchema
  })
  .strict();
export type CompleteTariffInvoiceThreeDsMethodRequest = z.infer<
  typeof completeTariffInvoiceThreeDsMethodRequestSchema
>;

export const completeTariffInvoiceThreeDsMethodResponseSchema = z
  .object({
    invoiceId: uuidSchema,
    subscriptionId: uuidSchema,
    invoiceVersion: positiveInteger,
    state: z.literal("payment_pending")
  })
  .strict();
export type CompleteTariffInvoiceThreeDsMethodResponse = z.infer<
  typeof completeTariffInvoiceThreeDsMethodResponseSchema
>;
