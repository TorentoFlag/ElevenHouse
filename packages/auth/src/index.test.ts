import { describe, expect, it } from "vitest";
import { isPlatformRole } from "./index";

describe("isPlatformRole", () => {
  it("accepts known platform roles", () => {
    expect(isPlatformRole("astrologer")).toBe(true);
  });

  it("rejects unknown roles", () => {
    expect(isPlatformRole("owner")).toBe(false);
  });
});
