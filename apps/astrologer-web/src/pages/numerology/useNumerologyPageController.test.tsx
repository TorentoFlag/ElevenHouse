import type {
  CalculationRecordResponse,
  NumerologyCalculationResponse
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../common/http/HttpError";
import { requestNumerologyAiDraft } from "./useNumerologyPageController";

const checksum = `sha256:${"a".repeat(64)}`;
const calculation = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "calculated",
  resultChecksum: checksum,
  interpretations: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      status: "draft",
      text: "Сохранённый текст"
    }
  ]
} as CalculationRecordResponse;
const response = { calculation } as NumerologyCalculationResponse;

describe("Numerology AI draft controller", () => {
  it("sends the selected calculation id and current result checksum", async () => {
    const mutate = vi.fn(async () => response);

    await expect(
      requestNumerologyAiDraft({
        calculation,
        editorText: "Сохранённый текст",
        isBusy: false,
        mutate
      })
    ).resolves.toEqual({ kind: "success", response });
    expect(mutate).toHaveBeenCalledWith({
      calculationId: calculation.id,
      body: { expectedResultChecksum: checksum }
    });
  });

  it("does not invoke generation for dirty or busy state", async () => {
    const mutate = vi.fn(async () => response);

    await expect(
      requestNumerologyAiDraft({
        calculation,
        editorText: "Несохранённый текст",
        isBusy: false,
        mutate
      })
    ).resolves.toEqual({ kind: "skipped" });
    await expect(
      requestNumerologyAiDraft({
        calculation,
        editorText: "Сохранённый текст",
        isBusy: true,
        mutate
      })
    ).resolves.toEqual({ kind: "skipped" });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("returns a safe explicit error without replacing the current response", async () => {
    const mutate = vi.fn(async () => {
      throw new HttpError(503, null);
    });

    await expect(
      requestNumerologyAiDraft({
        calculation,
        editorText: "Сохранённый текст",
        isBusy: false,
        mutate
      })
    ).resolves.toEqual({
      kind: "error",
      message: "AI временно недоступен. Повторите позже"
    });
  });
});
