import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";

const landingPageSource = readFileSync(
  fileURLToPath(new URL("./LandingPage.tsx", import.meta.url)),
  "utf8"
);
const landingStylesSource = readFileSync(
  fileURLToPath(new URL("../../styles.css", import.meta.url)),
  "utf8"
);

describe("LandingPage motion", () => {
  it("uses design-system motion for language switching", () => {
    expect(landingPageSource).toContain(
      'from "@elevenhouse/design-system/components/LanguageSwitcher"'
    );
    expect(landingPageSource).toContain('from "@elevenhouse/design-system/motion"');
    expect(landingPageSource).toContain("<LanguageSwitcher");
    expect(landingPageSource).toContain("<MotionText");
    expect(landingPageSource).toContain("transitionKey={`${language}:${scope}:${value}`}");
  });

  it("loads design-system motion styles for the language switcher", () => {
    expect(landingStylesSource).toContain(
      '@import "@elevenhouse/design-system/components/LanguageSwitcher.css";'
    );
  });
});
