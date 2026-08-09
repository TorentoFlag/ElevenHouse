import { HEADERS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { AstrologerTariffsController } from "./platform-tariffs.controller";

describe("AstrologerTariffsController", () => {
  it("prevents authenticated entitlement projections from being cached", () => {
    expect(
      Reflect.getMetadata(HEADERS_METADATA, AstrologerTariffsController.prototype.getEntitlements)
    ).toContainEqual({ name: "Cache-Control", value: "no-store" });
    expect(
      Reflect.getMetadata(HEADERS_METADATA, AstrologerTariffsController.prototype.getEntitlements)
    ).toContainEqual({ name: "ETag", value: '""' });
  });
});
