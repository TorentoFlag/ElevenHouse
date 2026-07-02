# OpenAI AI Generation Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the DeepSeek-backed AI generation contour with OpenAI Responses API while preserving the existing reference modal AI draft flow.

**Architecture:** Keep the existing provider-neutral contour, feature-specific `/dictionary/ai-draft` endpoint, Redis rate limits, prompt registry and frontend mutation. Replace only provider-specific contracts, runtime config and adapter code. Current main has unrelated unstaged product-contract changes; preserve `products` exports while adding OpenAI AI changes.

**Tech Stack:** TypeScript, Nest.js, React, Vitest, Zod via `@elevenhouse/validation`, official `openai` TypeScript SDK, OpenAI Responses API.

---

## File Structure

- Modify `packages/contracts/src/ai-drafts.ts` and `ai-drafts.test.ts`: OpenAI provider/model/finish metadata.
- Modify `packages/contracts/src/index.ts`: keep both `ai-drafts` and any existing `products` export.
- Modify `packages/ai/src/generation/*`: provider-neutral OpenAI-compatible result/types and structured-output schema support.
- Modify `packages/ai/src/prompts/dictionary-entry-draft.v1.ts` and test: add explicit JSON schema and provider-neutral reasoning setting.
- Modify `apps/astrologer-api/src/config/runtime-config.ts` and test: OpenAI env names and validation.
- Delete `apps/astrologer-api/src/modules/ai/deepseek-ai-provider.ts` and test.
- Create `apps/astrologer-api/src/modules/ai/openai-ai-provider.ts` and test.
- Create `apps/astrologer-api/src/modules/ai/ai-safety-identifier.ts` and test.
- Modify `apps/astrologer-api/src/modules/ai/ai-generation.service.ts` and test: remove DeepSeek import.
- Modify `apps/astrologer-api/src/modules/ai/ai.module.ts` and test: wire OpenAI provider.
- Modify `apps/astrologer-api/package.json` and `pnpm-lock.yaml`: add `openai`.
- Modify dictionary AI backend/frontend tests for OpenAI response metadata.
- Modify OpenAI migration docs if implementation materially changes the design.

## Task 1: Contracts And Provider-Neutral Types

- [ ] **Step 1: Write failing contract/type tests**

Update:

```bash
packages/contracts/src/ai-drafts.test.ts
packages/ai/src/generation/prompt-registry.test.ts
packages/ai/src/prompts/dictionary-entry-draft.v1.test.ts
```

Expected test changes:

```ts
expect(createDictionaryAiDraftResponseSchema.parse({
  content: "Черновик",
  provider: "openai",
  model: "gpt-5.4-mini",
  promptId: "dictionary.entryDraft",
  promptVersion: 1,
  finishReason: "completed"
}).provider).toBe("openai");

expect(() =>
  createDictionaryAiDraftResponseSchema.parse({
    content: "Черновик",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    promptId: "dictionary.entryDraft",
    promptVersion: 1,
    finishReason: "stop"
  })
).toThrow();
```

- [ ] **Step 2: Run red tests**

```bash
pnpm test packages/contracts/src/ai-drafts.test.ts packages/ai/src/generation/prompt-registry.test.ts packages/ai/src/prompts/dictionary-entry-draft.v1.test.ts
```

Expected: fail because current schemas still expect DeepSeek ids.

- [ ] **Step 3: Implement contracts and provider-neutral types**

Update:

```ts
export type AiProviderName = "openai";
export type AiModel = "gpt-5.4-mini" | "gpt-5.5";
export type AiGenerationFinishReason =
  | "completed"
  | "incomplete"
  | "content_filter"
  | "refusal"
  | "failed";
export type AiReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
```

Add structured output schema support:

```ts
export type AiStructuredOutputJsonSchema = {
  readonly type: "object";
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
};
```

Update `dictionary.entryDraft` prompt with:

```ts
reasoningEffort: "low",
structuredOutputName: "dictionary_entry_draft_v1",
structuredOutputJsonSchema: {
  type: "object",
  properties: {
    content: { type: "string", minLength: 1, maxLength: dictionaryContentMaxLength }
  },
  required: ["content"],
  additionalProperties: false
}
```

- [ ] **Step 4: Run green tests**

```bash
pnpm test packages/contracts/src/ai-drafts.test.ts packages/ai/src/generation/prompt-registry.test.ts packages/ai/src/prompts/dictionary-entry-draft.v1.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/ai-drafts.ts packages/contracts/src/ai-drafts.test.ts packages/ai/src/generation packages/ai/src/prompts/dictionary-entry-draft.v1.ts packages/ai/src/prompts/dictionary-entry-draft.v1.test.ts
git commit -m "feat: update ai contracts for openai"
```

## Task 2: OpenAI Runtime Config

- [ ] **Step 1: Write failing config tests**

Update `apps/astrologer-api/src/config/runtime-config.test.ts` to expect:

```ts
expect(config.ai).toMatchObject({
  provider: "openai",
  openAiBaseUrl: "https://api.openai.com/v1",
  fastDraftModel: "gpt-5.4-mini",
  qualityDraftModel: "gpt-5.5"
});
```

Also assert:

```ts
ASTROLOGER_OPENAI_API_KEY is required when ASTROLOGER_AI_ENABLED=true
ASTROLOGER_OPENAI_BASE_URL must use https in production when ASTROLOGER_AI_ENABLED=true
```

- [ ] **Step 2: Run red config tests**

```bash
pnpm test apps/astrologer-api/src/config/runtime-config.test.ts
```

Expected: fail because config still uses DeepSeek env names.

- [ ] **Step 3: Implement config**

Replace DeepSeek env keys with:

```ts
ASTROLOGER_AI_PROVIDER: z.literal("openai").default("openai"),
ASTROLOGER_OPENAI_API_KEY: optionalTrimmedNonEmptyStringSchema,
ASTROLOGER_OPENAI_BASE_URL: z.string().trim().url().default("https://api.openai.com/v1"),
ASTROLOGER_AI_FAST_DRAFT_MODEL: z.enum(["gpt-5.4-mini", "gpt-5.5"]).default("gpt-5.4-mini"),
ASTROLOGER_AI_QUALITY_DRAFT_MODEL: z.enum(["gpt-5.4-mini", "gpt-5.5"]).default("gpt-5.5")
```

Keep all rate-limit env names unchanged.

- [ ] **Step 4: Run green config tests**

```bash
pnpm test apps/astrologer-api/src/config/runtime-config.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/astrologer-api/src/config/runtime-config.ts apps/astrologer-api/src/config/runtime-config.test.ts
git commit -m "feat: configure astrologer ai for openai"
```

## Task 3: OpenAI Provider

- [ ] **Step 1: Add SDK dependency**

```bash
pnpm add openai --filter @elevenhouse/astrologer-api
```

Expected: `apps/astrologer-api/package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Write failing provider tests**

Create:

```bash
apps/astrologer-api/src/modules/ai/ai-safety-identifier.test.ts
apps/astrologer-api/src/modules/ai/openai-ai-provider.test.ts
```

Required assertions:

```ts
expect(createAiSafetyIdentifier("owner")).toMatch(/^eh_[a-f0-9]{61}$/);
expect(createAiSafetyIdentifier("owner")).toHaveLength(64);
```

Provider request assertion:

```ts
expect(client.responses.create).toHaveBeenCalledWith(expect.objectContaining({
  model: "gpt-5.4-mini",
  store: false,
  safety_identifier: createAiSafetyIdentifier("owner"),
  max_output_tokens: 900,
  reasoning: { effort: "low" },
  text: {
    format: expect.objectContaining({
      type: "json_schema",
      name: "dictionary_entry_draft_v1",
      strict: true
    })
  },
  tools: undefined
}));
```

- [ ] **Step 3: Run red provider tests**

```bash
pnpm test apps/astrologer-api/src/modules/ai/ai-safety-identifier.test.ts apps/astrologer-api/src/modules/ai/openai-ai-provider.test.ts
```

Expected: fail because files do not exist.

- [ ] **Step 4: Implement provider**

Create `ai-safety-identifier.ts`:

```ts
import { createHash } from "node:crypto";

export function createAiSafetyIdentifier(ownerUserId: string): string {
  return `eh_${createHash("sha256").update(ownerUserId).digest("hex").slice(0, 61)}`;
}
```

Replace DeepSeek provider with OpenAI provider:

```ts
import OpenAI from "openai";

export class OpenAiProvider implements AiGenerationPort {
  async generateStructured<TOutput>(input: GenerateStructuredInput<TOutput>) {
    const response = await client.responses.create({
      model,
      input: input.prompt.messages,
      store: false,
      safety_identifier: input.safetyIdentifier,
      max_output_tokens: input.maxOutputTokens,
      reasoning: { effort: input.reasoningEffort },
      text: {
        format: {
          type: "json_schema",
          name: input.structuredOutputName,
          schema: input.structuredOutputJsonSchema,
          strict: true
        }
      }
    });

    if (response.status !== "completed") {
      throw new AiProviderResponseFormatError("OpenAI response was not completed");
    }

    const parsedJson = JSON.parse(response.output_text);
    const parsedOutput = input.responseSchema.safeParse(parsedJson);
    if (!parsedOutput.success) {
      throw new AiProviderResponseFormatError("OpenAI response did not match output schema");
    }
  }
}
```

Map SDK errors by `error.status` for `400`, `401`, `403`, `422`, `429`, `>=500`.

- [ ] **Step 5: Delete DeepSeek provider files**

```bash
git rm apps/astrologer-api/src/modules/ai/deepseek-ai-provider.ts apps/astrologer-api/src/modules/ai/deepseek-ai-provider.test.ts
```

- [ ] **Step 6: Run green provider tests**

```bash
pnpm test apps/astrologer-api/src/modules/ai/ai-safety-identifier.test.ts apps/astrologer-api/src/modules/ai/openai-ai-provider.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/astrologer-api/package.json pnpm-lock.yaml apps/astrologer-api/src/modules/ai
git commit -m "feat: add openai ai provider"
```

## Task 4: Wire AI Service And Module

- [ ] **Step 1: Write failing service/module tests**

Update:

```bash
apps/astrologer-api/src/modules/ai/ai-generation.service.test.ts
apps/astrologer-api/src/modules/ai/ai.module.test.ts
```

Assertions:

```ts
expect(provider.generateStructured).toHaveBeenCalledWith(expect.objectContaining({
  safetyIdentifier: createAiSafetyIdentifier(ownerUserId),
  metadata: expect.objectContaining({ provider: "openai" })
}));
expect(moduleRef.get(OpenAiProvider)).toBeInstanceOf(OpenAiProvider);
```

- [ ] **Step 2: Run red service/module tests**

```bash
pnpm test apps/astrologer-api/src/modules/ai/ai-generation.service.test.ts apps/astrologer-api/src/modules/ai/ai.module.test.ts
```

Expected: fail because service/module still imports DeepSeek.

- [ ] **Step 3: Implement service/module wiring**

Update `AiGenerationService`:

```ts
const safetyIdentifier = createAiSafetyIdentifier(input.ownerUserId);
await this.provider.generateStructured({
  ...,
  safetyIdentifier,
  reasoningEffort: input.prompt.reasoningEffort,
  structuredOutputName: input.prompt.structuredOutputName,
  structuredOutputJsonSchema: input.prompt.structuredOutputJsonSchema
});
```

Update `AiModule`:

```ts
{
  provide: AI_GENERATION_PROVIDER,
  useClass: OpenAiProvider
}
```

- [ ] **Step 4: Run green service/module tests**

```bash
pnpm test apps/astrologer-api/src/modules/ai/ai-generation.service.test.ts apps/astrologer-api/src/modules/ai/ai.module.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/astrologer-api/src/modules/ai
git commit -m "feat: wire ai service to openai"
```

## Task 5: Dictionary AI Backend And Frontend Metadata

- [ ] **Step 1: Write failing feature tests**

Update:

```bash
apps/astrologer-api/src/modules/dictionary-ai/dictionary-ai.service.test.ts
apps/astrologer-api/src/modules/dictionary-ai/dictionary-ai.e2e.test.ts
apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts
```

Expected response metadata:

```ts
provider: "openai",
model: "gpt-5.4-mini",
finishReason: "completed"
```

- [ ] **Step 2: Run red feature tests**

```bash
pnpm test apps/astrologer-api/src/modules/dictionary-ai/dictionary-ai.service.test.ts apps/astrologer-api/src/modules/dictionary-ai/dictionary-ai.e2e.test.ts apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts
```

Expected: fail because fixtures still use DeepSeek metadata.

- [ ] **Step 3: Implement fixture and schema changes**

Update dictionary AI service/e2e/frontend API fixtures to OpenAI metadata. No route shape changes.

- [ ] **Step 4: Run green feature tests**

```bash
pnpm test apps/astrologer-api/src/modules/dictionary-ai/dictionary-ai.service.test.ts apps/astrologer-api/src/modules/dictionary-ai/dictionary-ai.e2e.test.ts apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/astrologer-api/src/modules/dictionary-ai apps/astrologer-web/src/features/dictionary/api packages/contracts/src/ai-drafts.ts packages/contracts/src/ai-drafts.test.ts
git commit -m "feat: return openai ai draft metadata"
```

## Task 6: Remove DeepSeek References And Verify

- [ ] **Step 1: Search for DeepSeek references**

```bash
rg "DeepSeek|deepseek|ASTROLOGER_DEEPSEEK" apps packages docs/superpowers/specs/2026-07-02-openai-ai-generation-migration-design.md
```

Expected: no production-code references. Historical DeepSeek design files may still mention DeepSeek; do not rewrite old historical specs unless they confuse current source of truth.

- [ ] **Step 2: Run focused test suite**

```bash
pnpm test packages/contracts/src/ai-drafts.test.ts packages/ai/src/generation/prompt-registry.test.ts packages/ai/src/prompts/dictionary-entry-draft.v1.test.ts apps/astrologer-api/src/config/runtime-config.test.ts apps/astrologer-api/src/modules/ai/ai-safety-identifier.test.ts apps/astrologer-api/src/modules/ai/openai-ai-provider.test.ts apps/astrologer-api/src/modules/ai/ai-rate-limiter.test.ts apps/astrologer-api/src/modules/ai/ai-generation.service.test.ts apps/astrologer-api/src/modules/ai/ai.module.test.ts apps/astrologer-api/src/modules/dictionary-ai/dictionary-ai.service.test.ts apps/astrologer-api/src/modules/dictionary-ai/dictionary-ai.e2e.test.ts apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModal.test.tsx apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/ReferenceEntryModalView.test.tsx apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.test.ts
```

Expected: pass.

- [ ] **Step 3: Run typechecks**

```bash
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/ai typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: pass.

- [ ] **Step 4: Run targeted lint**

```bash
pnpm exec eslint "packages/contracts/src/ai-drafts.ts" "packages/contracts/src/ai-drafts.test.ts" "packages/ai/src/**/*.ts" "apps/astrologer-api/src/config/runtime-config.ts" "apps/astrologer-api/src/config/runtime-config.test.ts" "apps/astrologer-api/src/modules/ai/**/*.ts" "apps/astrologer-api/src/modules/dictionary-ai/**/*.ts" "apps/astrologer-web/src/features/dictionary/api/createDictionaryAiDraft.ts" "apps/astrologer-web/src/features/dictionary/api/dictionaryApi.test.ts" "apps/astrologer-web/src/features/dictionary/model/useCreateDictionaryAiDraftMutation.ts" "apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/*.tsx" "apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.ts" "apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.test.ts"
```

Expected: pass. Full `pnpm lint` may still fail on unrelated pre-existing auth lint warnings/errors; report separately if unchanged.

- [ ] **Step 5: Commit final cleanup**

```bash
git add apps packages docs/superpowers/plans/2026-07-02-openai-ai-generation-migration.md pnpm-lock.yaml
git commit -m "chore: finish openai ai migration"
```

