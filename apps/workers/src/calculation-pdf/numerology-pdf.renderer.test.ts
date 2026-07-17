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

  it("uses the shared RU and EN compatibility audit copy instead of raw explanations", () => {
    const result = compatibilityResult();
    const hostile = {
      ...result,
      comparisons: result.comparisons.map((comparison) => ({
        ...comparison,
        explanation: "RAW key_numbers lifePath mixed"
      })),
      zones: result.zones.map((zone) => ({
        ...zone,
        explanation: "RAW inner_world different"
      })),
      conclusion: { ...result.conclusion, explanation: "RAW mixed" }
    };
    const ruContent = buildNumerologyPdfContent(document(hostile, "ru"));
    const enContent = buildNumerologyPdfContent(document(hostile, "en"));
    const ruComparison = table(ruContent, "22 сравнения").rows[0];
    const enComparison = table(enContent, "22 comparisons").rows[0];

    expect(ruComparison).toEqual([
      "Ключевые числа",
      "Число жизненного пути",
      "2",
      "5",
      "3",
      "Различие",
      "Число жизненного пути: 2 и 5. Разница — 3. По методике это категория «Различие»."
    ]);
    expect(enComparison).toEqual([
      "Core numbers",
      "Life path number",
      "2",
      "5",
      "3",
      "Different",
      "Life path number: 2 and 5. Difference — 3. The method classifies this as “Different”."
    ]);
    expect(section(ruContent, "Вывод").text).toBe(
      "Совпадения и близкие значения — 10; различия и напряжения — 12. Итог: смешанная совместимость."
    );
    expect(section(enContent, "Conclusion").text).toBe(
      "Matches and close values — 10; differences and tensions — 12. Result: mixed compatibility."
    );
    expect(JSON.stringify({ ruContent, enContent })).not.toContain("RAW");
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

  it("keeps the standard compatibility report compact enough to avoid an orphan conclusion", async () => {
    const rendered = await createNumerologyPdfRenderer().render(document(compatibilityResult()));

    expect(rendered.pageCount).toBeLessThanOrEqual(7);
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

function section(content: ReturnType<typeof buildNumerologyPdfContent>, heading: string) {
  const block = content.find((item) => item.kind === "section" && item.heading === heading);
  if (!block || block.kind !== "section") throw new Error(`Missing ${heading}`);
  return block;
}
