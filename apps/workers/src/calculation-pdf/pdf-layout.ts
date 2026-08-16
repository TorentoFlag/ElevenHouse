import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb, type RGB } from "pdf-lib";

const pageWidth = 595.28;
const pageHeight = 841.89;
const marginX = 52;
const marginTop = 58;
const marginBottom = 55;
const contentWidth = pageWidth - marginX * 2;
const bodySize = 10.5;
const bodyLineHeight = 15.5;

export type PdfLayout = {
  readonly drawCover: (title: string, subtitle: string) => void;
  readonly drawSection: (heading: string, text: string, muted?: boolean) => void;
  readonly drawList: (heading: string, items: readonly string[]) => void;
  readonly drawKeyValues: (
    heading: string,
    items: readonly { readonly label: string; readonly value: string }[]
  ) => void;
  readonly drawTable: (
    heading: string,
    headers: readonly string[],
    rows: readonly (readonly string[])[],
    options?: PdfTableOptions
  ) => void;
  readonly drawGraphic: (
    heading: string,
    height: number,
    draw: (context: PdfGraphicContext) => void
  ) => void;
  readonly save: () => Promise<{ readonly bytes: Buffer; readonly pageCount: number }>;
};

export type PdfTableOptions = {
  readonly columnWeights?: readonly number[];
  readonly fontSize?: number;
  readonly lineHeight?: number;
};

export type PdfGraphicContext = {
  readonly page: PDFPage;
  readonly regular: PDFFont;
  readonly semibold: PDFFont;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rgb: typeof rgb;
  readonly colors: {
    readonly ink: RGB;
    readonly muted: RGB;
    readonly border: RGB;
    readonly surface: RGB;
    readonly accent: RGB;
  };
};

export async function createPdfLayout(input: {
  readonly locale: "ru" | "en";
  readonly title: string;
  readonly creator: string;
  readonly createdAt: string;
  readonly regularFontBytes?: Uint8Array;
  readonly semiboldFontBytes?: Uint8Array;
}): Promise<PdfLayout> {
  const [regularFontBytes, semiboldFontBytes] = await Promise.all([
    input.regularFontBytes ?? readFont("Onest-Regular.ttf"),
    input.semiboldFontBytes ?? readFont("Onest-SemiBold.ttf")
  ]);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regular, semibold] = await Promise.all([
    document.embedFont(regularFontBytes, { subset: true }),
    document.embedFont(semiboldFontBytes, { subset: true })
  ]);
  const metadataDate = new Date(input.createdAt);
  document.setTitle(input.title);
  document.setAuthor("ElevenHouse");
  document.setCreator(input.creator);
  document.setProducer("ElevenHouse PDF renderer");
  document.setCreationDate(metadataDate);
  document.setModificationDate(metadataDate);
  return new DefaultPdfLayout(document, regular, semibold, input.locale);
}

class DefaultPdfLayout implements PdfLayout {
  private page: PDFPage;
  private y = pageHeight - marginTop;
  private footersDrawn = false;

  constructor(
    private readonly document: PDFDocument,
    private readonly regular: PDFFont,
    private readonly semibold: PDFFont,
    private readonly locale: "ru" | "en"
  ) {
    this.page = this.addPage();
  }

  drawCover(title: string, subtitle: string): void {
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
    this.drawWrapped(title, this.semibold, 26, 32, rgb(0.11, 0.09, 0.18));
    this.y -= 8;
    this.drawWrapped(subtitle, this.regular, 12, 18, rgb(0.42, 0.39, 0.51));
    this.y -= 34;
  }

  drawSection(heading: string, text: string, muted = false): void {
    this.drawHeading(heading, muted);
    const paragraphs = normalizeText(text).split(/\n+/u);
    paragraphs.forEach((paragraph, index) => {
      if (!paragraph) return;
      this.drawWrapped(
        paragraph,
        this.regular,
        bodySize,
        bodyLineHeight,
        muted ? rgb(0.42, 0.39, 0.51) : rgb(0.16, 0.14, 0.21)
      );
      if (index < paragraphs.length - 1) this.y -= 7;
    });
    this.y -= 16;
  }

  drawList(heading: string, items: readonly string[]): void {
    if (items.length === 0) return;
    this.drawHeading(heading);
    items.forEach((item, index) => {
      this.ensureSpace(bodyLineHeight * 2);
      this.page.drawText(`${index + 1}.`, {
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

  drawKeyValues(
    heading: string,
    items: readonly { readonly label: string; readonly value: string }[]
  ): void {
    if (items.length === 0) return;
    this.drawHeading(heading);
    for (const item of items) {
      this.ensureSpace(bodyLineHeight * 2);
      const label = `${normalizeText(item.label)}:`;
      const labelWidth = Math.min(170, this.semibold.widthOfTextAtSize(label, bodySize) + 14);
      this.page.drawText(label, {
        x: marginX,
        y: this.y,
        font: this.semibold,
        size: bodySize,
        color: rgb(0.23, 0.16, 0.39)
      });
      this.drawWrapped(
        item.value,
        this.regular,
        bodySize,
        bodyLineHeight,
        rgb(0.16, 0.14, 0.21),
        labelWidth
      );
      this.y -= 5;
    }
    this.y -= 11;
  }

  drawTable(
    heading: string,
    headers: readonly string[],
    rows: readonly (readonly string[])[],
    options: PdfTableOptions = {}
  ): void {
    if (headers.length === 0 || rows.length === 0) return;
    this.drawHeading(heading);
    const weights = normalizedColumnWeights(headers.length, options.columnWeights);
    const weightTotal = weights.reduce((total, weight) => total + weight, 0);
    const columnWidths = weights.map((weight) => (contentWidth * weight) / weightTotal);
    const columnWidthAt = (index: number) => columnWidths[index] ?? contentWidth / headers.length;
    const fontSize = options.fontSize ?? 9;
    const lineHeight = options.lineHeight ?? 13;
    const drawRow = (cells: readonly string[], header: boolean) => {
      const lines = headers.map((_, index) =>
        wrapText(
          normalizeText(cells[index] ?? ""),
          header ? this.semibold : this.regular,
          fontSize,
          columnWidthAt(index) - 12
        )
      );
      const rowHeight = Math.max(
        25,
        Math.max(...lines.map((value) => value.length)) * lineHeight + 10
      );
      this.ensureSpace(rowHeight);
      const top = this.y + 5;
      this.page.drawRectangle({
        x: marginX,
        y: top - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: header ? rgb(0.94, 0.92, 0.98) : rgb(1, 1, 1),
        borderColor: rgb(0.86, 0.84, 0.9),
        borderWidth: 0.5
      });
      let columnOffset = 0;
      lines.forEach((cellLines, columnIndex) => {
        const x = marginX + columnOffset + 6;
        cellLines.forEach((line, lineIndex) => {
          this.page.drawText(line, {
            x,
            y: top - 14 - lineIndex * lineHeight,
            font: header ? this.semibold : this.regular,
            size: fontSize,
            color: rgb(0.16, 0.14, 0.21)
          });
        });
        if (columnIndex > 0) {
          this.page.drawLine({
            start: { x: marginX + columnOffset, y: top },
            end: { x: marginX + columnOffset, y: top - rowHeight },
            thickness: 0.5,
            color: rgb(0.86, 0.84, 0.9)
          });
        }
        columnOffset += columnWidthAt(columnIndex);
      });
      this.y = top - rowHeight - 1;
    };
    drawRow(headers, true);
    rows.forEach((row) => drawRow(row, false));
    this.y -= 15;
  }

  drawGraphic(heading: string, height: number, draw: (context: PdfGraphicContext) => void): void {
    this.ensureSpace(height + 62);
    this.drawHeading(heading);
    this.ensureSpace(height);
    const top = this.y;
    draw({
      page: this.page,
      regular: this.regular,
      semibold: this.semibold,
      x: marginX,
      y: top - height,
      width: contentWidth,
      height,
      rgb,
      colors: {
        ink: rgb(0.16, 0.14, 0.21),
        muted: rgb(0.42, 0.39, 0.51),
        border: rgb(0.86, 0.84, 0.9),
        surface: rgb(0.98, 0.97, 1),
        accent: rgb(0.48, 0.33, 0.85)
      }
    });
    this.y -= height + 18;
  }

  async save(): Promise<{ bytes: Buffer; pageCount: number }> {
    if (!this.footersDrawn) {
      this.drawFooters();
      this.footersDrawn = true;
    }
    const pageCount = this.document.getPageCount();
    return {
      bytes: Buffer.from(
        await this.document.save({ useObjectStreams: false, addDefaultPage: false })
      ),
      pageCount
    };
  }

  private drawHeading(heading: string, muted = false): void {
    this.ensureSpace(62);
    this.page.drawText(normalizeText(heading), {
      x: marginX,
      y: this.y,
      font: this.semibold,
      size: 14,
      color: muted ? rgb(0.42, 0.39, 0.51) : rgb(0.23, 0.16, 0.39)
    });
    this.y -= 23;
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

  private drawFooters(): void {
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

  private addPage(): PDFPage {
    return this.document.addPage([pageWidth, pageHeight]);
  }
}

function normalizedColumnWeights(
  columnCount: number,
  requested: readonly number[] | undefined
): readonly number[] {
  if (
    requested?.length === columnCount &&
    requested.every((weight) => Number.isFinite(weight) && weight > 0)
  ) {
    return requested;
  }
  return Array.from({ length: columnCount }, () => 1);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text
    .split(/\s+/u)
    .filter(Boolean)
    .flatMap((word) => splitWord(word, font, size, maxWidth));
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

function splitWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const chunks: string[] = [];
  let chunk = "";
  for (const character of word) {
    const candidate = `${chunk}${character}`;
    if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
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

async function readFont(fileName: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolve(__dirname, "../../assets", fileName)));
}
