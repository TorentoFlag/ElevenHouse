import {
  clientSubscriptionEventSchema,
  type ClientSubscriptionEvent
} from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";

import { digestFinanceCanonicalValueV1 } from "./finance-canonical-digest";

export const FINANCE_CLIENT_ORDER_CAPTURE_APPLIED_EVENT =
  "finance.client_order.capture_applied.v1" as const;

export type FinanceClientOrderCapturePurposeDispatchPayload = Readonly<{
  captureApplicationReceiptId: string;
}>;

type Sha256Digest = `sha256:${string}`;

type CaptureAuthorityCommon = Readonly<{
  kind: "client_subscription_capture_authority";
  schemaVersion: 1;
  captureApplicationReceiptId: string;
  captureApplicationDigest: Sha256Digest;
  orderId: string;
  contractId: string;
  contractCanonicalDigest: Sha256Digest;
  subscriptionId: string;
  subscriptionExpectedVersion: number;
  capturedAt: string;
  canonicalDigest: Sha256Digest;
}>;

export type FinanceClientOrderSubscriptionCaptureAuthority = CaptureAuthorityCommon &
  Readonly<{ captureKind: "initial" }>;

export type FinanceClientOrderCaptureDispatchTarget = Readonly<{
  kind: "initial";
  periodId: string;
  activatedEventId: string;
  entitlementChangedEventId: string;
}>;

export type FinanceClientOrderCaptureDispatchReceipt = Readonly<{
  kind: "finance_client_order_capture_dispatch_receipt";
  schemaVersion: 1;
  dispatchReceiptId: string;
  authority: FinanceClientOrderSubscriptionCaptureAuthority;
  sourceEventId: string;
  sourceEventDigest: Sha256Digest;
  target: FinanceClientOrderCaptureDispatchTarget;
  dispatchedAt: string;
  canonicalDigest: Sha256Digest;
}>;

export type ClientSubscriptionCaptureAppliedEvent = Extract<
  ClientSubscriptionEvent,
  { eventType: "client_subscription.capture_applied.v1" }
>;

export class ClientOrderCapturePurposeDispatchIntegrityError extends Error {
  readonly code = "FINANCE_CLIENT_ORDER_CAPTURE_PURPOSE_DISPATCH_INTEGRITY_ERROR" as const;

  constructor(readonly reason: "invalid_payload" | "invalid_authority" | "invalid_receipt") {
    super("Finance client-order capture purpose dispatch evidence is invalid");
    this.name = "ClientOrderCapturePurposeDispatchIntegrityError";
  }
}

const canonicalUuidSchema = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase(), "UUID must be canonical lowercase");
const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const instantSchema = z.string().datetime({ offset: true });
const positiveVersionSchema = z.number().int().positive();

const payloadSchema = z.object({ captureApplicationReceiptId: canonicalUuidSchema }).strict();

const authorityInputCommonSchema = z.object({
  captureApplicationReceiptId: canonicalUuidSchema,
  captureApplicationDigest: digestSchema,
  orderId: canonicalUuidSchema,
  contractId: canonicalUuidSchema,
  contractCanonicalDigest: digestSchema,
  subscriptionId: canonicalUuidSchema,
  subscriptionExpectedVersion: positiveVersionSchema,
  capturedAt: instantSchema
});
const initialAuthorityInputSchema = authorityInputCommonSchema
  .extend({ captureKind: z.literal("initial") })
  .strict();
const authorityInputSchema = initialAuthorityInputSchema;
const initialAuthoritySchema = initialAuthorityInputSchema
  .extend({
    kind: z.literal("client_subscription_capture_authority"),
    schemaVersion: z.literal(1),
    canonicalDigest: digestSchema
  })
  .strict();
const authoritySchema = initialAuthoritySchema;

const initialTargetSchema = z
  .object({
    kind: z.literal("initial"),
    periodId: canonicalUuidSchema,
    activatedEventId: canonicalUuidSchema,
    entitlementChangedEventId: canonicalUuidSchema
  })
  .strict();
const targetSchema = initialTargetSchema;

const receiptSchema = z
  .object({
    kind: z.literal("finance_client_order_capture_dispatch_receipt"),
    schemaVersion: z.literal(1),
    dispatchReceiptId: canonicalUuidSchema,
    authority: authoritySchema,
    sourceEventId: canonicalUuidSchema,
    sourceEventDigest: digestSchema,
    target: targetSchema,
    dispatchedAt: instantSchema,
    canonicalDigest: digestSchema
  })
  .strict();

export function createClientOrderCapturePurposeDispatchPayload(
  input: unknown
): FinanceClientOrderCapturePurposeDispatchPayload {
  try {
    return deepFreeze(payloadSchema.parse(input));
  } catch {
    throw new ClientOrderCapturePurposeDispatchIntegrityError("invalid_payload");
  }
}

export function sealFinanceClientOrderSubscriptionCaptureAuthority(
  input: unknown
): FinanceClientOrderSubscriptionCaptureAuthority {
  try {
    const parsed = authorityInputSchema.parse(input);
    const core = {
      kind: "client_subscription_capture_authority" as const,
      schemaVersion: 1 as const,
      ...parsed
    };
    return deepFreeze({
      ...core,
      canonicalDigest: digestFinanceCanonicalValueV1(core)
    }) as FinanceClientOrderSubscriptionCaptureAuthority;
  } catch {
    throw new ClientOrderCapturePurposeDispatchIntegrityError("invalid_authority");
  }
}

export function createFinanceClientOrderCaptureDispatchReceipt(
  input: Readonly<{
    authority: FinanceClientOrderSubscriptionCaptureAuthority;
    dispatchReceiptId: string;
    sourceEventId: string;
    target: FinanceClientOrderCaptureDispatchTarget;
    dispatchedAt: string;
  }>
): FinanceClientOrderCaptureDispatchReceipt {
  try {
    const authority = rehydrateAuthority(input.authority);
    const target = targetSchema.parse(input.target) as FinanceClientOrderCaptureDispatchTarget;
    assertTargetMatchesAuthority(authority, target);
    const dispatchReceiptId = canonicalUuidSchema.parse(input.dispatchReceiptId);
    const sourceEventId = canonicalUuidSchema.parse(input.sourceEventId);
    const dispatchedAt = instantSchema.parse(input.dispatchedAt);
    assertDispatchTime(authority.capturedAt, dispatchedAt);
    assertDistinctOutputIds({
      authority,
      dispatchReceiptId,
      sourceEventId,
      target
    });
    const sourceEvent = buildCaptureAppliedEvent({ authority, sourceEventId, target });
    const core = {
      kind: "finance_client_order_capture_dispatch_receipt" as const,
      schemaVersion: 1 as const,
      dispatchReceiptId,
      authority,
      sourceEventId,
      sourceEventDigest: digestFinanceCanonicalValueV1(sourceEvent),
      target,
      dispatchedAt
    };
    return deepFreeze({
      ...core,
      canonicalDigest: digestFinanceCanonicalValueV1(core)
    }) as FinanceClientOrderCaptureDispatchReceipt;
  } catch (error) {
    if (error instanceof ClientOrderCapturePurposeDispatchIntegrityError) throw error;
    throw new ClientOrderCapturePurposeDispatchIntegrityError("invalid_receipt");
  }
}

export function rehydrateFinanceClientOrderCaptureDispatchReceipt(
  input: unknown
): FinanceClientOrderCaptureDispatchReceipt {
  try {
    const parsed = receiptSchema.parse(input);
    const authority = rehydrateAuthority(parsed.authority);
    const target = parsed.target as FinanceClientOrderCaptureDispatchTarget;
    assertTargetMatchesAuthority(authority, target);
    assertDispatchTime(authority.capturedAt, parsed.dispatchedAt);
    assertDistinctOutputIds({
      authority,
      dispatchReceiptId: parsed.dispatchReceiptId,
      sourceEventId: parsed.sourceEventId,
      target
    });
    const sourceEvent = buildCaptureAppliedEvent({
      authority,
      sourceEventId: parsed.sourceEventId,
      target
    });
    if (digestFinanceCanonicalValueV1(sourceEvent) !== parsed.sourceEventDigest) {
      throw new ClientOrderCapturePurposeDispatchIntegrityError("invalid_receipt");
    }
    const { canonicalDigest, ...parsedCore } = parsed;
    const core = { ...parsedCore, authority, target };
    if (digestFinanceCanonicalValueV1(core) !== canonicalDigest) {
      throw new ClientOrderCapturePurposeDispatchIntegrityError("invalid_receipt");
    }
    return deepFreeze({ ...core, canonicalDigest }) as FinanceClientOrderCaptureDispatchReceipt;
  } catch (error) {
    if (error instanceof ClientOrderCapturePurposeDispatchIntegrityError) throw error;
    throw new ClientOrderCapturePurposeDispatchIntegrityError("invalid_receipt");
  }
}

export function createFinanceClientSubscriptionCaptureAppliedEvent(
  input: FinanceClientOrderCaptureDispatchReceipt
): ClientSubscriptionCaptureAppliedEvent {
  const receipt = rehydrateFinanceClientOrderCaptureDispatchReceipt(input);
  return deepFreeze(
    buildCaptureAppliedEvent({
      authority: receipt.authority,
      sourceEventId: receipt.sourceEventId,
      target: receipt.target
    })
  );
}

function rehydrateAuthority(input: unknown): FinanceClientOrderSubscriptionCaptureAuthority {
  const parsed = authoritySchema.parse(input);
  const { canonicalDigest, ...core } = parsed;
  if (digestFinanceCanonicalValueV1(core) !== canonicalDigest) {
    throw new ClientOrderCapturePurposeDispatchIntegrityError("invalid_authority");
  }
  return deepFreeze({ ...core, canonicalDigest }) as FinanceClientOrderSubscriptionCaptureAuthority;
}

function buildCaptureAppliedEvent(
  input: Readonly<{
    authority: FinanceClientOrderSubscriptionCaptureAuthority;
    sourceEventId: string;
    target: FinanceClientOrderCaptureDispatchTarget;
  }>
): ClientSubscriptionCaptureAppliedEvent {
  const parsed = clientSubscriptionEventSchema.parse({
    eventId: input.sourceEventId,
    eventType: "client_subscription.capture_applied.v1",
    schemaVersion: 1,
    occurredAt: input.authority.capturedAt,
    data: {
      subscriptionId: input.authority.subscriptionId,
      contractId: input.authority.contractId,
      periodId: input.target.periodId,
      financeEvidenceId: input.authority.captureApplicationReceiptId
    }
  });
  if (parsed.eventType !== "client_subscription.capture_applied.v1") {
    throw new ClientOrderCapturePurposeDispatchIntegrityError("invalid_receipt");
  }
  return parsed;
}

function assertTargetMatchesAuthority(
  authority: FinanceClientOrderSubscriptionCaptureAuthority,
  target: FinanceClientOrderCaptureDispatchTarget
): void {
  if (authority.captureKind !== target.kind) invalidReceipt();
}

function assertDispatchTime(capturedAt: string, dispatchedAt: string): void {
  if (Date.parse(dispatchedAt) < Date.parse(capturedAt)) invalidReceipt();
}

function assertDistinctOutputIds(
  input: Readonly<{
    authority: FinanceClientOrderSubscriptionCaptureAuthority;
    dispatchReceiptId: string;
    sourceEventId: string;
    target: FinanceClientOrderCaptureDispatchTarget;
  }>
): void {
  const lifecycleIds = [input.target.activatedEventId, input.target.entitlementChangedEventId];
  const ids = [
    input.authority.captureApplicationReceiptId,
    input.authority.orderId,
    input.authority.contractId,
    input.authority.subscriptionId,
    input.dispatchReceiptId,
    input.sourceEventId,
    input.target.periodId,
    ...lifecycleIds
  ];
  if (new Set(ids).size !== ids.length) invalidReceipt();
}

function invalidReceipt(): never {
  throw new ClientOrderCapturePurposeDispatchIntegrityError("invalid_receipt");
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
