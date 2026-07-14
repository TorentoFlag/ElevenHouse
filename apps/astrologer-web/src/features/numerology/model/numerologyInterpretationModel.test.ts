import { describe, expect, it } from "vitest";
import type { CalculationRecordResponse } from "@elevenhouse/contracts";
import { HttpError } from "../../../common/http/HttpError";
import {
  getNumerologyAiDraftErrorMessage,
  getNumerologyInterpretationState
} from "./numerologyInterpretationModel";

const calculation = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "calculated",
  interpretations: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      status: "draft",
      text: "Сохранённый текст"
    }
  ]
} as CalculationRecordResponse;

describe("Numerology interpretation state", () => {
  it("enables AI for a clean saved draft and blocks approval for dirty text", () => {
    const clean = getNumerologyInterpretationState(calculation, "Сохранённый текст", false);
    expect(clean).toMatchObject({
      isDirty: false,
      aiDisabled: false,
      aiDisabledReason: null,
      approveDisabled: false,
      saveDisabled: true
    });

    const dirty = getNumerologyInterpretationState(calculation, "Изменённый текст", false);
    expect(dirty).toMatchObject({
      isDirty: true,
      aiDisabled: true,
      aiDisabledReason: "Сначала сохраните или отмените изменения",
      approveDisabled: true,
      saveDisabled: false
    });
  });

  it("blocks AI for previews, archived calculations and busy state", () => {
    expect(getNumerologyInterpretationState(null, "", false).aiDisabledReason).toBe(
      "Сначала сохраните расчёт"
    );
    expect(
      getNumerologyInterpretationState({ ...calculation, status: "archived" }, "", false)
        .aiDisabledReason
    ).toBe("Архивный расчёт нельзя изменять");
    expect(getNumerologyInterpretationState(calculation, "Сохранённый текст", true)).toMatchObject({
      aiDisabled: true,
      approveDisabled: true,
      saveDisabled: true
    });
  });

  it("maps provider and checksum errors to explicit user messages", () => {
    expect(getNumerologyAiDraftErrorMessage(new HttpError(409, null))).toContain("изменился");
    expect(getNumerologyAiDraftErrorMessage(new HttpError(422, null))).toContain("не смог");
    expect(getNumerologyAiDraftErrorMessage(new HttpError(429, null))).toContain("Лимит");
    expect(getNumerologyAiDraftErrorMessage(new HttpError(502, null))).toContain("некорректный");
    expect(getNumerologyAiDraftErrorMessage(new HttpError(503, null))).toContain("недоступен");
    expect(getNumerologyAiDraftErrorMessage(new Error("network"))).toBe(
      "Не удалось создать AI-черновик"
    );
  });
});
