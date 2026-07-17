import { describe, expect, it } from "vitest";
import { getCompatibilityComparisonSelection } from "./numerologyCompatibilityExpansionModel";

describe("compatibility comparison expansion", () => {
  const conclusion = "compatibility:conclusion";
  const lifePath = "compatibility:key_numbers:lifePath";
  const birthday = "compatibility:key_numbers:birthday";

  it("opens a closed comparison", () => {
    expect(getCompatibilityComparisonSelection(conclusion, lifePath, conclusion)).toBe(lifePath);
  });

  it("collapses the open comparison back to the conclusion", () => {
    expect(getCompatibilityComparisonSelection(lifePath, lifePath, conclusion)).toBe(conclusion);
  });

  it("switches directly from one comparison to another", () => {
    expect(getCompatibilityComparisonSelection(lifePath, birthday, conclusion)).toBe(birthday);
  });
});
