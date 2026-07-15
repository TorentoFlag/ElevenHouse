import { PDFDocument } from "pdf-lib";
import { numerologyResultSchema } from "@elevenhouse/contracts";
import { describe, expect, it } from "vitest";
import type { NumerologyPdfDocument } from "./calculation-pdf.documents";
import { buildNumerologyPdfContent, createNumerologyPdfRenderer } from "./numerology-pdf.renderer";
import { compatibilityResult, individualResult } from "./numerology-pdf.source.test";

describe("Numerology PDF renderer", () => {
  it("composes every individual Pythagorean result block without a fictitious score", () => {
    const content = buildNumerologyPdfContent(document(individualResult()));

    expect(keyValues(content, "Ключевые числа")).toHaveLength(5);
    expect(table(content, "Персональные месяцы").rows).toHaveLength(12);
    expect(keyValues(content, "Рабочие числа")).toHaveLength(4);
    expect(table(content, "Психоматрица").rows).toHaveLength(9);
    expect(table(content, "Линии силы").rows).toHaveLength(8);
    expect(table(content, "Линии силы").headers).toEqual([
      "Линия",
      "Ячейки",
      "Значение",
      "Уровень"
    ]);
    expect(JSON.stringify(content)).not.toContain("из 10");
    expect(JSON.stringify(content)).toContain("Текущая подтверждённая интерпретация");
  });

  it("composes both full profiles and all compatibility analytics", () => {
    const content = buildNumerologyPdfContent(document(compatibilityResult()));
    const strengthTables = content.filter(
      (block) => block.kind === "table" && block.heading.includes("Линии силы")
    );

    expect(strengthTables).toHaveLength(2);
    expect(strengthTables.every((block) => block.kind === "table" && block.rows.length === 8)).toBe(
      true
    );
    expect(table(content, "22 сравнения").rows).toHaveLength(22);
    expect(table(content, "Зоны совместимости").rows).toHaveLength(4);
    expect(table(content, "Итоговые количества").rows).toHaveLength(4);
    expect(JSON.stringify(content)).toContain("Число пары");
    expect(JSON.stringify(content)).toContain("Итог совместимости");
  });

  it("renders deterministic RU and EN multi-page PDFs with inert long text", async () => {
    const renderer = createNumerologyPdfRenderer();
    const ru = document(
      compatibilityResult(),
      "ru",
      "<script>alert('x')</script> Текст. ".repeat(500)
    );
    const en = document(individualResult(), "en");
    const first = await renderer.render(ru);
    const second = await renderer.render(ru);
    const english = await renderer.render(en);
    const ruDocument = await PDFDocument.load(first.bytes);
    const enDocument = await PDFDocument.load(english.bytes);

    expect(first.bytes.equals(second.bytes)).toBe(true);
    expect(first.pageCount).toBeGreaterThan(5);
    expect(ruDocument.getTitle()).toBe("Нумерология");
    expect(enDocument.getTitle()).toBe("Numerology");
    expect(first.bytes.toString("latin1")).not.toContain("/JavaScript");
    expect(first.bytes.toString("latin1")).not.toContain("/JS");
    expect(JSON.stringify(buildNumerologyPdfContent(en))).toContain("Core numbers");
  });
});

function document(
  result: ReturnType<typeof individualResult> | ReturnType<typeof compatibilityResult>,
  locale: "ru" | "en" = "ru",
  approvedInterpretation: string | null = "Текущая подтверждённая интерпретация"
): NumerologyPdfDocument {
  return {
    kind: "numerology",
    locale,
    createdAt: "2026-07-15T12:00:00.000Z",
    calculationTitle: "Тестовый расчёт",
    approvedInterpretation,
    result: numerologyResultSchema.parse(result)
  };
}

function keyValues(content: ReturnType<typeof buildNumerologyPdfContent>, heading: string) {
  const block = content.find((item) => item.kind === "key_values" && item.heading === heading);
  if (!block || block.kind !== "key_values") throw new Error(`Missing ${heading}`);
  return block.items;
}

function table(content: ReturnType<typeof buildNumerologyPdfContent>, heading: string) {
  const block = content.find((item) => item.kind === "table" && item.heading === heading);
  if (!block || block.kind !== "table") throw new Error(`Missing ${heading}`);
  return block;
}
