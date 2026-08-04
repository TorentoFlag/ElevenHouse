import "reflect-metadata";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { csrfRequiredMetadataKey } from "../security/route-policy/route-security-metadata";
import { ClientConsentsController } from "./client-consents.controller";
import type { ClientConsentsService } from "./client-consents.service";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const consentId = "44444444-4444-4444-8444-444444444444";

describe("ClientConsentsController", () => {
  it("requires CSRF for grant and revoke mutations", () => {
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, ClientConsentsController.prototype.grant)
    ).toBe(true);
    expect(
      Reflect.getMetadata(csrfRequiredMetadataKey, ClientConsentsController.prototype.revoke)
    ).toBe(true);
  });

  it("derives client identity from a client session for every route", async () => {
    const service = {
      list: vi.fn(async () => ({ consents: [] })),
      grant: vi.fn(async () => ({ state: "granted" })),
      revoke: vi.fn(async () => ({ state: "revoked" }))
    } as unknown as ClientConsentsService;
    const controller = new ClientConsentsController(service);
    const request = clientRequest(["client"]);
    const grantBody = {
      accepted: true as const,
      policyVersion: "chart-ai-external-processing.v1" as const,
      noticeSha256: `sha256:${"a".repeat(64)}`,
      locale: "ru" as const
    };

    await controller.list(request, { locale: "ru" });
    await controller.grant(request, astrologerUserId, grantBody);
    await controller.revoke(request, consentId, {});
    await controller.revoke(request, consentId, null as never);

    expect(service.list).toHaveBeenCalledWith(clientUserId, { locale: "ru" });
    expect(service.grant).toHaveBeenCalledWith(clientUserId, astrologerUserId, grantBody);
    expect(service.revoke).toHaveBeenCalledWith(clientUserId, consentId, {});
    expect(service.revoke).toHaveBeenCalledWith(clientUserId, consentId, null);
    expect(() => controller.list({ headers: {} } as never, { locale: "ru" })).toThrow(
      UnauthorizedException
    );
    expect(() => controller.list(clientRequest(["astrologer"]), { locale: "ru" })).toThrow(
      ForbiddenException
    );
  });
});

function clientRequest(roles: readonly string[]) {
  return {
    headers: {},
    currentCustomerAccount: {
      account: { id: clientUserId, status: "active", roles }
    }
  } as never;
}
