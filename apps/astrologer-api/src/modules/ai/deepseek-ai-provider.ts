import { createHash } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AiGenerationMetadata,
  AiGenerationPort,
  AiGenerationResult,
  AiModelProfile,
  AiPromptThinkingMode,
  RenderedPrompt
} from "@elevenhouse/ai";
import type { ZodType } from "@elevenhouse/validation";
import { AI_FETCHER } from "./ai.tokens";

export type Fetcher = typeof fetch;

type DeepSeekModel = "deepseek-v4-flash" | "deepseek-v4-pro";
type DeepSeekFinishReason =
  | "stop"
  | "length"
  | "content_filter"
  | "insufficient_system_resource";

type DeepSeekAiConfig = {
  readonly enabled: boolean;
  readonly deepSeekApiKey?: string;
  readonly deepSeekBaseUrl: string;
  readonly fastDraftModel: DeepSeekModel;
  readonly qualityDraftModel: DeepSeekModel;
  readonly timeoutMs: number;
};

type DeepSeekChoice = {
  readonly finish_reason?: unknown;
  readonly message?: {
    readonly content?: unknown;
  };
};

type DeepSeekResponseBody = {
  readonly choices?: readonly DeepSeekChoice[];
  readonly usage?: {
    readonly prompt_tokens?: unknown;
    readonly completion_tokens?: unknown;
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
export class DeepSeekAiProvider implements AiGenerationPort {
  private readonly fetcher: Fetcher;

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(AI_FETCHER) fetcher?: Fetcher
  ) {
    this.fetcher = fetcher ?? fetch;
  }

  async generateStructured<TOutput>(input: {
    readonly prompt: RenderedPrompt;
    readonly modelProfile: AiModelProfile;
    readonly responseSchema: ZodType<TOutput>;
    readonly maxOutputTokens: number;
    readonly thinking: AiPromptThinkingMode;
    readonly userKey: string;
    readonly metadata: AiGenerationMetadata;
  }): Promise<AiGenerationResult<TOutput>> {
    const config = this.configService.getOrThrow<DeepSeekAiConfig>("astrologerApi.ai");

    if (!config.enabled || !config.deepSeekApiKey) {
      throw new AiProviderUnavailableError("AI provider is disabled");
    }

    const model = resolveModel(input.modelProfile, config);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), config.timeoutMs);

    try {
      const response = await this.fetcher(createDeepSeekChatCompletionsUrl(config.deepSeekBaseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.deepSeekApiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: input.prompt.messages,
          response_format: { type: "json_object" },
          thinking: { type: input.thinking },
          max_tokens: input.maxOutputTokens,
          user_id: input.userKey
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw mapDeepSeekStatus(response.status);
      }

      return parseDeepSeekResponse({
        body: await parseProviderJson(response),
        responseSchema: input.responseSchema,
        model
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new AiProviderTimeoutError("AI provider request timed out");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createDeepSeekUserKey(ownerUserId: string): string {
  return `eh_${createHash("sha256").update(ownerUserId).digest("hex")}`;
}

function resolveModel(modelProfile: AiModelProfile, config: DeepSeekAiConfig): DeepSeekModel {
  return modelProfile === "qualityDraft" ? config.qualityDraftModel : config.fastDraftModel;
}

function createDeepSeekChatCompletionsUrl(baseUrl: string): string {
  return new URL("chat/completions", ensureTrailingSlash(baseUrl)).toString();
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function mapDeepSeekStatus(status: number): Error {
  if (status === 401) {
    return new AiProviderAuthenticationError("DeepSeek authentication failed");
  }

  if (status === 402) {
    return new AiProviderBillingError("DeepSeek balance is insufficient");
  }

  if (status === 400 || status === 422) {
    return new AiProviderBadRequestError("DeepSeek request is invalid");
  }

  if (status === 429) {
    return new AiProviderRateLimitError("DeepSeek rate limit reached");
  }

  if (status === 500 || status === 503) {
    return new AiProviderServerError("DeepSeek server error");
  }

  return new AiProviderServerError(`DeepSeek returned HTTP ${status}`);
}

async function parseProviderJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AiProviderResponseFormatError("DeepSeek response body was not valid JSON");
  }
}

function parseDeepSeekResponse<TOutput>({
  body,
  responseSchema,
  model
}: {
  readonly body: unknown;
  readonly responseSchema: ZodType<TOutput>;
  readonly model: DeepSeekModel;
}): AiGenerationResult<TOutput> {
  const deepSeekBody = readDeepSeekBody(body);
  const choice = deepSeekBody.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content !== "string" || content.length === 0) {
    throw new AiProviderResponseFormatError("DeepSeek response did not include message content");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new AiProviderResponseFormatError("DeepSeek response content was not valid JSON");
  }

  const parsedOutput = responseSchema.safeParse(parsedJson);
  if (!parsedOutput.success) {
    throw new AiProviderResponseFormatError("DeepSeek response did not match output schema");
  }

  const usage = parseUsage(deepSeekBody.usage);

  return {
    output: parsedOutput.data,
    provider: "deepseek",
    model,
    finishReason: parseFinishReason(choice?.finish_reason),
    ...(usage ? { usage } : {})
  };
}

function readDeepSeekBody(body: unknown): DeepSeekResponseBody {
  if (!isRecord(body)) {
    throw new AiProviderResponseFormatError("DeepSeek response body was not an object");
  }

  const choices = body.choices;
  if (choices !== undefined && !Array.isArray(choices)) {
    throw new AiProviderResponseFormatError("DeepSeek response choices were invalid");
  }

  if (!Object.hasOwn(body, "usage")) {
    return {
      choices: choices as DeepSeekResponseBody["choices"]
    };
  }

  if (!isRecord(body.usage)) {
    throw new AiProviderResponseFormatError("DeepSeek usage was invalid");
  }

  return {
    choices: choices as DeepSeekResponseBody["choices"],
    usage: body.usage
  };
}

function parseFinishReason(value: unknown): DeepSeekFinishReason {
  if (
    value === "stop" ||
    value === "length" ||
    value === "content_filter" ||
    value === "insufficient_system_resource"
  ) {
    return value;
  }

  throw new AiProviderResponseFormatError("DeepSeek finish reason was unsupported");
}

function parseUsage(usage: DeepSeekResponseBody["usage"]): AiGenerationResult<unknown>["usage"] {
  if (!usage) {
    return undefined;
  }

  return {
    promptTokens: readTokenCount(usage.prompt_tokens),
    completionTokens: readTokenCount(usage.completion_tokens),
    totalTokens: readTokenCount(usage.total_tokens)
  };
}

function readTokenCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AiProviderResponseFormatError("DeepSeek usage token count was invalid");
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}
