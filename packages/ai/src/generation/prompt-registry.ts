type RegistryPrompt = {
  readonly id: string;
  readonly version: number;
};

export type PromptRegistry<TPrompt extends RegistryPrompt> = {
  readonly get: (id: string, version: number) => TPrompt;
};

export function createPromptRegistry<TPrompt extends RegistryPrompt>(
  prompts: readonly TPrompt[]
): PromptRegistry<TPrompt> {
  const byKey = new Map<string, TPrompt>();

  for (const prompt of prompts) {
    const key = promptKey(prompt.id, prompt.version);
    if (byKey.has(key)) {
      throw new Error(`Duplicate AI prompt ${key}`);
    }

    byKey.set(key, prompt);
  }

  return Object.freeze({
    get(id: string, version: number): TPrompt {
      const key = promptKey(id, version);
      const prompt = byKey.get(key);

      if (!prompt) {
        throw new Error(`Unknown AI prompt ${key}`);
      }

      return prompt;
    }
  });
}

function promptKey(id: string, version: number): string {
  return `${id}@${version}`;
}
