import "reflect-metadata";
import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { csrfRequiredMetadataKey } from "../security/route-policy/route-security-metadata";
import { ClientProfileController } from "./client-profile.controller";
import type { ClientProfileService } from "./client-profile.service";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const birthDataId = "55555555-5555-4555-8555-555555555555";

describe("ClientProfileController", () => {
  it("declares CSRF requirements for client birth-profile mutations", () => {
    expect(Reflect.getMetadata(csrfRequiredMetadataKey, ClientProfileController.prototype.upsertBirthData)).toBe(
      true
    );
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, ClientProfileController.prototype.createBirthProfile)
    ).toBe(true);
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, ClientProfileController.prototype.updateBirthProfile)
    ).toBe(true);
  });

  it("serves overview and birth profiles for client sessions only", async () => {
    const service = {
      getOverview: vi.fn(async () => ({ summary: { directLinkOnly: true } })),
      listBirthProfiles: vi.fn(async () => ({ profiles: [] }))
    } as unknown as ClientProfileService;
    const controller = new ClientProfileController(service);

    await expect(controller.getOverview(clientRequest(["client"]))).resolves.toMatchObject({
      summary: { directLinkOnly: true }
    });
    await expect(controller.listBirthProfiles(clientRequest(["client"]))).resolves.toEqual({
      profiles: []
    });

    expect(service.getOverview).toHaveBeenCalledWith(clientUserId);
    expect(service.listBirthProfiles).toHaveBeenCalledWith(clientUserId);
    expect(() => controller.getOverview({ headers: {} } as never)).toThrow(UnauthorizedException);
    expect(() => controller.listBirthProfiles(clientRequest(["astrologer"]))).toThrow(
      ForbiddenException
    );
  });

  it("creates and updates client-owned birth profiles", async () => {
    const service = {
      createBirthProfile: vi.fn(async () => ({ id: birthDataId })),
      updateBirthProfile: vi.fn(async () => ({ id: birthDataId }))
    } as unknown as ClientProfileService;
    const controller = new ClientProfileController(service);
    const body = birthProfileRequest({ label: "Я", birthDate: "1990-03-14" });

    await expect(controller.createBirthProfile(clientRequest(["client"]), body)).resolves.toEqual({
      id: birthDataId
    });
    await expect(
      controller.updateBirthProfile(clientRequest(["client"]), birthDataId, body)
    ).resolves.toEqual({ id: birthDataId });

    expect(service.createBirthProfile).toHaveBeenCalledWith(clientUserId, body);
    expect(service.updateBirthProfile).toHaveBeenCalledWith(clientUserId, birthDataId, body);
  });

  it("returns not found when updating a missing birth profile", async () => {
    const controller = new ClientProfileController({
      updateBirthProfile: vi.fn(async () => null)
    } as unknown as ClientProfileService);

    await expect(
      controller.updateBirthProfile(clientRequest(["client"]), birthDataId, birthProfileRequest({ label: "Я" }))
    ).rejects.toBeInstanceOf(NotFoundException);
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
    isPrimary: true
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
