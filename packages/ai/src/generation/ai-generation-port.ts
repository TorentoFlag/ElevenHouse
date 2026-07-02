import type { ZodType } from "@elevenhouse/validation";
import type {
  AiGenerationMetadata,
  AiGenerationResult,
  AiModelProfile,
  AiPromptThinkingMode,
  RenderedPrompt
} from "./ai-generation-types";

export type AiGenerationPort = {
  readonly generateStructured: <TOutput>(input: {
    readonly prompt: RenderedPrompt;
    readonly modelProfile: AiModelProfile;
    readonly responseSchema: ZodType<TOutput>;
    readonly maxOutputTokens: number;
    readonly thinking: AiPromptThinkingMode;
    readonly userKey: string;
    readonly metadata: AiGenerationMetadata;
  }) => Promise<AiGenerationResult<TOutput>>;
};
