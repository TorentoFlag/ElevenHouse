import { afterEach, describe, expect, it, vi } from "vitest";
import type { AstrologerClientResponse } from "@elevenhouse/contracts";
import { application } from "../../../Application";
import { updateClientBirthData } from "./clientsApi";

const clientUserId = "22222222-2222-4222-8222-222222222222";

describe("clientsApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("updates related client birth data through a CSRF-protected route", async () => {
    const put = vi.spyOn(application.http, "put").mockResolvedValue(response());

    await expect(
      updateClientBirthData(clientUserId, {
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
});

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
        createdAt: "2026-07-20T12:00:00.000Z",
        updatedAt: "2026-07-20T12:00:00.000Z"
      }
    }
  };
}
