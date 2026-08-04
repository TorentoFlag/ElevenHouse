// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalculationRecordResponse, ChartResult } from "@elevenhouse/contracts";
import { application } from "../../../Application";
import { HttpError } from "../../../common/http/HttpError";
import { ChartAiPanel } from "./ChartAiPanel";

const calculationId = "44444444-4444-4444-8444-444444444444";
const otherCalculationId = "55555555-5555-4555-8555-555555555555";
const initialInterpretationId = "66666666-6666-4666-8666-666666666666";
const checksum = `sha256:${"a".repeat(64)}`;

describe("ChartAiPanel manual save idempotency", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not instruct the astrologer to request client consent for a legacy response", async () => {
    const user = userEvent.setup();
    vi.spyOn(application.http, "get").mockResolvedValue(calculationRecord(calculationId));
    vi.spyOn(application.http, "post").mockRejectedValue(
      new HttpError(403, { code: "CHART_AI_CONSENT_REQUIRED" })
    );

    renderPanel(calculationId);
    await screen.findByRole("textbox");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Сгенерировать заново" })).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: "Сгенерировать заново" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось создать AI-черновик");
  });

  it.each([
    ["transport failure", new Error("network interrupted")],
    ["server outcome uncertainty", new HttpError(503, null)],
    [
      "typed in-progress response",
      new HttpError(409, { code: "CALCULATION_INTERPRETATION_SAVE_IN_PROGRESS" })
    ],
    [
      "typed unknown outcome",
      new HttpError(503, { code: "CALCULATION_INTERPRETATION_SAVE_OUTCOME_UNKNOWN" })
    ]
  ])("reuses one manual-save resource UUID after %s", async (_label, firstFailure) => {
    const user = userEvent.setup();
    vi.spyOn(application.http, "get").mockResolvedValue(calculationRecord(calculationId));
    const post = vi
      .spyOn(application.http, "post")
      .mockRejectedValueOnce(firstFailure)
      .mockResolvedValueOnce(calculationRecord(calculationId, "Проверено и дополнено"));

    renderPanel(calculationId);
    const editor = await screen.findByRole("textbox");
    await waitFor(() => expect(editor).toHaveValue("Проверено"));
    await user.type(editor, " и дополнено");
    await user.click(screen.getByRole("button", { name: "Сохранить правки" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Сохранить правки" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    const firstKey = manualSaveKey(post.mock.calls[0]);
    const secondKey = manualSaveKey(post.mock.calls[1]);
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(secondKey).toBe(firstKey);
  });

  it("starts a new resource after content changes or a terminal conflict", async () => {
    const user = userEvent.setup();
    vi.spyOn(application.http, "get").mockResolvedValue(calculationRecord(calculationId));
    const post = vi
      .spyOn(application.http, "post")
      .mockRejectedValueOnce(new Error("network interrupted"))
      .mockRejectedValueOnce(
        new HttpError(409, {
          code: "CALCULATION_INTERPRETATION_IDEMPOTENCY_CONFLICT"
        })
      )
      .mockResolvedValueOnce(calculationRecord(calculationId, "Третья версия"));

    renderPanel(calculationId);
    const editor = await screen.findByRole("textbox");
    await waitFor(() => expect(editor).toHaveValue("Проверено"));
    await user.clear(editor);
    await user.type(editor, "Вторая версия");
    await user.click(screen.getByRole("button", { name: "Сохранить правки" }));
    await screen.findByRole("alert");
    await user.clear(editor);
    await user.type(editor, "Третья версия");
    await user.click(screen.getByRole("button", { name: "Сохранить правки" }));
    await user.click(screen.getByRole("button", { name: "Сохранить правки" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(3));

    const keys = post.mock.calls.map(manualSaveKey);
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("starts a new resource when the calculation identity changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(application.http, "get").mockImplementation(async (path) =>
      path === `/calculations/${otherCalculationId}`
        ? calculationRecord(otherCalculationId)
        : calculationRecord(calculationId)
    );
    const post = vi.spyOn(application.http, "post").mockRejectedValue(new Error("offline"));
    const view = renderPanel(calculationId);
    const editor = await screen.findByRole("textbox");
    await waitFor(() => expect(editor).toHaveValue("Проверено"));
    await user.type(editor, " один");
    await user.click(screen.getByRole("button", { name: "Сохранить правки" }));
    await screen.findByRole("alert");

    view.rerender(panel(otherCalculationId));
    await waitFor(() => expect(editor).toHaveValue("Проверено"));
    await user.type(editor, " два");
    await user.click(screen.getByRole("button", { name: "Сохранить правки" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    expect(manualSaveKey(post.mock.calls[1])).not.toBe(manualSaveKey(post.mock.calls[0]));
  });
});

function renderPanel(calculationIdValue: string) {
  return render(panel(calculationIdValue));
}

function panel(calculationIdValue: string) {
  return (
    <ChartAiPanel
      calculationId={calculationIdValue}
      isBusy={false}
      isResultStale={false}
      result={{ method: "natal" } as ChartResult}
    />
  );
}

function manualSaveKey(call: readonly unknown[] | undefined): unknown {
  const path = call?.[0];
  return typeof path === "string" && path.startsWith("/calculations/")
    ? (call?.[2] as { headers?: Record<string, string> } | undefined)?.headers?.["idempotency-key"]
    : undefined;
}

function calculationRecord(id: string, text = "Проверено"): CalculationRecordResponse {
  return {
    id,
    ownerUserId: "11111111-1111-4111-8111-111111111111",
    module: "chart",
    mode: "individual",
    interpretationMode: "adult_natal",
    methodCode: "natal",
    title: "QA Natal",
    status: "calculated",
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: checksum,
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId: "22222222-2222-4222-8222-222222222222",
        displayName: "Марина"
      }
    ],
    links: [],
    interpretations: [{ id: initialInterpretationId, status: "draft", text }],
    artifacts: [],
    createdAt: "2026-08-03T10:00:00.000Z",
    updatedAt: "2026-08-03T10:00:00.000Z"
  };
}
