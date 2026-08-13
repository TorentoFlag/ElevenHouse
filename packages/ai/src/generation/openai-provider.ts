import type { ZodType } from "@elevenhouse/validation";
import type { AiGenerationPort } from "./ai-generation-port";
import type {
  AiGenerationMetadata,
  AiGenerationResult,
  AiModel,
  AiModelProfile,
  AiReasoningEffort,
  AiStructuredOutputJsonSchema,
  RenderedPrompt
} from "./ai-generation-types";

export type OpenAiClient = {
  readonly responses: {
    readonly create: (
      params: Record<string, unknown>,
      options?: { readonly maxRetries?: number }
    ) => Promise<unknown>;
  };
};

export type OpenAiRuntimeConfig = {
  readonly enabled: boolean;
  readonly openAiApiKey?: string;
  readonly openAiBaseUrl: string;
  readonly fastDraftModel: AiModel;
  readonly qualityDraftModel: AiModel;
  readonly timeoutMs: number;
};

type OpenAiResponseBody = {
  readonly model?: unknown;
  readonly output_text?: unknown;
  readonly output?: readonly { readonly content?: readonly { readonly type?: unknown }[] }[];
  readonly status?: unknown;
  readonly incomplete_details?: { readonly reason?: unknown } | null;
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
export class AiProviderIncompleteResponseError extends AiProviderError {}
export class AiProviderRefusalError extends AiProviderError {}
export class AiProviderOutcomeUnknownError extends AiProviderError {
  readonly terminalOutcome = "outcome_unknown" as const;
  readonly safeErrorCode = "AI_OUTCOME_UNKNOWN" as const;
  readonly redispatch = "forbidden" as const;
}

export function createOpenAiProvider(input: {
  readonly getConfig: () => OpenAiRuntimeConfig;
  readonly client: OpenAiClient;
}): AiGenerationPort {
  return {
    generateStructured: async <TOutput>(request: {
      readonly prompt: RenderedPrompt;
      readonly modelProfile: AiModelProfile;
      readonly requestedModel?: AiModel;
      readonly providerMaxRetries?: 0;
      readonly responseSchema: ZodType<TOutput>;
      readonly maxOutputTokens: number;
      readonly reasoningEffort: AiReasoningEffort;
      readonly safetyIdentifier: string;
      readonly structuredOutputName: string;
      readonly structuredOutputJsonSchema: AiStructuredOutputJsonSchema;
      readonly metadata: AiGenerationMetadata;
    }): Promise<AiGenerationResult<TOutput>> => {
      const config = input.getConfig();
      if (!config.enabled || !config.openAiApiKey) {
        throw new AiProviderUnavailableError("AI provider is disabled");
      }
      const model =
        request.requestedModel ??
        (request.modelProfile === "qualityDraft"
          ? config.qualityDraftModel
          : config.fastDraftModel);
      try {
        const requestBody = {
          model,
          store: false,
          safety_identifier: request.safetyIdentifier,
          max_output_tokens: request.maxOutputTokens,
          reasoning:
            request.reasoningEffort === "none" ? undefined : { effort: request.reasoningEffort },
          input: request.prompt.messages,
          text: {
            format: {
              type: "json_schema",
              name: request.structuredOutputName,
              schema: request.structuredOutputJsonSchema,
              strict: true
            }
          },
          tools: undefined
        };
        return parseOpenAiResponse({
          body:
            request.providerMaxRetries === undefined
              ? await input.client.responses.create(requestBody)
              : await input.client.responses.create(requestBody, {
                  maxRetries: request.providerMaxRetries
                }),
          responseSchema: request.responseSchema
        });
      } catch (error) {
        if (isKnownProviderError(error)) throw error;
        if (request.providerMaxRetries === 0 && isAmbiguousTransportError(error)) {
          throw new AiProviderOutcomeUnknownError("AI provider outcome is unknown");
        }
        if (isTimeoutError(error))
          throw new AiProviderTimeoutError("AI provider request timed out");
        const status = readHttpStatus(error);
        if (status !== undefined) throw mapOpenAiStatus(status);
        throw error;
      }
    }
  };
}

function parseOpenAiResponse<TOutput>(input: {
  readonly body: unknown;
  readonly responseSchema: ZodType<TOutput>;
}): AiGenerationResult<TOutput> {
  const body = readOpenAiBody(input.body);
  if (body.output?.some((item) => item.content?.some((content) => content.type === "refusal"))) {
    throw new AiProviderRefusalError("OpenAI response was refused");
  }
  if (body.status === "failed") throw new AiProviderServerError("OpenAI response failed");
  if (body.status === "incomplete")
    throw new AiProviderIncompleteResponseError("OpenAI response was incomplete");
  if (body.status !== "completed")
    throw new AiProviderResponseFormatError("OpenAI response status was unsupported");
  if (typeof body.output_text !== "string" || body.output_text.length === 0) {
    throw new AiProviderResponseFormatError("OpenAI response did not include output text");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(body.output_text);
  } catch {
    throw new AiProviderResponseFormatError("OpenAI response output text was not valid JSON");
  }
  const output = input.responseSchema.safeParse(decoded);
  if (!output.success)
    throw new AiProviderResponseFormatError("OpenAI response did not match output schema");
  if (
    typeof body.model !== "string" ||
    body.model !== body.model.trim() ||
    body.model.length === 0 ||
    body.model.length > 160
  ) {
    throw new AiProviderResponseFormatError("OpenAI response model provenance was invalid");
  }
  return {
    output: output.data,
    provider: "openai",
    model: body.model,
    finishReason: "completed",
    ...(body.usage ? { usage: parseUsage(body.usage) } : {})
  };
}

function readOpenAiBody(value: unknown): OpenAiResponseBody {
  if (!isRecord(value))
    throw new AiProviderResponseFormatError("OpenAI response body was not an object");
  if (value.usage !== undefined && !isRecord(value.usage))
    throw new AiProviderResponseFormatError("OpenAI usage was invalid");
  if (
    value.incomplete_details !== undefined &&
    value.incomplete_details !== null &&
    !isRecord(value.incomplete_details)
  ) {
    throw new AiProviderResponseFormatError("OpenAI incomplete details were invalid");
  }
  return value as OpenAiResponseBody;
}

function parseUsage(
  usage: NonNullable<OpenAiResponseBody["usage"]>
): AiGenerationResult<unknown>["usage"] {
  return {
    promptTokens: parseTokenCount(usage.input_tokens),
    completionTokens: parseTokenCount(usage.output_tokens),
    totalTokens: parseTokenCount(usage.total_tokens)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function readHttpStatus(error: unknown): number | undefined {
  return isRecord(error) && typeof error.status === "number" ? error.status : undefined;
}
function parseTokenCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AiProviderResponseFormatError("OpenAI usage token count was invalid");
  }
  return value;
}
function isTimeoutError(error: unknown): boolean {
  return (
    isRecord(error) &&
    (error.name === "AbortError" ||
      error.name === "APIConnectionTimeoutError" ||
      ("constructor" in error &&
        typeof error.constructor === "function" &&
        error.constructor.name === "APIConnectionTimeoutError"))
  );
}
function isAmbiguousTransportError(error: unknown): boolean {
  const constructorName = readErrorConstructorName(error);
  return (
    isTimeoutError(error) ||
    (isRecord(error) &&
      (error.name === "APIConnectionError" ||
        error.name === "APIConnectionTimeoutError" ||
        constructorName === "APIConnectionError" ||
        constructorName === "APIConnectionTimeoutError"))
  );
}
function readErrorConstructorName(error: unknown): string | undefined {
  return isRecord(error) &&
    "constructor" in error &&
    typeof error.constructor === "function" &&
    typeof error.constructor.name === "string"
    ? error.constructor.name
    : undefined;
}
function isKnownProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError;
}
function mapOpenAiStatus(status: number): Error {
  if (status === 401 || status === 403)
    return new AiProviderAuthenticationError("OpenAI authentication failed");
  if (status === 402) return new AiProviderBillingError("OpenAI billing quota is insufficient");
  if (status === 400 || status === 422)
    return new AiProviderBadRequestError("OpenAI request is invalid");
  if (status === 429) return new AiProviderRateLimitError("OpenAI rate limit reached");
  if (status === 500 || status === 503) return new AiProviderServerError("OpenAI server error");
  return new AiProviderServerError(`OpenAI returned HTTP ${status}`);
}
