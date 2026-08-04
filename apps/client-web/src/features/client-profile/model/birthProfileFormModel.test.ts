import { describe, expect, it } from "vitest";
import type { ClientBirthDataResponse, ClientBirthPlaceCandidate } from "@elevenhouse/contracts";
import {
  applyBirthPlaceCandidate,
  buildBirthProfileRequest,
  createBirthProfileForm,
  updateBirthDate,
  updateBirthPlaceQuery,
  updateBirthTime,
  updateBirthTimeDstOccurrence
} from "./birthProfileFormModel";

describe("birthProfileFormModel", () => {
  it("preserves every saved calculation field when unrelated profile text is edited", () => {
    const form = {
      ...createBirthProfileForm(savedProfile()),
      label: "Мой основной профиль"
    };

    expect(buildBirthProfileRequest(form)).toEqual({
      ok: true,
      request: {
        label: "Мой основной профиль",
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "approximate",
        birthPlaceText: "Москва, Россия",
        birthCountryCode: "RU",
        birthCity: "Москва",
        birthRegion: "Москва",
        birthTimezone: "Europe/Moscow",
        birthTimeDstOccurrence: "second",
        birthLatitude: 55.7558,
        birthLongitude: 37.6173,
        isPrimary: true
      }
    });
  });

  it("keeps saved place metadata but blocks an edited free-text place until a candidate is selected", () => {
    const edited = updateBirthPlaceQuery(createBirthProfileForm(savedProfile()), "Санкт-Петербург");

    expect(edited).toMatchObject({
      birthPlaceText: "Санкт-Петербург",
      selectedBirthPlaceText: "Москва, Россия",
      birthTimezone: "Europe/Moscow",
      birthLatitude: 55.7558,
      birthLongitude: 37.6173,
      birthTimeDstOccurrence: "second"
    });
    expect(buildBirthProfileRequest(edited)).toEqual({
      ok: false,
      reason: "birth-place-selection-required"
    });
  });

  it("replaces all authoritative place fields from one candidate and clears DST on timezone change", () => {
    const selected = applyBirthPlaceCandidate(
      createBirthProfileForm(savedProfile()),
      romeCandidate()
    );

    expect(selected).toMatchObject({
      birthPlaceText: "Rome, Italy",
      selectedBirthPlaceText: "Rome, Italy",
      birthCountryCode: "IT",
      birthCity: "Rome",
      birthRegion: "Lazio",
      birthTimezone: "Europe/Rome",
      birthLatitude: 41.8933,
      birthLongitude: 12.4829,
      birthTimeDstOccurrence: null
    });
    expect(buildBirthProfileRequest(selected)).toMatchObject({
      ok: true,
      request: {
        birthPlaceText: "Rome, Italy",
        birthTimezone: "Europe/Rome"
      }
    });
  });

  it("retains DST when a selected candidate has the same civil timezone", () => {
    const selected = applyBirthPlaceCandidate(createBirthProfileForm(savedProfile()), {
      ...romeCandidate(),
      id: "geoapify:moscow",
      label: "Москва, Россия",
      placeName: "Москва, Россия",
      countryCode: "RU",
      city: "Москва",
      region: "Москва",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173,
      providerPlaceId: "moscow"
    });

    expect(selected.birthTimeDstOccurrence).toBe("second");
  });

  it("clears DST only when date or time actually changes", () => {
    const original = createBirthProfileForm(savedProfile());

    expect(updateBirthDate(original, "1990-03-14").birthTimeDstOccurrence).toBe("second");
    expect(updateBirthTime(original, "08:25").birthTimeDstOccurrence).toBe("second");
    expect(updateBirthDate(original, "1990-03-15").birthTimeDstOccurrence).toBeNull();
    expect(updateBirthTime(original, "08:26").birthTimeDstOccurrence).toBeNull();
  });

  it("preserves an explicit repeated-hour choice until a civil field changes", () => {
    const original = createBirthProfileForm({
      ...savedProfile(),
      birthTimeDstOccurrence: null
    });

    const selected = updateBirthTimeDstOccurrence(original, "first");

    expect(buildBirthProfileRequest(selected)).toMatchObject({
      ok: true,
      request: { birthTimeDstOccurrence: "first" }
    });
    expect(updateBirthDate(selected, "1990-03-15").birthTimeDstOccurrence).toBeNull();
  });

  it("allows a genuinely empty optional place without fabricating location metadata", () => {
    expect(buildBirthProfileRequest(createBirthProfileForm(null))).toMatchObject({
      ok: true,
      request: {
        birthPlaceText: null,
        birthCountryCode: null,
        birthCity: null,
        birthRegion: null,
        birthTimezone: null,
        birthLatitude: null,
        birthLongitude: null
      }
    });
  });
});

function savedProfile(): ClientBirthDataResponse {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    clientUserId: "11111111-1111-4111-8111-111111111111",
    label: "Я",
    birthDate: "1990-03-14",
    birthTime: "08:25",
    birthTimePrecision: "approximate",
    birthPlaceText: "Москва, Россия",
    birthCountryCode: "RU",
    birthCity: "Москва",
    birthRegion: "Москва",
    birthTimezone: "Europe/Moscow",
    birthTimeDstOccurrence: "second",
    birthLatitude: 55.7558,
    birthLongitude: 37.6173,
    source: "client_profile",
    isPrimary: true,
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z"
  };
}

function romeCandidate(): ClientBirthPlaceCandidate {
  return {
    id: "geoapify:41485",
    label: "Rome, Lazio, Italy",
    placeName: "Rome, Italy",
    countryCode: "IT",
    city: "Rome",
    region: "Lazio",
    timezone: "Europe/Rome",
    latitude: 41.8933,
    longitude: 12.4829,
    provider: "geoapify",
    providerPlaceId: "41485"
  };
}
