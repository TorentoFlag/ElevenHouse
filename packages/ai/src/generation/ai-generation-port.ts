import type { ZodType } from "@elevenhouse/validation";
import type {
  AiGenerationMetadata,
  AiGenerationResult,
  AiModel,
  AiModelProfile,
  AiReasoningEffort,
  AiStructuredOutputJsonSchema,
  RenderedPrompt
} from "./ai-generation-types";

export type AiGenerationPort = {
  readonly generateStructured: <TOutput>(input: {
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
  }) => Promise<AiGenerationResult<TOutput>>;
};
