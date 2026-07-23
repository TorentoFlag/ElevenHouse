import { describe, expect, it } from "vitest";
import { HttpError } from "../../../common/http/HttpError";
import {
  getHumanDesignAiDraftErrorMessage,
  getHumanDesignInterpretationState
} from "./humanDesignInterpretationModel";

describe("Human Design interpretation state", () => {
  it("enables AI draft generation only for a saved active calculation", () => {
    expect(getHumanDesignInterpretationState(null, false)).toMatchObject({
      aiDisabled: true,
      aiDisabledReason: "Сначала сохраните расчёт",
      latestText: "",
      latestStatus: null
    });
    expect(getHumanDesignInterpretationState({ ...calculation(), status: "archived" }, false))
      .toMatchObject({
        aiDisabled: true,
        aiDisabledReason: "Архивный расчёт нельзя изменять"
      });
    expect(getHumanDesignInterpretationState(calculation(), true)).toMatchObject({
      aiDisabled: true,
      aiDisabledReason: "Дождитесь завершения текущего действия"
    });
    expect(getHumanDesignInterpretationState(calculation(), false)).toMatchObject({
      aiDisabled: false,
      aiDisabledReason: null,
      latestText: "Сохранённый AI draft",
      latestStatus: "draft"
    });
  });

  it("maps AI draft backend failures to stable Russian messages", () => {
    expect(getHumanDesignAiDraftErrorMessage(new HttpError(409, null))).toContain("изменился");
    expect(getHumanDesignAiDraftErrorMessage(new HttpError(422, null))).toContain("не смог");
    expect(getHumanDesignAiDraftErrorMessage(new HttpError(429, null))).toContain("Лимит");
    expect(getHumanDesignAiDraftErrorMessage(new HttpError(502, null))).toContain("некорректный");
    expect(getHumanDesignAiDraftErrorMessage(new HttpError(503, null))).toContain("недоступен");
    expect(getHumanDesignAiDraftErrorMessage(new Error("boom"))).toBe(
      "Не удалось создать AI-черновик"
    );
  });
});

function calculation() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    module: "human_design" as const,
    mode: "individual" as const,
    methodCode: "human_design_classic",
    title: "Марина Краснова — Дизайн человека",
    status: "linked" as const,
    requestFingerprint: `sha256:${"a".repeat(64)}`,
    inputData: { mode: "individual" },
    resultData: { mode: "individual" },
    resultSummary: { type: "generator" },
    resultChecksum: `sha256:${"b".repeat(64)}`,
    participants: [
      {
        role: "subject" as const,
        source: "crm_client" as const,
        clientId: "33333333-3333-4333-8333-333333333333",
        displayName: "Марина Краснова"
      }
    ],
    links: [],
    interpretations: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        status: "draft" as const,
        text: "Сохранённый AI draft"
      }
    ],
    artifacts: [],
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z"
  };
}
