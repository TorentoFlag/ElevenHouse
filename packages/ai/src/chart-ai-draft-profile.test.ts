import { describe, expect, it } from "vitest";
import { resolveChartAiDraftProfile } from "./chart-ai-draft-profile";

describe("chart AI draft profiles", () => {
  it.each([
    ["natal", "adult", "натальной карты"],
    ["transit", "adult", "транзитной карты"],
    ["progression", "adult", "прогрессивной карты"],
    ["synastry", "adult", "синастрии"],
    ["composite", "adult", "композитной карты"],
    ["solar_return", "adult", "соляра"],
    ["astrocartography", "adult", "астрографии"],
    ["horary", "adult", "хорарной карты"]
  ] as const)("selects a dedicated %s profile", (method, subjectKind, expectedPhrase) => {
    const profile = resolveChartAiDraftProfile({ method, subjectKind });

    expect(profile.method).toBe(method);
    expect(profile.renderSystemInstruction("ru")).toContain(expectedPhrase);
  });

  it("keeps child natal lifecycle-compatible while selecting child-safe wording", () => {
    const adult = resolveChartAiDraftProfile({ method: "natal", subjectKind: "adult" });
    const child = resolveChartAiDraftProfile({ method: "natal", subjectKind: "child" });

    expect(child.method).toBe(adult.method);
    expect(child.outputContractVersion).toBe(adult.outputContractVersion);
    expect(child.renderSystemInstruction("ru")).toContain("ребёнка");
    expect(child.renderSystemInstruction("ru")).not.toBe(adult.renderSystemInstruction("ru"));
  });
});
