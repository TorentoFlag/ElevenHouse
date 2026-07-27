import { z } from "@elevenhouse/validation";
import { financePaymentProviderSchema, paymentProviderEnvironmentSchema } from "./payments";

const isoDateTimeSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();
const providerIdentifierSchema = z.string().trim().min(1).max(160);

export const reconciliationStatusValues = ["pending", "matched", "exception", "ignored"] as const;
export const reconciliationStatusSchema = z.enum(reconciliationStatusValues);
export type ReconciliationStatus = z.infer<typeof reconciliationStatusSchema>;

export const reconciliationExceptionResolutionValues = ["resolved", "waived"] as const;
export const reconciliationExceptionResolutionSchema = z.enum(
  reconciliationExceptionResolutionValues
);
export type ReconciliationExceptionResolution = z.infer<
  typeof reconciliationExceptionResolutionSchema
>;

export const reconciliationRecordResponseSchema = z
  .object({
    id: uuidSchema,
    provider: financePaymentProviderSchema,
    environment: paymentProviderEnvironmentSchema,
    providerPaymentId: providerIdentifierSchema.nullable(),
    providerPayoutId: providerIdentifierSchema.nullable(),
    providerSettlementId: providerIdentifierSchema.nullable(),
    providerEventId: uuidSchema.nullable(),
    status: reconciliationStatusSchema,
    exceptionCode: z.string().trim().min(1).max(120).nullable(),
    exceptionMessage: z.string().trim().min(1).max(2_000).nullable(),
    providerOccurredAt: isoDateTimeSchema.nullable(),
    checkedAt: isoDateTimeSchema,
    resolvedAt: isoDateTimeSchema.nullable(),
    payload: z.record(z.string().min(1).max(80), z.unknown())
  })
  .strict();
export type ReconciliationRecordResponse = z.infer<typeof reconciliationRecordResponseSchema>;

export const adminReconciliationExceptionSchema = z
  .object({
    id: uuidSchema,
    provider: financePaymentProviderSchema,
    environment: paymentProviderEnvironmentSchema,
    providerPaymentId: providerIdentifierSchema.nullable(),
    providerPayoutId: providerIdentifierSchema.nullable(),
    providerSettlementId: providerIdentifierSchema.nullable(),
    providerEventId: uuidSchema.nullable(),
    status: z.literal("exception"),
    exceptionCode: z.string().trim().min(1).max(120),
    exceptionMessage: z.string().trim().min(1).max(2_000),
    providerOccurredAt: isoDateTimeSchema.nullable(),
    checkedAt: isoDateTimeSchema,
    resolvedAt: z.null(),
    payload: z.record(z.string().min(1).max(80), z.unknown())
  })
  .superRefine((value, context) => {
    if (!value.providerPaymentId && !value.providerPayoutId && !value.providerSettlementId) {
      context.addIssue({
        code: "custom",
        path: ["providerPaymentId"],
        message: "Reconciliation exception must carry at least one provider identifier"
      });
    }
  })
  .strict();
export type AdminReconciliationException = z.infer<typeof adminReconciliationExceptionSchema>;

export const adminReconciliationExceptionQueueSummarySchema = z
  .object({
    openCount: z.number().int().min(0),
    oldestOpenAt: isoDateTimeSchema.nullable()
  })
  .strict();
export type AdminReconciliationExceptionQueueSummary = z.infer<
  typeof adminReconciliationExceptionQueueSummarySchema
>;

export const adminReconciliationExceptionQueueResponseSchema = z
  .object({
    summary: adminReconciliationExceptionQueueSummarySchema,
    exceptions: z.array(adminReconciliationExceptionSchema)
  })
  .strict();
export type AdminReconciliationExceptionQueueResponse = z.infer<
  typeof adminReconciliationExceptionQueueResponseSchema
>;

export const resolveReconciliationExceptionRequestSchema = z
  .object({
    resolution: reconciliationExceptionResolutionSchema,
    adminNote: z.string().trim().min(1).max(2_000)
  })
  .strict();
export type ResolveReconciliationExceptionRequest = z.infer<
  typeof resolveReconciliationExceptionRequestSchema
>;
