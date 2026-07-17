import type {
  NumerologyAiLocale,
  NumerologyInterpretationDraftPromptInput
} from "@elevenhouse/ai";
import type {
  PythagoreanCompatibilityResult,
  PythagoreanIndividualResult
} from "@elevenhouse/domain";
import {
  formatNumerologyComparison,
  formatNumerologyConclusion,
  formatNumerologyZone
} from "@elevenhouse/numerology-presentation";

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function buildNumerologyAiContext(
  result: PythagoreanIndividualResult | PythagoreanCompatibilityResult,
  locale: NumerologyAiLocale
): NumerologyInterpretationDraftPromptInput {
  if (result.mode === "individual") {
    return {
      locale,
      methodCode: "pythagorean",
      mode: "individual",
      ...toNumericProfile(result),
      periods: {
        personalYear: result.periods.personalYear ?? null,
        personalMonths: [...(result.periods.personalMonths ?? [])],
        personalDay: result.periods.personalDay
          ? { value: result.periods.personalDay.value }
          : null
      }
    };
  }

  return {
    locale,
    methodCode: "pythagorean",
    mode: "compatibility",
    individuals: [toNumericProfile(result.individuals[0]), toNumericProfile(result.individuals[1])],
    pairNumber: result.pairNumber,
    comparisons: result.comparisons.map((comparison) => ({
      block: comparison.block,
      code: comparison.code,
      valueA: comparison.valueA,
      valueB: comparison.valueB,
      difference: comparison.difference,
      relation: comparison.relation,
      explanation: formatNumerologyComparison(comparison, locale)
    })),
    zones: result.zones.map((zone) => ({
      code: zone.code,
      counts: zone.counts,
      relation: zone.relation,
      explanation: formatNumerologyZone(zone, locale)
    })),
    counts: result.counts,
    conclusion: {
      ...result.conclusion,
      explanation: formatNumerologyConclusion(result.conclusion, locale)
    }
  };
}

function toNumericProfile(result: PythagoreanIndividualResult) {
  return {
    keyNumbers: result.keyNumbers,
    psychomatrix: {
      workingNumbers: result.psychomatrix.workingNumbers,
      cellCounts: Object.fromEntries(
        digits.map((digit) => [digit, result.psychomatrix.cells[digit].length])
      ) as Record<(typeof digits)[number], number>
    },
    strengthLines: result.strengthLines.map(({ code, label, value, level, levelLabel }) => ({
      code,
      label,
      value,
      level,
      levelLabel
    }))
  };
}
