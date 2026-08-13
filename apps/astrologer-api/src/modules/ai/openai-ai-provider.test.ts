import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { z } from "@elevenhouse/validation";
import { describe, expect, it, vi } from "vitest";
import { AI_OPENAI_CLIENT } from "./ai.tokens";
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
  AiProviderUnavailableError,
  OpenAiProvider,
  type OpenAiClient
} from "./openai-ai-provider";

type TestAiConfig = {
  readonly enabled: boolean;
  readonly openAiApiKey?: string;
  readonly openAiBaseUrl: string;
  readonly fastDraftModel: "gpt-5.4-mini" | "gpt-5.5";
  readonly qualityDraftModel: "gpt-5.4-mini" | "gpt-5.5";
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
};

const baseAiConfig: TestAiConfig = {
  enabled: true,
  openAiApiKey: "openai-secret",
  openAiBaseUrl: "https://api.openai.com/v1",
  fastDraftModel: "gpt-5.4-mini",
  qualityDraftModel: "gpt-5.5",
  timeoutMs: 15000,
  maxOutputTokens: 900
};

const responseSchema = z.object({ content: z.string() });
const structuredOutputJsonSchema = {
  type: "object",
  properties: {
    content: { type: "string", minLength: 1 }
  },
  required: ["content"],
  additionalProperties: false
} as const;

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
  input: Partial<Parameters<OpenAiProvider["generateStructured"]>[0]> = {}
): Parameters<OpenAiProvider["generateStructured"]>[0] {
  return {
    prompt: {
      messages: [
        { role: "system", content: "Return JSON." },
        { role: "user", content: "Title: Sun in Aries" }
      ]
    },
    modelProfile: "fastDraft",
    responseSchema,
    maxOutputTokens: 900,
    reasoningEffort: "low",
    safetyIdentifier: createAiSafetyIdentifier("owner"),
    structuredOutputName: "dictionary_entry_draft_v1",
    structuredOutputJsonSchema,
    metadata: {
      feature: "dictionary.aiDraft",
      promptId: "dictionary.entryDraft",
      promptVersion: 1,
      ownerUserId: "owner"
    },
    ...input
  };
}

function createOpenAiResponse(options: {
  readonly outputText?: unknown;
  readonly status?: unknown;
  readonly incompleteReason?: unknown;
  readonly usage?: unknown;
  readonly model?: unknown;
} = {}): unknown {
  const outputText = Object.hasOwn(options, "outputText")
    ? options.outputText
    : JSON.stringify({ content: "Generated draft" });
  const status = Object.hasOwn(options, "status") ? options.status : "completed";
  const usage = Object.hasOwn(options, "usage")
    ? options.usage
    : {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15
      };
  const model = Object.hasOwn(options, "model")
    ? options.model
    : "gpt-5.4-mini-2026-08-03";

  return {
    model,
    output_text: outputText,
    status,
    incomplete_details: options.incompleteReason
      ? { reason: options.incompleteReason }
      : null,
    ...(usage === undefined ? {} : { usage })
  };
}

function createClient(response: unknown): OpenAiClient {
  return {
    responses: {
      create: vi.fn(async () => response)
    }
  };
}

describe("OpenAiProvider", () => {
  it("calls OpenAI Responses API with structured output settings", async () => {
    const client = createClient(createOpenAiResponse());
    const provider = new OpenAiProvider(createConfigService(), client);

    await expect(provider.generateStructured(createProviderInput())).resolves.toMatchObject({
      output: { content: "Generated draft" },
      provider: "openai",
      model: "gpt-5.4-mini-2026-08-03",
      finishReason: "completed",
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15
      }
    });

    expect(client.responses.create).toHaveBeenCalledWith({
      model: "gpt-5.4-mini",
      store: false,
      safety_identifier: createAiSafetyIdentifier("owner"),
      max_output_tokens: 900,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: "Return JSON." },
        { role: "user", content: "Title: Sun in Aries" }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "dictionary_entry_draft_v1",
          schema: structuredOutputJsonSchema,
          strict: true
        }
      },
      tools: undefined
    });
  });

  it("passes no reasoning setting when prompt reasoning is none", async () => {
    const client = createClient(createOpenAiResponse());
    const provider = new OpenAiProvider(createConfigService(), client);

    await provider.generateStructured(createProviderInput({ reasoningEffort: "none" }));

    expect(client.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: undefined
      })
    );
  });

  it("rejects disabled provider config before calling OpenAI", async () => {
    const client = createClient(createOpenAiResponse());
    const provider = new OpenAiProvider(createConfigService({ enabled: false }), client);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderUnavailableError
    );
    expect(client.responses.create).not.toHaveBeenCalled();
  });

  it("maps aborted provider requests to timeout errors", async () => {
    const client: OpenAiClient = {
      responses: {
        create: vi.fn(async () => {
          throw new DOMException("Aborted", "AbortError");
        })
      }
    };
    const provider = new OpenAiProvider(createConfigService({ timeoutMs: 1 }), client);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderTimeoutError
    );
  });

  it("maps OpenAI SDK timeout errors to timeout errors", async () => {
    const client: OpenAiClient = {
      responses: {
        create: vi.fn(async () => {
          throw new OpenAI.APIConnectionTimeoutError();
        })
      }
    };
    const provider = new OpenAiProvider(createConfigService({ timeoutMs: 1 }), client);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderTimeoutError
    );
  });

  it.each([
    [401, AiProviderAuthenticationError],
    [403, AiProviderAuthenticationError],
    [402, AiProviderBillingError],
    [400, AiProviderBadRequestError],
    [422, AiProviderBadRequestError],
    [429, AiProviderRateLimitError],
    [500, AiProviderServerError],
    [503, AiProviderServerError],
    [418, AiProviderServerError]
  ])("maps OpenAI HTTP %i to a typed provider error", async (status, ErrorClass) => {
    const client: OpenAiClient = {
      responses: {
        create: vi.fn(async () => {
          throw { status };
        })
      }
    };
    const provider = new OpenAiProvider(createConfigService(), client);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      ErrorClass
    );
  });

  it("rejects malformed provider JSON before returning output", async () => {
    const client = createClient(createOpenAiResponse({ outputText: "not-json", usage: undefined }));
    const provider = new OpenAiProvider(createConfigService(), client);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderResponseFormatError
    );
  });

  it.each([undefined, "", " ", 42])(
    "rejects missing or malformed observed model provenance: %j",
    async (model) => {
      const response = createOpenAiResponse({ model });
      if (model === undefined && typeof response === "object" && response !== null) {
        delete (response as { model?: unknown }).model;
      }
      const provider = new OpenAiProvider(createConfigService(), createClient(response));

      await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
        AiProviderResponseFormatError
      );
    }
  );

  it("rejects output that does not match the response schema", async () => {
    const client = createClient(
      createOpenAiResponse({ outputText: JSON.stringify({ content: 123 }), usage: undefined })
    );
    const provider = new OpenAiProvider(createConfigService(), client);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderResponseFormatError
    );
  });

  it.each([
    { response: {}, description: "missing output text" },
    { response: { output_text: "", status: "completed" }, description: "empty output text" },
    { response: { output_text: "{}", status: "unexpected" }, description: "unsupported status" }
  ])("rejects invalid OpenAI response shape: $description", async ({ response }) => {
    const client = createClient(response);
    const provider = new OpenAiProvider(createConfigService(), client);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderResponseFormatError
    );
  });

  it("rejects incomplete responses before returning partial output", async () => {
    const client = createClient(
      createOpenAiResponse({ status: "incomplete", incompleteReason: "content_filter" })
    );
    const provider = new OpenAiProvider(createConfigService(), client);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderIncompleteResponseError
    );
  });

  it("rejects refusal responses before parsing output text", async () => {
    const client = createClient({
      status: "completed",
      output_text: "",
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "I cannot help with that." }]
        }
      ]
    });
    const provider = new OpenAiProvider(createConfigService(), client);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderRefusalError
    );
  });

  it.each([
    { usage: { input_tokens: 10, output_tokens: 5 }, description: "missing total" },
    { usage: { input_tokens: -1, output_tokens: 5, total_tokens: 15 }, description: "negative" },
    {
      usage: { input_tokens: 10.5, output_tokens: 5, total_tokens: 15 },
      description: "fractional"
    },
    {
      usage: { input_tokens: "10", output_tokens: 5, total_tokens: 15 },
      description: "non-number"
    }
  ])("rejects malformed OpenAI usage when present: $description", async ({ usage }) => {
    const client = createClient(createOpenAiResponse({ usage }));
    const provider = new OpenAiProvider(createConfigService(), client);

    await expect(provider.generateStructured(createProviderInput())).rejects.toBeInstanceOf(
      AiProviderResponseFormatError
    );
  });

  it("selects the quality draft model for qualityDraft requests", async () => {
    const client = createClient(createOpenAiResponse({ usage: undefined }));
    const provider = new OpenAiProvider(createConfigService(), client);

    await provider.generateStructured(createProviderInput({ modelProfile: "qualityDraft" }));

    expect(client.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.5"
      })
    );
  });

  it("can be instantiated by Nest without an OpenAI client provider", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OpenAiProvider,
        {
          provide: ConfigService,
          useValue: createConfigService()
        }
      ]
    }).compile();

    expect(moduleRef.get(OpenAiProvider)).toBeInstanceOf(OpenAiProvider);
  });

  it("uses an injected OpenAI client provider when present", async () => {
    const client = createClient(createOpenAiResponse());
    const moduleRef = await Test.createTestingModule({
      providers: [
        OpenAiProvider,
        {
          provide: ConfigService,
          useValue: createConfigService()
        },
        {
          provide: AI_OPENAI_CLIENT,
          useValue: client
        }
      ]
    }).compile();

    await moduleRef.get(OpenAiProvider).generateStructured(createProviderInput());

    expect(client.responses.create).toHaveBeenCalledOnce();
  });
});
