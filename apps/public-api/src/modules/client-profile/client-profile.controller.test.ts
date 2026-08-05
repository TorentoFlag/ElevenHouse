import "reflect-metadata";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { csrfRequiredMetadataKey } from "../security/route-policy/route-security-metadata";
import type { ClientBirthPlaceSearchService } from "./client-birth-place-search.service";
import { ClientProfileController } from "./client-profile.controller";
import type { ClientProfileService } from "./client-profile.service";

const clientUserId = "11111111-1111-4111-8111-111111111111";

describe("ClientProfileController", () => {
  it("declares CSRF requirements for the single birth-profile mutation", () => {
    expect(
      Reflect.getMetadata(
        csrfRequiredMetadataKey,
        ClientProfileController.prototype.upsertBirthData
      )
    ).toBe(true);
  });

  it("serves overview for client sessions only", async () => {
    const service = {
      getOverview: vi.fn(async () => ({ summary: { directLinkOnly: true } })),
    } as unknown as ClientProfileService;
    const controller = createController(service);

    await expect(controller.getOverview(clientRequest(["client"]))).resolves.toMatchObject({
      summary: { directLinkOnly: true }
    });
    expect(service.getOverview).toHaveBeenCalledWith(clientUserId);
    expect(() => controller.getOverview({ headers: {} } as never)).toThrow(UnauthorizedException);
    expect(() => controller.getOverview(clientRequest(["astrologer"]))).toThrow(
      ForbiddenException
    );
  });

  it("searches birth places only for an authenticated client owner", async () => {
    const searchBirthPlaces = vi.fn(async () => ({ candidates: [] }));
    const controller = createController(
      {} as ClientProfileService,
      {
        search: searchBirthPlaces
      } as unknown as ClientBirthPlaceSearchService
    );

    await expect(
      controller.searchBirthPlaces(clientRequest(["client"]), { query: "Москва", limit: "3" })
    ).resolves.toEqual({ candidates: [] });
    expect(searchBirthPlaces).toHaveBeenCalledWith(clientUserId, {
      query: "Москва",
      limit: "3"
    });
    expect(() =>
      controller.searchBirthPlaces(clientRequest(["astrologer"]), { query: "Москва" })
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.searchBirthPlaces({ headers: {} } as never, { query: "Москва" })
    ).toThrow(UnauthorizedException);
  });

  it("writes the client-owned singleton birth profile", async () => {
    const service = {
      upsertBirthData: vi.fn(async () => ({ id: "55555555-5555-4555-8555-555555555555" }))
    } as unknown as ClientProfileService;
    const controller = createController(service);
    const body = birthProfileRequest({ label: "Я", birthDate: "1990-03-14" });

    await expect(controller.upsertBirthData(clientRequest(["client"]), body)).resolves.toEqual({
      id: "55555555-5555-4555-8555-555555555555"
    });
    expect(service.upsertBirthData).toHaveBeenCalledWith(clientUserId, body);
  });
});

function birthProfileRequest(
  overrides: Partial<{
    label: string | null;
    birthDate: string | null;
  }> = {}
) {
  return {
    label: overrides.label ?? null,
    birthDate: overrides.birthDate ?? null,
    birthTime: null,
    birthTimePrecision: "unknown" as const,
    birthPlaceText: null,
    birthCountryCode: null,
    birthCity: null,
    birthRegion: null,
    birthTimezone: null,
    birthTimeDstOccurrence: null,
    birthLatitude: null,
    birthLongitude: null,
    expectedRevision: null
  };
}

function clientRequest(roles: readonly string[]) {
  return {
    headers: {},
    currentCustomerAccount: {
      account: {
        id: clientUserId,
        status: "active",
        roles
      }
    }
  } as never;
}

function createController(
  profileService: ClientProfileService,
  birthPlaceSearchService: ClientBirthPlaceSearchService = {
    search: vi.fn(async () => ({ candidates: [] }))
  } as unknown as ClientBirthPlaceSearchService
) {
  return new ClientProfileController(profileService, birthPlaceSearchService);
}
