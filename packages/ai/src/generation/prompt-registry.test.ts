import { z } from "@elevenhouse/validation";
import { describe, expect, it } from "vitest";
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
