import { HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { definePrompt } from "@elevenhouse/ai";
import type { AiGenerationPort } from "@elevenhouse/ai";
import { z } from "@elevenhouse/validation";
import { describe, expect, it, vi } from "vitest";
import { AiGenerationService } from "./ai-generation.service";
import type { AiRateLimitDecision } from "./ai-rate-limiter";
import { createAiSafetyIdentifier } from "./ai-safety-identifier";
import type { AiUsageRecorderPort } from "./ai-usage-recorder";
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

const consentRecordId = "22222222-2222-4222-8222-222222222222";
const consentClientUserId = "33333333-3333-4333-8333-333333333333";
const consentAstrologerUserId = "44444444-4444-4444-8444-444444444444";
const consentSafetyIdentifier = createAiSafetyIdentifier(consentAstrologerUserId);

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
      createUsageRecorder(),
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
      createUsageRecorder(),
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

  it("rejects consent evidence outside the authenticated owner before cost or quota", async () => {
    const provider = { generateStructured: vi.fn() };
    const rateLimiter = {
      consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true }))
    };
    const usageRecorder = createUsageRecorder();
    const service = new AiGenerationService(
      provider,
      rateLimiter,
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "55555555-5555-4555-8555-555555555555",
        feature: "chart.interpretationDraft",
        consentAuthorizations: [
          {
            consentRecordId,
            clientUserId: consentClientUserId,
            astrologerUserId: consentAstrologerUserId
          }
        ]
      })
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { code: "AI_USAGE_EVIDENCE_UNAVAILABLE" }
    });
    expect(rateLimiter.consume).not.toHaveBeenCalled();
    expect(usageRecorder.start).not.toHaveBeenCalled();
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("rejects consent-bound generation without legal authority and source evidence before cost or quota", async () => {
    const provider = { generateStructured: vi.fn() };
    const rateLimiter = {
      consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true }))
    };
    const usageRecorder = createUsageRecorder();
    const service = new AiGenerationService(
      provider,
      rateLimiter,
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: consentAstrologerUserId,
        feature: "chart.interpretationDraft",
        consentAuthorizations: [
          {
            consentRecordId,
            clientUserId: consentClientUserId,
            astrologerUserId: consentAstrologerUserId
          }
        ]
      })
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { code: "AI_USAGE_EVIDENCE_UNAVAILABLE" }
    });
    expect(rateLimiter.consume).not.toHaveBeenCalled();
    expect(usageRecorder.start).not.toHaveBeenCalled();
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    "matrix.reportDraft",
    "numerology.interpretationDraft",
    "humanDesign.interpretationDraft",
    "unknown.clientFeature"
  ])("fails closed for client-derived feature %s without an approved purpose policy", async (feature) => {
    const provider = { generateStructured: vi.fn() };
    const rateLimiter = {
      consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true }))
    };
    const usageRecorder = createUsageRecorder();
    const service = new AiGenerationService(
      provider,
      rateLimiter,
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Client-derived context" },
        ownerUserId: consentAstrologerUserId,
        feature
      })
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { code: "AI_FEATURE_PROCESSING_AUTHORITY_UNAVAILABLE" }
    });
    expect(rateLimiter.consume).not.toHaveBeenCalled();
    expect(usageRecorder.start).not.toHaveBeenCalled();
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("requires calculation evidence for the registered chart feature", async () => {
    const provider = { generateStructured: vi.fn() };
    const rateLimiter = {
      consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true }))
    };
    const usageRecorder = createUsageRecorder();
    const service = new AiGenerationService(
      provider,
      rateLimiter,
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Calculated chart" },
        ownerUserId: consentAstrologerUserId,
        feature: "chart.interpretationDraft"
      })
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: { code: "AI_USAGE_EVIDENCE_UNAVAILABLE" }
    });
    expect(rateLimiter.consume).not.toHaveBeenCalled();
    expect(usageRecorder.start).not.toHaveBeenCalled();
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("generates a chart draft without client consent when its calculation evidence is present", async () => {
    const usageRecorder = createUsageRecorder();
    const generateStructured = vi.fn(async () => ({
      output: { content: "Generated" },
      provider: "openai" as const,
      model: "gpt-5.4-mini" as const,
      finishReason: "completed" as const
    }));
    const provider: AiGenerationPort = {
      generateStructured: generateStructured as unknown as AiGenerationPort["generateStructured"]
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Calculated chart" },
        ownerUserId: consentAstrologerUserId,
        feature: "chart.interpretationDraft",
        consentAuthorizations: [],
        usageEvidence: {
          processingAuthorityVersion: "openai-processing-authority.v1",
          resourceEvidence: {
            resourceType: "chart_calculation",
            resourceId: "88888888-8888-4888-8888-888888888888",
            sourceChecksum: `sha256:${"b".repeat(64)}`
          }
        }
      })
    ).resolves.toMatchObject({ output: { content: "Generated" } });

    expect(generateStructured).toHaveBeenCalledOnce();
    expect(usageRecorder.start).toHaveBeenCalledWith(
      expect.objectContaining({
        consentAuthorizations: [],
        processingAuthorityVersion: "openai-processing-authority.v1",
        resourceEvidence: {
          resourceType: "chart_calculation",
          resourceId: "88888888-8888-4888-8888-888888888888",
          sourceChecksum: `sha256:${"b".repeat(64)}`
        }
      })
    );
  });

  it("renders prompts and records successful usage", async () => {
    const usageRecorder = createUsageRecorder();
    const generateStructured = vi.fn(async () => ({
      output: { content: "Generated" },
      provider: "openai" as const,
      model: "gpt-5.4-mini" as const,
      finishReason: "completed" as const,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
    }));
    const provider: AiGenerationPort = {
      generateStructured: generateStructured as unknown as AiGenerationPort["generateStructured"]
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: consentAstrologerUserId,
        feature: "chart.interpretationDraft",
        consentAuthorizations: [
          {
            consentRecordId,
            clientUserId: consentClientUserId,
            astrologerUserId: consentAstrologerUserId
          }
        ],
        usageEvidence: {
          processingAuthorityVersion: "openai-processing-authority.v1",
          resourceEvidence: {
            resourceType: "chart_calculation",
            resourceId: "88888888-8888-4888-8888-888888888888",
            sourceChecksum: `sha256:${"b".repeat(64)}`
          }
        }
      })
    ).resolves.toMatchObject({
      output: { content: "Generated" },
      provider: "openai"
    });

    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: { messages: [{ role: "user", content: "Sun in Aries" }] },
        reasoningEffort: "low",
        safetyIdentifier: consentSafetyIdentifier,
        structuredOutputName: "dictionary_entry_draft_v1",
        structuredOutputJsonSchema,
        metadata: expect.objectContaining({
          feature: "chart.interpretationDraft",
          promptId: "dictionary.entryDraft",
          promptVersion: 1,
          ownerUserId: consentSafetyIdentifier,
          provider: "openai"
        })
      })
    );
    expect(usageRecorder.start).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "chart.interpretationDraft",
        promptId: "dictionary.entryDraft",
        promptVersion: 1,
        provider: "openai",
        ownerSafetyId: consentSafetyIdentifier,
        consentAuthorizations: [
          {
            consentRecordId,
            clientUserId: consentClientUserId,
            astrologerUserId: consentAstrologerUserId
          }
        ],
        processingAuthorityVersion: "openai-processing-authority.v1",
        resourceEvidence: {
          resourceType: "chart_calculation",
          resourceId: "88888888-8888-4888-8888-888888888888",
          sourceChecksum: `sha256:${"b".repeat(64)}`
        }
      })
    );
    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.not.objectContaining({
          processingAuthorityVersion: expect.anything(),
          resourceId: expect.anything(),
          sourceChecksum: expect.anything()
        })
      })
    );
    expect(usageRecorder.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        model: "gpt-5.4-mini",
        finishReason: "completed",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
      })
    );
  });

  it("caps prompt output tokens by the runtime AI maximum", async () => {
    const generateStructured = vi.fn(async () => ({
      output: { content: "Generated" },
      provider: "openai" as const,
      model: "gpt-5.4-mini" as const,
      finishReason: "completed" as const
    }));
    const provider: AiGenerationPort = {
      generateStructured: generateStructured as unknown as AiGenerationPort["generateStructured"]
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      createUsageRecorder(),
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
      createUsageRecorder(),
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

  it("does not call the provider when durable attempt creation fails", async () => {
    const provider = { generateStructured: vi.fn() };
    const usageRecorder = createUsageRecorder({
      start: vi.fn(async () => {
        throw new Error("database unavailable");
      })
    });
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      })
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    expect(usageRecorder.start).toHaveBeenCalledTimes(2);
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it("recovers an exact attempt start after a lost commit acknowledgement", async () => {
    const starts: unknown[] = [];
    const usageRecorder = createUsageRecorder({
      start: vi.fn(async (record) => {
        starts.push(record);
        if (starts.length === 1) throw new Error("commit acknowledgement lost");
        return record.attemptId;
      })
    });
    const providerImplementation = {
      generateStructured: vi.fn(async () => ({
        output: { content: "Generated" },
        provider: "openai" as const,
        model: "gpt-5.4-mini" as const,
        finishReason: "completed" as const
      }))
    };
    const provider: AiGenerationPort = {
      generateStructured:
        providerImplementation.generateStructured as unknown as AiGenerationPort["generateStructured"]
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      })
    ).resolves.toMatchObject({ output: { content: "Generated" } });
    expect(usageRecorder.start).toHaveBeenCalledTimes(2);
    expect(starts[1]).toEqual(starts[0]);
    expect(starts[0]).toMatchObject({ attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(providerImplementation.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("awaits durable failure evidence before returning a safe provider error", async () => {
    const events: string[] = [];
    const usageRecorder = createUsageRecorder({
      start: vi.fn(async (record) => {
        events.push("usage.started");
        return record.attemptId;
      }),
      fail: vi.fn(async (input) => {
        events.push(`usage.failed:${input.safeErrorCode}`);
      })
    });
    const provider = {
      generateStructured: vi.fn(async () => {
        events.push("provider.called");
        throw new AiProviderTimeoutError("raw timeout details");
      })
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      })
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    expect(events).toEqual([
      "usage.started",
      "provider.called",
      "usage.failed:AI_PROVIDER_TIMEOUT"
    ]);
    expect(usageRecorder.fail).toHaveBeenCalledWith(
      expect.not.objectContaining({ error: expect.anything(), message: expect.anything() })
    );
  });

  it("does not report generation success when durable completion fails", async () => {
    const usageRecorder = createUsageRecorder({
      complete: vi.fn(async () => {
        throw new Error("database unavailable");
      })
    });
    const providerImplementation = {
      generateStructured: vi.fn(async () => ({
        output: { content: "Generated" },
        provider: "openai" as const,
        model: "gpt-5.4-mini" as const,
        finishReason: "completed" as const
      }))
    };
    const provider: AiGenerationPort = {
      generateStructured:
        providerImplementation.generateStructured as unknown as AiGenerationPort["generateStructured"]
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      })
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    expect(usageRecorder.complete).toHaveBeenCalledTimes(2);
    expect(providerImplementation.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("recovers an exact successful terminal write after a lost commit acknowledgement", async () => {
    const terminalWrites: unknown[] = [];
    const usageRecorder = createUsageRecorder({
      complete: vi.fn(async (record) => {
        terminalWrites.push(record);
        if (terminalWrites.length === 1) throw new Error("commit acknowledgement lost");
      })
    });
    const providerImplementation = {
      generateStructured: vi.fn(async () => ({
        output: { content: "Generated" },
        provider: "openai" as const,
        model: "gpt-5.4-mini" as const,
        finishReason: "completed" as const
      }))
    };
    const provider: AiGenerationPort = {
      generateStructured:
        providerImplementation.generateStructured as unknown as AiGenerationPort["generateStructured"]
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      })
    ).resolves.toMatchObject({ output: { content: "Generated" } });
    expect(providerImplementation.generateStructured).toHaveBeenCalledTimes(1);
    expect(usageRecorder.complete).toHaveBeenCalledTimes(2);
    expect(terminalWrites[1]).toEqual(terminalWrites[0]);
  });

  it("recovers exact provider-failure evidence after a lost commit acknowledgement", async () => {
    const terminalWrites: unknown[] = [];
    const usageRecorder = createUsageRecorder({
      fail: vi.fn(async (record) => {
        terminalWrites.push(record);
        if (terminalWrites.length === 1) throw new Error("commit acknowledgement lost");
      })
    });
    const provider = {
      generateStructured: vi.fn(async () => {
        throw new AiProviderTimeoutError("raw timeout details");
      })
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      usageRecorder,
      createConfigService(true)
    );

    await expect(
      service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      })
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    expect(provider.generateStructured).toHaveBeenCalledTimes(1);
    expect(usageRecorder.fail).toHaveBeenCalledTimes(2);
    expect(terminalWrites[1]).toEqual(terminalWrites[0]);
  });

  it("uses monotonic duration and clamps completion time across a wall-clock rollback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
    const monotonicClock = vi
      .spyOn(performance, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_250);
    const usageRecorder = createUsageRecorder();
    const providerImplementation = {
      generateStructured: vi.fn(async () => {
        vi.setSystemTime(new Date("2026-08-03T11:59:00.000Z"));
        return {
          output: { content: "Generated" },
          provider: "openai" as const,
          model: "gpt-5.4-mini" as const,
          finishReason: "completed" as const
        };
      })
    };
    const provider: AiGenerationPort = {
      generateStructured:
        providerImplementation.generateStructured as unknown as AiGenerationPort["generateStructured"]
    };
    const service = new AiGenerationService(
      provider,
      { consume: vi.fn(async (): Promise<AiRateLimitDecision> => ({ allowed: true })) },
      usageRecorder,
      createConfigService(true)
    );

    try {
      await service.generate({
        prompt,
        input: { title: "Sun in Aries" },
        ownerUserId: "owner",
        feature: "dictionary.aiDraft"
      });
      expect(usageRecorder.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMs: 250,
          completedAt: new Date("2026-08-03T12:00:00.000Z")
        })
      );
    } finally {
      monotonicClock.mockRestore();
      vi.useRealTimers();
    }
  });
});

function createUsageRecorder(overrides: Partial<AiUsageRecorderPort> = {}) {
  const start = vi.fn<AiUsageRecorderPort["start"]>(async (record) => record.attemptId);
  const complete = vi.fn<AiUsageRecorderPort["complete"]>(async () => undefined);
  const fail = vi.fn<AiUsageRecorderPort["fail"]>(async () => undefined);
  const reconcileStale = vi.fn<AiUsageRecorderPort["reconcileStale"]>(async () => []);
  if (overrides.start) start.mockImplementation(overrides.start);
  if (overrides.complete) complete.mockImplementation(overrides.complete);
  if (overrides.fail) fail.mockImplementation(overrides.fail);
  if (overrides.reconcileStale) reconcileStale.mockImplementation(overrides.reconcileStale);
  return { start, complete, fail, reconcileStale };
}
