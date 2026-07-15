import type { MatrixReportContent } from "@elevenhouse/domain";
import type { MatrixPdfDocument } from "./calculation-pdf.documents";
import { createPdfLayout } from "./pdf-layout";

export type MatrixPdfRenderer = {
  readonly render: (
    document: MatrixPdfDocument
  ) => Promise<{ readonly bytes: Buffer; readonly pageCount: number }>;
};

export function createMatrixPdfRenderer(
  input: {
    readonly regularFontBytes?: Uint8Array;
    readonly semiboldFontBytes?: Uint8Array;
  } = {}
): MatrixPdfRenderer {
  return {
    render: async (document) => {
      const labels = document.locale === "ru" ? russianLabels : englishLabels;
      const layout = await createPdfLayout({
        locale: document.locale,
        title: labels.title,
        creator: "ElevenHouse Matrix",
        createdAt: document.createdAt,
        ...input
      });
      layout.drawCover(labels.title, labels.subtitle);
      drawReport(layout, document.content, labels);
      return layout.save();
    }
  };
}

function drawReport(
  layout: Awaited<ReturnType<typeof createPdfLayout>>,
  content: MatrixReportContent,
  labels: MatrixLabels
): void {
  const sections: readonly [string, string | null][] = [
    [labels.overview, content.overview],
    [labels.corePortrait, content.corePortrait],
    [labels.strengthsAndTalents, content.strengthsAndTalents],
    [labels.growthAreas, content.growthAreas],
    [labels.moneyAndRealization, content.moneyAndRealization],
    [labels.relationships, content.relationships],
    [labels.lineageThemes, content.lineageThemes],
    [labels.purposes, content.purposes],
    [labels.yearProjection, content.yearProjection]
  ];
  for (const [heading, text] of sections) {
    if (text?.trim()) layout.drawSection(heading, text);
  }
  layout.drawList(labels.reflectionQuestions, content.reflectionQuestions);
  layout.drawList(labels.practicalSteps, content.practicalSteps);
  layout.drawSection(labels.disclaimer, content.disclaimer, true);
}

const russianLabels = {
  title: "Матрица судьбы",
  subtitle: "Персональный аналитический отчёт",
  overview: "Общая картина",
  corePortrait: "Ядро личности",
  strengthsAndTalents: "Сильные стороны и таланты",
  growthAreas: "Зоны роста",
  moneyAndRealization: "Деньги и реализация",
  relationships: "Отношения",
  lineageThemes: "Родовые темы",
  purposes: "Предназначения",
  yearProjection: "Прогноз на год",
  reflectionQuestions: "Вопросы для размышления",
  practicalSteps: "Практические шаги",
  disclaimer: "Важно"
} as const;

type MatrixLabels = { readonly [Key in keyof typeof russianLabels]: string };

const englishLabels: MatrixLabels = {
  title: "Destiny Matrix",
  subtitle: "Personal analytical report",
  overview: "Overview",
  corePortrait: "Core personality",
  strengthsAndTalents: "Strengths and talents",
  growthAreas: "Growth areas",
  moneyAndRealization: "Money and realization",
  relationships: "Relationships",
  lineageThemes: "Lineage themes",
  purposes: "Purposes",
  yearProjection: "Year projection",
  reflectionQuestions: "Reflection questions",
  practicalSteps: "Practical steps",
  disclaimer: "Important"
};
