import { z } from "@elevenhouse/validation";
import { describe, expect, it } from "vitest";
import * as publicAiApi from "../index";
import { astroDiaryDraftReviewPromptV1 } from "../prompts/astro-diary-draft-review.v1";
import { astroDiaryReflectionQuestionDraftPromptV1 } from "../prompts/astro-diary-question-draft.v1";
import { astroDiaryReplyDraftPromptV1 } from "../prompts/astro-diary-reply-draft.v1";
import { chartInterpretationDraftPromptV1 } from "../prompts/chart-interpretation-draft.v1";
import { dictionaryEntryDraftPromptV1 } from "../prompts/dictionary-entry-draft.v1";
import { humanDesignInterpretationDraftPromptV1 } from "../prompts/human-design-interpretation-draft.v1";
import { matrixReportDraftPromptV1 } from "../prompts/matrix-report-draft.v1";
import { numerologyInterpretationDraftPromptV1 } from "../prompts/numerology-interpretation-draft.v1";
import { definePrompt } from "./prompt-definition";
import { createPromptRegistry } from "./prompt-registry";

const testPrompt = definePrompt({
  id: "dictionary.entryDraft",
  version: 1,
  locales: ["ru", "en"],
  modelProfile: "fastDraft",
  responseFormat: "json",
  reasoningEffort: "low",
  maxOutputTokens: 900,
  structuredOutputName: "dictionary_entry_draft_v1",
  structuredOutputJsonSchema: {
    type: "object",
    properties: {
      content: { type: "string", minLength: 1 }
    },
    required: ["content"],
    additionalProperties: false
  },
  inputSchema: z.object({ title: z.string().min(1) }),
  outputSchema: z.object({ content: z.string().min(1) }),
  render(input) {
    return {
      messages: [
        {
          role: "system",
          content: "Return json."
        },
        {
          role: "user",
          content: `Title: ${input.title}`
        }
      ]
    };
  }
});

describe("prompt registry", () => {
  it("characterizes the existing prompt identities and runtime profiles", () => {
    const existingPrompts = [
      dictionaryEntryDraftPromptV1,
      matrixReportDraftPromptV1,
      numerologyInterpretationDraftPromptV1,
      humanDesignInterpretationDraftPromptV1,
      chartInterpretationDraftPromptV1
    ];

    expect(
      existingPrompts.map((prompt) => ({
        id: prompt.id,
        version: prompt.version,
        locales: prompt.locales,
        modelProfile: prompt.modelProfile,
        reasoningEffort: prompt.reasoningEffort,
        maxOutputTokens: prompt.maxOutputTokens,
        structuredOutputName: prompt.structuredOutputName
      }))
    ).toEqual([
      {
        id: "dictionary.entryDraft",
        version: 1,
        locales: ["ru", "en"],
        modelProfile: "fastDraft",
        reasoningEffort: "low",
        maxOutputTokens: 900,
        structuredOutputName: "dictionary_entry_draft_v1"
      },
      {
        id: "matrix.reportDraft",
        version: 1,
        locales: ["ru", "en"],
        modelProfile: "qualityDraft",
        reasoningEffort: "medium",
        maxOutputTokens: 5_000,
        structuredOutputName: "matrix_report_draft_v1"
      },
      {
        id: "numerology.interpretationDraft",
        version: 1,
        locales: ["ru", "en"],
        modelProfile: "qualityDraft",
        reasoningEffort: "medium",
        maxOutputTokens: 3_500,
        structuredOutputName: "numerology_interpretation_draft_v1"
      },
      {
        id: "humanDesign.interpretationDraft",
        version: 1,
        locales: ["ru", "en"],
        modelProfile: "qualityDraft",
        reasoningEffort: "medium",
        maxOutputTokens: 3_500,
        structuredOutputName: "human_design_interpretation_draft_v1"
      },
      {
        id: "chart.interpretationDraft",
        version: 3,
        locales: ["ru", "en"],
        modelProfile: "qualityDraft",
        reasoningEffort: "medium",
        maxOutputTokens: 3_800,
        structuredOutputName: "chart_interpretation_draft_v3"
      }
    ]);
  });

  it("exports an isolated registry for the three frozen AstroDiary prompts", () => {
    const registry = Reflect.get(publicAiApi, "astroDiaryPromptRegistry") as
      | ReturnType<typeof createPromptRegistry>
      | undefined;

    expect(registry).toBeDefined();
    expect(registry?.get("astroDiary.replyDraft", 1)).toBe(astroDiaryReplyDraftPromptV1);
    expect(registry?.get("astroDiary.reflectionQuestionDraft", 1)).toBe(
      astroDiaryReflectionQuestionDraftPromptV1
    );
    expect(registry?.get("astroDiary.draftReview", 1)).toBe(astroDiaryDraftReviewPromptV1);
  });

  it("returns a registered prompt by id and version", () => {
    const registry = createPromptRegistry([testPrompt]);

    expect(registry.get("dictionary.entryDraft", 1)).toBe(testPrompt);
  });

  it("rejects unknown prompt ids", () => {
    const registry = createPromptRegistry([testPrompt]);

    expect(getThrownErrorMessage(() => registry.get("missing.prompt", 1))).toBe(
      "Unknown AI prompt missing.prompt@1"
    );
  });

  it("rejects duplicate prompt definitions", () => {
    expect(getThrownErrorMessage(() => createPromptRegistry([testPrompt, testPrompt]))).toBe(
      "Duplicate AI prompt dictionary.entryDraft@1"
    );
  });

  it("rejects structured output schemas that do not require every property", () => {
    expect(() =>
      definePrompt({
        ...testPrompt,
        id: "invalid.prompt",
        structuredOutputJsonSchema: {
          type: "object",
          properties: {
            content: { type: "string" },
            warning: { type: "string" }
          },
          required: ["content"],
          additionalProperties: false
        }
      })
    ).toThrow("AI prompt invalid.prompt@1 must require every structured output property");
  });
});

function getThrownErrorMessage(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }

    throw new Error("Expected action to throw an Error", { cause: error });
  }

  throw new Error("Expected action to throw");
}
