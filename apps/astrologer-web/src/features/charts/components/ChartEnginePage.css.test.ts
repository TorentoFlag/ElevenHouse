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
const horarySetupCss = readFileSync(
  new URL("./ChartHorarySetup.module.css", import.meta.url),
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

  it("keeps the horary setup panel reachable before the preparation canvas at compact widths", () => {
    const compactRules = horarySetupCss.slice(
      horarySetupCss.indexOf("@container chart-engine-page (max-width: 760px)")
    );

    expect(compactRules).toMatch(/\.setupPanel\s*\{[\s\S]*?min-height:\s*620px/);
  });

  it("uses the chart gold for horary input hover and focus instead of browser defaults", () => {
    expect(momentControlsCss).toMatch(
      /\.horaryQuestionFieldsSetup input:hover[^,{]*,[\s\S]*?border-color:\s*rgb\(246 210 102 \/ 0\.48\)/
    );
    expect(momentControlsCss).toMatch(
      /\.horaryQuestionFieldsSetup input:focus,[\s\S]*?border-color:\s*var\(--chart-gold\)/
    );
    expect(momentControlsCss).toMatch(
      /\.horaryQuestionFieldsSetup input:focus,[\s\S]*?outline:\s*2px solid var\(--chart-gold\)/
    );
    expect(momentControlsCss).toMatch(
      /\.horaryQuestionFieldsSetup input:focus,[\s\S]*?box-shadow:\s*0 0 0 4px rgb\(246 210 102 \/ 0\.14\)/
    );
  });

  it("stacks the three horary setup sections instead of inheriting the toolbar grid", () => {
    const setupRules = momentControlsCss.slice(
      momentControlsCss.indexOf(".horaryQuestionFieldsSetup"),
      momentControlsCss.indexOf(".horaryToolbarGroup")
    );

    expect(setupRules).toMatch(/grid-template-columns:\s*1fr/);
  });

  it("keeps setup-only group headings out of the compact horary toolbar", () => {
    expect(momentControlsCss).toMatch(
      /\.horaryToolbarGroup \.horarySetupGroupTitle\s*\{[\s\S]*?display:\s*none/
    );
  });
});
