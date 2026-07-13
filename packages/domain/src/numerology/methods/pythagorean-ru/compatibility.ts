import type {
  NumerologyRelation,
  PythagoreanComparison,
  PythagoreanComparisonBlock,
  PythagoreanCompatibilityConclusion,
  PythagoreanCompatibilityZone,
  PythagoreanIndividualResult,
  PythagoreanRelationCounts
} from "../../numerology-types";
import { DIGITS } from "./profile";
import { reduceScalar } from "./reduction";

const KEY_CODES = ["lifePath", "birthday", "expression", "soul", "personality"] as const;
const RELATIONS: readonly NumerologyRelation[] = ["match", "close", "different", "tension"];

export function calculateCompatibility(
  first: PythagoreanIndividualResult,
  second: PythagoreanIndividualResult
) {
  const comparisons = [
    ...KEY_CODES.map((code) =>
      comparison(
        "key_numbers",
        code,
        first.keyNumbers[code],
        second.keyNumbers[code],
        classifyKeyDifference
      )
    ),
    ...DIGITS.map((digit) =>
      comparison(
        "psychomatrix",
        `digit_${digit}`,
        first.psychomatrix.cells[digit].length,
        second.psychomatrix.cells[digit].length,
        classifyCountDifference
      )
    ),
    ...first.strengthLines.map((line, index) =>
      comparison(
        "strength_lines",
        line.code,
        line.value,
        second.strengthLines[index]?.value ?? 0,
        classifyCountDifference
      )
    )
  ];
  const counts = {
    key_numbers: countRelations(comparisons.filter((item) => item.block === "key_numbers")),
    psychomatrix: countRelations(comparisons.filter((item) => item.block === "psychomatrix")),
    strength_lines: countRelations(comparisons.filter((item) => item.block === "strength_lines")),
    total: countRelations(comparisons)
  };
  return {
    pairNumber: reduceScalar(first.keyNumbers.lifePath + second.keyNumbers.lifePath),
    comparisons,
    zones: buildZones(comparisons),
    counts,
    conclusion: conclude(counts.total)
  };
}

function comparison(
  block: PythagoreanComparisonBlock,
  code: string,
  valueA: number,
  valueB: number,
  classify: (difference: number) => NumerologyRelation
): PythagoreanComparison {
  const difference = Math.abs(valueA - valueB);
  const relation = classify(difference);
  return {
    block,
    code,
    valueA,
    valueB,
    difference,
    relation,
    explanation: explain(block, code, difference, relation)
  };
}

function classifyKeyDifference(difference: number): NumerologyRelation {
  if (difference === 0) return "match";
  if (difference === 1) return "close";
  if (difference <= 3) return "different";
  return "tension";
}

function classifyCountDifference(difference: number): NumerologyRelation {
  if (difference === 0) return "match";
  if (difference === 1) return "close";
  if (difference === 2) return "different";
  return "tension";
}

function countRelations(comparisons: readonly PythagoreanComparison[]): PythagoreanRelationCounts {
  return Object.fromEntries(
    RELATIONS.map((relation) => [
      relation,
      comparisons.filter((comparison) => comparison.relation === relation).length
    ])
  ) as Record<NumerologyRelation, number>;
}

function buildZones(
  comparisons: readonly PythagoreanComparison[]
): readonly PythagoreanCompatibilityZone[] {
  const definitions: readonly {
    code: PythagoreanCompatibilityZone["code"];
    codes: readonly string[];
  }[] = [
    { code: "identity", codes: ["lifePath", "birthday", "expression"] },
    { code: "inner_world", codes: ["soul", "personality"] },
    { code: "resources", codes: DIGITS.map((digit) => `digit_${digit}`) },
    {
      code: "dynamics",
      codes: comparisons.filter((item) => item.block === "strength_lines").map((item) => item.code)
    }
  ];
  return definitions.map((definition) => {
    const selected = comparisons.filter((item) => definition.codes.includes(item.code));
    const counts = countRelations(selected);
    const relation = classifyZone(counts);
    return {
      code: definition.code,
      comparisonCodes: selected.map((item) => `${item.block}:${item.code}`),
      counts,
      relation,
      explanation: `Зона ${definition.code}: ${selected.length} сравнений, итог ${relation}.`
    };
  });
}

function classifyZone(counts: PythagoreanRelationCounts): NumerologyRelation {
  if (counts.tension >= counts.match + counts.close && counts.tension > 0) return "tension";
  if (counts.different + counts.tension === 0) return "match";
  if (counts.match + counts.close > counts.different + counts.tension) return "close";
  return "different";
}

function conclude(counts: PythagoreanRelationCounts): PythagoreanCompatibilityConclusion {
  const matchAndClose = counts.match + counts.close;
  const differentAndTension = counts.different + counts.tension;
  const code =
    matchAndClose > differentAndTension
      ? "harmonious"
      : counts.tension >= matchAndClose
        ? "attention"
        : "mixed";
  return {
    code,
    matchAndClose,
    differentAndTension,
    tension: counts.tension,
    explanation: `Совпадения и близкие значения: ${matchAndClose}; различия и напряжения: ${differentAndTension}; вывод: ${code}.`
  };
}

function explain(
  block: PythagoreanComparisonBlock,
  code: string,
  difference: number,
  relation: NumerologyRelation
): string {
  return `Блок ${block}, показатель ${code}: разница ${difference}, отношение ${relation}.`;
}
