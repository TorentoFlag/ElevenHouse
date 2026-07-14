import {
  matrixCalculationResponseSchema,
  saveMatrixReportRequestSchema,
  type CalculationRecordResponse,
  type MatrixCalculationResponse,
  type MatrixData,
  type MatrixEnergyRowCode,
  type MatrixInterpretationContext,
  type MatrixPointCode,
  type MatrixReport,
  type MatrixReportLocale,
  type MatrixReportStatus,
  type SaveMatrixReportRequest
} from "@elevenhouse/contracts";

export type MatrixMode = "individual" | "compatibility";
export type MatrixSelector =
  | MatrixPointCode
  | "purpose:personal"
  | "purpose:social"
  | "purpose:spiritual"
  | "zone:purpose"
  | "zone:money"
  | "zone:love"
  | "zone:energy"
  | `energy:${MatrixEnergyRowCode}`;

export type MatrixSelection = {
  readonly selector: MatrixSelector;
  readonly arcana: number;
  readonly label: string;
  readonly kicker: string;
  readonly context: MatrixInterpretationContext;
};

export type MatrixReportEditor = {
  locale: MatrixReportLocale;
  status: MatrixReportStatus;
  overview: string;
  corePortrait: string;
  strengthsAndTalents: string;
  growthAreas: string;
  moneyAndRealization: string;
  relationships: string;
  lineageThemes: string;
  purposes: string;
  yearProjection: string;
  reflectionQuestions: string;
  practicalSteps: string;
  disclaimer: string;
};

const pointDefinitions: ReadonlyArray<{
  readonly code: MatrixPointCode;
  readonly label: string;
  readonly context: MatrixInterpretationContext;
  readonly kicker: string;
}> = [
  { code: "E", label: "Портрет · Я", context: "portrait", kicker: "Центр матрицы" },
  { code: "A", label: "Характер", context: "portrait", kicker: "Ключевая точка" },
  { code: "B", label: "Детство · род", context: "lineage", kicker: "Ключевая точка" },
  { code: "C", label: "Карма рода", context: "lineage", kicker: "Ключевая точка" },
  { code: "D", label: "Зона комфорта", context: "portrait", kicker: "Ключевая точка" },
  { code: "tl", label: "Таланты", context: "talent", kicker: "Кармическая точка" },
  { code: "tr", label: "Кармический хвост", context: "karmic", kicker: "Кармическая точка" },
  { code: "br", label: "Род · ресурс", context: "lineage", kicker: "Кармическая точка" },
  { code: "bl", label: "Отношения", context: "relationship", kicker: "Кармическая точка" },
  { code: "A1", label: "Скрытый талант", context: "talent", kicker: "Внутренняя точка" },
  { code: "B1", label: "Духовная задача", context: "purpose", kicker: "Внутренняя точка" },
  { code: "C1", label: "Кармический опыт", context: "karmic", kicker: "Внутренняя точка" },
  { code: "D1", label: "Земная задача", context: "purpose", kicker: "Внутренняя точка" },
  { code: "tl1", label: "Мужская линия рода", context: "lineage", kicker: "Внутренняя точка" },
  { code: "tr1", label: "Женская линия рода", context: "lineage", kicker: "Внутренняя точка" },
  { code: "br1", label: "Ресурс рода", context: "lineage", kicker: "Внутренняя точка" },
  { code: "bl1", label: "Уроки рода", context: "lineage", kicker: "Внутренняя точка" }
];

export const matrixRailGroups = [
  {
    title: "Ключевые точки",
    items: pointDefinitions.slice(0, 9).map((item) => ({ selector: item.code, label: item.label }))
  },
  {
    title: "Предназначения",
    items: [
      { selector: "purpose:personal" as const, label: "Личное · до 40 лет" },
      { selector: "purpose:social" as const, label: "Социальное · 40–60 лет" },
      { selector: "purpose:spiritual" as const, label: "Духовное · 60+ лет" }
    ]
  },
  {
    title: "Зоны жизни",
    items: [
      { selector: "zone:purpose" as const, label: "Предназначение" },
      { selector: "zone:money" as const, label: "Деньги · самореализация" },
      { selector: "zone:love" as const, label: "Любовь · отношения" },
      { selector: "zone:energy" as const, label: "Энергия · ресурс" }
    ]
  }
] as const;

const energyLabels: Record<MatrixEnergyRowCode, string> = {
  sahasrara: "Сахасрара",
  ajna: "Аджна",
  vishuddha: "Вишудха",
  anahata: "Анахата",
  manipura: "Манипура",
  svadhisthana: "Свадхистана",
  muladhara: "Муладхара"
};

export function getMatrixSelection(matrix: MatrixData, selector: MatrixSelector): MatrixSelection {
  if (selector.startsWith("purpose:")) {
    const key = selector.slice(8) as "personal" | "social" | "spiritual";
    const labels = {
      personal: "Личное предназначение",
      social: "Социальное предназначение",
      spiritual: "Духовное предназначение"
    } as const;
    return {
      selector,
      arcana: matrix.purposes[key],
      label: labels[key],
      kicker: "Предназначение",
      context: "purpose"
    };
  }
  if (selector.startsWith("zone:")) {
    const key = selector.slice(5) as "purpose" | "money" | "love" | "energy";
    const definitions = {
      purpose: ["Предназначение", "purpose"],
      money: ["Деньги · самореализация", "money"],
      love: ["Любовь · отношения", "relationship"],
      energy: ["Энергия · ресурс", "energy"]
    } as const;
    return {
      selector,
      arcana: matrix.zones[key],
      label: definitions[key][0],
      kicker: "Зона жизни",
      context: definitions[key][1]
    };
  }
  if (selector.startsWith("energy:")) {
    const code = selector.slice(7) as MatrixEnergyRowCode;
    const row = matrix.energyMap.rows.find((item) => item.code === code);
    if (!row) throw new Error(`Unknown energy row: ${code}`);
    return {
      selector,
      arcana: row.emotions,
      label: energyLabels[code],
      kicker: "Энергетическая карта",
      context: "energy"
    };
  }
  const pointCode = selector as MatrixPointCode;
  const definition = pointDefinitions.find((item) => item.code === pointCode);
  if (!definition) throw new Error(`Unknown Matrix selector: ${selector}`);
  return {
    selector,
    arcana: matrix.points[pointCode],
    label: definition.label,
    kicker: definition.kicker,
    context: definition.context
  };
}

export function getMatrixArcana(matrix: MatrixData, selector: MatrixSelector): number {
  return getMatrixSelection(matrix, selector).arcana;
}

export function toMatrixCalculationResponse(
  calculation: CalculationRecordResponse
): MatrixCalculationResponse {
  return matrixCalculationResponseSchema.parse({ calculation, result: calculation.resultData });
}

export function findExistingMatrixCalculation(
  calculations: readonly CalculationRecordResponse[],
  input: {
    readonly mode: MatrixMode;
    readonly subjectClientId: string;
    readonly partnerClientId?: string;
  }
): CalculationRecordResponse | null {
  return (
    calculations.find((calculation) => {
      if (calculation.module !== "matrix" || calculation.mode !== input.mode) return false;
      const participants = calculation.participants.filter(
        (participant) => participant.source === "crm_client"
      );
      if (participants[0]?.clientId !== input.subjectClientId) return false;
      return input.mode === "individual"
        ? participants.length === 1
        : participants[1]?.clientId === input.partnerClientId;
    }) ?? null
  );
}

export function createEmptyMatrixReportEditor(locale: MatrixReportLocale): MatrixReportEditor {
  return {
    locale,
    status: "draft",
    overview: "",
    corePortrait: "",
    strengthsAndTalents: "",
    growthAreas: "",
    moneyAndRealization: "",
    relationships: "",
    lineageThemes: "",
    purposes: "",
    yearProjection: "",
    reflectionQuestions: "",
    practicalSteps: "",
    disclaimer: ""
  };
}

export function toMatrixReportEditor(report: MatrixReport): MatrixReportEditor {
  return {
    locale: report.locale,
    status: report.status,
    ...report.content,
    yearProjection: report.content.yearProjection ?? "",
    reflectionQuestions: report.content.reflectionQuestions.join("\n"),
    practicalSteps: report.content.practicalSteps.join("\n")
  };
}

export function toSaveMatrixReportRequest(
  editor: MatrixReportEditor,
  expectedResultChecksum: string
): SaveMatrixReportRequest {
  return saveMatrixReportRequestSchema.parse({
    locale: editor.locale,
    status: editor.status,
    expectedResultChecksum,
    content: {
      overview: editor.overview,
      corePortrait: editor.corePortrait,
      strengthsAndTalents: editor.strengthsAndTalents,
      growthAreas: editor.growthAreas,
      moneyAndRealization: editor.moneyAndRealization,
      relationships: editor.relationships,
      lineageThemes: editor.lineageThemes,
      purposes: editor.purposes,
      yearProjection: editor.yearProjection.trim() || null,
      reflectionQuestions: toLines(editor.reflectionQuestions),
      practicalSteps: toLines(editor.practicalSteps),
      disclaimer: editor.disclaimer
    }
  });
}

export function isMatrixReportEditorComplete(editor: MatrixReportEditor): boolean {
  try {
    toSaveMatrixReportRequest(editor, `sha256:${"0".repeat(64)}`);
    return true;
  } catch {
    return false;
  }
}

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
