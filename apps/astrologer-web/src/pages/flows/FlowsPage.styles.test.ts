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
      /@media \(max-width:\s*720px\)[\s\S]*\.automationToggle\s*\{[^}]*min-height:\s*44px/s
    );
    expect(styles).toMatch(
      /\.mobileCard \.automationToggle::before\s*\{[^}]*inset:\s*8\.75px 0/s
    );
  });
});

describe("FlowsPage create dialog geometry", () => {
  it("keeps the mobile blank command fluid below the 390px reference viewport", () => {
    expect(styles).toMatch(
      /@media \(max-width:\s*720px\)[\s\S]*\.createDialogBlank\s*\{[^}]*width:\s*100%[^}]*max-width:\s*316px/s
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
