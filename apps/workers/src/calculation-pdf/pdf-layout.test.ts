import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createPdfLayout } from "./pdf-layout";

describe("shared calculation PDF layout", () => {
  it("is deterministic, embeds metadata and paginates long Cyrillic content", async () => {
    const render = async () => {
      const layout = await createPdfLayout({
        locale: "ru",
        title: "Нумерология",
        creator: "ElevenHouse Calculation PDF",
        createdAt: "2026-07-15T12:00:00.000Z"
      });
      layout.drawCover("Нумерология", "Персональный аналитический отчёт");
      layout.drawSection("Очень длинное имя", "А".repeat(500));
      layout.drawSection("Подробный разбор", "Содержательный текст. ".repeat(500));
      return layout.save();
    };

    const first = await render();
    const second = await render();
    const document = await PDFDocument.load(first.bytes);

    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.pageCount).toBeGreaterThan(2);
    expect(document.getPageCount()).toBe(first.pageCount);
    expect(document.getTitle()).toBe("Нумерология");
    expect(document.getAuthor()).toBe("ElevenHouse");
  });

  it("supports key/value and table sections without executable PDF actions", async () => {
    const layout = await createPdfLayout({
      locale: "en",
      title: "Numerology",
      creator: "ElevenHouse Calculation PDF",
      createdAt: "2026-07-15T12:00:00.000Z"
    });
    layout.drawCover("Numerology", "Compatibility report");
    layout.drawKeyValues("Core numbers", [
      { label: "Life path", value: "2" },
      { label: "Name", value: "<script>alert('x')</script>" }
    ]);
    layout.drawTable(
      "Lines",
      ["Line", "Value", "Level"],
      [
        ["Purpose", "5", "Strong"],
        ["Stability", "4", "Balanced"]
      ]
    );
    const pdf = await layout.save();

    expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.bytes.toString("latin1")).not.toContain("/JavaScript");
    expect(pdf.bytes.toString("latin1")).not.toContain("/JS");
  });
});
