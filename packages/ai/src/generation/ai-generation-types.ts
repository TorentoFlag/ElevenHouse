import type { ZodType } from "@elevenhouse/validation";

export type AiProviderName = "openai";
export type AiModel = "gpt-5.4-mini" | "gpt-5.5";
export type AiModelProfile = "fastDraft" | "qualityDraft";
export type AiPromptResponseFormat = "json";
export type AiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type AiPromptLocale = "ru" | "en";
export type AiChatRole = "system" | "user" | "assistant";

export type AiChatMessage = {
  readonly role: AiChatRole;
  readonly content: string;
};

export type RenderedPrompt = {
  readonly messages: readonly AiChatMessage[];
};

export type AiGenerationUsage = {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
};

export type AiGenerationFinishReason =
  | "completed"
  | "incomplete"
  | "content_filter"
  | "refusal"
  | "failed";

export type AiGenerationMetadata = {
  readonly feature: string;
  readonly provider?: AiProviderName;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly ownerUserId: string;
};

export type AiGenerationResult<TOutput> = {
  readonly output: TOutput;
  readonly provider: AiProviderName;
  /** Exact model identifier observed in the provider response, not the requested alias. */
  readonly model: string;
  readonly finishReason: AiGenerationFinishReason;
  readonly usage?: AiGenerationUsage;
};

export type AiStructuredOutputJsonSchema = {
  readonly type: "object";
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
};

export type AiPromptDefinition<TInput, TOutput> = {
  readonly id: string;
  readonly version: number;
  readonly locales: readonly AiPromptLocale[];
  readonly modelProfile: AiModelProfile;
  /** Optional purpose-bound model override. Existing prompts keep profile-based selection. */
  readonly requestedModel?: AiModel;
  /** Optional per-request SDK retry override. Existing prompts keep SDK defaults. */
  readonly providerMaxRetries?: 0;
  readonly responseFormat: AiPromptResponseFormat;
  readonly reasoningEffort: AiReasoningEffort;
  readonly maxOutputTokens: number;
  readonly structuredOutputName: string;
  readonly structuredOutputJsonSchema: AiStructuredOutputJsonSchema;
  readonly inputSchema: ZodType<TInput>;
  readonly outputSchema: ZodType<TOutput>;
  readonly render: (input: TInput) => RenderedPrompt;
};
