import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./FlowsPage.module.css", import.meta.url), "utf8");

describe("FlowsPage automation dialog styles", () => {
  it("defines every visual hook used by activation review and pause confirmation", () => {
    const requiredSelectors = [
      "automationDialogBackdrop",
      "automationDialog",
      "automationDialogHeader",
      "automationDialogClose",
      "automationDialogIntro",
      "automationDialogNotice",
      "automationDialogError",
      "automationDialogErrorText",
      "automationReviewState",
      "automationReviewStatusIcon",
      "automationBlockerList",
      "automationPauseBody",
      "automationDialogFooter",
      "automationDialogPrimary",
      "automationDialogSecondary"
    ];

    for (const selector of requiredSelectors) {
      expect(styles, `missing .${selector}`).toContain(`.${selector}`);
    }
  });

  it("keeps the production overlay geometry and a mobile dialog override", () => {
    expect(styles).toMatch(/\.automationDialogBackdrop\s*\{[^}]*position:\s*fixed/s);
    expect(styles).toMatch(/\.automationDialog\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*60px\)/s);
    expect(styles).toMatch(
      /@media[^}]*\{[\s\S]*\.automationDialogBackdrop\s*\{[^}]*place-items:\s*end center/s
    );
  });
});

describe("FlowsPage gallery geometry", () => {
  it("pins the measured desktop card composition", () => {
    expect(styles).toMatch(/\.flowCard\s*\{[^}]*min-height:\s*211\.25px/s);
    expect(styles).toMatch(/\.graphPreview\s*\{[^}]*min-height:\s*64px/s);
    expect(styles).toMatch(/\.cardFooter\s*\{[^}]*height:\s*53\.5px/s);
  });

  it("keeps mobile cards inset by 10px with a 44px switch target", () => {
    expect(styles).toMatch(
      /\.mobileList\s*\{[^}]*width:\s*100vw[^}]*margin-inline:\s*auto[^}]*padding:\s*14px 0 28px/s
    );
    expect(styles).toMatch(
      /\.mobileCard\s*\{[^}]*width:\s*calc\(100% - 20px\)[^}]*margin:\s*0 10px[^}]*border-radius:\s*16px/s
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*700px\)[\s\S]*\.automationToggle\s*\{[^}]*min-height:\s*44px/s
    );
    expect(styles).toMatch(
      /\.mobileCard \.automationToggle::before\s*\{[^}]*inset:\s*8\.75px 0/s
    );
  });
});

describe("FlowsPage create dialog geometry", () => {
  it("keeps the measured primary command glow", () => {
    expect(styles).toMatch(
      /\.createButton,\s*\.mobileOpenButton\s*\{[^}]*box-shadow:\s*rgb\(244 196 48 \/ 0\.42\) 0 0 0 1px,[^}]*rgb\(244 196 48 \/ 0\.4\) 0 10px 26px -10px/s
    );
  });

  it("keeps the mobile blank command fluid below the 390px reference viewport", () => {
    expect(styles).toMatch(
      /@media \(max-width:\s*700px\)[\s\S]*\.createDialogBlank\s*\{[^}]*width:\s*100%[^}]*max-width:\s*316px/s
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*700px\)[\s\S]*\.createDialogClose\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*flex-basis:\s*44px/s
    );
  });
});

describe("FlowsPage builder controls geometry", () => {
  it("keeps the measured 42px zoom control height as a border-box", () => {
    expect(styles).toMatch(
      /\.builderCanvasControls\s*\{[^}]*box-sizing:\s*border-box[^}]*height:\s*42px/s
    );
    expect(styles).toMatch(
      /\.builderCanvasControls button:first-child\s*\{[^}]*font-size:\s*20px/s
    );
  });
});

describe("FlowsPage builder inspector geometry", () => {
  it("matches the measured reference section and field rhythm", () => {
    expect(styles).toMatch(
      /\.builderInspectorSection\s*\{[^}]*padding:\s*18px 20px/s
    );
    expect(styles).toMatch(
      /\.builderField input,[\s\S]*?\.builderField select\s*\{[^}]*min-height:\s*45px[^}]*border:\s*1px solid var\(--flows-line\)[^}]*border-radius:\s*14px[^}]*padding:\s*12px 14px[^}]*background:\s*rgb\(11 11 31\)[^}]*font:\s*15px/s
    );
  });
});

describe("FlowsPage mobile builder geometry", () => {
  it("keeps the builder within the 390px workspace and assigns every header item", () => {
    expect(styles).toMatch(
      /@media \(max-width:\s*700px\)[\s\S]*\.builderPage\s*\{[^}]*max-width:\s*100vw[^}]*margin:\s*-16px -14px 0/s
    );
    expect(styles).not.toContain("@media (max-width: 720px)");
    expect(styles).toMatch(
      /\.builderHeader\s*\{[^}]*grid-template-areas:\s*"back title"\s*"status actions"/s
    );
    expect(styles).toMatch(/\.builderHeaderStatus\s*\{[^}]*grid-area:\s*status/s);
    expect(styles).toMatch(/\.builderActions\s*\{[^}]*grid-area:\s*actions/s);
    expect(styles).toMatch(/\.builderActions\s*\{[^}]*overflow:\s*visible/s);
  });

  it("keeps mobile commands and sheets clear of the fixed navigation", () => {
    expect(styles).toMatch(
      /\.builderMobileActions button\s*\{[^}]*min-height:\s*44px/s
    );
    expect(styles).toMatch(
      /\.builderMobileDialogBackdrop\s*\{[^}]*box-sizing:\s*border-box[^}]*inset:\s*0[^}]*padding:\s*10px 10px calc\(64px \+ env\(safe-area-inset-bottom\)\)/s
    );
    expect(styles).toMatch(
      /\.builderMobileDialog\s*\{[^}]*max-height:\s*calc\(100dvh - 88px - env\(safe-area-inset-bottom\)\)/s
    );
    expect(styles).toMatch(
      /\.builderMobileHistory\s*\{[^}]*padding-bottom:\s*calc\(12px \+ env\(safe-area-inset-bottom\)\)/s
    );
    expect(styles).toMatch(
      /\.builderMobileDialog\s+:global\(\.ehModal__closeButton\)\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s
    );
  });
});
