import type { NumerologyCalculationResponse } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import { buildNumerologyWorkspaceModel, getNumerologyDetail } from "./numerologyWorkspaceModel";

describe("numerologyWorkspaceModel", () => {
  it("builds the individual workspace only from the server result", () => {
    const workspace = buildNumerologyWorkspaceModel(response("individual"))!;

    expect(workspace.subject?.displayName).toBe("Марина Краснова");
    expect(workspace.keyNumbers.map((item) => [item.code, item.label, item.value])).toEqual([
      ["lifePath", "Число жизненного пути", 9],
      ["expression", "Число выражения", 9],
      ["soul", "Число души", 3],
      ["personality", "Число личности", 6],
      ["birthday", "Число дня рождения", 5],
      ["personalYear", "Персональный год 2026", 9]
    ]);
    expect(workspace.personalMonths).toHaveLength(12);
    expect(workspace.matrix?.workingNumbersLabel).toBe("27 · 9 · 25 · 7");
    expect(workspace.strengthLines[0]).toMatchObject({
      code: "goal",
      value: 5,
      level: "Сильная линия"
    });
    expect(getNumerologyDetail(workspace, "cell:9")).toMatchObject({
      title: "Память и ум · цифра 9",
      value: "999"
    });
  });

  it("uses canonical compatibility comparisons", () => {
    const workspace = buildNumerologyWorkspaceModel(response("compatibility"))!;

    expect(workspace.compatibility?.pairNumber).toBe(1);
    expect(workspace.compatibility?.participants[0]).toMatchObject({
      lifePath: 9,
      expression: 9,
      soul: 3,
      personality: 6,
      birthday: 5
    });
    expect(workspace.compatibility?.participants.map((item) => item.lifePath)).toEqual([9, 1]);
    expect(workspace.compatibility?.keyNumberComparisons).toHaveLength(5);
    expect(workspace.compatibility?.matrixComparisons).toHaveLength(9);
    expect(workspace.compatibility?.strengthLineComparisons).toHaveLength(8);
    expect(workspace.compatibility?.zones).toHaveLength(4);
    expect(workspace.compatibility?.counts.total).toEqual({
      match: 3,
      close: 7,
      different: 7,
      tension: 5
    });
    expect(workspace.compatibility?.conclusion).toMatchObject({
      code: "mixed",
      explanation:
        "Совпадения и близкие значения — 10; различия и напряжения — 12. Итог: смешанная совместимость."
    });
    expect(workspace.compatibility?.strengthLineComparisons[0]).toMatchObject({
      label: "Целеустремлённость",
      valueA: 5,
      valueB: 4,
      difference: 1,
      relation: "close",
      relationLabel: "Близкие значения",
      explanation:
        "Целеустремлённость: 5 и 4. Разница — 1. По методике это категория «Близкие значения»."
    });
    expect(getNumerologyDetail(workspace, "compatibility:strength_lines:goal")).toMatchObject({
      title: "Целеустремлённость",
      value: "5 · 4",
      subtitle: "Близкие значения",
      text:
        "Целеустремлённость: 5 и 4. Разница — 1. По методике это категория «Близкие значения»."
    });
    expect(JSON.stringify(workspace.compatibility)).not.toContain("RAW compatibility code");
  });

  it("formats compatibility presentation in the requested English locale", () => {
    const workspace = buildNumerologyWorkspaceModel(
      response("compatibility"),
      null,
      null,
      "en"
    )!;

    expect(workspace.compatibility?.keyNumberComparisons[0]).toMatchObject({
      label: "Life path number",
      relationLabel: "Close values",
      explanation:
        "Life path number: 0 and 1. Difference — 1. The method classifies this as “Close values”."
    });
    expect(workspace.compatibility?.zones[0]).toMatchObject({
      label: "Identity",
      relationLabel: "Close values",
      explanation:
        "Identity. Comparisons: 1. Overall category: “Close values”. Matches: 0; close values: 1; differences: 0; tensions: 0."
    });
    expect(workspace.compatibility?.conclusion).toMatchObject({
      code: "mixed",
      label: "Mixed compatibility",
      explanation:
        "Matches and close values — 10; differences and tensions — 12. Result: mixed compatibility."
    });
    expect(JSON.stringify(workspace.compatibility)).not.toContain("RAW compatibility code");
  });

  it("uses a formula specific to each key number", () => {
    const workspace = buildNumerologyWorkspaceModel(response("individual"))!;

    expect(getNumerologyDetail(workspace, "key:lifePath")?.formula).toBe(
      "Сумма всех цифр даты рождения с последующим сведением числа."
    );
    expect(getNumerologyDetail(workspace, "key:expression")?.formula).toBe(
      "Сумма значений всех букв полного имени по таблице Пифагора."
    );
    expect(getNumerologyDetail(workspace, "key:personalYear")?.formula).toBe(
      "День и месяц рождения плюс цифры выбранного года."
    );
    expect(getNumerologyDetail(workspace, "key:lifePath")?.formula).not.toContain(
      "выбранного периода"
    );
    expect(getNumerologyDetail(workspace, "key:lifePath")?.formula).not.toContain(
      "настройками метода"
    );
  });
});

function response(mode: "individual" | "compatibility"): NumerologyCalculationResponse {
  const result =
    mode === "individual" ? individual("Марина Краснова", "1990-03-14", 9) : compatibility();
  const participantRows =
    mode === "individual"
      ? [participantRow("subject", "Марина Краснова")]
      : [
          participantRow("subject", "Марина Краснова"),
          participantRow("partner", "Дмитрий Лебедев")
        ];
  return {
    calculation: {
      id: "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      module: "numerology",
      mode,
      methodCode: "pythagorean",
      title: "Нумерология",
      status: "calculated",
      requestFingerprint: `sha256:${"a".repeat(64)}`,
      inputData: {},
      resultData: result,
      resultSummary: {},
      resultChecksum: `sha256:${"b".repeat(64)}`,
      participants: participantRows,
      links: [],
      interpretations: [],
      artifacts: [],
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z"
    },
    result
  } as unknown as NumerologyCalculationResponse;
}

function participantRow(role: "subject" | "partner", displayName: string) {
  return {
    role,
    source: "crm_client",
    clientId:
      role === "subject"
        ? "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
        : "4ab63db1-4f78-4d59-9b75-c21fc3ec9f6e",
    displayName
  };
}

function individual(name: string, birthDate: string, lifePath: number) {
  return {
    methodCode: "pythagorean",
    mode: "individual",
    participant: {
      calculationName: name,
      calculationNameSource: "crm_display_name",
      birthDate
    },
    keyNumbers: {
      lifePath,
      birthday: 5,
      expression: lifePath,
      soul: 3,
      personality: 6
    },
    periods: {
      personalYear: { year: 2026, value: 9 },
      personalMonths: Array.from({ length: 12 }, (_, index) => ({
        year: 2026,
        month: index + 1,
        value: (index % 9) + 1
      }))
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
      {
        code: "goal",
        label: "Целеустремленность",
        cells: ["1", "4", "7"],
        value: 5,
        level: "strong",
        levelLabel: "Сильная линия"
      }
    ]
  };
}

function compatibility() {
  const first = individual("Марина Краснова", "1990-03-14", 9);
  const second = individual("Дмитрий Лебедев", "1988-07-22", 1);
  const comparisonGroups = [
    ["key_numbers", ["lifePath", "birthday", "expression", "soul", "personality"]],
    ["psychomatrix", ["1", "2", "3", "4", "5", "6", "7", "8", "9"]],
    [
      "strength_lines",
      ["goal", "family", "stability", "self_esteem", "material", "talent", "spirituality", "temperament"]
    ]
  ] as const;
  return {
    methodCode: "pythagorean",
    mode: "compatibility",
    participants: { first: first.participant, second: second.participant },
    individuals: [first, second],
    pairNumber: 1,
    comparisons: comparisonGroups.flatMap(([block, codes]) =>
      codes.map((code, index) => ({
        block,
        code,
        valueA: block === "strength_lines" && code === "goal" ? 5 : index,
        valueB: block === "strength_lines" && code === "goal" ? 4 : index + 1,
        difference: 1,
        relation: "close",
        explanation: `RAW compatibility code ${block}:${code}`
      }))
    ),
    zones: ["identity", "inner_world", "resources", "dynamics"].map((code) => ({
      code,
      comparisonCodes: ["lifePath"],
      counts: { match: 0, close: 1, different: 0, tension: 0 },
      relation: "close",
      explanation: `RAW compatibility code ${code}`
    })),
    counts: {
      key_numbers: { match: 0, close: 1, different: 3, tension: 1 },
      psychomatrix: { match: 2, close: 4, different: 3, tension: 0 },
      strength_lines: { match: 1, close: 2, different: 1, tension: 4 },
      total: { match: 3, close: 7, different: 7, tension: 5 }
    },
    conclusion: {
      code: "mixed",
      matchAndClose: 10,
      differentAndTension: 12,
      tension: 5,
      explanation: "RAW compatibility code mixed"
    }
  };
}
