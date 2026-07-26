import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("astro calendar route registration", () => {
  it("mounts the production astro calendar page at /astro-calendar", () => {
    const source = readFileSync(new URL("../../router.tsx", import.meta.url), "utf8");

    expect(source).toContain('import { AstroCalendarPage } from "./pages/astro-calendar/AstroCalendarPage"');
    expect(source).toContain('path: "/astro-calendar"');
    expect(source).toContain("element: <AstroCalendarPage />");
  });
});
