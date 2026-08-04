import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./ChartEnginePage.module.css", import.meta.url), "utf8");
const birthDataCss = readFileSync(
  new URL("./ChartBirthDataEditor.module.css", import.meta.url),
  "utf8"
);
const momentControlsCss = readFileSync(
  new URL("./ChartMomentControls.module.css", import.meta.url),
  "utf8"
);

describe("Chart Engine responsive accessibility CSS", () => {
  it("keeps mobile controls operable and the page within the viewport", () => {
    const compactContainerRules = css.slice(
      css.indexOf("@container chart-engine-page (max-width: 760px)")
    );
    const mobileRules = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(compactContainerRules).toMatch(/\.modeActive,[\s\S]*?min-height:\s*44px/);
    expect(compactContainerRules).toMatch(/\.calculateButton,[\s\S]*?min-height:\s*44px/);
    expect(mobileRules).toMatch(/\.modeActive,[\s\S]*?min-height:\s*44px/);
    expect(mobileRules).toMatch(/\.calculateButton,[\s\S]*?min-height:\s*44px/);
    expect(mobileRules).toMatch(/\.page\s*\{[\s\S]*?overflow-x:\s*hidden/);
  });

  it("keeps extracted moment and birth-data controls usable at compact widths", () => {
    for (const responsivePrefix of [
      "@container chart-engine-page (max-width: 760px)",
      "@media (max-width: 760px)"
    ]) {
      const momentRules = momentControlsCss.slice(momentControlsCss.indexOf(responsivePrefix));
      const birthRules = birthDataCss.slice(birthDataCss.indexOf(responsivePrefix));

      expect(momentRules).toMatch(/\.transitMomentFields,[\s\S]*?grid-template-columns:\s*1fr/);
      expect(momentRules).toMatch(/\.transitMomentFields input,[\s\S]*?min-height:\s*44px/);
      expect(birthRules).toMatch(/\.birthDateDay,[\s\S]*?min-height:\s*44px/);
      expect(birthRules).toMatch(/\.birthPlaceCandidates button,[\s\S]*?min-height:\s*44px/);
    }
  });

  it("shows keyboard focus on every Chart Engine action family", () => {
    expect(css).toMatch(/\.modeButton:focus-visible/);
    expect(css).toMatch(/\.calculateButton:focus-visible/);
    expect(css).toMatch(/\.toolButton:focus-visible/);
    expect(css).toMatch(/\.panelTab:focus-visible/);
    expect(css).toMatch(/\.chartAiPrimaryButton:focus-visible/);
  });
});
