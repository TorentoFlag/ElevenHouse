import { HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { definePrompt } from "@elevenhouse/ai";
import type { AiGenerationPort } from "@elevenhouse/ai";
import { z } from "@elevenhouse/validation";
import { describe, expect, it, vi } from "vitest";
import { AiGenerationService } from "./ai-generation.service";
import type { AiRateLimitDecision } from "./ai-rate-limiter";
import { createAiSafetyIdentifier } from "./ai-safety-identifier";
import {
  AiProviderAuthenticationError,
  AiProviderBadRequestError,
  AiProviderBillingError,
  AiProviderIncompleteResponseError,
  AiProviderRateLimitError,
  AiProviderRefusalError,
  AiProviderResponseFormatError,
  AiProviderServerError,
  AiProviderTimeoutError,
  AiProviderUnavailableError
} from "./openai-ai-provider";

const structuredOutputJsonSchema = {
  type: "object",
  properties: {
    content: { type: "string", minLength: 1 }
  },
  required: ["content"],
  additionalProperties: false
} as const;

const prompt = definePrompt({
  id: "dictionary.entryDraft",
  version: 1,
  locales: ["ru"],
  modelProfile: "fastDraft",
  responseFormat: "json",
  reasoningEffort: "low",
  maxOutputTokens: 900,
  structuredOutputName: "dictionary_entry_draft_v1",
  structuredOutputJsonSchema,
  inputSchema: z.object({ title: z.string().min(1) }),
  outputSchema: z.object({ content: z.string().min(1) }),
  render(input) {
    return { messages: [{ role: "user", content: input.title }] };
  }
});

const safetyIdentifier = createAiSafetyIdentifier("owner");

function createConfigService(enabled: boolean, maxOutputTokens = 900): ConfigService {
  return new ConfigService({
    astrologerApi: {
      ai: {
        enabled,
        maxOutputTokens
      }
    }
  });
}

describe("AiGenerationService", () => {
  it("rejects disabled AI before consuming rate limits or calling the provider", async () => {
    const provider = { generateStructured: vi.fn() };
    const rateLimiter = {
      consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true }))
    };
    const service = new AiGenerationService(
      provider,
      rateLimiter,
      { record: vi.fn() },
      createConfigService(false)
    );

    let error: unknown;

    try {
      await service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(rateLimiter.consume).not.toHaveBeenCalled();
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("rate-limits before calling the provider", async () => {
    const provider = { generateStructured: vi.fn() };
    const service = new AiGenerationService(
      provider,
      {
        consume: vi.fn(
          async (): Promise<AiRateLimitDecision> => ({
            allowed: false,
            retryAfterSeconds: 30
          })
        )
      },
      { record: vi.fn() },
      createConfigService(true)
    );

    let error: unknown;

    try {
      await service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((error as HttpException).getResponse()).toEqual({
      message: "AI generation rate limit reached",
      retryAfterSeconds: 30
    });
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("renders prompts and records successful usage", async () => {
    const record = vi.fn();
    const generateStructured = vi.fn(
      async () => ({
        output: { content: "Generated" },
        provider: "openai" as const,
        model: "gpt-5.4-mini" as const,
        finishReason: "completed" as const,
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
      })
    );
    const provider: AiGenerationPort = {
      generateStructured: generateStructured as unknown as AiGenerationPort["generateStructured"]
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      { record },
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      })
    ).resolves.toMatchObject({
      output: { content: "Generated" },
      provider: "openai"
    });

    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: { messages: [{ role: "user", content: "Sun in Aries" }] },
        reasoningEffort: "low",
        safetyIdentifier,
        structuredOutputName: "dictionary_entry_draft_v1",
        structuredOutputJsonSchema,
        metadata: expect.objectContaining({
          feature: "dictionary.aiDraft",
          promptId: "dictionary.entryDraft",
          promptVersion: 1,
          ownerUserId: safetyIdentifier,
          provider: "openai"
        })
      })
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "dictionary.aiDraft",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        ownerUserId: "owner",
        provider: "openai",
        model: "gpt-5.4-mini",
        finishReason: "completed",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
      })
    );
  });

  it("caps prompt output tokens by the runtime AI maximum", async () => {
    const generateStructured = vi.fn(
      async () => ({
        output: { content: "Generated" },
        provider: "openai" as const,
        model: "gpt-5.4-mini" as const,
        finishReason: "completed" as const
      })
    );
    const provider: AiGenerationPort = {
      generateStructured: generateStructured as unknown as AiGenerationPort["generateStructured"]
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      { record: vi.fn() },
      createConfigService(true, 300)
    );

    await service.generate({
      prompt,
      input: { title: "Sun in Aries" },
      ownerUserId: "owner",
      feature: "dictionary.aiDraft"
    });

    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 300
      })
    );
  });

  it.each([
    [new AiProviderUnavailableError("disabled"), HttpStatus.SERVICE_UNAVAILABLE],
    [new AiProviderAuthenticationError("auth failed"), HttpStatus.SERVICE_UNAVAILABLE],
    [new AiProviderBillingError("billing failed"), HttpStatus.SERVICE_UNAVAILABLE],
    [new AiProviderRateLimitError("rate limited"), HttpStatus.SERVICE_UNAVAILABLE],
    [new AiProviderServerError("server failed"), HttpStatus.SERVICE_UNAVAILABLE],
    [new AiProviderTimeoutError("timeout"), HttpStatus.SERVICE_UNAVAILABLE],
    [new AiProviderBadRequestError("bad upstream request"), HttpStatus.BAD_GATEWAY],
    [new AiProviderResponseFormatError("bad upstream response"), HttpStatus.BAD_GATEWAY],
    [new AiProviderIncompleteResponseError("incomplete"), HttpStatus.BAD_GATEWAY],
    [new AiProviderRefusalError("refused"), HttpStatus.UNPROCESSABLE_ENTITY]
  ])("maps %s to a user-safe HTTP error", async (providerError, expectedStatus) => {
    const provider = {
      generateStructured: vi.fn(async () => {
        throw providerError;
      })
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      { record: vi.fn() },
      createConfigService(true)
    );

    let error: unknown;

    try {
      await service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(expectedStatus);
    expect((error as HttpException).getResponse()).toEqual({
      message: expect.any(String)
    });
  });
});
