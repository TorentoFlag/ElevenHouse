import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type {
  AiGenerationMetadata,
  AiGenerationPort,
  AiGenerationResult,
  AiModel,
  AiModelProfile,
  AiReasoningEffort,
  AiStructuredOutputJsonSchema,
  RenderedPrompt
} from "@elevenhouse/ai";
import type { ZodType } from "@elevenhouse/validation";
import { AI_OPENAI_CLIENT } from "./ai.tokens";

export type OpenAiClient = {
  readonly responses: {
    readonly create: (params: Record<string, unknown>) => Promise<unknown>;
  };
};

type OpenAiRuntimeConfig = {
  readonly enabled: boolean;
  readonly openAiApiKey?: string;
  readonly openAiBaseUrl: string;
  readonly fastDraftModel: AiModel;
  readonly qualityDraftModel: AiModel;
  readonly timeoutMs: number;
};

type OpenAiResponseBody = {
  readonly output_text?: unknown;
  readonly status?: unknown;
  readonly incomplete_details?: {
    readonly reason?: unknown;
  } | null;
  readonly usage?: {
    readonly input_tokens?: unknown;
    readonly output_tokens?: unknown;
    readonly total_tokens?: unknown;
  };
};

class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class AiProviderUnavailableError extends AiProviderError {}
export class AiProviderRateLimitError extends AiProviderError {}
export class AiProviderAuthenticationError extends AiProviderError {}
export class AiProviderBillingError extends AiProviderError {}
export class AiProviderBadRequestError extends AiProviderError {}
export class AiProviderServerError extends AiProviderError {}
export class AiProviderTimeoutError extends AiProviderError {}
export class AiProviderResponseFormatError extends AiProviderError {}

@Injectable()
export class OpenAiProvider implements AiGenerationPort {
  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(AI_OPENAI_CLIENT) private readonly injectedClient?: OpenAiClient
  ) {}

  async generateStructured<TOutput>(input: {
    readonly prompt: RenderedPrompt;
    readonly modelProfile: AiModelProfile;
    readonly responseSchema: ZodType<TOutput>;
    readonly maxOutputTokens: number;
    readonly reasoningEffort: AiReasoningEffort;
    readonly safetyIdentifier: string;
    readonly structuredOutputName: string;
    readonly structuredOutputJsonSchema: AiStructuredOutputJsonSchema;
    readonly metadata: AiGenerationMetadata;
  }): Promise<AiGenerationResult<TOutput>> {
    const config = this.configService.getOrThrow<OpenAiRuntimeConfig>("astrologerApi.ai");

    if (!config.enabled || !config.openAiApiKey) {
      throw new AiProviderUnavailableError("AI provider is disabled");
    }

    const model = resolveModel(input.modelProfile, config);

    try {
      return parseOpenAiResponse({
        body: await this.getClient(config).responses.create({
          model,
          store: false,
          safety_identifier: input.safetyIdentifier,
          max_output_tokens: input.maxOutputTokens,
          reasoning: createReasoning(input.reasoningEffort),
          input: input.prompt.messages,
          text: {
            format: {
              type: "json_schema",
              name: input.structuredOutputName,
              schema: input.structuredOutputJsonSchema,
              strict: true
            }
          },
          tools: undefined
        }),
        responseSchema: input.responseSchema,
        model
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new AiProviderTimeoutError("AI provider request timed out");
      }

      const status = readHttpStatus(error);
      if (status !== undefined) {
        throw mapOpenAiStatus(status);
      }

      throw error;
    }
  }

  private getClient(config: OpenAiRuntimeConfig): OpenAiClient {
    if (this.injectedClient) {
      return this.injectedClient;
    }

    return new OpenAI({
      apiKey: config.openAiApiKey,
      baseURL: config.openAiBaseUrl,
      timeout: config.timeoutMs
    }) as unknown as OpenAiClient;
  }
}

function resolveModel(modelProfile: AiModelProfile, config: OpenAiRuntimeConfig): AiModel {
  return modelProfile === "qualityDraft" ? config.qualityDraftModel : config.fastDraftModel;
}

function createReasoning(
  reasoningEffort: AiReasoningEffort
): { readonly effort: Exclude<AiReasoningEffort, "none"> } | undefined {
  return reasoningEffort === "none" ? undefined : { effort: reasoningEffort };
}

function parseOpenAiResponse<TOutput>({
  body,
  responseSchema,
  model
}: {
  readonly body: unknown;
  readonly responseSchema: ZodType<TOutput>;
  readonly model: AiModel;
}): AiGenerationResult<TOutput> {
  const openAiBody = readOpenAiBody(body);
  const outputText = openAiBody.output_text;

  if (typeof outputText !== "string" || outputText.length === 0) {
    throw new AiProviderResponseFormatError("OpenAI response did not include output text");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(outputText);
  } catch {
    throw new AiProviderResponseFormatError("OpenAI response output text was not valid JSON");
  }

  const parsedOutput = responseSchema.safeParse(parsedJson);
  if (!parsedOutput.success) {
    throw new AiProviderResponseFormatError("OpenAI response did not match output schema");
  }

  const usage = parseUsage(openAiBody.usage);

  return {
    output: parsedOutput.data,
    provider: "openai",
    model,
    finishReason: parseFinishReason(openAiBody.status, openAiBody.incomplete_details?.reason),
    ...(usage ? { usage } : {})
  };
}

function readOpenAiBody(body: unknown): OpenAiResponseBody {
  if (!isRecord(body)) {
    throw new AiProviderResponseFormatError("OpenAI response body was not an object");
  }

  if (body.usage !== undefined && !isRecord(body.usage)) {
    throw new AiProviderResponseFormatError("OpenAI usage was invalid");
  }

  const incompleteDetails = body.incomplete_details;
  if (
    incompleteDetails !== undefined &&
    incompleteDetails !== null &&
    !isRecord(incompleteDetails)
  ) {
    throw new AiProviderResponseFormatError("OpenAI incomplete details were invalid");
  }

  return {
    output_text: body.output_text,
    status: body.status,
    incomplete_details: incompleteDetails as OpenAiResponseBody["incomplete_details"],
    usage: body.usage as OpenAiResponseBody["usage"]
  };
}

function parseFinishReason(
  status: unknown,
  incompleteReason: unknown
): AiGenerationResult<unknown>["finishReason"] {
  if (status === "completed") {
    return "completed";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "incomplete") {
    return incompleteReason === "content_filter" ? "content_filter" : "incomplete";
  }

  throw new AiProviderResponseFormatError("OpenAI response status was unsupported");
}

function parseUsage(usage: OpenAiResponseBody["usage"]): AiGenerationResult<unknown>["usage"] {
  if (!usage) {
    return undefined;
  }

  return {
    promptTokens: readTokenCount(usage.input_tokens),
    completionTokens: readTokenCount(usage.output_tokens),
    totalTokens: readTokenCount(usage.total_tokens)
  };
}

function readTokenCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AiProviderResponseFormatError("OpenAI usage token count was invalid");
  }

  return value;
}

function readHttpStatus(error: unknown): number | undefined {
  if (!isRecord(error) || typeof error.status !== "number") {
    return undefined;
  }

  return error.status;
}

function mapOpenAiStatus(status: number): Error {
  if (status === 401) {
    return new AiProviderAuthenticationError("OpenAI authentication failed");
  }

  if (status === 402) {
    return new AiProviderBillingError("OpenAI billing quota is insufficient");
  }

  if (status === 400 || status === 422) {
    return new AiProviderBadRequestError("OpenAI request is invalid");
  }

  if (status === 429) {
    return new AiProviderRateLimitError("OpenAI rate limit reached");
  }

  if (status === 500 || status === 503) {
    return new AiProviderServerError("OpenAI server error");
  }

  return new AiProviderServerError(`OpenAI returned HTTP ${status}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}
