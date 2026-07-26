import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../../../Application";
import {
  createClientBirthProfile,
  getClientCabinetOverview,
  listClientBirthProfiles,
  updateClientBirthProfile
} from "./clientProfileApi";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const birthDataId = "55555555-5555-4555-8555-555555555555";

describe("clientProfileApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the cabinet overview and birth profiles through validated contracts", async () => {
    const get = vi.spyOn(application.http, "get").mockImplementation(async (path) => {
      if (path === "/me/overview") {
        return {
          astrologers: [],
          birthProfiles: [birthProfile()],
          summary: {
            directLinkOnly: true,
            upcomingBookingCount: 0,
            availableMaterialCount: 0,
            unreadNotificationCount: 0,
            activeSubscriptionCount: 0
          }
        };
      }
      if (path === "/me/birth-profiles") {
        return { profiles: [birthProfile()] };
      }
      throw new Error(`Unexpected GET ${path}`);
    });

    await expect(getClientCabinetOverview()).resolves.toMatchObject({
      summary: { directLinkOnly: true },
      birthProfiles: [{ isPrimary: true }]
    });
    await expect(listClientBirthProfiles()).resolves.toMatchObject({
      profiles: [{ isPrimary: true }]
    });
    expect(get).toHaveBeenCalledWith("/me/overview");
    expect(get).toHaveBeenCalledWith("/me/birth-profiles");
  });

  it("creates and updates birth profiles with CSRF", async () => {
    const post = vi.spyOn(application.http, "post").mockResolvedValue(birthProfile({ label: "Мама" }));
    const put = vi.spyOn(application.http, "put").mockResolvedValue(birthProfile({ label: "Я" }));

    await expect(
      createClientBirthProfile({
        label: "Мама",
        birthDate: "1962-11-05",
        birthTime: null,
        birthTimePrecision: "unknown",
        birthPlaceText: "Тула",
        birthCountryCode: null,
        birthCity: null,
        birthRegion: null,
        birthTimezone: null,
        birthTimeDstOccurrence: null,
        birthLatitude: null,
        birthLongitude: null,
        isPrimary: false
      })
    ).resolves.toMatchObject({ label: "Мама" });

    await expect(
      updateClientBirthProfile(birthDataId, {
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
        isPrimary: true
      })
    ).resolves.toMatchObject({ label: "Я" });

    expect(post).toHaveBeenCalledWith(
      "/me/birth-profiles",
      expect.objectContaining({ label: "Мама", isPrimary: false }),
      { csrf: true }
    );
    expect(put).toHaveBeenCalledWith(
      `/me/birth-profiles/${birthDataId}`,
      expect.objectContaining({ label: "Я", isPrimary: true }),
      { csrf: true }
    );
  });
});

function birthProfile(overrides: Partial<{ label: string; isPrimary: boolean }> = {}) {
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
    isPrimary: overrides.isPrimary ?? true,
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z"
  };
}
