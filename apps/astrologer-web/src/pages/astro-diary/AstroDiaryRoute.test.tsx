import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("astro diary route registration", () => {
  it("mounts the production astro diary page at /astro-diary", () => {
    const source = readFileSync(new URL("../../router.tsx", import.meta.url), "utf8");

    expect(source).toContain('import { AstroDiaryPage } from "./pages/astro-diary/AstroDiaryPage"');
    expect(source).toContain("path: astrologerRouteContract.protected.astroDiary");
    expect(source).toContain("element: <AstroDiaryPage />");
  });
});
