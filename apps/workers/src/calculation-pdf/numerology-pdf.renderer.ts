import type {
  NumerologyComparison,
  NumerologyCompatibilityZone,
  NumerologyRelation,
  NumerologyRelationCounts,
  PythagoreanCompatibilityResult,
  PythagoreanIndividualResult
} from "@elevenhouse/contracts";
import type { NumerologyPdfDocument } from "./calculation-pdf.documents";
import { createPdfLayout } from "./pdf-layout";

type KeyValue = { readonly label: string; readonly value: string };

export type NumerologyPdfBlock =
  | {
      readonly kind: "section";
      readonly heading: string;
      readonly text: string;
      readonly muted?: boolean;
    }
  | { readonly kind: "list"; readonly heading: string; readonly items: readonly string[] }
  | { readonly kind: "key_values"; readonly heading: string; readonly items: readonly KeyValue[] }
  | {
      readonly kind: "table";
      readonly heading: string;
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
    };

export type NumerologyPdfRenderer = {
  readonly render: (
    document: NumerologyPdfDocument
  ) => Promise<{ readonly bytes: Buffer; readonly pageCount: number }>;
};

export function createNumerologyPdfRenderer(
  input: {
    readonly regularFontBytes?: Uint8Array;
    readonly semiboldFontBytes?: Uint8Array;
  } = {}
): NumerologyPdfRenderer {
  return {
    render: async (document) => {
      const labels = document.locale === "ru" ? ru : en;
      const layout = await createPdfLayout({
        locale: document.locale,
        title: labels.title,
        creator: "ElevenHouse Numerology",
        createdAt: document.createdAt,
        ...input
      });
      layout.drawCover(
        labels.title,
        document.result.mode === "individual"
          ? labels.individualSubtitle
          : labels.compatibilitySubtitle
      );
      for (const block of buildNumerologyPdfContent(document)) {
        if (block.kind === "section") {
          layout.drawSection(block.heading, block.text, block.muted);
        } else if (block.kind === "list") {
          layout.drawList(block.heading, block.items);
        } else if (block.kind === "key_values") {
          layout.drawKeyValues(block.heading, block.items);
        } else {
          layout.drawTable(block.heading, block.headers, block.rows);
        }
      }
      return layout.save();
    }
  };
}

export function buildNumerologyPdfContent(
  document: NumerologyPdfDocument
): readonly NumerologyPdfBlock[] {
  const labels = document.locale === "ru" ? ru : en;
  const blocks: NumerologyPdfBlock[] = [];
  if (document.result.mode === "individual") {
    blocks.push(
      {
        kind: "key_values",
        heading: labels.calculation,
        items: [
          { label: labels.calculationTitle, value: document.calculationTitle },
          { label: labels.participant, value: document.result.participant.calculationName },
          { label: labels.birthDate, value: document.result.participant.birthDate }
        ]
      },
      ...individualBlocks(document.result, labels)
    );
  } else {
    blocks.push(
      {
        kind: "key_values",
        heading: labels.compatibilityCalculation,
        items: [
          { label: labels.calculationTitle, value: document.calculationTitle },
          {
            label: labels.firstParticipant,
            value: document.result.participants.first.calculationName
          },
          {
            label: labels.secondParticipant,
            value: document.result.participants.second.calculationName
          },
          { label: labels.pairNumber, value: String(document.result.pairNumber) }
        ]
      },
      ...individualBlocks(
        document.result.individuals[0],
        labels,
        document.result.participants.first.calculationName
      ),
      ...individualBlocks(
        document.result.individuals[1],
        labels,
        document.result.participants.second.calculationName
      ),
      ...compatibilityBlocks(document.result, labels)
    );
  }
  if (document.approvedInterpretation?.trim()) {
    blocks.push({
      kind: "section",
      heading: labels.approvedInterpretation,
      text: document.approvedInterpretation
    });
  }
  return blocks;
}

function individualBlocks(
  result: PythagoreanIndividualResult,
  labels: Labels,
  participantName?: string
): readonly NumerologyPdfBlock[] {
  const heading = (value: string) => (participantName ? `${value} — ${participantName}` : value);
  const periods: KeyValue[] = [
    {
      label: labels.personalYear,
      value: result.periods.personalYear
        ? `${result.periods.personalYear.year}: ${result.periods.personalYear.value}`
        : labels.notCalculated
    },
    {
      label: labels.personalDay,
      value: result.periods.personalDay
        ? `${result.periods.personalDay.date}: ${result.periods.personalDay.value}`
        : labels.notCalculated
    }
  ];
  const monthRows = (result.periods.personalMonths ?? []).map((month) => [
    labels.months[month.month - 1] ?? String(month.month),
    String(month.year),
    String(month.value)
  ]);
  const blocks: NumerologyPdfBlock[] = [
    {
      kind: "key_values",
      heading: heading(labels.profile),
      items: [
        { label: labels.participant, value: result.participant.calculationName },
        { label: labels.birthDate, value: result.participant.birthDate }
      ]
    },
    {
      kind: "key_values",
      heading: heading(labels.keyNumbers),
      items: [
        { label: labels.lifePath, value: String(result.keyNumbers.lifePath) },
        { label: labels.birthday, value: String(result.keyNumbers.birthday) },
        { label: labels.expression, value: String(result.keyNumbers.expression) },
        { label: labels.soul, value: String(result.keyNumbers.soul) },
        { label: labels.personality, value: String(result.keyNumbers.personality) }
      ]
    },
    { kind: "key_values", heading: heading(labels.periods), items: periods }
  ];
  if (monthRows.length > 0) {
    blocks.push({
      kind: "table",
      heading: heading(labels.personalMonths),
      headers: [labels.month, labels.year, labels.value],
      rows: monthRows
    });
  }
  blocks.push(
    {
      kind: "key_values",
      heading: heading(labels.sourceData),
      items: [
        {
          label: labels.sourceDigits,
          value: result.psychomatrix.sourceDigits.join(" ")
        }
      ]
    },
    {
      kind: "key_values",
      heading: heading(labels.workingNumbers),
      items: [
        { label: labels.first, value: String(result.psychomatrix.workingNumbers.first) },
        { label: labels.second, value: String(result.psychomatrix.workingNumbers.second) },
        { label: labels.third, value: String(result.psychomatrix.workingNumbers.third) },
        { label: labels.fourth, value: String(result.psychomatrix.workingNumbers.fourth) }
      ]
    },
    {
      kind: "table",
      heading: heading(labels.psychomatrix),
      headers: [labels.digit, labels.repetitions, labels.count],
      rows: digits.map((digit) => [
        digit,
        result.psychomatrix.cells[digit] || "—",
        String(result.psychomatrix.cells[digit].length)
      ])
    },
    {
      kind: "table",
      heading: heading(labels.strengthLines),
      headers: [labels.line, labels.cells, labels.value, labels.level],
      rows: result.strengthLines.map((line) => [
        labels.lineLabels[line.code] ?? line.label,
        line.cells.join("–"),
        String(line.value),
        labels.levelLabels[line.level]
      ])
    }
  );
  return blocks;
}

function compatibilityBlocks(
  result: PythagoreanCompatibilityResult,
  labels: Labels
): readonly NumerologyPdfBlock[] {
  return [
    {
      kind: "key_values",
      heading: labels.compatibilitySummary,
      items: [{ label: labels.pairNumber, value: String(result.pairNumber) }]
    },
    {
      kind: "table",
      heading: labels.comparisons,
      headers: [
        labels.block,
        labels.indicator,
        labels.firstShort,
        labels.secondShort,
        labels.difference,
        labels.relation,
        labels.explanation
      ],
      rows: result.comparisons.map((comparison) => comparisonRow(comparison, labels))
    },
    {
      kind: "table",
      heading: labels.zones,
      headers: [labels.zone, labels.comparisonsCount, labels.relation, labels.counts],
      rows: result.zones.map((zone) => zoneRow(zone, labels))
    },
    {
      kind: "table",
      heading: labels.totalCounts,
      headers: [labels.block, labels.match, labels.close, labels.different, labels.tension],
      rows: (Object.keys(result.counts) as Array<keyof typeof result.counts>).map((block) => [
        labels.blockLabels[block],
        String(result.counts[block].match),
        String(result.counts[block].close),
        String(result.counts[block].different),
        String(result.counts[block].tension)
      ])
    },
    {
      kind: "key_values",
      heading: labels.conclusion,
      items: [
        { label: labels.result, value: labels.conclusionLabels[result.conclusion.code] },
        { label: labels.matchAndClose, value: String(result.conclusion.matchAndClose) },
        {
          label: labels.differentAndTension,
          value: String(result.conclusion.differentAndTension)
        },
        { label: labels.tension, value: String(result.conclusion.tension) }
      ]
    },
    {
      kind: "section",
      heading: labels.conclusionText,
      text: labels.conclusionExplanation(result.conclusion)
    }
  ];
}

function comparisonRow(comparison: NumerologyComparison, labels: Labels): readonly string[] {
  const indicator = indicatorLabel(comparison, labels);
  return [
    labels.blockLabels[comparison.block],
    indicator,
    String(comparison.valueA),
    String(comparison.valueB),
    String(comparison.difference),
    labels.relationLabels[comparison.relation],
    labels.comparisonExplanation(indicator, comparison)
  ];
}

function indicatorLabel(comparison: NumerologyComparison, labels: Labels): string {
  if (comparison.block === "psychomatrix") {
    return `${labels.digit} ${comparison.code.replace("digit_", "")}`;
  }
  return labels.indicatorLabels[comparison.code] ?? comparison.code;
}

function zoneRow(zone: NumerologyCompatibilityZone, labels: Labels): readonly string[] {
  return [
    labels.zoneLabels[zone.code],
    String(zone.comparisonCodes.length),
    labels.relationLabels[zone.relation],
    formatCounts(zone.counts, labels)
  ];
}

function formatCounts(counts: NumerologyRelationCounts, labels: Labels): string {
  return `${labels.match}: ${counts.match}; ${labels.close}: ${counts.close}; ${labels.different}: ${counts.different}; ${labels.tension}: ${counts.tension}`;
}

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const ruRelationLabels: Readonly<Record<NumerologyRelation, string>> = {
  match: "Совпадение",
  close: "Близкие значения",
  different: "Различие",
  tension: "Напряжение"
};

const ru = {
  title: "Нумерология",
  individualSubtitle: "Персональный аналитический отчёт",
  compatibilitySubtitle: "Аналитический отчёт о совместимости",
  calculation: "Участник расчёта",
  compatibilityCalculation: "Расчёт совместимости",
  calculationTitle: "Название расчёта",
  participant: "Участник",
  firstParticipant: "Первый участник",
  secondParticipant: "Второй участник",
  birthDate: "Дата рождения",
  profile: "Профиль участника",
  keyNumbers: "Ключевые числа",
  lifePath: "Число жизненного пути",
  birthday: "Число дня рождения",
  expression: "Число выражения",
  soul: "Число души",
  personality: "Число личности",
  periods: "Периоды",
  personalYear: "Персональный год",
  personalMonths: "Персональные месяцы",
  personalDay: "Персональный день",
  month: "Месяц",
  year: "Год",
  value: "Значение",
  notCalculated: "Не рассчитан",
  sourceData: "Исходные данные психоматрицы",
  sourceDigits: "Исходные цифры",
  workingNumbers: "Рабочие числа",
  first: "Первое",
  second: "Второе",
  third: "Третье",
  fourth: "Четвёртое",
  psychomatrix: "Психоматрица",
  digit: "Цифра",
  repetitions: "Повторы",
  count: "Количество",
  strengthLines: "Линии силы",
  line: "Линия",
  cells: "Ячейки",
  level: "Уровень",
  approvedInterpretation: "Подтверждённая интерпретация",
  pairNumber: "Число пары",
  compatibilitySummary: "Сводка совместимости",
  comparisons: "22 сравнения",
  block: "Блок",
  indicator: "Показатель",
  firstShort: "A",
  secondShort: "B",
  difference: "Разница",
  relation: "Отношение",
  explanation: "Пояснение",
  zones: "Зоны совместимости",
  zone: "Зона",
  comparisonsCount: "Сравнений",
  counts: "Количество отношений",
  totalCounts: "Итоговые количества",
  match: "Совпадение",
  close: "Близкие",
  different: "Различия",
  tension: "Напряжение",
  conclusion: "Итог совместимости",
  result: "Результат",
  matchAndClose: "Совпадения и близкие",
  differentAndTension: "Различия и напряжения",
  conclusionText: "Вывод",
  months: [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь"
  ],
  levelLabels: {
    absent: "Линия не выражена",
    weak: "Слабая выраженность",
    moderate: "Умеренная выраженность",
    expressed: "Выраженная линия",
    strong: "Сильная линия"
  },
  relationLabels: ruRelationLabels,
  zoneLabels: {
    identity: "Идентичность",
    inner_world: "Внутренний мир",
    resources: "Ресурсы",
    dynamics: "Динамика"
  },
  conclusionLabels: {
    harmonious: "Гармоничная совместимость",
    mixed: "Смешанная совместимость",
    attention: "Совместимость требует внимания"
  },
  blockLabels: {
    key_numbers: "Ключевые числа",
    psychomatrix: "Психоматрица",
    strength_lines: "Линии силы",
    total: "Всего"
  },
  lineLabels: {
    goal: "Целеустремлённость",
    family: "Семейность",
    stability: "Стабильность",
    self_esteem: "Самооценка",
    material: "Быт и материальность",
    talent: "Талант",
    spirituality: "Духовность",
    temperament: "Темперамент"
  } as Record<string, string>,
  indicatorLabels: {
    lifePath: "Число жизненного пути",
    birthday: "Число дня рождения",
    expression: "Число выражения",
    soul: "Число души",
    personality: "Число личности",
    goal: "Целеустремлённость",
    family: "Семейность",
    stability: "Стабильность",
    self_esteem: "Самооценка",
    material: "Быт и материальность",
    talent: "Талант",
    spirituality: "Духовность",
    temperament: "Темперамент"
  } as Record<string, string>,
  comparisonExplanation: (indicator: string, comparison: NumerologyComparison) =>
    `${indicator}: значения ${comparison.valueA} и ${comparison.valueB}, разница ${comparison.difference}, ${ruRelationLabels[comparison.relation].toLowerCase()}.`,
  conclusionExplanation: (conclusion: PythagoreanCompatibilityResult["conclusion"]) =>
    `Совпадения и близкие значения: ${conclusion.matchAndClose}; различия и напряжения: ${conclusion.differentAndTension}; напряжения: ${conclusion.tension}.`
} as const;

type WidenLabels<Value> = Value extends (...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : Value extends readonly (infer Item)[]
    ? readonly WidenLabels<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: WidenLabels<Value[Key]> }
      : Value extends string
        ? string
        : Value;

type Labels = WidenLabels<typeof ru>;

const en: Labels = {
  ...ru,
  title: "Numerology",
  individualSubtitle: "Personal analytical report",
  compatibilitySubtitle: "Compatibility analytical report",
  calculation: "Calculation participant",
  compatibilityCalculation: "Compatibility calculation",
  calculationTitle: "Calculation title",
  participant: "Participant",
  firstParticipant: "First participant",
  secondParticipant: "Second participant",
  birthDate: "Birth date",
  profile: "Participant profile",
  keyNumbers: "Core numbers",
  lifePath: "Life path number",
  birthday: "Birthday number",
  expression: "Expression number",
  soul: "Soul number",
  personality: "Personality number",
  periods: "Periods",
  personalYear: "Personal year",
  personalMonths: "Personal months",
  personalDay: "Personal day",
  month: "Month",
  year: "Year",
  value: "Value",
  notCalculated: "Not calculated",
  sourceData: "Psychomatrix source data",
  sourceDigits: "Source digits",
  workingNumbers: "Working numbers",
  first: "First",
  second: "Second",
  third: "Third",
  fourth: "Fourth",
  psychomatrix: "Psychomatrix",
  digit: "Digit",
  repetitions: "Repetitions",
  count: "Count",
  strengthLines: "Strength lines",
  line: "Line",
  cells: "Cells",
  level: "Level",
  approvedInterpretation: "Approved interpretation",
  pairNumber: "Pair number",
  compatibilitySummary: "Compatibility summary",
  comparisons: "22 comparisons",
  block: "Block",
  indicator: "Indicator",
  firstShort: "A",
  secondShort: "B",
  difference: "Difference",
  relation: "Relation",
  explanation: "Explanation",
  zones: "Compatibility zones",
  zone: "Zone",
  comparisonsCount: "Comparisons",
  counts: "Relation counts",
  totalCounts: "Total counts",
  match: "Match",
  close: "Close",
  different: "Different",
  tension: "Tension",
  conclusion: "Compatibility result",
  result: "Result",
  matchAndClose: "Match and close",
  differentAndTension: "Different and tension",
  conclusionText: "Conclusion",
  months: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ],
  levelLabels: {
    absent: "Absent",
    weak: "Weak",
    moderate: "Moderate",
    expressed: "Expressed",
    strong: "Strong"
  },
  relationLabels: { match: "Match", close: "Close", different: "Different", tension: "Tension" },
  zoneLabels: {
    identity: "Identity",
    inner_world: "Inner world",
    resources: "Resources",
    dynamics: "Dynamics"
  },
  conclusionLabels: {
    harmonious: "Harmonious compatibility",
    mixed: "Mixed compatibility",
    attention: "Compatibility requires attention"
  },
  blockLabels: {
    key_numbers: "Core numbers",
    psychomatrix: "Psychomatrix",
    strength_lines: "Strength lines",
    total: "Total"
  },
  lineLabels: {
    goal: "Purpose",
    family: "Family",
    stability: "Stability",
    self_esteem: "Self-esteem",
    material: "Material life",
    talent: "Talent",
    spirituality: "Spirituality",
    temperament: "Temperament"
  },
  indicatorLabels: {
    lifePath: "Life path number",
    birthday: "Birthday number",
    expression: "Expression number",
    soul: "Soul number",
    personality: "Personality number",
    goal: "Purpose",
    family: "Family",
    stability: "Stability",
    self_esteem: "Self-esteem",
    material: "Material life",
    talent: "Talent",
    spirituality: "Spirituality",
    temperament: "Temperament"
  },
  comparisonExplanation: (indicator, comparison) =>
    `${indicator}: values ${comparison.valueA} and ${comparison.valueB}, difference ${comparison.difference}, ${en.relationLabels[comparison.relation].toLowerCase()}.`,
  conclusionExplanation: (conclusion) =>
    `Matches and close values: ${conclusion.matchAndClose}; differences and tensions: ${conclusion.differentAndTension}; tensions: ${conclusion.tension}.`
};
