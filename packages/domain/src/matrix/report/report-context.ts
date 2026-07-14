import { resolveMatrixInterpretation } from "../interpretations/catalog";
import type {
  MatrixInterpretationContext,
  MatrixInterpretationEntry
} from "../interpretations/catalog-types";
import { MatrixValidationError } from "../matrix-errors";
import type { MatrixNote } from "../matrix-note-types";
import type { MatrixBaseResult, MatrixData, MatrixDerivedProjection } from "../matrix-types";
import type { MatrixReportLocale } from "./report-types";

export type MatrixReportAiContext = {
  readonly locale: MatrixReportLocale;
  readonly methodCode: "ladini_22";
  readonly engineRevision: number;
  readonly interpretationRevision: number;
  readonly resultChecksum: string;
  readonly mode: "individual" | "compatibility";
  readonly participants: readonly {
    readonly role: "subject" | "partner";
    readonly label: string;
  }[];
  readonly matrices: readonly {
    readonly role: "subject" | "partner" | "composite";
    readonly points: MatrixData["points"];
    readonly purposes: MatrixData["purposes"];
    readonly zones: MatrixData["zones"];
    readonly energyTotals: MatrixData["energyMap"]["totals"];
  }[];
  readonly interpretations: readonly MatrixReportInterpretation[];
  readonly projection: {
    readonly year: number;
    readonly ageCycleArcana: number;
    readonly personalYear: number;
    readonly challenge: number;
    readonly resource: number;
  } | null;
  readonly selectedNotes: readonly { readonly id: string; readonly text: string }[];
};

export type MatrixReportInterpretation = Pick<
  MatrixInterpretationEntry,
  | "catalogRevision"
  | "arcana"
  | "context"
  | "title"
  | "constructive"
  | "shadow"
  | "reflectionQuestions"
  | "practicalRecommendations"
  | "reportSummary"
> & { readonly key: string };

export function buildMatrixReportAiContext(input: {
  readonly locale: MatrixReportLocale;
  readonly result: MatrixBaseResult;
  readonly resultChecksum: string;
  readonly notes: readonly MatrixNote[];
  readonly selectedNoteIds: readonly string[];
  readonly projection: MatrixDerivedProjection | null;
}): MatrixReportAiContext {
  if (!/^sha256:[a-f0-9]{64}$/.test(input.resultChecksum)) {
    throw new MatrixValidationError("Matrix report result checksum is invalid");
  }
  if (new Set(input.selectedNoteIds).size !== input.selectedNoteIds.length) {
    throw new MatrixValidationError("Selected Matrix note ids must be unique");
  }
  const selectedNotes = input.selectedNoteIds.map((id) => {
    const note = input.notes.find((candidate) => candidate.id === id);
    if (!note) throw new MatrixValidationError(`Selected Matrix note ${id} was not found`);
    if (note.resultChecksum !== input.resultChecksum) {
      throw new MatrixValidationError(
        `Selected Matrix note ${id} is not bound to the current Matrix result`
      );
    }
    return { id, text: note.text.trim().slice(0, 2_000) };
  });
  const projection = input.projection
    ? {
        year: input.projection.yearForecast.year,
        ageCycleArcana: input.projection.ageCycle.arcana,
        personalYear: input.projection.yearForecast.personalYear,
        challenge: input.projection.yearForecast.challenge,
        resource: input.projection.yearForecast.resource
      }
    : null;

  const participants =
    input.result.mode === "individual"
      ? [
          {
            role: "subject" as const,
            label: firstName(input.result.participant.displayName, input.locale)
          }
        ]
      : [
          {
            role: "subject" as const,
            label: firstName(input.result.participants.first.displayName, input.locale)
          },
          {
            role: "partner" as const,
            label: firstName(input.result.participants.second.displayName, input.locale)
          }
        ];
  const matrices =
    input.result.mode === "individual"
      ? [matrixFacts("subject", input.result.matrix)]
      : [
          matrixFacts("subject", input.result.individuals[0].matrix),
          matrixFacts("partner", input.result.individuals[1].matrix),
          matrixFacts("composite", input.result.composite)
        ];
  const interpretationCoordinates =
    input.result.mode === "individual"
      ? matrixCoordinates("subject", input.result.matrix)
      : [
          ...matrixCoordinates("subject", input.result.individuals[0].matrix),
          ...matrixCoordinates("partner", input.result.individuals[1].matrix),
          ...matrixCoordinates("composite", input.result.composite),
          {
            key: "composite.compatibility",
            context: "compatibility" as const,
            arcana: input.result.composite.points.E
          }
        ];
  if (projection) {
    interpretationCoordinates.push(
      { key: "projection.ageCycle", context: "forecast", arcana: projection.ageCycleArcana },
      { key: "projection.personalYear", context: "forecast", arcana: projection.personalYear },
      { key: "projection.challenge", context: "forecast", arcana: projection.challenge },
      { key: "projection.resource", context: "forecast", arcana: projection.resource }
    );
  }

  return {
    locale: input.locale,
    methodCode: input.result.methodCode,
    engineRevision: input.result.engineRevision,
    interpretationRevision: input.result.interpretationRevision,
    resultChecksum: input.resultChecksum,
    mode: input.result.mode,
    participants,
    matrices,
    interpretations: interpretationCoordinates.map(({ key, context, arcana }) => {
      const entry = resolveMatrixInterpretation({ locale: input.locale, context, arcana });
      return {
        key,
        catalogRevision: entry.catalogRevision,
        arcana: entry.arcana,
        context: entry.context,
        title: entry.title,
        constructive: entry.constructive,
        shadow: entry.shadow,
        reflectionQuestions: entry.reflectionQuestions,
        practicalRecommendations: entry.practicalRecommendations,
        reportSummary: entry.reportSummary
      };
    }),
    projection,
    selectedNotes
  };
}

function matrixFacts(
  role: "subject" | "partner" | "composite",
  matrix: MatrixData
): MatrixReportAiContext["matrices"][number] {
  return {
    role,
    points: matrix.points,
    purposes: matrix.purposes,
    zones: matrix.zones,
    energyTotals: matrix.energyMap.totals
  };
}

function matrixCoordinates(
  role: "subject" | "partner" | "composite",
  matrix: MatrixData
): Array<{ key: string; context: MatrixInterpretationContext; arcana: number }> {
  return [
    { key: `${role}.portrait`, context: "portrait", arcana: matrix.points.E },
    { key: `${role}.talent`, context: "talent", arcana: matrix.points.tl },
    { key: `${role}.karmic`, context: "karmic", arcana: matrix.points.tr },
    { key: `${role}.relationship`, context: "relationship", arcana: matrix.points.bl },
    { key: `${role}.money`, context: "money", arcana: matrix.zones.money },
    { key: `${role}.lineage`, context: "lineage", arcana: matrix.points.C },
    { key: `${role}.purpose`, context: "purpose", arcana: matrix.purposes.personal },
    { key: `${role}.energy`, context: "energy", arcana: matrix.zones.energy }
  ];
}

function firstName(displayName: string, locale: MatrixReportLocale): string {
  return (
    displayName.trim().split(/\s+/u)[0]?.slice(0, 100) || (locale === "ru" ? "Клиент" : "Client")
  );
}
