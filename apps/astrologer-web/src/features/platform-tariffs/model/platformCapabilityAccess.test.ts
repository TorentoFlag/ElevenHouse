import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import { isPlatformCapabilityDenied } from "./platformCapabilityAccess";

describe("platform capability access", () => {
  it("recognizes the current entitlement denial and the legacy rolling-deploy response", () => {
    expect(
      isPlatformCapabilityDenied(
        new HttpError(403, { code: "entitlement_required", capability: "products" })
      )
    ).toBe(true);
    expect(
      isPlatformCapabilityDenied(
        new HttpError(403, { code: "platform_capability_denied", capability: "products" })
      )
    ).toBe(true);
    expect(isPlatformCapabilityDenied(new HttpError(403, { code: "other" }))).toBe(false);
    expect(
      isPlatformCapabilityDenied(new HttpError(500, { code: "platform_capability_denied" }))
    ).toBe(false);
  });
});
