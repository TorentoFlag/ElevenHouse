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
