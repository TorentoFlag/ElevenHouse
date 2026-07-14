import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  NumerologyWorkspaceCompatibilityComparison,
  NumerologyWorkspaceModel
} from "../../features/numerology/model/numerologyWorkspaceModel";
import { CompatibilityNumerologyPresentation } from "./CompatibilityNumerologyPresentation";
import { IndividualNumerologyPresentation } from "./IndividualNumerologyPresentation";
import { NumerologyPresentationDialog } from "./NumerologyPresentationDialog";

describe("Numerology presentation", () => {
  it("renders the complete individual result and current manual interpretation", () => {
    const markup = renderToStaticMarkup(
      <IndividualNumerologyPresentation
        model={individualModel}
        isPeriodVisible
        interpretationText="Ручная трактовка астролога"
      />
    );

    expect(markup.match(/data-key-number=/g)).toHaveLength(5);
    expect(markup).toContain("Число дня рождения");
    expect(markup).toContain("Личный год 2027");
    expect(markup.match(/data-personal-month=/g)).toHaveLength(12);
    expect(markup.match(/data-matrix-cell=/g)).toHaveLength(9);
    expect(markup.match(/data-strength-line=/g)).toHaveLength(8);
    expect(markup).toContain("Ручная трактовка астролога");
    expect(markup).not.toContain("/ 10");
  });

  it("omits the selected period and blank interpretation when they are not presented", () => {
    const markup = renderToStaticMarkup(
      <IndividualNumerologyPresentation
        model={individualModel}
        isPeriodVisible={false}
        interpretationText="   "
      />
    );

    expect(markup).not.toContain("data-personal-year");
    expect(markup).not.toContain("data-personal-month");
    expect(markup).not.toContain("Трактовка астролога");
  });

  it("renders every compatibility evidence block and the server conclusion", () => {
    const markup = renderToStaticMarkup(
      <CompatibilityNumerologyPresentation
        model={compatibilityModel}
        interpretationText="Совместная трактовка"
      />
    );

    expect(markup).toContain("Голубев Антон");
    expect(markup).toContain("Кошкина Яна Владимировна");
    expect(markup).toContain("Число пары");
    expect(markup.match(/data-participant-number=/g)).toHaveLength(10);
    expect(markup.match(/data-key-comparison=/g)).toHaveLength(5);
    expect(markup.match(/data-matrix-comparison=/g)).toHaveLength(9);
    expect(markup.match(/data-line-comparison=/g)).toHaveLength(8);
    expect(markup.match(/data-compatibility-zone=/g)).toHaveLength(4);
    expect(markup.match(/data-relation-counts=/g)).toHaveLength(4);
    expect(markup).toContain("Совпадения");
    expect(markup).toContain("Близкие");
    expect(markup).toContain("Различия");
    expect(markup).toContain("Напряжения");
    expect(markup).toContain("Смешанная совместимость");
    expect(markup).toContain("Итог сформирован сервером");
    expect(markup).toContain("Совместная трактовка");
  });

  it("uses the shared accessible modal shell", () => {
    const markup = renderToStaticMarkup(
      <NumerologyPresentationDialog
        model={individualModel}
        isPeriodVisible
        interpretationText=""
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Закрыть презентацию"');
    expect(markup).toContain("Голубев Антон · Нумерологический портрет");
  });
});

const keyNumbers = [
  ["lifePath", "Число жизненного пути", 2],
  ["expression", "Число выражения", 6],
  ["soul", "Число души", 6],
  ["personality", "Число личности", 9],
  ["birthday", "Число дня рождения", 1]
] as const;

const individualModel = {
  mode: "individual",
  title: "Голубев Антон, психоматрица",
  status: "preview",
  subject: {
    role: "subject",
    clientId: "11111111-1111-4111-8111-111111111111",
    displayName: "Голубев Антон",
    initials: "ГА",
    birthDate: "2000-08-19",
    sourceLabel: "CRM-клиент"
  },
  partner: null,
  keyNumbers: [
    ...keyNumbers.map(([code, label, value]) => ({
      code,
      selector: `key:${code}`,
      label,
      from: "данные клиента",
      value,
      meaning: { essence: `Смысл ${value}`, text: `Описание ${value}` }
    })),
    {
      code: "personalYear",
      selector: "key:personalYear",
      label: "Персональный год 2027",
      from: "день, месяц + год",
      value: 3,
      meaning: { essence: "Творчество", text: "Описание личного года" }
    }
  ],
  matrix: {
    workingNumbersLabel: "20 · 2 · 18 · 9",
    cells: Array.from({ length: 9 }, (_, index) => ({
      digit: String(index + 1),
      selector: `cell:${index + 1}`,
      label: `Ячейка ${index + 1}`,
      value: index === 0 ? "11" : String(index + 1),
      count: index === 0 ? 2 : 1,
      text: `Описание ячейки ${index + 1}`
    }))
  },
  strengthLines: Array.from({ length: 8 }, (_, index) => ({
    code: `line_${index + 1}`,
    selector: `line:line_${index + 1}`,
    label: `Линия ${index + 1}`,
    value: index,
    cells: ["1", "2", "3"],
    level: "умеренная",
    levelCode: "moderate",
    text: `Описание линии ${index + 1}`
  })),
  personalYear: { year: 2027, value: 3 },
  personalMonths: Array.from({ length: 12 }, (_, index) => ({
    year: 2027,
    month: index + 1,
    value: (index % 9) + 1
  })),
  compatibility: null,
  defaultSelector: "key:lifePath"
} satisfies NumerologyWorkspaceModel;

const comparisonCodes = {
  key: ["lifePath", "expression", "soul", "personality", "birthday"],
  matrix: Array.from({ length: 9 }, (_, index) => `digit_${index + 1}`),
  lines: Array.from({ length: 8 }, (_, index) => `line_${index + 1}`)
};

const compatibilityModel = {
  ...individualModel,
  mode: "compatibility",
  title: "Голубев Антон + Кошкина Яна Владимировна",
  partner: {
    role: "partner",
    clientId: "22222222-2222-4222-8222-222222222222",
    displayName: "Кошкина Яна Владимировна",
    initials: "КЯ",
    birthDate: "2002-03-16",
    sourceLabel: "CRM-клиент"
  },
  personalYear: null,
  personalMonths: [],
  compatibility: {
    pairNumber: 7,
    pairMeaning: { essence: "Поиск, глубина", text: "Смысл числа пары" },
    participants: [
      participant("Голубев Антон", "ГА", [2, 6, 6, 9, 1]),
      participant("Кошкина Яна Владимировна", "КЯ", [5, 7, 9, 7, 7])
    ],
    matrices: [],
    keyNumberComparisons: comparisonCodes.key.map((code) => comparison("key_numbers", code)),
    matrixComparisons: comparisonCodes.matrix.map((code) => comparison("psychomatrix", code)),
    strengthLineComparisons: comparisonCodes.lines.map((code) =>
      comparison("strength_lines", code)
    ),
    zones: (["identity", "inner_world", "resources", "dynamics"] as const).map((code, index) => ({
      selector: `compatibility:zone:${code}`,
      code,
      label: `Зона ${index + 1}`,
      comparisonCodes: [`comparison_${index + 1}`],
      counts: { match: 1, close: 1, different: 1, tension: 1 },
      relation: "different" as const,
      relationLabel: "Различие",
      explanation: `Описание зоны ${index + 1}`
    })),
    counts: {
      key_numbers: { match: 0, close: 1, different: 3, tension: 1 },
      psychomatrix: { match: 2, close: 4, different: 3, tension: 0 },
      strength_lines: { match: 1, close: 2, different: 1, tension: 4 },
      total: { match: 3, close: 7, different: 7, tension: 5 }
    },
    conclusion: {
      selector: "compatibility:conclusion",
      code: "mixed",
      label: "Смешанная совместимость",
      matchAndClose: 10,
      differentAndTension: 12,
      tension: 5,
      explanation: "Итог сформирован сервером"
    }
  },
  defaultSelector: "compatibility:conclusion"
} satisfies NumerologyWorkspaceModel;

function participant(
  displayName: string,
  initials: string,
  values: readonly [number, number, number, number, number]
) {
  return {
    displayName,
    initials,
    lifePath: values[0],
    expression: values[1],
    soul: values[2],
    personality: values[3],
    birthday: values[4]
  };
}

function comparison(
  block: NumerologyWorkspaceCompatibilityComparison["block"],
  code: string
): NumerologyWorkspaceCompatibilityComparison {
  return {
    selector: `compatibility:${block}:${code}`,
    block,
    code,
    label: `Сравнение ${code}`,
    valueA: 4,
    valueB: 2,
    difference: 2,
    relation: "different",
    relationLabel: "Различие",
    explanation: `Описание сравнения ${code}`
  };
}
