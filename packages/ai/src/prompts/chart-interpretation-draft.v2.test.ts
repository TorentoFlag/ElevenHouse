import { describe, expect, it } from "vitest";
import { chartInterpretationDraftPromptV2 } from "./chart-interpretation-draft.v2";

const transitInput = {
  locale: "ru" as const,
  methodCode: "transit" as const,
  subjectKind: "adult" as const,
  factors: [
    {
      section: "transit",
      facts: [
        { label: "Sun", value: "Aries 10°" },
        { label: "Moon", value: "Cancer 4°" }
      ]
    }
  ],
  warnings: [],
  dictionaryGrounding: []
};

describe("chart interpretation draft prompt v2", () => {
  it("renders method-specific instructions from validated non-natal factors", () => {
    expect(chartInterpretationDraftPromptV2.inputSchema.parse(transitInput)).toEqual(transitInput);

    const rendered = chartInterpretationDraftPromptV2.render(transitInput);
    expect(rendered.messages[0]?.content).toContain("транзитной карты");
    expect(rendered.messages[1]?.content).toContain("<chart_data>");
    expect(rendered.messages[1]?.content).toContain("Aries 10°");
  });

  it("uses a distinct child natal instruction and rejects child variants for other methods", () => {
    const childInput = {
      ...transitInput,
      methodCode: "natal" as const,
      subjectKind: "child" as const
    };

    expect(chartInterpretationDraftPromptV2.render(childInput).messages[0]?.content).toContain(
      "ребёнка"
    );
    expect(() =>
      chartInterpretationDraftPromptV2.inputSchema.parse({
        ...transitInput,
        subjectKind: "child"
      })
    ).toThrow();
  });

  it("renders horary-specific instructions and question context without boilerplate caveats", () => {
    const horaryInput = {
      ...transitInput,
      methodCode: "horary" as const,
      horaryQuestion: {
        question: "Подпишет ли клиент договор в этом месяце?",
        category: "career" as const
      }
    };

    expect(chartInterpretationDraftPromptV2.inputSchema.parse(horaryInput)).toEqual(horaryInput);

    const rendered = chartInterpretationDraftPromptV2.render(horaryInput);
    expect(chartInterpretationDraftPromptV2.version).toBe(5);
    expect(chartInterpretationDraftPromptV2.structuredOutputName).toBe(
      "chart_interpretation_draft_v5"
    );
    expect(rendered.messages[0]?.content).toContain("дай прямой рабочий ответ на вопрос");
    expect(rendered.messages[0]?.content).toContain("Не добавляй дисклеймеры");
    expect(rendered.messages[1]?.content).toContain("Подпишет ли клиент договор");
    expect(rendered.messages[1]?.content).toContain('"category": "career"');
  });
});
