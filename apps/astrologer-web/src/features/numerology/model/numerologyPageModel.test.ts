import type { NumerologyCalculationResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { createInitialNumerologyForm } from "./numerologyFormModel";
import { buildNumerologyPageViewModel, getCurrentInterpretation } from "./numerologyPageModel";

describe("numerologyPageModel", () => {
  it("selects the latest interpretation of the current result", () => {
    const calculation = {
      ...response().calculation,
      interpretations: [
        interpretation("11111111-1111-4111-8111-111111111111", "Первая"),
        interpretation("22222222-2222-4222-8222-222222222222", "Актуальная")
      ]
    };

    expect(getCurrentInterpretation(calculation)?.id).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("builds publish disabled reason for an unlinked CRM calculation", () => {
    const saved = response();
    const form = createInitialNumerologyForm();

    expect(buildNumerologyPageViewModel(saved, null, form, null, "", false)).toMatchObject({
      publishDisabled: true,
      publishDisabledReason: "Сначала привяжите расчет к клиенту"
    });
  });

  it("blocks AI and approval when the visible interpretation has unsaved changes", () => {
    const base = response();
    const saved = {
      ...base,
      calculation: {
        ...base.calculation,
        interpretations: [
          interpretation("11111111-1111-4111-8111-111111111111", "Сохранённый текст")
        ]
      }
    };

    expect(
      buildNumerologyPageViewModel(saved, null, createInitialNumerologyForm(), null, "Изменено", false)
    ).toMatchObject({
      isAiDraftDisabled: true,
      aiDraftDisabledReason: "Сначала сохраните или отмените изменения",
      isApproveInterpretationDisabled: true,
      isSaveInterpretationDisabled: false
    });
  });
});

function response(): NumerologyCalculationResponse {
  const result = individualResult();
  return {
    calculation: {
      id: "44444444-4444-4444-8444-444444444444",
      ownerUserId: "55555555-5555-4555-8555-555555555555",
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      title: "Мария",
      status: "calculated",
      requestFingerprint: `sha256:${"a".repeat(64)}`,
      inputData: {
        participants: [
          {
            role: "subject",
            source: "crm_client",
            clientId: "66666666-6666-4666-8666-666666666666",
            calculationName: "Мария Иванова",
            calculationNameSource: "crm_display_name",
            birthDate: "1990-03-14"
          }
        ],
        periods: {}
      },
      resultData: result,
      resultSummary: {},
      resultChecksum: `sha256:${"b".repeat(64)}`,
      participants: [
        {
          role: "subject",
          source: "crm_client",
          clientId: "66666666-6666-4666-8666-666666666666",
          displayName: "Мария Иванова"
        }
      ],
      links: [],
      interpretations: [],
      artifacts: [],
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z"
    },
    result
  } as NumerologyCalculationResponse;
}

function individualResult(): NumerologyCalculationResponse["result"] {
  return {
    methodCode: "pythagorean",
    mode: "individual",
    participant: {
      calculationName: "Мария Иванова",
      calculationNameSource: "crm_display_name",
      birthDate: "1990-03-14"
    },
    keyNumbers: { lifePath: 9, birthday: 5, expression: 9, soul: 3, personality: 6 },
    periods: {},
    psychomatrix: {
      sourceDigits: [1, 4, 0, 3, 1, 9, 9, 0],
      workingNumbers: { first: 27, second: 9, third: 25, fourth: 7 },
      cells: {
        "1": "11",
        "2": "",
        "3": "3",
        "4": "4",
        "5": "",
        "6": "",
        "7": "7",
        "8": "",
        "9": "999"
      }
    },
    strengthLines: [] as never
  } as NumerologyCalculationResponse["result"];
}

function interpretation(id: string, text: string) {
  return {
    id,
    source: "manual" as const,
    status: "draft" as const,
    text,
    modelId: null,
    promptVersion: null,
    approvedAt: null
  };
}
