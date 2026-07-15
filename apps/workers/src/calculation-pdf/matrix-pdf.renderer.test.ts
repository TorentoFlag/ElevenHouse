import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { MatrixPdfDocument } from "./calculation-pdf.documents";
import { createMatrixPdfRenderer } from "./matrix-pdf.renderer";
import { reportContent } from "./matrix-pdf.source.test";

describe("generic Matrix PDF renderer", () => {
  it("preserves the branded report and paginates long content", async () => {
    const renderer = createMatrixPdfRenderer();
    const pdf = await renderer.render(document("Очень подробный разбор. ".repeat(420)));
    const loaded = await PDFDocument.load(pdf.bytes);

    expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.pageCount).toBeGreaterThan(2);
    expect(loaded.getTitle()).toBe("Матрица судьбы");
    expect(loaded.getAuthor()).toBe("ElevenHouse");
  });

  it("renders markup as inert text and produces stable bytes", async () => {
    const renderer = createMatrixPdfRenderer();
    const input = document("<script>alert('x')</script> Безопасный текст");
    const first = await renderer.render(input);
    const second = await renderer.render(input);

    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.bytes.toString("latin1")).not.toContain("/JavaScript");
    expect(first.bytes.toString("latin1")).not.toContain("/JS");
  });
});

function document(overview: string): MatrixPdfDocument {
  return {
    kind: "matrix",
    locale: "ru",
    createdAt: "2026-07-15T12:00:00.000Z",
    content: reportContent(overview)
  };
}
