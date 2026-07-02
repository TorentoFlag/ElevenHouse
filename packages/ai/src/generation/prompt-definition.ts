import type { AiPromptDefinition } from "./ai-generation-types";

export function definePrompt<TInput, TOutput>(
  definition: AiPromptDefinition<TInput, TOutput>
): AiPromptDefinition<TInput, TOutput> {
  if (!definition.id.trim()) {
    throw new Error("AI prompt id is required");
  }

  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error(`AI prompt ${definition.id} must use a positive integer version`);
  }

  if (definition.locales.length < 1) {
    throw new Error(`AI prompt ${definition.id}@${definition.version} must support a locale`);
  }

  if (
    !Number.isInteger(definition.maxOutputTokens) ||
    definition.maxOutputTokens < 1
  ) {
    throw new Error(`AI prompt ${definition.id}@${definition.version} must limit output tokens`);
  }

  return definition;
}
