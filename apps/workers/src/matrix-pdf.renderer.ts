import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type {
  MatrixPdfRenderClaim,
  MatrixReportContent,
  MatrixReportLocale
} from "@elevenhouse/domain";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

const pageWidth = 595.28;
const pageHeight = 841.89;
const marginX = 52;
const marginTop = 58;
const marginBottom = 55;
const contentWidth = pageWidth - marginX * 2;
const bodySize = 10.5;
const bodyLineHeight = 15.5;

export type MatrixPdfRenderer = {
  readonly render: (claim: MatrixPdfRenderClaim) => Promise<Buffer>;
};

export function createMatrixPdfRenderer(
  input: {
    readonly regularFontBytes?: Uint8Array;
    readonly semiboldFontBytes?: Uint8Array;
  } = {}
): MatrixPdfRenderer {
  let fontBytesPromise: Promise<{ regular: Uint8Array; semibold: Uint8Array }> | undefined;

  return {
    render: async (claim) => {
      fontBytesPromise ??= loadFontBytes(input);
      const fontBytes = await fontBytesPromise;
      return renderMatrixPdf(claim, fontBytes);
    }
  };
}

async function renderMatrixPdf(
  claim: MatrixPdfRenderClaim,
  fontBytes: { readonly regular: Uint8Array; readonly semibold: Uint8Array }
): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regular, semibold] = await Promise.all([
    document.embedFont(fontBytes.regular, { subset: true }),
    document.embedFont(fontBytes.semibold, { subset: true })
  ]);
  const metadataDate = new Date(claim.job.createdAt);
  document.setTitle(claim.job.locale === "ru" ? "Матрица судьбы" : "Destiny Matrix");
  document.setAuthor("ElevenHouse");
  document.setCreator("ElevenHouse Matrix");
  document.setProducer("ElevenHouse Matrix PDF renderer");
  document.setCreationDate(metadataDate);
  document.setModificationDate(metadataDate);

  const layout = new PdfLayout(document, regular, semibold, claim.job.locale);
  layout.drawCover();
  drawReport(layout, claim.report.content, claim.job.locale);
  layout.drawFooters();

  return Buffer.from(await document.save({ useObjectStreams: false, addDefaultPage: false }));
}

function drawReport(
  layout: PdfLayout,
  content: MatrixReportContent,
  locale: MatrixReportLocale
): void {
  const labels = locale === "ru" ? russianLabels : englishLabels;
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
    if (!text?.trim()) continue;
    layout.drawSection(heading, text);
  }
  layout.drawList(labels.reflectionQuestions, content.reflectionQuestions);
  layout.drawList(labels.practicalSteps, content.practicalSteps);
  layout.drawSection(labels.disclaimer, content.disclaimer, true);
}

class PdfLayout {
  private page: PDFPage;
  private y = pageHeight - marginTop;

  constructor(
    private readonly document: PDFDocument,
    private readonly regular: PDFFont,
    private readonly semibold: PDFFont,
    private readonly locale: MatrixReportLocale
  ) {
    this.page = this.addPage();
  }

  drawCover(): void {
    this.page.drawRectangle({
      x: 0,
      y: pageHeight - 8,
      width: pageWidth,
      height: 8,
      color: rgb(0.48, 0.33, 0.85)
    });
    this.page.drawText("ELEVENHOUSE", {
      x: marginX,
      y: this.y,
      font: this.semibold,
      size: 9,
      color: rgb(0.48, 0.33, 0.85)
    });
    this.y -= 44;
    this.drawWrapped(
      this.locale === "ru" ? "Матрица судьбы" : "Destiny Matrix",
      this.semibold,
      26,
      32,
      rgb(0.11, 0.09, 0.18)
    );
    this.y -= 8;
    this.drawWrapped(
      this.locale === "ru" ? "Персональный аналитический отчёт" : "Personal analytical report",
      this.regular,
      12,
      18,
      rgb(0.42, 0.39, 0.51)
    );
    this.y -= 34;
  }

  drawSection(heading: string, text: string, muted = false): void {
    this.ensureSpace(62);
    this.page.drawText(heading, {
      x: marginX,
      y: this.y,
      font: this.semibold,
      size: 14,
      color: muted ? rgb(0.42, 0.39, 0.51) : rgb(0.23, 0.16, 0.39)
    });
    this.y -= 23;
    this.drawParagraphs(text, muted ? rgb(0.42, 0.39, 0.51) : rgb(0.16, 0.14, 0.21));
    this.y -= 16;
  }

  drawList(heading: string, items: readonly string[]): void {
    if (items.length === 0) return;
    this.ensureSpace(62);
    this.page.drawText(heading, {
      x: marginX,
      y: this.y,
      font: this.semibold,
      size: 14,
      color: rgb(0.23, 0.16, 0.39)
    });
    this.y -= 23;
    items.forEach((item, index) => {
      this.ensureSpace(bodyLineHeight * 2);
      const marker = `${index + 1}.`;
      this.page.drawText(marker, {
        x: marginX,
        y: this.y,
        font: this.semibold,
        size: bodySize,
        color: rgb(0.48, 0.33, 0.85)
      });
      this.drawWrapped(item, this.regular, bodySize, bodyLineHeight, rgb(0.16, 0.14, 0.21), 22);
      this.y -= 5;
    });
    this.y -= 11;
  }

  drawFooters(): void {
    const pages = this.document.getPages();
    pages.forEach((page, index) => {
      page.drawLine({
        start: { x: marginX, y: 34 },
        end: { x: pageWidth - marginX, y: 34 },
        thickness: 0.5,
        color: rgb(0.86, 0.84, 0.9)
      });
      page.drawText(`${index + 1} / ${pages.length}`, {
        x: pageWidth - marginX - 28,
        y: 20,
        font: this.regular,
        size: 8,
        color: rgb(0.5, 0.47, 0.56)
      });
      page.drawText("ElevenHouse", {
        x: marginX,
        y: 20,
        font: this.regular,
        size: 8,
        color: rgb(0.5, 0.47, 0.56)
      });
    });
  }

  private drawParagraphs(text: string, color: ReturnType<typeof rgb>): void {
    const paragraphs = normalizeText(text).split(/\n+/u);
    paragraphs.forEach((paragraph, index) => {
      if (!paragraph) return;
      this.drawWrapped(paragraph, this.regular, bodySize, bodyLineHeight, color);
      if (index < paragraphs.length - 1) this.y -= 7;
    });
  }

  private drawWrapped(
    text: string,
    font: PDFFont,
    size: number,
    lineHeight: number,
    color: ReturnType<typeof rgb>,
    indent = 0
  ): void {
    const lines = wrapText(normalizeText(text), font, size, contentWidth - indent);
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.page.drawText(line, { x: marginX + indent, y: this.y, font, size, color });
      this.y -= lineHeight;
    }
  }

  private ensureSpace(height: number): void {
    if (this.y - height >= marginBottom) return;
    this.page = this.addPage();
    this.y = pageHeight - marginTop;
  }

  private addPage(): PDFPage {
    return this.document.addPage([pageWidth, pageHeight]);
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

function normalizeText(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
      ? " "
      : character;
  })
    .join("")
    .trim();
}

async function loadFontBytes(input: {
  readonly regularFontBytes?: Uint8Array;
  readonly semiboldFontBytes?: Uint8Array;
}): Promise<{ regular: Uint8Array; semibold: Uint8Array }> {
  return {
    regular:
      input.regularFontBytes ??
      new Uint8Array(await readFile(resolve(__dirname, "../assets/Onest-Regular.ttf"))),
    semibold:
      input.semiboldFontBytes ??
      new Uint8Array(await readFile(resolve(__dirname, "../assets/Onest-SemiBold.ttf")))
  };
}

const russianLabels = {
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

const englishLabels = {
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
} as const;
