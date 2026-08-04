import type {
  ClientBirthDataResponse,
  ClientBirthDataUpsertRequest,
  ClientBirthPlaceCandidate,
  ClientBirthTimePrecision
} from "@elevenhouse/contracts";

export type BirthProfileFormState = {
  readonly label: string;
  readonly birthDate: string;
  readonly birthTime: string;
  readonly birthTimePrecision: ClientBirthTimePrecision;
  readonly birthPlaceText: string;
  readonly selectedBirthPlaceText: string | null;
  readonly birthCountryCode: string | null;
  readonly birthCity: string | null;
  readonly birthRegion: string | null;
  readonly birthTimezone: string | null;
  readonly birthTimeDstOccurrence: "first" | "second" | null;
  readonly birthLatitude: number | null;
  readonly birthLongitude: number | null;
};

export type BirthProfileRequestResult =
  | {
      readonly ok: true;
      readonly request: ClientBirthDataUpsertRequest;
    }
  | {
      readonly ok: false;
      readonly reason: "birth-place-selection-required";
    };

export function createBirthProfileForm(
  profile: ClientBirthDataResponse | null
): BirthProfileFormState {
  if (!profile) {
    return {
      label: "Я",
      birthDate: "",
      birthTime: "",
      birthTimePrecision: "unknown",
      birthPlaceText: "",
      selectedBirthPlaceText: null,
      birthCountryCode: null,
      birthCity: null,
      birthRegion: null,
      birthTimezone: null,
      birthTimeDstOccurrence: null,
      birthLatitude: null,
      birthLongitude: null
    };
  }

  const selectedBirthPlaceText = hasAuthoritativePlace(profile)
    ? normalizeVisibleText(profile.birthPlaceText)
    : null;

  return {
    label: profile.label ?? "Я",
    birthDate: profile.birthDate ?? "",
    birthTime: profile.birthTime ?? "",
    birthTimePrecision: profile.birthTimePrecision,
    birthPlaceText: profile.birthPlaceText ?? "",
    selectedBirthPlaceText,
    birthCountryCode: profile.birthCountryCode,
    birthCity: profile.birthCity,
    birthRegion: profile.birthRegion,
    birthTimezone: profile.birthTimezone,
    birthTimeDstOccurrence: profile.birthTimeDstOccurrence,
    birthLatitude: profile.birthLatitude,
    birthLongitude: profile.birthLongitude
  };
}

export function updateBirthPlaceQuery(
  form: BirthProfileFormState,
  birthPlaceText: string
): BirthProfileFormState {
  return {
    ...form,
    birthPlaceText
  };
}

export function applyBirthPlaceCandidate(
  form: BirthProfileFormState,
  candidate: ClientBirthPlaceCandidate
): BirthProfileFormState {
  return {
    ...form,
    birthPlaceText: candidate.placeName,
    selectedBirthPlaceText: candidate.placeName,
    birthCountryCode: candidate.countryCode,
    birthCity: candidate.city,
    birthRegion: candidate.region,
    birthTimezone: candidate.timezone,
    birthTimeDstOccurrence:
      form.birthTimezone === candidate.timezone ? form.birthTimeDstOccurrence : null,
    birthLatitude: candidate.latitude,
    birthLongitude: candidate.longitude
  };
}

export function updateBirthDate(
  form: BirthProfileFormState,
  birthDate: string
): BirthProfileFormState {
  return {
    ...form,
    birthDate,
    birthTimeDstOccurrence:
      normalizeVisibleText(form.birthDate) === normalizeVisibleText(birthDate)
        ? form.birthTimeDstOccurrence
        : null
  };
}

export function updateBirthTime(
  form: BirthProfileFormState,
  birthTime: string
): BirthProfileFormState {
  const hasTime = normalizeVisibleText(birthTime).length > 0;
  const timeChanged = normalizeVisibleText(form.birthTime) !== normalizeVisibleText(birthTime);

  return {
    ...form,
    birthTime,
    birthTimePrecision: hasTime
      ? form.birthTimePrecision === "unknown"
        ? "exact"
        : form.birthTimePrecision
      : "unknown",
    birthTimeDstOccurrence: timeChanged ? null : form.birthTimeDstOccurrence
  };
}

export function updateBirthTimeDstOccurrence(
  form: BirthProfileFormState,
  birthTimeDstOccurrence: "first" | "second" | null
): BirthProfileFormState {
  return {
    ...form,
    birthTimeDstOccurrence
  };
}

export function buildBirthProfileRequest(form: BirthProfileFormState): BirthProfileRequestResult {
  const typedPlace = normalizeVisibleText(form.birthPlaceText);
  const selectedPlace = normalizeVisibleText(form.selectedBirthPlaceText);

  if (typedPlace || selectedPlace) {
    if (
      !typedPlace ||
      !selectedPlace ||
      typedPlace !== selectedPlace ||
      !hasAuthoritativePlace(form)
    ) {
      return {
        ok: false,
        reason: "birth-place-selection-required"
      };
    }
  }

  const birthTime = normalizeVisibleText(form.birthTime) || null;
  const hasSelectedPlace = selectedPlace.length > 0;

  return {
    ok: true,
    request: {
      label: normalizeVisibleText(form.label) || "Я",
      birthDate: normalizeVisibleText(form.birthDate) || null,
      birthTime,
      birthTimePrecision: birthTime ? form.birthTimePrecision : "unknown",
      birthPlaceText: hasSelectedPlace ? selectedPlace : null,
      birthCountryCode: hasSelectedPlace ? form.birthCountryCode : null,
      birthCity: hasSelectedPlace ? form.birthCity : null,
      birthRegion: hasSelectedPlace ? form.birthRegion : null,
      birthTimezone: hasSelectedPlace ? form.birthTimezone : null,
      birthTimeDstOccurrence: birthTime ? form.birthTimeDstOccurrence : null,
      birthLatitude: hasSelectedPlace ? form.birthLatitude : null,
      birthLongitude: hasSelectedPlace ? form.birthLongitude : null,
      isPrimary: true
    }
  };
}

function hasAuthoritativePlace(
  value: Pick<
    BirthProfileFormState | ClientBirthDataResponse,
    "birthPlaceText" | "birthTimezone" | "birthLatitude" | "birthLongitude"
  >
): boolean {
  return (
    normalizeVisibleText(value.birthPlaceText).length > 0 &&
    normalizeVisibleText(value.birthTimezone).length > 0 &&
    typeof value.birthLatitude === "number" &&
    Number.isFinite(value.birthLatitude) &&
    typeof value.birthLongitude === "number" &&
    Number.isFinite(value.birthLongitude)
  );
}

function normalizeVisibleText(value: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}
