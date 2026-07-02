import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { z } from "@elevenhouse/validation";
import { describe, expect, it, vi } from "vitest";
import {
  AiProviderAuthenticationError,
  AiProviderBadRequestError,
  AiProviderBillingError,
  AiProviderRateLimitError,
  AiProviderResponseFormatError,
  AiProviderServerError,
  AiProviderTimeoutError,
  AiProviderUnavailableError,
  createDeepSeekUserKey,
  DeepSeekAiProvider,
  type Fetcher
} from "./deepseek-ai-provider";

type TestAiConfig = {
  readonly enabled: boolean;
  readonly deepSeekApiKey: string;
  readonly deepSeekBaseUrl: string;
  readonly fastDraftModel: "deepseek-v4-flash" | "deepseek-v4-pro";
  readonly qualityDraftModel: "deepseek-v4-flash" | "deepseek-v4-pro";
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
};

const baseAiConfig: TestAiConfig = {
  enabled: true,
  deepSeekApiKey: "deepseek-secret",
  deepSeekBaseUrl: "https://api.deepseek.com",
  fastDraftModel: "deepseek-v4-flash",
  qualityDraftModel: "deepseek-v4-pro",
  timeoutMs: 15000,
  maxOutputTokens: 900
};

const responseSchema = z.object({ content: z.string() });

function createConfigService(config: Partial<TestAiConfig> = {}): ConfigService {
  return new ConfigService({
    astrologerApi: {
      ai: {
        ...baseAiConfig,
        ...config
      }
    }
  });
}

function createProviderInput(
  input: Partial<Parameters<DeepSeekAiProvider["generateStructured"]>[0]> = {}
): Parameters<DeepSeekAiProvider["generateStructured"]>[0] {
  return {
    prompt: {
      messages: [
        { role: "system", content: "Return json." },
        { role: "user", content: "Title: Sun in Aries" }
      ]
    },
    modelProfile: "fastDraft",
    responseSchema,
    maxOutputTokens: 900,
    thinking: "disabled",
    userKey: "eh_owner_hash",
    metadata: {
      feature: "dictionary.aiDraft",
      promptId: "dictionary.entryDraft",
      promptVersion: 1,
      ownerUserId: "owner"
    },
    ...input
  };
}

function createDeepSeekBody(options: {
  readonly content?: unknown;
  readonly finishReason?: unknown;
  readonly usage?: unknown;
} = {}): unknown {
  const content = Object.hasOwn(options, "content")
    ? options.content
    : JSON.stringify({ content: "Generated draft" });
  const finishReason = Object.hasOwn(options, "finishReason") ? options.finishReason : "stop";
  const usage = Object.hasOwn(options, "usage")
    ? options.usage
    : {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      };

  return {
    choices: [
      {
        finish_reason: finishReason,
        message: {
          content
        }
      }
    ],
    ...(usage === undefined ? {} : { usage })
  };
}

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function createFetcher(response: Response): ReturnType<typeof vi.fn<Fetcher>> {
  return vi.fn<Fetcher>(async () => response);
}

describe("DeepSeekAiProvider", () => {
  it("calls DeepSeek chat completions with structured JSON settings", async () => {
    const fetcher = createFetcher(createJsonResponse(createDeepSeekBody()));
    const provider = new DeepSeekAiProvider(createConfigService(), fetcher);

    await expect(provider.generateStructured(createProviderInput())).resolves.toMatchObject({
      output: { content: "Generated draft" },
      provider: "deepseek",
      model: "deepseek-v4-flash",
      finishReason: "stop",
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15
      }
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer deepseek-secret",
          "content-type": "application/json"
        }),
        body: expect.any(String)
      })
    );
    const requestBody = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof requestBody).toBe("string");
    expect(JSON.parse(typeof requestBody === "string" ? requestBody : "")).toMatchObject({
      model: "deepseek-v4-flash",
      messages: [
        { role: "system", content: "Return json." },
        { role: "user", content: "Title: Sun in Aries" }
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      max_tokens: 900,
      user_id: "eh_owner_hash"
    });
  });

  it("normalizes trailing slash base URLs before calling DeepSeek", async () => {
    const fetcher = createFetcher(createJsonResponse(createDeepSeekBody()));
    const provider = new DeepSeekAiProvider(
      createConfigService({ deepSeekBaseUrl: "https://api.deepseek.com/" }),
      fetcher
    );

    await provider.generateStructured(createProviderInput());

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.any(Object)
    );
  });

  it("rejects malformed provider JSON before returning output", async () => {
    const fetcher = createFetcher(
      createJsonResponse(createDeepSeekBody({ content: "not-json", usage: undefined }))
    );
    const provider = new DeepSeekAiProvider(createConfigService(), fetcher);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderResponseFormatError
    );
  });

  it("rejects disabled provider config before calling DeepSeek", async () => {
    const fetcher = createFetcher(createJsonResponse(createDeepSeekBody()));
    const provider = new DeepSeekAiProvider(createConfigService({ enabled: false }), fetcher);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderUnavailableError
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps aborted provider requests to timeout errors", async () => {
    const fetcher = vi.fn<Fetcher>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );
    const provider = new DeepSeekAiProvider(createConfigService({ timeoutMs: 1 }), fetcher);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderTimeoutError
    );
  });

  it.each([
    [401, AiProviderAuthenticationError],
    [402, AiProviderBillingError],
    [400, AiProviderBadRequestError],
    [422, AiProviderBadRequestError],
    [429, AiProviderRateLimitError],
    [500, AiProviderServerError],
    [503, AiProviderServerError],
    [418, AiProviderServerError]
  ])("maps DeepSeek HTTP %i to a typed provider error", async (status, ErrorClass) => {
    const fetcher = createFetcher(createJsonResponse({ error: "provider-error" }, status));
    const provider = new DeepSeekAiProvider(createConfigService(), fetcher);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      ErrorClass
    );
  });

  it("rejects output that does not match the response schema", async () => {
    const fetcher = createFetcher(
      createJsonResponse(
        createDeepSeekBody({ content: JSON.stringify({ content: 123 }), usage: undefined })
      )
    );
    const provider = new DeepSeekAiProvider(createConfigService(), fetcher);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderResponseFormatError
    );
  });

  it.each([
    { body: {}, description: "missing choices" },
    { body: { choices: [] }, description: "empty choices" },
    { body: { choices: [{ finish_reason: "stop", message: {} }] }, description: "missing content" },
    {
      body: { choices: [{ finish_reason: "stop", message: { content: "" } }] },
      description: "empty content"
    },
    { body: { choices: "invalid" }, description: "invalid choices" }
  ])("rejects invalid DeepSeek response shape: $description", async ({ body }) => {
    const fetcher = createFetcher(createJsonResponse(body));
    const provider = new DeepSeekAiProvider(createConfigService(), fetcher);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderResponseFormatError
    );
  });

  it("maps accepted finish reasons from DeepSeek responses", async () => {
    const fetcher = createFetcher(
      createJsonResponse(createDeepSeekBody({ finishReason: "length", usage: undefined }))
    );
    const provider = new DeepSeekAiProvider(createConfigService(), fetcher);

    await expect(provider.generateStructured(createProviderInput())).resolves.toMatchObject({
      finishReason: "length"
    });
  });

  it.each([undefined, "tool_calls", "unexpected"])(
    "rejects unsupported DeepSeek finish reason %s",
    async (finishReason) => {
      const fetcher = createFetcher(
        createJsonResponse(createDeepSeekBody({ finishReason, usage: undefined }))
      );
      const provider = new DeepSeekAiProvider(createConfigService(), fetcher);

      await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
        AiProviderResponseFormatError
      );
    }
  );

  it.each([
    { usage: { prompt_tokens: 10, completion_tokens: 5 }, description: "missing total" },
    {
      usage: { prompt_tokens: -1, completion_tokens: 5, total_tokens: 15 },
      description: "negative"
    },
    {
      usage: { prompt_tokens: 10.5, completion_tokens: 5, total_tokens: 15 },
      description: "fractional"
    },
    {
      usage: { prompt_tokens: "10", completion_tokens: 5, total_tokens: 15 },
      description: "non-number"
    }
  ])("rejects malformed DeepSeek usage when present: $description", async ({ usage }) => {
    const fetcher = createFetcher(createJsonResponse(createDeepSeekBody({ usage })));
    const provider = new DeepSeekAiProvider(createConfigService(), fetcher);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderResponseFormatError
    );
  });

  it("selects the quality draft model for qualityDraft requests", async () => {
    const fetcher = createFetcher(createJsonResponse(createDeepSeekBody({ usage: undefined })));
    const provider = new DeepSeekAiProvider(createConfigService(), fetcher);

    await provider.generateStructured(createProviderInput({ modelProfile: "qualityDraft" }));

    const requestBody = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof requestBody).toBe("string");
    expect(JSON.parse(typeof requestBody === "string" ? requestBody : "")).toMatchObject({
      model: "deepseek-v4-pro"
    });
  });

  it("creates non-PII DeepSeek user keys from owner ids", () => {
    expect(createDeepSeekUserKey("owner")).toBe(
      "eh_4c1029697ee358715d3a14a2add817c4b01651440de808371f78165ac90dc581"
    );
  });

  it("can be instantiated by Nest without a fetcher provider", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeepSeekAiProvider,
        {
          provide: ConfigService,
          useValue: createConfigService()
        }
      ]
    }).compile();

    expect(moduleRef.get(DeepSeekAiProvider)).toBeInstanceOf(DeepSeekAiProvider);
  });
});
