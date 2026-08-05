/* eslint-disable @typescript-eslint/no-explicit-any -- The draft regression fixture intentionally supplies legacy partial input. */
import {
  canonicalizeFinanceCommandPayload,
  hashFinanceCommandPayload
} from "../finance-authorization/canonical-command-payload";
import { describe, expect, it } from "vitest";

import {
  createPlatformTariffDraft,
  canonicalizePlatformTariffTerms,
  PlatformTariffAuthorityError,
  preparePlatformTariffSubscriptionPurchase,
  publishPlatformTariffDraft,
  revisePlatformTariffDraft,
  resolvePlatformTariffEntitlement,
  resolveTariffCommissionBps,
  verifyPlatformTariffVersion,
  type PlatformTariffSubscriptionSnapshot,
  type PlatformTariffVersion
} from "./platform-tariff-authority";

describe("platform tariff authority", () => {
  it("seals an explicit bank-facing recurring interval into every paid tariff version", () => {
    const tariff = createPlatformTariffDraft({
      ...draftInput(),
      monthlyRecurringFrequencyDays: 31,
      yearlyRecurringFrequencyDays: 365
    } as any);

    expect(tariff).toMatchObject({
      monthlyRecurringFrequencyDays: 31,
      yearlyRecurringFrequencyDays: 365
    });
    expect(canonicalizePlatformTariffTerms(tariff)).toContain(
      '"monthlyRecurringFrequencyDays":31'
    );
  });
  it("keeps the commercial digest stable when a draft is published", () => {
    const draft = createPlatformTariffDraft(draftInput());
    const published = publishPlatformTariffDraft(draft);

    expect(draft.lifecycle).toBe("draft");
    expect(published.lifecycle).toBe("published");
    expect(published.canonicalDigest).toBe(draft.canonicalDigest);
    expect(published.clientSaleCommissionBps).toBe(800);
  });

  it("refuses publication when a selected capability has no server-side enforcement", () => {
    const draft = createPlatformTariffDraft({ ...draftInput(), features: ["engine"] });

    expect(() => publishPlatformTariffDraft(draft)).toThrow(
      new PlatformTariffAuthorityError("tariff_not_publishable")
    );
  });

  it("revises only the exact draft revision and re-seals its digest", () => {
    const draft = createPlatformTariffDraft(draftInput());
    const revised = revisePlatformTariffDraft({
      current: draft,
      expectedDraftRevision: 1,
      next: { ...draftInput(), monthlyPriceMinor: 2_900 }
    });

    expect(revised.draftRevision).toBe(2);
    expect(revised.monthlyPriceMinor).toBe(2_900);
    expect(revised.canonicalDigest).not.toBe(draft.canonicalDigest);
    expect(() => revisePlatformTariffDraft({ current: revised, expectedDraftRevision: 1, next: draftInput() })).toThrow(PlatformTariffAuthorityError);
  });

  it("preserves an exact active entitlement after its tariff is retired", () => {
    const tariff = publishedFeatureTariff();
    const active = subscriptionFor(tariff);
    const input = { subscription: active, tariff, capability: "engine" as const, now: "2026-08-04T12:00:00.000Z" };

    expect(resolvePlatformTariffEntitlement(input)).toBe("allowed");
    expect(resolvePlatformTariffEntitlement({ ...input, tariff: { ...tariff, lifecycle: "retired" } })).toBe("allowed");
    expect(resolvePlatformTariffEntitlement({ ...input, subscription: null })).toBe("denied");
    expect(resolvePlatformTariffEntitlement({ ...input, subscription: { ...active, endsAt: "2026-08-04T11:59:59.000Z" } })).toBe("denied");
    expect(resolvePlatformTariffEntitlement({ ...input, subscription: { ...active, tariffVersionDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } })).toBe("denied");
  });

  it("resolves sale commission only from the subscription tariff snapshot", () => {
    const tariff = publishedFeatureTariff();
    const subscription = subscriptionFor(tariff);

    expect(resolveTariffCommissionBps({ subscription, tariff })).toBe(800);
    expect(() =>
      resolveTariffCommissionBps({ subscription: { ...subscription, commissionBpsSnapshot: 1 }, tariff })
    ).toThrow(PlatformTariffAuthorityError);
  });

  it("refuses a persisted tariff row whose digest is not its commercial terms", () => {
    const tariff = createPlatformTariffDraft(draftInput());

    expect(() => verifyPlatformTariffVersion({ ...tariff, canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })).toThrow(
      new PlatformTariffAuthorityError("invalid_tariff")
    );
  });

  it("does not fabricate an active billing period before a paid tariff is set up", () => {
    expect(
      preparePlatformTariffSubscriptionPurchase({
        ownerUserId: "owner-1",
        tariff: publishedFeatureTariff(),
        billingCycle: "month",
        now: "2026-08-04T12:00:00.000Z"
      }).subscription
    ).toMatchObject({ state: "incomplete_setup", startsAt: null, endsAt: null });
  });

  it("produces the one canonical byte-for-byte tariff preimage that its digest binds", () => {
    const tariff = createPlatformTariffDraft(draftInput());

    expect(canonicalizePlatformTariffTerms(tariff)).toBe(
      new TextDecoder().decode(canonicalizeFinanceCommandPayload({
        tariffSeriesId: tariff.tariffSeriesId,
        version: tariff.version,
        name: tariff.name,
        tagline: tariff.tagline,
        monthlyPriceMinor: tariff.monthlyPriceMinor,
        yearlyPriceMinor: tariff.yearlyPriceMinor,
        monthlyRecurringFrequencyDays: tariff.monthlyRecurringFrequencyDays,
        yearlyRecurringFrequencyDays: tariff.yearlyRecurringFrequencyDays,
        clientSaleCommissionBps: tariff.clientSaleCommissionBps,
        seatsLimit: tariff.seatsLimit,
        bookingsLimit: tariff.bookingsLimit,
        aiRequestsLimit: tariff.aiRequestsLimit,
        automationLimit: tariff.automationLimit,
        isPopular: tariff.isPopular,
        displayOrder: tariff.displayOrder,
        features: tariff.features
      }))
    );
  });
});

function draftInput() {
  return {
    tariffSeriesId: "pro",
    version: 1,
    name: "Pro",
    tagline: "For active practice",
    monthlyPriceMinor: 2_500,
    yearlyPriceMinor: 25_000,
    monthlyRecurringFrequencyDays: 31,
    yearlyRecurringFrequencyDays: 365,
    clientSaleCommissionBps: 800,
    seatsLimit: 1,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: false,
    displayOrder: 0,
    features: [] as const
  };
}

function publishedFeatureTariff(): PlatformTariffVersion {
  const terms = { ...draftInput(), features: ["engine"] as const };
  return {
    ...terms,
    draftRevision: 1,
    lifecycle: "published" as const,
    canonicalDigest: hashFinanceCommandPayload(terms)
  };
}

function subscriptionFor(tariff: PlatformTariffVersion): PlatformTariffSubscriptionSnapshot {
  return {
    subscriptionId: "subscription-1",
    ownerUserId: "owner-1",
    tariffSeriesId: tariff.tariffSeriesId,
    tariffVersion: tariff.version,
    tariffVersionDigest: tariff.canonicalDigest,
    commissionBpsSnapshot: tariff.clientSaleCommissionBps,
    version: 1,
    state: "active",
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-09-01T00:00:00.000Z"
  };
}
