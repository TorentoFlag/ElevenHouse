import { z } from "@elevenhouse/validation";
import { describe, expect, it, vi } from "vitest";

import { astroDiaryPromptContextFixture } from "../prompts/astro-diary-prompt.test-fixtures";
import { astroDiaryReflectionQuestionDraftPromptV1 } from "../prompts/astro-diary-question-draft.v1";
import { createAiGenerationRuntime } from "./ai-generation-runtime";
import {
  AiProviderOutcomeUnknownError,
  createOpenAiProvider,
  type OpenAiClient
} from "./openai-provider";

describe("AstroDiary OpenAI request policy", () => {
  it("carries the purpose-bound model and retry policy from the prompt through the shared runtime", async () => {
    const create = vi.fn(async () => ({
      model: "gpt-5.5-2026-04-23",
      output_text: JSON.stringify({
        question: "Что помогло вам остаться в контакте с собой, когда вы обозначили границу?"
      }),
      status: "completed"
    }));
    const provider = createOpenAiProvider({
      getConfig: () => ({
        openAiApiKey: "test-key",
        openAiBaseUrl: "https://api.openai.com/v1",
        fastDraftModel: "gpt-5.4-mini",
        qualityDraftModel: "gpt-5.4-mini",
        timeoutMs: 15_000
      }),
      client: { responses: { create } }
    });
    const runtime = createAiGenerationRuntime<never, "AI_OUTCOME_UNKNOWN">({
      provider,
      rateLimiter: { consume: async () => ({ allowed: true }) },
      usageRecorder: {
        start: async ({ attemptId }) => attemptId,
        complete: vi.fn(async () => undefined),
        fail: vi.fn(async () => undefined)
      },
      getRuntimeConfig: () => ({ maxOutputTokens: 900 }),
      getUsageEvidenceRequirement: () => ({ usageEvidence: "forbidden" }),
      normalizeResourceEvidence: () => null,
      createSafetyIdentifier: () => "safe-owner",
      toSafeErrorCode: () => "AI_OUTCOME_UNKNOWN",
      idGenerator: () => "attempt-1"
    });

    await runtime.generate({
      prompt: astroDiaryReflectionQuestionDraftPromptV1,
      input: { target: "current_cycle", context: astroDiaryPromptContextFixture },
      ownerUserId: "owner-1",
      feature: "astroDiary.reflectionQuestionDraft"
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.5",
        store: false,
        text: {
          format: expect.objectContaining({
            name: "astro_diary_reflection_question_draft_v1",
            strict: true
          })
        }
      }),
      { maxRetries: 0 }
    );
  });

  it("enforces literal gpt-5.5, store false, strict output, and zero SDK retries", async () => {
    const client: OpenAiClient = {
      responses: {
        create: vi.fn(async () => ({
          model: "gpt-5.5-2026-04-23",
          output_text: JSON.stringify({ draftText: "Grounded draft" }),
          status: "completed"
        }))
      }
    };
    const provider = createOpenAiProvider({
      getConfig: () => ({
        openAiApiKey: "test-key",
        openAiBaseUrl: "https://api.openai.com/v1",
        fastDraftModel: "gpt-5.4-mini",
        qualityDraftModel: "gpt-5.4-mini",
        timeoutMs: 15_000
      }),
      client
    });

    await provider.generateStructured({
      prompt: { messages: [{ role: "user", content: "Draft" }] },
      modelProfile: "qualityDraft",
      requestedModel: "gpt-5.5",
      providerMaxRetries: 0,
      responseSchema: z.object({ draftText: z.string() }).strict(),
      maxOutputTokens: 600,
      reasoningEffort: "medium",
      safetyIdentifier: "safe-owner",
      structuredOutputName: "astro_diary_reflection_question_draft_v1",
      structuredOutputJsonSchema: {
        type: "object",
        properties: { draftText: { type: "string", maxLength: 600 } },
        required: ["draftText"],
        additionalProperties: false
      },
      metadata: {
        feature: "astroDiary.reflectionQuestionDraft",
        promptId: "astroDiary.reflectionQuestionDraft",
        promptVersion: 1,
        ownerUserId: "safe-owner"
      }
    });

    expect(client.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.5",
        store: false,
        text: {
          format: expect.objectContaining({
            type: "json_schema",
            strict: true
          })
        }
      }),
      { maxRetries: 0 }
    );
  });

  it("rejects changed source text before provider I/O when its leaf digest was reused", async () => {
    const create = vi.fn(async () => ({
      model: "gpt-5.5-2026-04-23",
      output_text: JSON.stringify({ question: "Что помогло вам заметить этот момент?" }),
      status: "completed"
    }));
    const provider = createOpenAiProvider({
      getConfig: () => ({
        openAiApiKey: "test-key",
        openAiBaseUrl: "https://api.openai.com/v1",
        fastDraftModel: "gpt-5.4-mini",
        qualityDraftModel: "gpt-5.4-mini",
        timeoutMs: 15_000
      }),
      client: { responses: { create } }
    });
    const runtime = createAiGenerationRuntime<never, "AI_OUTCOME_UNKNOWN">({
      provider,
      rateLimiter: { consume: async () => ({ allowed: true }) },
      usageRecorder: {
        start: async ({ attemptId }) => attemptId,
        complete: vi.fn(async () => undefined),
        fail: vi.fn(async () => undefined)
      },
      getRuntimeConfig: () => ({ maxOutputTokens: 900 }),
      getUsageEvidenceRequirement: () => ({ usageEvidence: "forbidden" }),
      normalizeResourceEvidence: () => null,
      createSafetyIdentifier: () => "safe-owner",
      toSafeErrorCode: () => "AI_OUTCOME_UNKNOWN",
      idGenerator: () => "attempt-1"
    });

    await expect(
      runtime.generate({
        prompt: astroDiaryReflectionQuestionDraftPromptV1,
        input: {
          target: "current_cycle",
          context: {
            ...astroDiaryPromptContextFixture,
            currentEntry: {
              ...astroDiaryPromptContextFixture.currentEntry,
              text: `${astroDiaryPromptContextFixture.currentEntry?.text} altered`
            }
          }
        },
        ownerUserId: "owner-1",
        feature: "astroDiary.reflectionQuestionDraft"
      })
    ).rejects.toThrow("AstroDiary source leaf digest is invalid");
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["APIConnectionTimeoutError", "APIConnectionError"])(
    "turns ambiguous %s transport into outcome_unknown without redispatch",
    async (errorName) => {
      const create = vi.fn(async () => {
        const error = new Error("ambiguous transport");
        error.name = errorName;
        throw error;
      });
      const provider = createOpenAiProvider({
        getConfig: () => ({
          openAiApiKey: "test-key",
          openAiBaseUrl: "https://api.openai.com/v1",
          fastDraftModel: "gpt-5.4-mini",
          qualityDraftModel: "gpt-5.4-mini",
          timeoutMs: 15_000
        }),
        client: { responses: { create } }
      });

      const result = provider.generateStructured({
        prompt: { messages: [{ role: "user", content: "Draft" }] },
        modelProfile: "qualityDraft",
        requestedModel: "gpt-5.5",
        providerMaxRetries: 0,
        responseSchema: z.object({ draftText: z.string() }).strict(),
        maxOutputTokens: 600,
        reasoningEffort: "medium",
        safetyIdentifier: "safe-owner",
        structuredOutputName: "astro_diary_reflection_question_draft_v1",
        structuredOutputJsonSchema: {
          type: "object",
          properties: { draftText: { type: "string", maxLength: 600 } },
          required: ["draftText"],
          additionalProperties: false
        },
        metadata: {
          feature: "astroDiary.reflectionQuestionDraft",
          promptId: "astroDiary.reflectionQuestionDraft",
          promptVersion: 1,
          ownerUserId: "safe-owner"
        }
      });

      await expect(result).rejects.toMatchObject({
        name: "AiProviderOutcomeUnknownError",
        terminalOutcome: "outcome_unknown",
        safeErrorCode: "AI_OUTCOME_UNKNOWN",
        redispatch: "forbidden"
      } satisfies Partial<AiProviderOutcomeUnknownError>);
      expect(create).toHaveBeenCalledOnce();
    }
  );

  it.each([
    class APIConnectionError extends Error {},
    class APIConnectionTimeoutError extends Error {}
  ])("recognizes the installed SDK constructor shape for %s", async (SdkTransportError) => {
    const create = vi.fn(async () => {
      throw new SdkTransportError("ambiguous transport");
    });
    const provider = createOpenAiProvider({
      getConfig: () => ({
        openAiApiKey: "test-key",
        openAiBaseUrl: "https://api.openai.com/v1",
        fastDraftModel: "gpt-5.4-mini",
        qualityDraftModel: "gpt-5.4-mini",
        timeoutMs: 15_000
      }),
      client: { responses: { create } }
    });

    await expect(
      provider.generateStructured({
        prompt: { messages: [{ role: "user", content: "Draft" }] },
        modelProfile: "qualityDraft",
        requestedModel: "gpt-5.5",
        providerMaxRetries: 0,
        responseSchema: z.object({ draftText: z.string() }).strict(),
        maxOutputTokens: 600,
        reasoningEffort: "medium",
        safetyIdentifier: "safe-owner",
        structuredOutputName: "astro_diary_reflection_question_draft_v1",
        structuredOutputJsonSchema: {
          type: "object",
          properties: { draftText: { type: "string", maxLength: 600 } },
          required: ["draftText"],
          additionalProperties: false
        },
        metadata: {
          feature: "astroDiary.reflectionQuestionDraft",
          promptId: "astroDiary.reflectionQuestionDraft",
          promptVersion: 1,
          ownerUserId: "safe-owner"
        }
      })
    ).rejects.toMatchObject({
      name: "AiProviderOutcomeUnknownError",
      terminalOutcome: "outcome_unknown",
      safeErrorCode: "AI_OUTCOME_UNKNOWN",
      redispatch: "forbidden"
    } satisfies Partial<AiProviderOutcomeUnknownError>);
    expect(create).toHaveBeenCalledOnce();
  });
});
