import { describe, expect, it } from "vitest";
import { CompatibilityWorkspace } from "./CompatibilityWorkspace";
import { CompatibilityComparisonList } from "./CompatibilityComparisonList";
import { CompatibilityParticipants } from "./CompatibilityParticipants";
import { CompatibilitySummary } from "./CompatibilitySummary";
import { DetailPanel } from "./DetailPanel";
import { YearMonthsPanel } from "./YearMonthsPanel";

describe("NumerologyResultPanel component boundaries", () => {
  it("keeps nested result panel components in dedicated modules", () => {
    expect(CompatibilityWorkspace).toBeTypeOf("function");
    expect(CompatibilityComparisonList).toBeTypeOf("function");
    expect(CompatibilityParticipants).toBeTypeOf("function");
    expect(CompatibilitySummary).toBeTypeOf("function");
    expect(DetailPanel).toBeTypeOf("function");
    expect(YearMonthsPanel).toBeTypeOf("function");
  });
});
