import type { ZodType } from "@elevenhouse/validation";

export type AiProviderName = "deepseek";
export type AiModelProfile = "fastDraft" | "qualityDraft";
export type AiPromptResponseFormat = "json";
export type AiPromptThinkingMode = "enabled" | "disabled";
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
  | "stop"
  | "length"
  | "content_filter"
  | "insufficient_system_resource";

export type AiGenerationMetadata = {
  readonly feature: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly ownerUserId: string;
};

export type AiGenerationResult<TOutput> = {
  readonly output: TOutput;
  readonly provider: AiProviderName;
  readonly model: "deepseek-v4-flash" | "deepseek-v4-pro";
  readonly finishReason: AiGenerationFinishReason;
  readonly usage?: AiGenerationUsage;
};

export type AiPromptDefinition<TInput, TOutput> = {
  readonly id: string;
  readonly version: number;
  readonly locales: readonly AiPromptLocale[];
  readonly modelProfile: AiModelProfile;
  readonly responseFormat: AiPromptResponseFormat;
  readonly thinking: AiPromptThinkingMode;
  readonly maxOutputTokens: number;
  readonly inputSchema: ZodType<TInput>;
  readonly outputSchema: ZodType<TOutput>;
  readonly render: (input: TInput) => RenderedPrompt;
};
