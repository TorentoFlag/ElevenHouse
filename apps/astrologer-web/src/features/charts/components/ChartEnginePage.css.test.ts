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

  it("defines the accepted responsive chart layout breakpoints", () => {
    const desktopRulesStart = css.indexOf(".body {");
    const desktopRules = css.slice(
      desktopRulesStart,
      css.indexOf(".relatedProfileEditor", desktopRulesStart)
    );
    const actionMenuRulesStart = css.indexOf(".actionMenu {");
    const actionMenuRules = css.slice(
      actionMenuRulesStart,
      css.indexOf(".calculateButton,", actionMenuRulesStart)
    );
    const wideCompactRules = css.slice(css.indexOf("@container chart-engine-page (max-width: 1680px)"));
    const tabletRules = css.slice(css.indexOf("@container chart-engine-page (max-width: 1024px)"));
    const mobileRules = css.slice(css.indexOf("@container chart-engine-page (max-width: 768px)"));

    expect(desktopRules).toMatch(
      /grid-template-columns:\s*minmax\(190px,\s*218px\) minmax\(0,\s*1fr\) minmax\(300px,\s*340px\)/
    );
    expect(css).toMatch(/\.panelTabs\s*\{[\s\S]*?flex-wrap:\s*wrap/);
    expect(actionMenuRules).toMatch(/\.actionMenuTrigger\s*\{[\s\S]*?display:\s*inline-flex/);
    expect(actionMenuRules).toMatch(/\.actionMenuPanel\s*\{[\s\S]*?position:\s*absolute/);
    expect(wideCompactRules).toMatch(/\.toolbarSpacer\s*\{[\s\S]*?display:\s*none/);
    expect(tabletRules).toMatch(/\.body\s*\{[\s\S]*?display:\s*grid/);
    expect(tabletRules).toMatch(/\.body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(tabletRules).toMatch(/\.railToggle\s*\{[\s\S]*?display:\s*flex/);
    expect(tabletRules).toMatch(/\.wheelSvg\s*\{[\s\S]*?aspect-ratio:\s*1/);
    expect(tabletRules).toMatch(/\.panel\s*\{[\s\S]*?grid-row:\s*3/);
    expect(mobileRules).toMatch(/\.calculateButton\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
    expect(mobileRules).toMatch(/\.actionMenu\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
    expect(mobileRules).toMatch(/\.actionMenuTrigger\s*\{[\s\S]*?box-sizing:\s*border-box/);
    expect(mobileRules).toMatch(/\.panelTabs\s*\{[\s\S]*?overflow-x:\s*hidden/);
  });

  it("keeps chart scrollbars visually integrated with the dark interface", () => {
    expect(css).toMatch(/--chart-scrollbar-thumb:\s*rgb\(186 178 218 \/ 0\.36\)/);
    expect(css).toMatch(/--chart-scrollbar-track:\s*transparent/);
    expect(css).toMatch(/\.scrollSurface\s*\{[\s\S]*?scrollbar-color:\s*var\(--chart-scrollbar-thumb\) var\(--chart-scrollbar-track\)/);
    expect(css).toMatch(/\.scrollSurface::-webkit-scrollbar-track\s*\{[\s\S]*?background:\s*var\(--chart-scrollbar-track\)/);
    expect(css).toMatch(/\.rail,[\s\S]*?\.panel,[\s\S]*?\.body,[\s\S]*?\.railContent,[\s\S]*?\.relatedProfileEditor,[\s\S]*?\.horaryPrecalculation,[\s\S]*?\.horaryPreparationSettings,[\s\S]*?\.presentationBody\s*\{[\s\S]*?scrollbar-color:\s*var\(--chart-scrollbar-thumb\) var\(--chart-scrollbar-track\)/);
    expect(css).toMatch(/\.rail,[\s\S]*?\.panel\s*\{[\s\S]*?overflow-x:\s*hidden/);
    expect(css).toMatch(/\.railContent\s*\{[\s\S]*?overflow-x:\s*hidden/);
    expect(css).toMatch(/\.aspectMatrix\s*\{[\s\S]*?overflow-x:\s*hidden/);
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

  it("keeps all horary footer actions visible instead of clipping the settings button", () => {
    expect(horarySetupCss).toMatch(/\.actions\s*\{[\s\S]*?flex-wrap:\s*wrap/);
    expect(horarySetupCss).toMatch(
      /\.actions :global\(button:first-of-type\)\s*\{[\s\S]*?flex:\s*1 1 220px/
    );
    expect(horarySetupCss).toMatch(
      /\.actions :global\(button:not\(:first-of-type\)\)\s*\{[\s\S]*?flex:\s*0 0 auto/
    );
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

  it("allows horary pickers to overlay the preview instead of clipping them", () => {
    expect(momentControlsCss).toMatch(
      /\.horaryPickerOverlay\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*1000/
    );
  });
});
