# AI Generation Contour Design

## Status

Approved for implementation planning.

## Context

ElevenHouse needs a real AI integration for the astrologer reference modal. The
current `AI-черновик` button fills the interpretation text from a local template.
The new integration must call DeepSeek using the platform API key, but the design
must not be limited to one button. The same contour should support future AI
features such as consultation preparation, message drafts, content outlines and
astrological briefs.

Project constraints:

- API keys must never be exposed to browser applications.
- AI features for astrologers belong behind `apps/astrologer-api`, not
  `client-web` or `public-api`.
- Contracts must live in `packages/contracts`; frontend/backend DTOs must not be
  informal duplicates.
- Backend apps use Nest feature modules under `src/modules/<module-name>/`.
- Packages may be imported by apps; packages must not import app code.
- User-provided text and future external context must be treated as untrusted data
  in prompts.

Relevant current code:

- `apps/astrologer-api/src/app.module.ts`
- `apps/astrologer-api/src/modules/dictionary/`
- `apps/astrologer-api/src/modules/security/`
- `apps/astrologer-api/src/modules/redis/`
- `apps/astrologer-web/src/pages/reference/components/ReferenceEntryModal/`
- `apps/astrologer-web/src/pages/reference/helpers/referenceEntryDraft.ts`
- `packages/contracts/src/dictionary.ts`

## External Research

DeepSeek API findings:

- OpenAI-compatible Chat Completions are available at
  `https://api.deepseek.com`.
- Current model ids are `deepseek-v4-flash` and `deepseek-v4-pro`.
- Legacy `deepseek-chat` and `deepseek-reasoner` are documented as deprecated on
  `2026-07-24 15:59 UTC`; new code must not depend on those names.
- Both current models support JSON Output, tool calls and context caching.
- JSON Output requires both `response_format: { type: "json_object" }` and prompt
  instructions that explicitly ask for JSON and show the target shape.
- `thinking` can be disabled for low-latency short drafts.
- DeepSeek supports `user_id`; it must not include privacy data.
- DeepSeek has account-level concurrency limits and returns `429` when exceeded.

Primary sources:

- https://api-docs.deepseek.com/api/create-chat-completion
- https://api-docs.deepseek.com/guides/json_mode
- https://api-docs.deepseek.com/guides/kv_cache
- https://api-docs.deepseek.com/quick_start/rate_limit
- https://api-docs.deepseek.com/quick_start/pricing
- https://api-docs.deepseek.com/quick_start/error_codes

Security and architecture sources:

- OWASP LLM Prompt Injection Prevention Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
- Nest feature modules and custom providers:
  https://docs.nestjs.com/modules
  https://docs.nestjs.com/fundamentals/custom-providers
- Nest configuration:
  https://docs.nestjs.com/techniques/configuration

## Decision

Build a reusable AI generation contour with three layers:

1. `packages/ai`: provider-neutral prompt definitions, prompt rendering,
   provider ports and output schemas.
2. `apps/astrologer-api/src/modules/ai`: app-level AI infrastructure, including
   DeepSeek adapter, config, rate limiting, usage metadata and error mapping.
3. Feature-specific modules such as `dictionary-ai`: authenticated endpoints and
   use cases that select approved prompts and map product inputs to prompt inputs.

Do not expose a generic browser-callable endpoint such as
`POST /ai/generate { promptId, input }`. Each product feature gets a specific
endpoint with its own contract and authorization semantics. This prevents
`astrologer-api` from becoming an unbounded DeepSeek proxy.

## Non-Goals

- Do not build admin-managed prompt editing in this first implementation.
- Do not add a prompt-management SaaS dependency.
- Do not allow frontend code to send arbitrary system prompts.
- Do not give the model tools or internal actions for the dictionary draft use
  case.
- Do not automatically save AI output as a dictionary entry.
- Do not implement long-running worker generation for the reference modal.

## Architecture

Target file layout:

```text
packages/ai/
  package.json
  src/
    index.ts
    generation/
      ai-generation-port.ts
      ai-generation-types.ts
      prompt-definition.ts
      prompt-registry.ts
      render-prompt.ts
    prompts/
      dictionary-entry-draft.v1.ts
      dictionary-entry-draft.v1.test.ts

apps/astrologer-api/src/modules/ai/
  ai.module.ts
  ai.tokens.ts
  ai-generation.service.ts
  ai-generation.service.test.ts
  deepseek-ai-provider.ts
  deepseek-ai-provider.test.ts
  ai-rate-limiter.ts
  ai-rate-limiter.test.ts
  ai-usage-recorder.ts

apps/astrologer-api/src/modules/dictionary-ai/
  dictionary-ai.module.ts
  dictionary-ai.controller.ts
  dictionary-ai.service.ts
  dictionary-ai.service.test.ts
  dictionary-ai.e2e.test.ts

apps/astrologer-web/src/features/dictionary/api/
  createDictionaryAiDraft.ts

apps/astrologer-web/src/features/dictionary/model/
  useCreateDictionaryAiDraftMutation.ts
```

`packages/ai` is a package because prompt definitions and provider-neutral types
will be shared by backend apps and workers later. It must not import `apps/*` or
`packages/db`.

`apps/astrologer-api/src/modules/ai` is the composition root for runtime concerns:
DeepSeek credentials, HTTP calls, Redis rate limits, request timeouts and provider
error mapping. It exports `AiGenerationService` for feature modules.

`dictionary-ai` is intentionally separate from `dictionary` because AI generation
does not create, update or delete dictionary entries. It prepares user-editable
content. The existing `dictionary` module remains responsible for persistence.

## Prompt Model

Prompts are versioned TypeScript definitions in git. A prompt definition contains:

- stable `id`, for example `dictionary.entryDraft`;
- integer `version`;
- supported `locales`;
- `modelProfile`, for example `fastDraft`;
- model behavior settings: `thinking`, `temperature`, `maxOutputTokens`,
  `responseFormat`;
- input schema;
- output schema;
- `render(input)` that returns ordered chat messages.

Example shape:

```ts
export const dictionaryEntryDraftPromptV1 = definePrompt({
  id: "dictionary.entryDraft",
  version: 1,
  locales: ["ru", "en"],
  modelProfile: "fastDraft",
  responseFormat: "json",
  thinking: "disabled",
  maxOutputTokens: 900,
  inputSchema: dictionaryEntryDraftPromptInputSchema,
  outputSchema: dictionaryEntryDraftPromptOutputSchema,
  render(input) {
    return {
      messages: [
        {
          role: "system",
          content: renderDictionaryEntryDraftSystemPrompt(input.locale)
        },
        {
          role: "user",
          content: renderDictionaryEntryDraftUserData(input)
        }
      ]
    };
  }
});
```

Prompt rules:

- Keep stable system instructions first to benefit from DeepSeek context caching.
- Put user-provided data in clearly delimited sections.
- Include the word `json` and an example JSON object for JSON Output prompts.
- Do not interpolate untrusted text into instruction sentences.
- Validate prompt input before rendering and provider output after parsing.
- Version prompts instead of editing behavior silently when a change can affect
  production output.

## Provider Interface

`packages/ai` defines a provider-neutral port:

```ts
export type AiGenerationPort = {
  generateStructured<TOutput>(input: {
    prompt: RenderedPrompt;
    modelProfile: AiModelProfile;
    responseSchema: ZodType<TOutput>;
    userKey: string;
    metadata: AiGenerationMetadata;
  }): Promise<AiGenerationResult<TOutput>>;
};
```

The `DeepSeekAiProvider` implements this port inside `astrologer-api`.

Provider behavior:

- use `https://api.deepseek.com` by default;
- use `deepseek-v4-flash` for `fastDraft`;
- allow `deepseek-v4-pro` by config for higher quality profiles;
- send `Authorization: Bearer <ASTROLOGER_DEEPSEEK_API_KEY>`;
- send `response_format: { type: "json_object" }` for structured prompts;
- send `thinking: { type: "disabled" }` for short drafts;
- send `user_id` as a non-PII hash-derived value, for example
  `eh_<sha256(ownerUserId)>`;
- set request timeout from config;
- parse provider JSON, then validate with the prompt output schema;
- map provider errors to internal typed errors.

DeepSeek tool calls are not used for the first feature. The interface can grow a
separate `generateWithTools` method later when a product use case justifies tools
and explicit least-privilege execution.

## Runtime Config

Add typed runtime settings to `createAstrologerApiRuntimeConfig`:

```text
ASTROLOGER_AI_ENABLED=true|false
ASTROLOGER_AI_PROVIDER=deepseek
ASTROLOGER_DEEPSEEK_API_KEY=<secret>
ASTROLOGER_DEEPSEEK_BASE_URL=https://api.deepseek.com
ASTROLOGER_AI_FAST_DRAFT_MODEL=deepseek-v4-flash
ASTROLOGER_AI_QUALITY_DRAFT_MODEL=deepseek-v4-pro
ASTROLOGER_AI_TIMEOUT_MS=15000
ASTROLOGER_AI_MAX_OUTPUT_TOKENS=900
ASTROLOGER_AI_RATE_LIMIT_USER_PER_MINUTE=3
ASTROLOGER_AI_RATE_LIMIT_USER_PER_HOUR=30
ASTROLOGER_AI_RATE_LIMIT_USER_PER_DAY=150
ASTROLOGER_AI_RATE_LIMIT_REDIS_KEY_PREFIX=elevenhouse:astrologer-api:ai
```

Production validation:

- if `ASTROLOGER_AI_ENABLED=true`, `ASTROLOGER_DEEPSEEK_API_KEY` is required;
- if disabled, AI endpoints return a controlled unavailable response;
- base URL must be a URL;
- model names must be one of `deepseek-v4-flash` or `deepseek-v4-pro`;
- limits and timeout must be positive integers.

The API key is provided through the runtime secret environment. It is never stored
in frontend env files, contracts, docs examples with real values, logs or database
rows.

## Contracts

Add `packages/contracts/src/ai-drafts.ts` and export it from
`packages/contracts/src/index.ts`.

Initial contract:

```ts
export const createDictionaryAiDraftRequestSchema = z
  .object({
    categoryId: uuidSchema,
    locale: dictionaryLocaleSchema,
    title: dictionaryTitleRequestSchema
  })
  .strict();

export const createDictionaryAiDraftResponseSchema = z
  .object({
    content: nonEmptyStringSchema.max(dictionaryContentMaxLength),
    provider: z.literal("deepseek"),
    model: z.enum(["deepseek-v4-flash", "deepseek-v4-pro"]),
    promptId: z.literal("dictionary.entryDraft"),
    promptVersion: z.literal(1),
    finishReason: z.enum(["stop", "length", "content_filter", "insufficient_system_resource"]),
    usage: z
      .object({
        promptTokens: z.number().int().min(0),
        completionTokens: z.number().int().min(0),
        totalTokens: z.number().int().min(0)
      })
      .optional()
  })
  .strict();
```

The response includes prompt id/version and provider metadata so issues can be
debugged without exposing prompts or secrets to the browser.

## API Surface

Initial endpoint:

```text
POST /dictionary/ai-draft
```

Security:

- `AstrologerSessionAuthGuard`;
- `@RequireCsrf()`;
- owner user id from authenticated astrologer session;
- Redis rate limits before provider call;
- no idempotency key requirement because this command does not persist business
  state and repeated generation can legitimately produce a new draft.

Controller responsibility:

- parse body with contract schema;
- call `DictionaryAiService`;
- return contract response.

Service responsibility:

- ensure requested category belongs to available dictionary categories for the
  owner and locale, or return `404`;
- normalize title;
- call `AiGenerationService` with `dictionaryEntryDraftPromptV1`;
- map typed AI errors to product-level HTTP errors;
- not save the result.

## Frontend Flow

Replace local template generation in
`ReferenceEntryModal.tsx` with a React Query mutation:

1. User clicks `AI-черновик`.
2. Button enters loading state and prevents duplicate clicks.
3. Frontend calls `createDictionaryAiDraft`.
4. On success, `draft.content` is replaced with returned content.
5. On error, show a local modal error near the content field.
6. User can edit the text.
7. User still saves through existing `createDictionaryCustomEntry`.

Frontend must not know DeepSeek, prompt ids or provider settings.

## Error Handling

Provider errors are mapped as follows:

- DeepSeek `401`: platform configuration error, log internally, user sees AI
  unavailable.
- DeepSeek `402`: provider balance error, log internally, user sees AI
  unavailable.
- DeepSeek `400` / `422`: integration bug, log request metadata without prompt
  content, user sees AI unavailable.
- DeepSeek `429`: return `429` with a generic retry message.
- DeepSeek `500` / `503`: one short retry with jitter is allowed; if it still
  fails, return `503`.
- timeout: abort provider request and return `504` or mapped `503` with a generic
  message.
- malformed JSON or schema mismatch: log prompt id/version/model/finish reason,
  return `502`.

Never return provider raw error bodies to the browser.

## Rate Limits and Cost Controls

Use Redis rate limiting similar to passwordless auth:

- per owner account, short window: 3 requests/minute;
- per owner account, hourly window: 30 requests/hour;
- per owner account, daily window: 150 requests/day;
- optional platform-wide bucket can be added when traffic grows.

The rate-limit key must use a hash of account id, not raw PII. Rate limit buckets
should be independent from passwordless auth buckets.

DeepSeek usage metadata should be captured in logs through `AiUsageRecorder`.
The first implementation records structured logs only. A database table for AI
usage can be introduced later when billing, quotas or admin analytics require
queryable history.

## Observability

Log structured metadata:

- feature: `dictionary.aiDraft`;
- prompt id and version;
- provider and model;
- owner account hash;
- duration;
- finish reason;
- token usage if returned;
- error class.

Do not log:

- API key;
- raw prompt messages;
- raw model output;
- full user-entered title if it may contain sensitive data.

## Security

Prompt injection controls:

- system instructions are static and versioned;
- user inputs are delimited as data;
- prompt text says user data cannot override instructions;
- no tools are provided;
- output is parsed as JSON and validated with Zod;
- response is treated as untrusted text until validation passes;
- generated content is never saved without user review and explicit save action.

Data handling:

- The first dictionary draft prompt sends only category metadata, locale and title.
- Do not send client birth data, consultation notes, recordings or private messages
  until those future features have explicit consent and data-minimization rules.
- Future AI features that use sensitive data need their own feature spec and audit
  requirements.

## Testing Strategy

Unit tests:

- prompt input schemas accept valid values and reject invalid values;
- prompt renderer produces JSON-output instructions and delimited user data;
- prompt registry resolves known prompts and rejects unknown prompts;
- DeepSeek provider sends expected request shape and validates response;
- provider maps DeepSeek status codes to typed errors;
- AI rate limiter allows and blocks according to configured buckets;
- `DictionaryAiService` calls the correct prompt and does not persist entries.

Contract tests:

- request and response schemas parse valid payloads;
- invalid locale, empty title and oversized output are rejected.

Controller/e2e tests:

- unauthenticated request is rejected;
- missing CSRF is rejected;
- valid request returns AI draft response;
- rate-limited request returns `429`;
- provider unavailable returns generic failure without leaking provider details.

Frontend tests:

- clicking `AI-черновик` calls the API mutation;
- loading state prevents duplicate clicks;
- success replaces only `draft.content`;
- failure leaves existing content intact and shows an error;
- save flow still uses existing dictionary custom entry mutation.

## Rollout

1. Add `packages/ai` and backend AI module behind `ASTROLOGER_AI_ENABLED`.
2. Add dictionary AI draft endpoint and frontend mutation.
3. Keep the local template fallback only when AI is disabled in non-production
   environments.
4. In production, disabled or failing AI shows an explicit recoverable UI error;
   it must not silently pretend to be an AI draft.
5. Add later AI features by creating new prompt definitions and feature-specific
   endpoints that reuse `AiGenerationService`.

## Acceptance Criteria

- DeepSeek key exists only in backend runtime config.
- `astrologer-web` never imports or references DeepSeek.
- AI generation is reusable through `AiGenerationService` and prompt definitions.
- The dictionary draft endpoint uses a versioned prompt and returns provider
  metadata.
- Output is JSON-parsed and Zod-validated before returning to frontend.
- Rate limits are enforced before provider calls.
- No generated content is saved automatically.
- Tests cover contracts, prompt rendering, provider request/response mapping,
  service behavior and frontend mutation behavior.

