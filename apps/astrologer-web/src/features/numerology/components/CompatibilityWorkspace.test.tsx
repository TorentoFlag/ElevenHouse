import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  NumerologyWorkspaceCompatibilityComparison,
  NumerologyWorkspaceModel
} from "../model/numerologyWorkspaceModel";
import { CompatibilityWorkspace } from "./CompatibilityWorkspace";

describe("CompatibilityWorkspace", () => {
  it("renders every compatibility evidence section and all five participant numbers", () => {
    const markup = renderToStaticMarkup(
      <CompatibilityWorkspace
        model={model}
        selectedSelector="compatibility:conclusion"
        interpretationText=""
        isBusy={false}
        isApproveInterpretationDisabled
        isSaveInterpretationDisabled
        onInterpretationChange={vi.fn()}
        onSaveInterpretation={vi.fn()}
        onApproveInterpretation={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(markup).toContain("Число личности");
    expect(markup).toContain("Число дня рождения");
    expect(markup).toContain('aria-label="Ключевые числа пары"');
    expect(markup).toContain('aria-label="Сравнение психоматриц"');
    expect(markup).toContain('aria-label="Линии совместимости"');
    expect(markup).toContain('aria-label="Зоны совместимости"');
    expect(markup).toContain("Итог совместимости");
    expect(markup).toContain("3 совпадения");
    expect(markup).toContain("7 близких");
    expect(markup).toContain("7 различий");
    expect(markup).toContain("5 напряжений");
  });
});

const comparisons = {
  keyNumberComparisons: [comparison("key_numbers", "lifePath", "Число жизненного пути")],
  matrixComparisons: [comparison("psychomatrix", "digit_1", "Характер · цифра 1")],
  strengthLineComparisons: [
    comparison("strength_lines", "goal", "Целеустремлённость")
  ]
};

const model = {
  mode: "compatibility",
  title: "Совместимость",
  status: "preview",
  subject: null,
  partner: null,
  keyNumbers: [],
  matrix: null,
  strengthLines: [],
  personalYear: null,
  personalMonths: [],
  compatibility: {
    pairNumber: 7,
    pairMeaning: { essence: "Поиск, глубина", text: "Сила числа в анализе." },
    participants: [
      {
        displayName: "Кошкина Яна Владимировна",
        initials: "КЯ",
        lifePath: 5,
        expression: 7,
        soul: 9,
        personality: 7,
        birthday: 7
      },
      {
        displayName: "Голубев Антон",
        initials: "ГА",
        lifePath: 2,
        expression: 6,
        soul: 6,
        personality: 9,
        birthday: 1
      }
    ],
    matrices: [],
    ...comparisons,
    zones: [
      {
        selector: "compatibility:zone:identity",
        code: "identity",
        label: "Идентичность",
        comparisonCodes: ["key_numbers:lifePath"],
        counts: { match: 0, close: 1, different: 2, tension: 0 },
        relation: "different",
        relationLabel: "Различие",
        explanation: "Зона идентичности"
      }
    ],
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
      explanation: "Смешанная совместимость"
    }
  },
  defaultSelector: "compatibility:conclusion"
} satisfies NumerologyWorkspaceModel;

function comparison(
  block: NumerologyWorkspaceCompatibilityComparison["block"],
  code: string,
  label: string
): NumerologyWorkspaceCompatibilityComparison {
  return {
    selector: `compatibility:${block}:${code}`,
    block,
    code,
    label,
    valueA: 4,
    valueB: 2,
    difference: 2,
    relation: "different",
    relationLabel: "Различие",
    explanation: "Значения различаются"
  };
}
