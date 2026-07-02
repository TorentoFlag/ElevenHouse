import { HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { definePrompt } from "@elevenhouse/ai";
import type { AiGenerationPort } from "@elevenhouse/ai";
import { z } from "@elevenhouse/validation";
import { describe, expect, it, vi } from "vitest";
import { AiGenerationService } from "./ai-generation.service";
import type { AiRateLimitDecision } from "./ai-rate-limiter";
import { AiProviderUnavailableError } from "./deepseek-ai-provider";

const prompt = definePrompt({
  id: "dictionary.entryDraft",
  version: 1,
  locales: ["ru"],
  modelProfile: "fastDraft",
  responseFormat: "json",
  thinking: "disabled",
  maxOutputTokens: 900,
  inputSchema: z.object({ title: z.string().min(1) }),
  outputSchema: z.object({ content: z.string().min(1) }),
  render(input) {
    return { messages: [{ role: "user", content: input.title }] };
  }
});

const hashedOwnerUserId = "eh_4c1029697ee358715d3a14a2add817c4b01651440de808371f78165ac90dc581";

function createConfigService(enabled: boolean): ConfigService {
  return new ConfigService({
    astrologerApi: {
      ai: {
        enabled
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

    await expect(
      service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      })
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
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
        provider: "deepseek" as const,
        model: "deepseek-v4-flash" as const,
        finishReason: "stop" as const,
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
      provider: "deepseek"
    });

    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: { messages: [{ role: "user", content: "Sun in Aries" }] },
        userKey: expect.stringMatching(/^eh_[a-f0-9]{64}$/),
        metadata: {
          feature: "dictionary.aiDraft",
          promptId: "dictionary.entryDraft",
          promptVersion: 1,
          ownerUserId: hashedOwnerUserId
        }
      })
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "dictionary.aiDraft",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        ownerUserId: "owner",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
      })
    );
  });
});
