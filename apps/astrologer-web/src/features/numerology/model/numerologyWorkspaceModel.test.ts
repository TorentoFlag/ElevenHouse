import type { NumerologyCalculationResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { buildNumerologyWorkspaceModel, getNumerologyDetail } from "./numerologyWorkspaceModel";

describe("numerologyWorkspaceModel", () => {
  it("builds an individual workspace with reference-style key rail, matrix, lines, and detail", () => {
    const model = buildNumerologyWorkspaceModel(individualResponse());
    expect(model).not.toBeNull();
    const workspace = model!;

    expect(workspace.mode).toBe("individual");
    expect(workspace.subject?.displayName).toBe("Марина Краснова");
    expect(workspace.keyNumbers.map((item) => [item.code, item.label, item.from, item.value])).toEqual([
      ["lifePath", "Число жизненного пути", "дата рождения", 9],
      ["expression", "Число выражения", "полное имя", 9],
      ["soul", "Число души", "гласные имени", 3],
      ["personality", "Число личности", "согласные имени", 6],
      ["birthday", "Число дня рождения", "день рождения", 5],
      ["personalYear", "Персональный год 2026", "день, месяц + год", 9]
    ]);
    expect(workspace.matrix?.workingNumbersLabel).toBe("27 · 9 · 25 · 7");
    expect(workspace.matrix?.cells[0]).toMatchObject({
      digit: "1",
      label: "Характер",
      value: "11",
      selector: "cell:1"
    });
    expect(workspace.strengthLines.map((line) => [line.code, line.label, line.value])).toContainEqual([
      "goal",
      "Целеустремленность",
      5
    ]);

    expect(getNumerologyDetail(workspace, "cell:9")).toMatchObject({
      title: "Память и ум · цифра 9",
      value: "999"
    });
    expect(getNumerologyDetail(workspace, "line:goal")).toMatchObject({
      title: "Линия: Целеустремленность",
      value: "5"
    });
  });

  it("builds compatibility workspace with two participant summaries and pair detail", () => {
    const model = buildNumerologyWorkspaceModel(compatibilityResponse());
    expect(model).not.toBeNull();
    const workspace = model!;

    expect(workspace.mode).toBe("compatibility");
    expect(workspace.subject?.displayName).toBe("Марина Краснова");
    expect(workspace.partner?.displayName).toBe("Дмитрий Лебедев");
    expect(workspace.compatibility?.pairNumber).toBe(1);
    expect(workspace.compatibility?.participants.map((participant) => participant.lifePath)).toEqual([
      9,
      1
    ]);
    expect(workspace.compatibility?.matrices).toHaveLength(2);
    expect(workspace.compatibility?.strengthLineComparisons[0]).toMatchObject({
      label: "Целеустремленность",
      valueA: 5,
      valueB: 4
    });
  });
});

function individualResponse(): NumerologyCalculationResponse {
  return response({
    mode: "individual",
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e",
        displayName: "Марина Краснова",
        birthDate: "1990-03-14",
        inputSnapshot: { fullName: "Марина Краснова", birthDate: "1990-03-14" },
        manuallyOverridden: false
      }
    ],
    resultSnapshot: {
      methodCode: "pythagorean",
      methodVersion: "1.0.0",
      participant: { fullName: "Марина Краснова", birthDate: "1990-03-14" },
      keyNumbers: {
        lifePath: 9,
        expression: 9,
        soul: 3,
        personality: 6,
        birthday: 5,
        personalYear: 9
      },
      psychomatrix: {
        sourceDigits: [1, 4, 0, 3, 1, 9, 9, 0],
        workingNumbers: { first: 27, second: 9, third: 25, fourth: 7 },
        cells: {
          "1": "11",
          "2": "22",
          "3": "3",
          "4": "4",
          "5": "5",
          "6": "",
          "7": "77",
          "8": "",
          "9": "999"
        }
      },
      strengthLines: [
        { code: "goal", cells: ["1", "4", "7"], value: 5 },
        { code: "family", cells: ["2", "5", "8"], value: 3 }
      ]
    }
  });
}

function compatibilityResponse(): NumerologyCalculationResponse {
  return response({
    mode: "compatibility",
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e",
        displayName: "Марина Краснова",
        birthDate: "1990-03-14",
        inputSnapshot: { fullName: "Марина Краснова", birthDate: "1990-03-14" },
        manuallyOverridden: false
      },
      {
        role: "partner",
        source: "crm_client",
        clientId: "4ab63db1-4f78-4d59-9b75-c21fc3ec9f6e",
        displayName: "Дмитрий Лебедев",
        birthDate: "1988-07-22",
        inputSnapshot: { fullName: "Дмитрий Лебедев", birthDate: "1988-07-22" },
        manuallyOverridden: false
      }
    ],
    resultSnapshot: {
      methodCode: "pythagorean",
      methodVersion: "1.0.0",
      participants: {
        first: { fullName: "Марина Краснова", birthDate: "1990-03-14" },
        second: { fullName: "Дмитрий Лебедев", birthDate: "1988-07-22" }
      },
      individuals: [
        {
          methodCode: "pythagorean",
          methodVersion: "1.0.0",
          participant: { fullName: "Марина Краснова", birthDate: "1990-03-14" },
          keyNumbers: { lifePath: 9, expression: 9, soul: 3 },
          psychomatrix: {
            sourceDigits: [],
            workingNumbers: { first: 27, second: 9, third: 25, fourth: 7 },
            cells: {
              "1": "11",
              "2": "22",
              "3": "3",
              "4": "4",
              "5": "5",
              "6": "",
              "7": "77",
              "8": "",
              "9": "999"
            }
          },
          strengthLines: []
        },
        {
          methodCode: "pythagorean",
          methodVersion: "1.0.0",
          participant: { fullName: "Дмитрий Лебедев", birthDate: "1988-07-22" },
          keyNumbers: { lifePath: 1, expression: 3, soul: 2 },
          psychomatrix: {
            sourceDigits: [],
            workingNumbers: { first: 36, second: 9, third: 32, fourth: 5 },
            cells: {
              "1": "11",
              "2": "22",
              "3": "333",
              "4": "",
              "5": "",
              "6": "6",
              "7": "77",
              "8": "88",
              "9": "9"
            }
          },
          strengthLines: []
        }
      ],
      pairNumber: 1,
      keyNumberComparisons: [],
      matrixComparisons: [],
      strengthLineComparisons: [{ code: "goal", valueA: 5, valueB: 4, relation: "close" }]
    }
  });
}

function response(input: {
  readonly mode: "individual" | "compatibility";
  readonly participants: NumerologyCalculationResponse["calculation"]["participants"];
  readonly resultSnapshot: Record<string, unknown>;
}): NumerologyCalculationResponse {
  const calculation = {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    module: "numerology",
    mode: input.mode,
    methodCode: "pythagorean",
    currentMethodVersion: "1.0.0",
    title: "Нумерология",
    status: "calculated",
    participants: input.participants,
    versions: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        versionNumber: 1,
        methodVersion: "1.0.0",
        settingsSnapshot: {},
        inputSnapshot: { mode: input.mode },
        resultSnapshot: input.resultSnapshot,
        resultSummary: {},
        resultChecksum: "checksum",
        createdAt: "2026-07-06T00:00:00.000Z"
      }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z"
  };

  const currentVersion = calculation.versions[0]!;

  return {
    calculation,
    currentVersion,
    resultSnapshot: currentVersion.resultSnapshot,
    settingsSnapshot: currentVersion.settingsSnapshot,
    inputSnapshot: currentVersion.inputSnapshot
  } as unknown as NumerologyCalculationResponse;
}
