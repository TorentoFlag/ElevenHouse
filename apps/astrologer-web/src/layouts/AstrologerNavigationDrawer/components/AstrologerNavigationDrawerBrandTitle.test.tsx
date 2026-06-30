import { describe, expect, it } from "vitest";
import { AstrologerNavigationDrawerBrandTitle } from "./AstrologerNavigationDrawerBrandTitle";

describe("AstrologerNavigationDrawerBrandTitle", () => {
  it("accents the House segment in the brand title", () => {
    const element = AstrologerNavigationDrawerBrandTitle({
      title: "ElevenHouse"
    });

    expect(JSON.stringify(element)).toContain("Eleven");
    expect(JSON.stringify(element)).toContain("House");
    expect(JSON.stringify(element)).toContain("ehNavigationDrawer__brandTitleAccent");
  });

  it("returns plain title when accent segment is absent", () => {
    expect(
      AstrologerNavigationDrawerBrandTitle({
        title: "Eleven"
      })
    ).toBe("Eleven");
  });
});
