import { describe, expect, it } from "vitest";
import {
  buildHumanDesignPdfContent,
  createHumanDesignPdfRenderer
} from "./human-design-pdf.renderer";
import { individualResult } from "./human-design-pdf.source.test";

describe("Human Design PDF renderer", () => {
  it("builds deterministic Human Design sections without recalculating mechanics", () => {
    const blocks = buildHumanDesignPdfContent({
      kind: "human_design",
      locale: "ru",
      createdAt: "2026-07-23T12:00:00.000Z",
      calculationTitle: "Марина Краснова — Дизайн человека",
      approvedInterpretation: "Утверждённая трактовка",
      result: individualResult()
    });
    const serialized = JSON.stringify(blocks);

    expect(serialized).toContain("Генератор");
    expect(serialized).toContain("Сакральный");
    expect(serialized).toContain("Канал 20-34");
    expect(serialized).toContain("Утверждённая трактовка");
  });

  it("renders a valid non-empty PDF buffer", async () => {
    const rendered = await createHumanDesignPdfRenderer().render({
      kind: "human_design",
      locale: "en",
      createdAt: "2026-07-23T12:00:00.000Z",
      calculationTitle: "Human Design",
      approvedInterpretation: null,
      result: individualResult()
    });

    expect(rendered.pageCount).toBeGreaterThan(0);
    expect(rendered.bytes.subarray(0, 4).toString()).toBe("%PDF");
  });
});
