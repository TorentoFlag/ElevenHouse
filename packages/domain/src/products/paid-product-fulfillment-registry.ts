import type {
  ProductAccessGrant,
  ProductAstroDiaryConfig,
  ProductDeliveryFormat,
  ProductExecutionMode,
  ProductMethod,
  ProductParticipantMode,
  ProductPaymentModel,
  ProductRequiredClientData,
  ProductSubscriptionPeriod,
  ProductType
} from "./product-types";

export const paidProductFulfillmentIssueCodeValues = [
  "free_product_fulfillment_not_required",
  "session_pack_fulfillment_unsupported",
  "client_subscription_fulfillment_unsupported",
  "group_fulfillment_unsupported",
  "gift_fulfillment_unsupported",
  "asynchronous_fulfillment_unsupported",
  "instant_fulfillment_unsupported",
  "mini_product_fulfillment_unsupported",
  "course_product_fulfillment_unsupported",
  "custom_product_fulfillment_unsupported",
  "paid_product_shape_unsupported",
  "fulfillment_dependency_unavailable"
] as const;

export type PaidProductFulfillmentIssueCode =
  (typeof paidProductFulfillmentIssueCodeValues)[number];

export type PaidProductFulfillmentShape = {
  readonly type: ProductType;
  readonly paymentModel: ProductPaymentModel;
  readonly executionMode: ProductExecutionMode;
  readonly participantMode: ProductParticipantMode;
  readonly subscriptionPeriod?: ProductSubscriptionPeriod | null;
  readonly trialDays?: number | null;
  readonly durationMinutes?: number | null;
  readonly packageSessionCount?: number | null;
  readonly groupSize?: number | null;
  readonly deliveryFormats?: readonly ProductDeliveryFormat[];
  readonly requiredClientData?: readonly ProductRequiredClientData[];
  readonly methods?: readonly ProductMethod[];
  readonly accessGrants?: readonly ProductAccessGrant[];
  readonly modifiers?: readonly unknown[];
  readonly astroDiaryConfig?: ProductAstroDiaryConfig | null;
};

export type PaidProductTerminalEvidence = {
  readonly owner: "booking";
  readonly status: "completed";
  readonly contractVersion: number;
};

export type PaidProductCancellationAllocatorRef = {
  readonly owner: "booking";
  readonly port: "BookingCancellationRefundDecisionPort";
  readonly policyVersion: number;
};

export type PaidProductFulfillmentDecision =
  | {
      readonly supported: true;
      readonly registryKey: string;
      readonly registryRevision: number;
      readonly holdAnchor: "booking_completed";
      readonly terminalEvidence: PaidProductTerminalEvidence;
      readonly cancellationAllocator: PaidProductCancellationAllocatorRef;
    }
  | {
      readonly supported: false;
      readonly code: PaidProductFulfillmentIssueCode;
    };

export type PaidProductFulfillmentDependencyRef =
  | ({ readonly kind: "terminal_evidence" } & PaidProductTerminalEvidence)
  | ({ readonly kind: "cancellation_refund_allocator" } & PaidProductCancellationAllocatorRef);

export type PaidProductFulfillmentDependencyStatus = "registered" | "missing" | "superseded";

export type PaidProductFulfillmentDependencyReader = {
  readonly getDependencyStatus: (
    reference: PaidProductFulfillmentDependencyRef
  ) => Promise<PaidProductFulfillmentDependencyStatus>;
};

const terminalEvidence = Object.freeze({
  owner: "booking",
  status: "completed",
  contractVersion: 1
} satisfies PaidProductTerminalEvidence);

const cancellationAllocator = Object.freeze({
  owner: "booking",
  port: "BookingCancellationRefundDecisionPort",
  policyVersion: 1
} satisfies PaidProductCancellationAllocatorRef);

const approvedLiveSoloSession = Object.freeze({
  supported: true,
  registryKey: "single.once.live.solo",
  registryRevision: 1,
  holdAnchor: "booking_completed",
  terminalEvidence,
  cancellationAllocator
} satisfies PaidProductFulfillmentDecision);

const approvedAstroDiarySubscription = Object.freeze({
  supported: true,
  registryKey: "sub.sub.async.solo",
  registryRevision: 1,
  holdAnchor: "booking_completed",
  terminalEvidence,
  cancellationAllocator
} satisfies PaidProductFulfillmentDecision);

const paidProductFulfillmentRegistry: Readonly<
  Record<string, Extract<PaidProductFulfillmentDecision, { supported: true }>>
> = Object.freeze({
  "single.once.live.solo": approvedLiveSoloSession,
  "sub.sub.async.solo": approvedAstroDiarySubscription
});

export async function resolvePaidProductFulfillment(input: {
  readonly product: PaidProductFulfillmentShape;
  readonly reader: PaidProductFulfillmentDependencyReader;
}): Promise<PaidProductFulfillmentDecision> {
  const unsupportedCode = unsupportedFulfillmentCode(input.product);
  if (unsupportedCode) {
    return unsupportedDecision(unsupportedCode);
  }

  const registryKey = fulfillmentRegistryKey(input.product);
  const registryEntry = paidProductFulfillmentRegistry[registryKey];
  if (!registryEntry) {
    return unsupportedDecision("paid_product_shape_unsupported");
  }

  const terminalDependency = Object.freeze({
    kind: "terminal_evidence",
    ...registryEntry.terminalEvidence
  } satisfies PaidProductFulfillmentDependencyRef);
  const cancellationDependency = Object.freeze({
    kind: "cancellation_refund_allocator",
    ...registryEntry.cancellationAllocator
  } satisfies PaidProductFulfillmentDependencyRef);
  const [terminalStatus, cancellationStatus] = await Promise.all([
    input.reader.getDependencyStatus(terminalDependency),
    input.reader.getDependencyStatus(cancellationDependency)
  ]);
  if (terminalStatus !== "registered" || cancellationStatus !== "registered") {
    return unsupportedDecision("fulfillment_dependency_unavailable");
  }

  return registryEntry;
}

function fulfillmentRegistryKey(product: PaidProductFulfillmentShape): string {
  return [product.type, product.paymentModel, product.executionMode, product.participantMode].join(
    "."
  );
}

function unsupportedFulfillmentCode(
  product: PaidProductFulfillmentShape
): PaidProductFulfillmentIssueCode | null {
  if (product.paymentModel === "free") {
    return "free_product_fulfillment_not_required";
  }
  if (isExactAstroDiarySubscription(product)) return null;

  switch (product.type) {
    case "single":
      break;
    case "pack":
      return "session_pack_fulfillment_unsupported";
    case "sub":
      return "client_subscription_fulfillment_unsupported";
    case "async":
      return "asynchronous_fulfillment_unsupported";
    case "mini":
      return "mini_product_fulfillment_unsupported";
    case "course":
      return "course_product_fulfillment_unsupported";
    case "custom":
      return "custom_product_fulfillment_unsupported";
    default:
      return "paid_product_shape_unsupported";
  }

  switch (product.paymentModel) {
    case "once":
      break;
    case "pack":
      return "session_pack_fulfillment_unsupported";
    case "sub":
      return "client_subscription_fulfillment_unsupported";
    default:
      return "paid_product_shape_unsupported";
  }

  switch (product.participantMode) {
    case "solo":
      break;
    case "group":
      return "group_fulfillment_unsupported";
    case "gift":
      return "gift_fulfillment_unsupported";
    default:
      return "paid_product_shape_unsupported";
  }

  switch (product.executionMode) {
    case "live":
      return null;
    case "async":
      return "asynchronous_fulfillment_unsupported";
    case "instant":
      return "instant_fulfillment_unsupported";
    default:
      return "paid_product_shape_unsupported";
  }
}

function isExactAstroDiarySubscription(product: PaidProductFulfillmentShape): boolean {
  const config = product.astroDiaryConfig;
  return (
    product.type === "sub" &&
    product.paymentModel === "sub" &&
    product.executionMode === "async" &&
    product.participantMode === "solo" &&
    (product.subscriptionPeriod === "week" ||
      product.subscriptionPeriod === "month" ||
      product.subscriptionPeriod === "year") &&
    product.trialDays === null &&
    product.durationMinutes === null &&
    product.packageSessionCount === null &&
    product.groupSize === null &&
    exactValues(product.deliveryFormats, ["chat", "audio", "file"]) &&
    exactValues(product.requiredClientData, []) &&
    exactValues(product.methods, []) &&
    exactValues(product.accessGrants, ["journal"]) &&
    exactValues(product.modifiers, []) &&
    config !== null &&
    config !== undefined &&
    positiveInteger(config.reflectionCyclesPerPeriod) &&
    positiveInteger(config.responseSlaWorkingDays) &&
    positiveInteger(config.clientResponseWindowCalendarDays) &&
    config.workingWeekdays.length > 0 &&
    new Set(config.workingWeekdays).size === config.workingWeekdays.length &&
    config.workingWeekdays.every(
      (weekday) => Number.isInteger(weekday) && weekday >= 1 && weekday <= 7
    ) &&
    config.serviceTimezone.length > 0 &&
    config.serviceTimezone.trim() === config.serviceTimezone
  );
}

function exactValues(
  actual: readonly unknown[] | undefined,
  expected: readonly unknown[]
): boolean {
  return (
    actual !== undefined &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function unsupportedDecision(
  code: PaidProductFulfillmentIssueCode
): PaidProductFulfillmentDecision {
  return Object.freeze({ supported: false, code });
}
