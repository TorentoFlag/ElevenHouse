import type { PlatformPlanFeatureCode } from "./platform-billing-types";
import { resolvePlatformTariffEntitlement } from "./platform-tariff-authority";
import type {
  PlatformTariffSubscriptionSnapshot,
  PlatformTariffVersion
} from "./platform-tariff-authority";
import type { PlatformTariffAuthorityStore } from "./platform-tariff-authority-store";

export type PlatformTariffEntitlementOperation = "read" | "mutation" | "generation" | "worker";
export type PlatformTariffEntitlementDecision = "allow" | "read_only" | "deny";

export type PlatformTariffHistoricalCapabilityGrant = Readonly<{
  subscription: PlatformTariffSubscriptionSnapshot;
  tariff: PlatformTariffVersion;
}>;

export type PlatformTariffCapabilityResolution = Readonly<{
  capability: PlatformPlanFeatureCode;
  decision: PlatformTariffEntitlementDecision;
}>;

/**
 * Read authority for current and prior exact tariff snapshots. Historical evidence is deliberately
 * returned as a complete pair so the domain can fail closed on a mismatched owner, digest, period,
 * lifecycle, or capability rather than trusting an infrastructure-level boolean.
 */
export type PlatformTariffEntitlementStore = Readonly<
  Pick<PlatformTariffAuthorityStore, "findCurrentSubscription" | "findTariffVersion"> & {
    findLatestHistoricalCapabilityGrant(input: Readonly<{
      ownerUserId: string;
      capability: PlatformPlanFeatureCode;
      at: string;
    }>): Promise<PlatformTariffHistoricalCapabilityGrant | null>;
  }
>;

/**
 * Runtime capability authority. It never falls back to a catalog/default plan:
 * an operation is allowed only by the exact active subscription snapshot.
 */
export async function resolvePlatformTariffCapability(input: Readonly<{
  store: PlatformTariffEntitlementStore;
  ownerUserId: string;
  capability: PlatformPlanFeatureCode;
  operation: PlatformTariffEntitlementOperation;
  now: string;
}>): Promise<PlatformTariffEntitlementDecision> {
  const [resolution] = await resolvePlatformTariffCapabilities({
    ...input,
    capabilities: [input.capability]
  });
  return resolution?.decision ?? "deny";
}

/**
 * Resolves a compound requirement against one current subscription/tariff pair.
 * This prevents a multi-capability operation from combining authorisation facts
 * from two separately observed subscription snapshots.
 */
export async function resolvePlatformTariffCapabilities(input: Readonly<{
  store: PlatformTariffEntitlementStore;
  ownerUserId: string;
  capabilities: readonly PlatformPlanFeatureCode[];
  operation: PlatformTariffEntitlementOperation;
  now: string;
}>): Promise<readonly PlatformTariffCapabilityResolution[]> {
  const subscription = await input.store.findCurrentSubscription(input.ownerUserId);
  const tariff = subscription
    ? await input.store.findTariffVersion({
        tariffSeriesId: subscription.tariffSeriesId,
        version: subscription.tariffVersion,
        canonicalDigest: subscription.tariffVersionDigest
      })
    : null;

  return Promise.all(
    input.capabilities.map(async (capability) => {
      if (
        subscription &&
        resolvePlatformTariffEntitlement({ subscription, tariff, capability, now: input.now }) ===
          "allowed"
      ) {
        return { capability, decision: "allow" } as const;
      }

      const historicalGrant = await input.store.findLatestHistoricalCapabilityGrant({
        ownerUserId: input.ownerUserId,
        capability,
        at: input.now
      });
      return {
        capability,
        decision: isValidHistoricalCapabilityGrant({
          grant: historicalGrant,
          ownerUserId: input.ownerUserId,
          capability,
          at: input.now
        })
          ? "read_only"
          : "deny"
      } as const;
    })
  );
}

function isValidHistoricalCapabilityGrant(input: Readonly<{
  grant: PlatformTariffHistoricalCapabilityGrant | null;
  ownerUserId: string;
  capability: PlatformPlanFeatureCode;
  at: string;
}>): boolean {
  if (!input.grant) return false;
  const { subscription, tariff } = input.grant;
  if (
    subscription.ownerUserId !== input.ownerUserId ||
    !["active", "cancelled", "expired"].includes(subscription.state) ||
    subscription.startsAt === null ||
    subscription.endsAt === null ||
    subscription.tariffSeriesId !== tariff.tariffSeriesId ||
    subscription.tariffVersion !== tariff.version ||
    subscription.tariffVersionDigest !== tariff.canonicalDigest ||
    subscription.commissionBpsSnapshot !== tariff.clientSaleCommissionBps ||
    (tariff.lifecycle !== "published" && tariff.lifecycle !== "retired") ||
    !tariff.features.includes(input.capability)
  ) {
    return false;
  }

  const startsAt = Date.parse(subscription.startsAt);
  const endsAt = Date.parse(subscription.endsAt);
  const evaluatedAt = Date.parse(input.at);
  return (
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    Number.isFinite(evaluatedAt) &&
    startsAt < endsAt &&
    startsAt <= evaluatedAt
  );
}
