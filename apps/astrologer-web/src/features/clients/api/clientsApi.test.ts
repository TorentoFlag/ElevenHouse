import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AstrologerClientResponse,
  ClientBirthPlaceSearchResponse
} from "@elevenhouse/contracts";
import { application } from "../../../Application";
import {
  getAstrologerClient,
  resolveClientBirthPlaceReference,
  searchClientBirthPlaces,
  updateClientBirthData
} from "./clientsApi";

const clientUserId = "22222222-2222-4222-8222-222222222222";

describe("clientsApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads a related client by owner-scoped client id", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(response());

    await expect(getAstrologerClient(clientUserId)).resolves.toMatchObject({
      client: {
        clientUserId,
        displayName: "Марина Краснова"
      }
    });

    expect(get).toHaveBeenCalledWith(`/clients/${clientUserId}`);
  });

  it("updates related client birth data through a CSRF-protected route", async () => {
    const put = vi.spyOn(application.http, "put").mockResolvedValue(response());

    await expect(
      updateClientBirthData(clientUserId, {
        expectedRevision: 1,
        label: "Основные данные",
        birthDate: "1990-07-15",
        birthTime: "10:30",
        birthTimePrecision: "exact",
        birthPlaceText: "Рим, Италия",
        birthCountryCode: "IT",
        birthCity: "Рим",
        birthRegion: "Лацио",
        birthTimezone: "Europe/Rome",
        birthTimeDstOccurrence: null,
        birthLatitude: 41.9028,
        birthLongitude: 12.4964
      })
    ).resolves.toMatchObject({
      client: {
        clientUserId,
        birthData: {
          birthTimezone: "Europe/Rome"
        }
      }
    });

    expect(put).toHaveBeenCalledWith(
      `/clients/${clientUserId}/birth-data`,
      {
        expectedRevision: 1,
        label: "Основные данные",
        birthDate: "1990-07-15",
        birthTime: "10:30",
        birthTimePrecision: "exact",
        birthPlaceText: "Рим, Италия",
        birthCountryCode: "IT",
        birthCity: "Рим",
        birthRegion: "Лацио",
        birthTimezone: "Europe/Rome",
        birthTimeDstOccurrence: null,
        birthLatitude: 41.9028,
        birthLongitude: 12.4964
      },
      { csrf: true }
    );
  });

  it("searches provider-resolved birth places through the clients API", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue(placeSearchResponse());

    await expect(searchClientBirthPlaces({ query: "  Rome   Italy  ", limit: 3 })).resolves.toEqual(
      placeSearchResponse()
    );

    expect(get).toHaveBeenCalledWith("/clients/birth-places?query=Rome+Italy&limit=3");
  });

  it("resolves and strictly parses one opaque provider reference", async () => {
    const candidate = placeSearchResponse().candidates[0]!;
    const get = vi.spyOn(application.http, "get").mockResolvedValue(candidate);

    await expect(resolveClientBirthPlaceReference("51485")).resolves.toEqual(candidate);
    expect(get).toHaveBeenCalledWith("/clients/birth-places/geoapify/51485");
  });

  it("encodes a valid opaque reference and rejects malformed provider responses", async () => {
    const get = vi.spyOn(application.http, "get").mockResolvedValue({
      ...placeSearchResponse().candidates[0],
      timezone: "Not/A_Real_Timezone"
    });

    await expect(resolveClientBirthPlaceReference("place~51485")).rejects.toThrow();
    expect(get).toHaveBeenCalledWith("/clients/birth-places/geoapify/place~51485");
  });
});

function placeSearchResponse(): ClientBirthPlaceSearchResponse {
  return {
    candidates: [
      {
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
      }
    ]
  };
}

function response(): AstrologerClientResponse {
  return {
    client: {
      clientUserId,
      displayName: "Марина Краснова",
      relationshipStatus: "active",
      firstLinkedAt: "2026-07-20T12:00:00.000Z",
      lastLinkedAt: "2026-07-20T12:00:00.000Z",
      birthData: {
        id: "55555555-5555-4555-8555-555555555555",
        clientUserId,
        label: "Основные данные",
        birthDate: "1990-07-15",
        birthTime: "10:30",
        birthTimePrecision: "exact",
        birthPlaceText: "Рим, Италия",
        birthCountryCode: "IT",
        birthCity: "Рим",
        birthRegion: "Лацио",
        birthTimezone: "Europe/Rome",
        birthTimeDstOccurrence: null,
        birthLatitude: 41.9028,
        birthLongitude: 12.4964,
        source: "manual",
        revision: 1,
        lastEditedByUserId: clientUserId,
        lastEditedByRole: "client",
        createdAt: "2026-07-20T12:00:00.000Z",
        updatedAt: "2026-07-20T12:00:00.000Z"
      }
    }
  };
}
