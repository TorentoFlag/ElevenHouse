import type { ProductAccessGrant, ProductAstroDiaryConfig } from "@elevenhouse/contracts/products";
import type { ProductFormDraft } from "./productDraft";

export type AstroDiaryIsoWeekday = ProductAstroDiaryConfig["workingWeekdays"][number];

export function createDefaultAstroDiaryProductConfig(): ProductAstroDiaryConfig {
  return {
    reflectionCyclesPerPeriod: 4,
    responseSlaWorkingDays: 2,
    clientResponseWindowCalendarDays: 7,
    workingWeekdays: [1, 2, 3, 4, 5],
    serviceTimezone: "UTC"
  };
}

export function normalizeAstroDiaryProductDraft(draft: ProductFormDraft): ProductFormDraft {
  return {
    ...draft,
    type: "sub",
    executionMode: "async",
    paymentModel: "sub",
    durationMinutes: null,
    durationLabel: "",
    slaLabel: "",
    packageSessionCount: null,
    packageDiscountPercent: null,
    subscriptionPeriod: draft.subscriptionPeriod ?? "month",
    trialDays: null,
    participantMode: "solo",
    groupSize: null,
    deliveryFormats: ["chat", "audio", "file"],
    requiredClientData: [],
    methods: [],
    accessGrants: ["journal"],
    modifiers: [],
    astroDiaryConfig: draft.astroDiaryConfig ?? createDefaultAstroDiaryProductConfig()
  };
}

export function toggleProductAccessGrant(
  draft: ProductFormDraft,
  value: ProductAccessGrant
): ProductFormDraft {
  if (value === "journal") {
    if (draft.accessGrants.length === 1 && draft.accessGrants[0] === "journal") {
      return removeAstroDiaryConfiguration({ ...draft, accessGrants: [] });
    }

    return normalizeAstroDiaryProductDraft({ ...draft, accessGrants: ["journal"] });
  }

  if (draft.accessGrants.includes("journal")) {
    return removeAstroDiaryConfiguration({ ...draft, accessGrants: [value] });
  }

  const accessGrants = draft.accessGrants.includes(value)
    ? draft.accessGrants.filter((accessGrant) => accessGrant !== value)
    : [...draft.accessGrants, value];

  return { ...draft, accessGrants, astroDiaryConfig: null };
}

export function toggleAstroDiaryWorkingWeekday(
  draft: ProductFormDraft,
  weekday: AstroDiaryIsoWeekday
): ProductFormDraft {
  const config = draft.astroDiaryConfig;
  if (!config) {
    return draft;
  }

  const isSelected = config.workingWeekdays.includes(weekday);
  if (isSelected && config.workingWeekdays.length === 1) {
    return draft;
  }

  const workingWeekdays = isSelected
    ? config.workingWeekdays.filter((selectedWeekday) => selectedWeekday !== weekday)
    : [...config.workingWeekdays, weekday].sort((left, right) => left - right);

  return {
    ...draft,
    astroDiaryConfig: {
      ...config,
      workingWeekdays
    }
  };
}

function removeAstroDiaryConfiguration(draft: ProductFormDraft): ProductFormDraft {
  return {
    ...draft,
    astroDiaryConfig: null,
    trialDays: draft.paymentModel === "sub" ? (draft.trialDays ?? 0) : draft.trialDays
  };
}
