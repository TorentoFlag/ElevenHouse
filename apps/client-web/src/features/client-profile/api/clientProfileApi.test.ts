import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import {
  getClientCabinetOverview,
  searchClientBirthPlaces,
  upsertClientBirthData
} from "./clientProfileApi";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const birthDataId = "55555555-5555-4555-8555-555555555555";

describe("clientProfileApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the cabinet overview and its singleton birth profile through validated contracts", async () => {
    const get = vi.spyOn(application.http, "get").mockImplementation(async (path) => {
      if (path === "/me/overview") {
        return {
          astrologers: [],
          birthData: birthProfile(),
          summary: {
            directLinkOnly: true,
            upcomingBookingCount: 0,
            availableMaterialCount: 0,
            unreadNotificationCount: 0,
            activeSubscriptionCount: 0
          }
        };
      }
      throw new Error(`Unexpected GET ${path}`);
    });

    await expect(getClientCabinetOverview()).resolves.toMatchObject({
      summary: { directLinkOnly: true },
      birthData: { revision: 1 }
    });
    expect(get).toHaveBeenCalledWith("/me/overview");
  });

  it("upserts the singleton birth profile with CSRF and its expected revision", async () => {
    const put = vi.spyOn(application.http, "put").mockResolvedValue(birthProfile({ label: "Я" }));

    await expect(
      upsertClientBirthData({
        label: "Я",
        birthDate: "1990-03-14",
        birthTime: "08:25",
        birthTimePrecision: "exact",
        birthPlaceText: "Москва",
        birthCountryCode: null,
        birthCity: null,
        birthRegion: null,
        birthTimezone: null,
        birthTimeDstOccurrence: null,
        birthLatitude: null,
        birthLongitude: null,
        expectedRevision: 1
      })
    ).resolves.toMatchObject({ label: "Я" });

    expect(put).toHaveBeenCalledWith(
      "/me/birth-data",
      expect.objectContaining({ label: "Я", expectedRevision: 1 }),
      { csrf: true }
    );
  });

  it("searches validated client birth places with request cancellation support", async () => {
    const controller = new AbortController();
    const get = vi.spyOn(application.http, "get").mockResolvedValue({
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
    });

    await expect(
      searchClientBirthPlaces({ query: "  Rome   Italy  ", limit: 3 }, controller.signal)
    ).resolves.toMatchObject({ candidates: [{ timezone: "Europe/Rome" }] });
    expect(get).toHaveBeenCalledWith("/me/birth-places?query=Rome+Italy&limit=3", {
      signal: controller.signal
    });
  });
});

function birthProfile(overrides: Partial<{ label: string }> = {}) {
  return {
    id: birthDataId,
    clientUserId,
    label: overrides.label ?? "Я",
    birthDate: "1990-03-14",
    birthTime: "08:25",
    birthTimePrecision: "exact",
    birthPlaceText: "Москва",
    birthCountryCode: null,
    birthCity: null,
    birthRegion: null,
    birthTimezone: null,
    birthTimeDstOccurrence: null,
    birthLatitude: null,
    birthLongitude: null,
    source: "client_profile",
    revision: 1,
    lastEditedByUserId: clientUserId,
    lastEditedByRole: "client",
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z"
  };
}
