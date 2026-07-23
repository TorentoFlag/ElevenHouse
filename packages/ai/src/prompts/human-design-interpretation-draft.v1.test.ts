import { describe, expect, it } from "vitest";
import {
  humanDesignInterpretationDraftPromptV1,
  renderHumanDesignInterpretationText,
  type HumanDesignInterpretationDraftPromptInput,
  type HumanDesignInterpretationDraftPromptOutput
} from "./human-design-interpretation-draft.v1";

const input: HumanDesignInterpretationDraftPromptInput = {
  locale: "ru",
  methodCode: "human_design_classic",
  engineRevision: 1,
  resultChecksum: `sha256:${"a".repeat(64)}`,
  mode: "individual",
  subject: {
    type: "generator",
    strategy: "wait_to_respond",
    authority: "sacral",
    profile: "1/3",
    definition: "single",
    signature: "satisfaction",
    notSelfTheme: "frustration",
    incarnationCross: {
      angle: "right_angle",
      profileCode: "1/3",
      gateSequence: [20, 1, 34, 2]
    },
    definedCenters: ["throat", "sacral"],
    definedChannels: ["20-34"],
    definedGates: [20, 34]
  },
  partner: null,
  compatibility: null,
  transit: null
};

const output: HumanDesignInterpretationDraftPromptOutput = {
  overview: "Обзор",
  mechanics: "Механика",
  sessionFocus: "Фокус",
  conditioningRisks: "Риски",
  relationshipFocus: null,
  transitFocus: null,
  reflectionQuestions: ["Первый?", "Второй?", "Третий?"],
  disclaimer: "Не заменяет профессиональную помощь."
};

describe("humanDesignInterpretationDraftPromptV1", () => {
  it("defines a structured Human Design interpretation draft prompt", () => {
    expect(humanDesignInterpretationDraftPromptV1).toMatchObject({
      id: "humanDesign.interpretationDraft",
      version: 1,
      locales: ["ru", "en"],
      modelProfile: "qualityDraft",
      responseFormat: "json"
    });
    expect(humanDesignInterpretationDraftPromptV1.inputSchema.parse(input)).toEqual(input);
    expect(humanDesignInterpretationDraftPromptV1.outputSchema.parse(output)).toEqual(output);
    expect(humanDesignInterpretationDraftPromptV1.structuredOutputJsonSchema.required).toContain(
      "transitFocus"
    );
  });

  it("renders guardrails and escapes data as data", () => {
    const rendered = humanDesignInterpretationDraftPromptV1.render({
      ...input,
      subject: { ...input.subject, definedGates: [20, 34, 57] }
    });
    const content = rendered.messages.map((message) => message.content).join("\n");

    expect(content).toContain("не рассчитывай ворота");
    expect(content).toContain("<human_design_data>");
    expect(content).toContain('"definedGates"');
    expect(rendered.messages[1]?.content).not.toContain("birth");
  });

  it("renders localized editable draft text", () => {
    expect(renderHumanDesignInterpretationText(output, "ru")).toContain("ОБЗОР\nОбзор");
    expect(renderHumanDesignInterpretationText({ ...output, overview: "Overview" }, "en"))
      .toContain("OVERVIEW\nOverview");
  });
});
