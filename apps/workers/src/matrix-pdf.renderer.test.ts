import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { MatrixPdfRenderClaim } from "@elevenhouse/domain";
import { createMatrixPdfRenderer } from "./matrix-pdf.renderer";

describe("createMatrixPdfRenderer", () => {
  it("renders a branded Cyrillic report and paginates long content", async () => {
    const renderer = createMatrixPdfRenderer();
    const pdf = await renderer.render(claim("Очень подробный разбор. ".repeat(420)));
    const document = await PDFDocument.load(pdf);

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(document.getPageCount()).toBeGreaterThan(2);
    expect(document.getTitle()).toBe("Матрица судьбы");
    expect(document.getAuthor()).toBe("ElevenHouse");
  });

  it("treats report markup as inert text and produces stable output", async () => {
    const renderer = createMatrixPdfRenderer();
    const input = claim("<script>alert('x')</script> Безопасный текст");

    const first = await renderer.render(input);
    const second = await renderer.render(input);

    expect(first.equals(second)).toBe(true);
    expect(first.toString("latin1")).not.toContain("/JavaScript");
    expect(first.toString("latin1")).not.toContain("/JS");
  });
});

function claim(overview: string): MatrixPdfRenderClaim {
  return {
    job: {
      id: "00000000-0000-4000-8000-000000000001",
      calculationId: "00000000-0000-4000-8000-000000000002",
      ownerUserId: "00000000-0000-4000-8000-000000000003",
      reportId: "00000000-0000-4000-8000-000000000004",
      reportRevision: 2,
      resultChecksum: `sha256:${"a".repeat(64)}`,
      locale: "ru",
      status: "processing",
      artifactId: "00000000-0000-4000-8000-000000000005",
      mediaAssetId: "00000000-0000-4000-8000-000000000006",
      failureReason: null,
      createdAt: "2026-07-14T12:00:00.000Z",
      updatedAt: "2026-07-14T12:00:00.000Z"
    },
    report: {
      content: {
        overview,
        corePortrait: "Глубокий внутренний мир и внимательность к деталям.",
        strengthsAndTalents: "Аналитика и наставничество.",
        growthAreas: "Не изолироваться от мира.",
        moneyAndRealization: "Реализация через экспертность.",
        relationships: "Ценить ясный диалог.",
        lineageThemes: "Поддержка рода.",
        purposes: "Передавать знания.",
        yearProjection: null,
        reflectionQuestions: ["Что сейчас важно?", "Какой следующий шаг?"],
        practicalSteps: ["Записать наблюдения", "Обсудить выводы"],
        disclaimer: "Материал предназначен для саморефлексии и не заменяет профессиональную помощь."
      },
      plainText: overview
    },
    storageBucket: "elevenhouse-local-private",
    storageKey: "owner/matrix_report_pdf/job/report.pdf",
    originalFileName: "Матрица судьбы.pdf"
  };
}
