import type {
  AdminTariffDraftRequest,
  AdminTariffResponse,
  AdminTariffUpdateRequest
} from "@elevenhouse/contracts";
import {
  platformPlanFeatureCodeValues,
  type PlatformPlanFeatureCode
} from "@elevenhouse/contracts";

export type PlatformTariffFormState = AdminTariffDraftRequest;

export const platformTariffFeatureOptions = platformPlanFeatureCodeValues;

export function createBlankTariffDraft(displayOrder: number): PlatformTariffFormState {
  return {
    tariffSeriesId: "",
    version: 1,
    name: "",
    tagline: "",
    monthlyPriceMinor: 0,
    yearlyPriceMinor: 0,
    monthlyRecurringFrequencyDays: null,
    yearlyRecurringFrequencyDays: null,
    clientSaleCommissionBps: 0,
    seatsLimit: 1,
    bookingsLimit: null,
    aiRequestsLimit: null,
    automationLimit: null,
    isPopular: false,
    displayOrder,
    features: []
  };
}

export function tariffToForm(tariff: AdminTariffResponse): PlatformTariffFormState {
  const {
    draftRevision,
    lifecycle,
    canonicalDigest,
    ...terms
  } = tariff;
  void draftRevision;
  void lifecycle;
  void canonicalDigest;
  return terms;
}

export function createNextVersionDraft(
  tariff: AdminTariffResponse,
  nextVersion: number
): PlatformTariffFormState {
  return { ...tariffToForm(tariff), version: nextVersion };
}

export function toUpdateRequest(
  form: PlatformTariffFormState,
  expectedDraftRevision: number
): AdminTariffUpdateRequest {
  return { ...form, expectedDraftRevision };
}

export function toggleTariffFeature(
  features: readonly PlatformPlanFeatureCode[],
  feature: PlatformPlanFeatureCode
): PlatformPlanFeatureCode[] {
  return features.includes(feature)
    ? features.filter((item) => item !== feature)
    : [...features, feature];
}

export function nextTariffVersion(
  tariffs: readonly AdminTariffResponse[],
  tariffSeriesId: string
): number {
  return Math.max(0, ...tariffs.filter((tariff) => tariff.tariffSeriesId === tariffSeriesId).map((tariff) => tariff.version)) + 1;
}
