import { describe, expect, it } from "vitest";
import { toBirthPlaceDraftPatch } from "./birthPlaceModel";

describe("birthPlaceModel", () => {
  it("maps a provider candidate to the persisted birth-data fields", () => {
    expect(
      toBirthPlaceDraftPatch({
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
      })
    ).toEqual({
      birthPlaceText: "Rome, Italy",
      birthCountryCode: "IT",
      birthCity: "Rome",
      birthRegion: "Lazio",
      birthTimezone: "Europe/Rome",
      birthLatitude: 41.8933,
      birthLongitude: 12.4829
    });
  });
});
