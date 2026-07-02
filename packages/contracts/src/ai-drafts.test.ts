import { describe, expect, it } from "vitest";
import {
  createDictionaryAiDraftRequestSchema,
  createDictionaryAiDraftResponseSchema
} from "./ai-drafts";

const categoryId = "8e14390f-3db1-4d1c-9344-55679c778427";

describe("AI draft contracts", () => {
  it("normalizes dictionary AI draft requests", () => {
    expect(
      createDictionaryAiDraftRequestSchema.parse({
        categoryId,
        locale: " ru ",
        title: "  Солнце в Овне  "
      })
    ).toEqual({
      categoryId,
      locale: "ru",
      title: "Солнце в Овне"
    });
  });

  it("rejects empty dictionary AI draft titles", () => {
    expect(() =>
      createDictionaryAiDraftRequestSchema.parse({
        categoryId,
        locale: "ru",
        title: "   "
      })
    ).toThrow();
  });

  it("parses OpenAI-backed dictionary AI draft responses", () => {
    expect(
      createDictionaryAiDraftResponseSchema.parse({
        content: "Черновик трактовки.",
        provider: "openai",
        model: "gpt-5.4-mini",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        finishReason: "completed",
        usage: {
          promptTokens: 100,
          completionTokens: 60,
          totalTokens: 160
        }
      })
    ).toEqual({
      content: "Черновик трактовки.",
      provider: "openai",
      model: "gpt-5.4-mini",
      promptId: "dictionary.entryDraft",
      promptVersion: 1,
      finishReason: "completed",
      usage: {
        promptTokens: 100,
        completionTokens: 60,
        totalTokens: 160
      }
    });
  });

  it("rejects obsolete DeepSeek response metadata", () => {
    expect(() =>
      createDictionaryAiDraftResponseSchema.parse({
        content: "Черновик трактовки.",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        finishReason: "stop"
      })
    ).toThrow();
  });

  it("rejects oversized AI draft content", () => {
    expect(() =>
      createDictionaryAiDraftResponseSchema.parse({
        content: "x".repeat(10_001),
        provider: "openai",
        model: "gpt-5.4-mini",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        finishReason: "completed"
      })
    ).toThrow();
  });
});
