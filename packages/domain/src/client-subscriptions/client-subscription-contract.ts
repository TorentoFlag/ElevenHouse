import { clientSubscriptionContractSchema } from "@elevenhouse/contracts";
import { Temporal } from "@js-temporal/polyfill";
import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import type {
  ClientSubscriptionContract,
  ClientSubscriptionOrderSnapshot,
  ClientSubscriptionProductSnapshot,
  ClientSubscriptionRelationshipSnapshot
} from "./client-subscription-types";

export type SealClientSubscriptionContractOutcome =
  | { readonly outcome: "sealed"; readonly contract: ClientSubscriptionContract }
  | {
      readonly outcome: "rejected";
      readonly code:
        | "inactive_relationship"
        | "inactive_product"
        | "snapshot_mismatch"
        | "invalid_astro_diary_shape";
    };

export function sealClientSubscriptionContract(input: {
  readonly contractId: string;
  readonly order: ClientSubscriptionOrderSnapshot;
  readonly product: ClientSubscriptionProductSnapshot;
  readonly relationship: ClientSubscriptionRelationshipSnapshot;
  readonly createdAt: string;
}): SealClientSubscriptionContractOutcome {
  if (input.relationship.status !== "active") {
    return { outcome: "rejected", code: "inactive_relationship" };
  }
  if (input.product.status !== "active") {
    return { outcome: "rejected", code: "inactive_product" };
  }
  if (!snapshotsMatch(input.order, input.product, input.relationship)) {
    return { outcome: "rejected", code: "snapshot_mismatch" };
  }

  let createdAt: string;
  try {
    createdAt = Temporal.Instant.from(input.createdAt).toString();
  } catch {
    return { outcome: "rejected", code: "invalid_astro_diary_shape" };
  }

  const weekdays = [...input.product.astroDiaryConfig.workingWeekdays].sort((a, b) => a - b);
  const terms = {
    id: canonicalUuid(input.contractId),
    orderId: canonicalUuid(input.order.orderId),
    productId: canonicalUuid(input.order.productId),
    productRevision: input.order.productRevision,
    relationshipId: canonicalUuid(input.order.relationshipId),
    astrologerUserId: canonicalUuid(input.order.astrologerUserId),
    clientUserId: canonicalUuid(input.order.clientUserId),
    priceMinor: input.order.priceMinor,
    currency: input.order.currency,
    cadence: input.order.cadence,
    billingEconomics: {
      ...input.order.billingEconomics,
      orderId: canonicalUuid(input.order.billingEconomics.orderId),
      astrologerUserId: canonicalUuid(input.order.billingEconomics.astrologerUserId)
    },
    accessGrants: ["journal"] as const,
    deliveryFormats: ["chat", "audio", "file"] as const,
    requiredClientData: [] as const,
    methods: [] as const,
    modifiers: [] as const,
    astroDiaryConfig: { ...input.product.astroDiaryConfig, workingWeekdays: weekdays },
    createdAt
  };
  const parsed = clientSubscriptionContractSchema.safeParse({
    ...terms,
    canonicalDigest: sha256CanonicalJson(terms as unknown as CanonicalJson)
  });
  if (!parsed.success) {
    return { outcome: "rejected", code: "invalid_astro_diary_shape" };
  }
  return { outcome: "sealed", contract: parsed.data };
}

function canonicalUuid(value: string): string {
  return value.toLowerCase();
}

function snapshotsMatch(
  order: ClientSubscriptionOrderSnapshot,
  product: ClientSubscriptionProductSnapshot,
  relationship: ClientSubscriptionRelationshipSnapshot
): boolean {
  return (
    order.productId === product.productId &&
    order.productRevision === product.revision &&
    order.relationshipId === relationship.relationshipId &&
    order.astrologerUserId === relationship.astrologerUserId &&
    order.astrologerUserId === product.ownerUserId &&
    order.clientUserId === relationship.clientUserId &&
    order.priceMinor > 0 &&
    order.priceMinor === product.priceMinor &&
    order.currency === product.currency &&
    order.cadence === product.cadence &&
    order.billingEconomics.orderId === order.orderId &&
    order.billingEconomics.astrologerUserId === order.astrologerUserId &&
    order.billingEconomics.gross.amountMinor === order.priceMinor &&
    order.billingEconomics.gross.currency === order.currency &&
    exactArray(order.accessGrants, product.accessGrants) &&
    exactArray(order.deliveryFormats, product.deliveryFormats) &&
    exactArray(order.requiredClientData, product.requiredClientData) &&
    exactArray(order.methods, product.methods) &&
    order.modifiers.length === product.modifiers.length &&
    sameAstroDiaryConfig(order.astroDiaryConfig, product.astroDiaryConfig) &&
    product.type === "sub" &&
    product.paymentModel === "sub" &&
    product.executionMode === "async" &&
    product.participantMode === "solo" &&
    product.trialDays === null &&
    product.groupSize === null &&
    product.packageSessionCount === null &&
    exactArray(product.accessGrants, ["journal"]) &&
    exactArray(product.deliveryFormats, ["chat", "audio", "file"]) &&
    product.requiredClientData.length === 0 &&
    product.methods.length === 0 &&
    product.modifiers.length === 0
  );
}

function sameAstroDiaryConfig(
  left: ClientSubscriptionProductSnapshot["astroDiaryConfig"],
  right: ClientSubscriptionProductSnapshot["astroDiaryConfig"]
): boolean {
  return (
    left.reflectionCyclesPerPeriod === right.reflectionCyclesPerPeriod &&
    left.responseSlaWorkingDays === right.responseSlaWorkingDays &&
    left.clientResponseWindowCalendarDays === right.clientResponseWindowCalendarDays &&
    left.serviceTimezone === right.serviceTimezone &&
    exactArray(left.workingWeekdays.map(String), right.workingWeekdays.map(String))
  );
}

function exactArray(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}
