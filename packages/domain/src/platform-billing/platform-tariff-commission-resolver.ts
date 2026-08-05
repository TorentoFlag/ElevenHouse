import {
  resolveTariffCommissionBps,
  type PlatformTariffSubscriptionSnapshot
} from "./platform-tariff-authority";
import type { PlatformTariffAuthorityStore } from "./platform-tariff-authority-store";

export type ActiveTariffCommissionSnapshot = Readonly<{
  subscriptionId: string;
  tariffSeriesId: string;
  tariffVersion: number;
  tariffVersionDigest: `sha256:${string}`;
  commissionBps: number;
}>;

/**
 * Resolves the commercial fee for a client sale. Risk policy never participates in this lookup:
 * the result is the exact immutable tariff version that was active for the astrologer at order
 * creation time, or no authority at all.
 */
export async function resolveActiveTariffCommission(input: Readonly<{
  ownerUserId: string;
  now: string;
  store: Pick<PlatformTariffAuthorityStore, "findCurrentSubscription" | "findTariffVersion">;
}>): Promise<ActiveTariffCommissionSnapshot | null> {
  const subscription = await input.store.findCurrentSubscription(input.ownerUserId);
  if (!isCurrentAt(subscription, input.now)) return null;
  const tariff = await input.store.findTariffVersion({
    tariffSeriesId: subscription.tariffSeriesId,
    version: subscription.tariffVersion,
    canonicalDigest: subscription.tariffVersionDigest
  });
  if (!tariff || (tariff.lifecycle !== "published" && tariff.lifecycle !== "retired")) return null;
  try {
    return Object.freeze({
      subscriptionId: subscription.subscriptionId,
      tariffSeriesId: subscription.tariffSeriesId,
      tariffVersion: subscription.tariffVersion,
      tariffVersionDigest: subscription.tariffVersionDigest,
      commissionBps: resolveTariffCommissionBps({ subscription, tariff })
    });
  } catch {
    return null;
  }
}

function isCurrentAt(subscription: PlatformTariffSubscriptionSnapshot | null, now: string): subscription is PlatformTariffSubscriptionSnapshot {
  if (!subscription || subscription.state !== "active" || !subscription.startsAt || !subscription.endsAt) return false;
  const current = Date.parse(now);
  const startsAt = Date.parse(subscription.startsAt);
  const endsAt = Date.parse(subscription.endsAt);
  return Number.isFinite(current) && Number.isFinite(startsAt) && Number.isFinite(endsAt) && current >= startsAt && current < endsAt;
}
