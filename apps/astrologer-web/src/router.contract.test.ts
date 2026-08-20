import { describe, expect, it } from "vitest";
import { astrologerRouteContract, astrologerRoutePaths } from "./router.contract";

describe("astrologerRouteContract", () => {
  it("declares the reviews workspace route", () => {
    expect(astrologerRouteContract.protected.reviews).toBe("/reviews");
    expect(astrologerRoutePaths).toContain("/reviews");
  });
});
