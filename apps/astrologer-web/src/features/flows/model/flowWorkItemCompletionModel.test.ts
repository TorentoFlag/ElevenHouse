import { describe, expect, it } from "vitest";

import { resolveFlowWorkItemCompletionDraft } from "./flowWorkItemCompletionModel";

describe("flow work-item completion model", () => {
  it("requires a non-empty summary when the pinned task requires one", () => {
    expect(
      resolveFlowWorkItemCompletionDraft({
        resultSummary: "   ",
        requirement: "required"
      })
    ).toEqual({
      canSubmit: false,
      resultSummary: undefined,
      validation: "required",
      characterCount: 0
    });
  });

  it("trims a valid summary before it becomes command identity", () => {
    expect(
      resolveFlowWorkItemCompletionDraft({
        resultSummary: "  Карта и вопросы проверены  ",
        requirement: "required"
      })
    ).toEqual({
      canSubmit: true,
      resultSummary: "Карта и вопросы проверены",
      validation: null,
      characterCount: 25
    });
  });

  it("omits an empty optional summary and rejects values above the contract limit", () => {
    expect(
      resolveFlowWorkItemCompletionDraft({ resultSummary: "", requirement: "optional" })
    ).toEqual({
      canSubmit: true,
      resultSummary: undefined,
      validation: null,
      characterCount: 0
    });
    expect(
      resolveFlowWorkItemCompletionDraft({
        resultSummary: "x".repeat(1_001),
        requirement: "optional"
      })
    ).toMatchObject({ canSubmit: false, validation: "too_long", characterCount: 1_001 });
  });
});
