import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const tokensCss = readFileSync(fileURLToPath(new URL("../tokens.css", import.meta.url)), "utf8");

describe("design-system CSS tokens", () => {
  it("defines a reusable moon border alpha token", () => {
    expect(tokensCss).toContain(
      "--eh-color-moon-300-alpha-14: rgba(216, 212, 236, 0.14);"
    );
  });

  it("defines a reusable gold alpha token", () => {
    expect(tokensCss).toContain("--eh-color-gold-alpha-14: rgba(244, 196, 48, 0.14);");
  });
});
