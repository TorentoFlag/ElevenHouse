import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const indexCss = readFileSync(fileURLToPath(new URL("./index.css", import.meta.url)), "utf8");

describe("astrologer web global styles", () => {
  it("locks the app root to the viewport and delegates scrolling to layout regions", () => {
    expect(indexCss).toContain("html,\nbody,\n#root {\n  height: 100%;");
    expect(indexCss).toContain("overflow: hidden;");
    expect(indexCss).toContain(".app-shell {\n  display: grid;\n  height: 100vh;\n  box-sizing: border-box;");
    expect(indexCss).not.toContain("min-height: 100vh;");
  });
});
