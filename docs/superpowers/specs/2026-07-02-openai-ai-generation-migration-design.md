# OpenAI AI Generation Migration Design

## Status

Approved direction from product discussion. Awaiting written-spec review before
implementation planning.

## Context

The current AI generation contour was implemented for DeepSeek in the
`ai-generation-contour` worktree. Product direction changed: ElevenHouse will use
OpenAI API / ChatGPT-family models instead of DeepSeek.

The existing contour should not be deleted wholesale. Its provider-neutral parts
are still the correct architecture:

- `packages/ai` owns prompt definitions, schemas and provider-neutral generation
  types.
- `apps/astrologer-api/src/modules/ai` owns runtime provider integration,
  credentials, rate limits and usage metadata.
- Feature modules such as `dictionary-ai` expose specific authenticated
  endpoints instead of a generic browser-callable AI proxy.
- `astrologer-web` calls the feature endpoint and never receives provider API
  keys.

The provider-specific pieces must be migrated from DeepSeek to OpenAI:

- provider implementation and tests;
- runtime config names, validation and defaults;
- shared response contracts for provider/model metadata;
- provider-specific safety identifier helper;
- docs/spec/plan references.

## External Research

OpenAI official documentation findings:

- OpenAI recommends the Responses API as the primary interface for direct model
  requests. Chat Completions remains supported, but it is the previous standard.
- The Responses API creates model responses at `POST /v1/responses` and can
  generate text or JSON outputs.
- Structured Outputs should be used for machine-validated JSON. With Responses,
  structured output configuration uses `text.format`; this differs from the
  Chat Completions `response_format` shape.
- The official TypeScript SDK is the recommended server-side JavaScript client.
  The SDK reads `OPENAI_API_KEY` by default, but ElevenHouse will pass the app
  config value explicitly for typed runtime validation.
- API keys are secrets and must not be exposed in browser code.
- Responses are stored by default. This feature is a one-shot draft generation
  and does not need server-side conversation state, so requests must set
  `store: false`.
- OpenAI recommends a stable privacy-preserving `safety_identifier`, such as a
  hashed internal user id, for end-user abuse detection and isolation.
- OpenAI rate limits are organization/project/model-level and can be hit by
  requests or tokens. ElevenHouse must keep its own per-astrologer Redis rate
  limits and map provider `429` separately.
- Current model guidance favors `gpt-5.5` for higher intelligence and
  `gpt-5.4-mini` or `gpt-5.4-nano` for lower latency/cost workloads.

Primary sources:

- https://developers.openai.com/api/docs/guides/text
- https://developers.openai.com/api/reference/resources/responses/methods/create/
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://developers.openai.com/api/reference/typescript
- https://developers.openai.com/api/reference/overview/
- https://developers.openai.com/api/docs/guides/your-data
- https://developers.openai.com/api/docs/guides/safety-checks
- https://developers.openai.com/api/docs/guides/rate-limits
- https://developers.openai.com/api/docs/guides/error-codes
- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/libraries

## Decision

Migrate the existing contour to OpenAI Responses API rather than deleting and
rebuilding it. Keep the package/module boundaries and feature-specific endpoint
shape. Replace the DeepSeek provider with an OpenAI provider.

Use the official `openai` TypeScript SDK in `apps/astrologer-api`.

Default model profile mapping:

```text
fastDraft    -> gpt-5.4-mini
qualityDraft -> gpt-5.5
```

These are runtime-configurable because model choice must be revisitable after
latency, cost and output-quality checks.

For the first dictionary draft feature:

- use Responses API;
- set `store: false`;
- set `reasoning: { effort: "low" }` for `fastDraft`;
- set `max_output_tokens` from the prompt/config limit;
- use Structured Outputs with a JSON schema generated from or equivalent to the
  prompt output schema;
- send `safety_identifier` as a hashed internal owner user id;
- do not enable tools, file search, web search or background mode.

## Non-Goals

- Do not add ChatGPT Apps SDK, ChatGPT workspace agents, Assistants API, Agents
  SDK or OpenAI tools for this feature.
- Do not expose arbitrary prompt IDs or system prompts to the browser.
- Do not implement admin-managed prompt editing.
- Do not automatically save AI output as a dictionary entry.
- Do not add multi-turn state for the reference modal.
- Do not keep DeepSeek as a second provider unless the user explicitly asks for a
  multi-provider strategy.

## Architecture

### Provider-Neutral Package

`packages/ai` remains provider-neutral.

Required changes:

- `AiProviderName` becomes `"openai"`.
- model string types move from DeepSeek ids to OpenAI ids:
  `"gpt-5.4-mini" | "gpt-5.5"` for the current scope.
- generation finish reason becomes provider-neutral enough for Responses API,
  for example:
  `"completed" | "incomplete" | "content_filter" | "refusal" | "failed"`.
- usage type should reflect OpenAI token naming while preserving a stable
  frontend contract:
  `promptTokens`, `completionTokens`, `totalTokens` remain acceptable API
  contract names, mapped from OpenAI `input_tokens`, `output_tokens` and
  `total_tokens`.
- prompt definitions keep `modelProfile`, `maxOutputTokens`, input schema,
  output schema and `render(input)`.
- `thinking` should be renamed to a provider-neutral reasoning config before it
  leaks further. The first OpenAI implementation can map
  `reasoningEffort: "low"` for `fastDraft`.

### Astrologer API AI Module

Replace:

```text
apps/astrologer-api/src/modules/ai/deepseek-ai-provider.ts
apps/astrologer-api/src/modules/ai/deepseek-ai-provider.test.ts
```

with:

```text
apps/astrologer-api/src/modules/ai/openai-ai-provider.ts
apps/astrologer-api/src/modules/ai/openai-ai-provider.test.ts
apps/astrologer-api/src/modules/ai/ai-safety-identifier.ts
apps/astrologer-api/src/modules/ai/ai-safety-identifier.test.ts
```

The OpenAI provider implements `AiGenerationPort`.

Provider request behavior:

- construct `OpenAI` with the API key from runtime config;
- call `client.responses.create` or `client.responses.parse` through a thin
  wrapper that tests can mock;
- pass rendered prompt messages as Responses API input;
- pass stable instructions first and dynamic user data last to preserve prompt
  caching potential;
- pass `text.format` for structured JSON output;
- pass `store: false`;
- pass `safety_identifier`;
- pass `max_output_tokens`;
- pass `reasoning.effort`;
- do not pass any tools.

Provider response behavior:

- accept only a completed response with parseable structured content;
- map incomplete responses to a typed provider response-format or incomplete
  error;
- map refusals to a typed provider refusal error and expose a generic user-facing
  error through the feature endpoint;
- parse usage metadata when present;
- preserve provider request ids in logs/metadata later, but do not expose them to
  the frontend contract in this iteration.

### Runtime Config

Replace DeepSeek env variables with OpenAI-specific names:

```text
ASTROLOGER_AI_ENABLED=true|false
ASTROLOGER_AI_PROVIDER=openai
ASTROLOGER_OPENAI_API_KEY=<secret>
ASTROLOGER_OPENAI_BASE_URL=https://api.openai.com/v1
ASTROLOGER_AI_FAST_DRAFT_MODEL=gpt-5.4-mini
ASTROLOGER_AI_QUALITY_DRAFT_MODEL=gpt-5.5
ASTROLOGER_AI_TIMEOUT_MS=15000
ASTROLOGER_AI_MAX_OUTPUT_TOKENS=900
ASTROLOGER_AI_RATE_LIMIT_USER_PER_MINUTE=3
ASTROLOGER_AI_RATE_LIMIT_USER_PER_HOUR=30
ASTROLOGER_AI_RATE_LIMIT_USER_PER_DAY=150
ASTROLOGER_AI_RATE_LIMIT_REDIS_KEY_PREFIX=elevenhouse:astrologer-api:ai
```

Validation rules:

- when `ASTROLOGER_AI_ENABLED=false`, no OpenAI key is required;
- when `ASTROLOGER_AI_ENABLED=true`, `ASTROLOGER_OPENAI_API_KEY` is required and
  must not be blank;
- in production, `ASTROLOGER_OPENAI_BASE_URL` must use HTTPS when AI is enabled;
- model env values must be in the currently supported OpenAI model enum;
- rate-limit settings remain positive integers.

### API Contract

Keep the endpoint:

```text
POST /dictionary/ai-draft
```

Keep request shape:

```json
{
  "categoryId": "uuid",
  "locale": "ru",
  "title": "Солнце в Овне"
}
```

Update response metadata:

```json
{
  "content": "...",
  "provider": "openai",
  "model": "gpt-5.4-mini",
  "promptId": "dictionary.entryDraft",
  "promptVersion": 1,
  "finishReason": "completed",
  "usage": {
    "promptTokens": 120,
    "completionTokens": 80,
    "totalTokens": 200
  }
}
```

Frontend should continue treating provider metadata as display/debug data only.
The browser must not branch on OpenAI-specific behavior.

### Prompt

Keep `dictionary.entryDraft` version 1 unless implementation changes the product
behavior materially. The migration should remove provider-specific wording such
as "JSON Output" from internal docs, but the prompt can continue to instruct the
model to return only JSON as a backup to Structured Outputs.

Prompt requirements remain:

- Russian and English output support;
- user-provided fields are data, not instructions;
- no AI/process mention;
- no medical, legal, financial, fatalistic or guaranteed claims;
- response validates against `{ content: string }`.

### Error Handling

Map OpenAI provider errors to typed internal errors:

- authentication/permission errors: platform configuration error, frontend sees
  generic AI failure;
- bad request/unprocessable entity: integration bug, frontend sees generic AI
  failure;
- quota/rate limit: provider rate limit or billing/quota issue, frontend sees
  retry/generic failure depending on status;
- server/connection/timeout: transient provider failure;
- refusal/incomplete/invalid structured output: generic AI failure and usage
  record when available.

The existing product-level Redis rate limiter remains separate and still returns
`429` with `retryAfterSeconds`.

## Rollout

1. Update docs/spec/plan references from DeepSeek to OpenAI.
2. Update contracts and provider-neutral types.
3. Update runtime config and tests.
4. Replace DeepSeek provider with OpenAI provider and tests.
5. Update `AiGenerationService` safety identifier dependency.
6. Update `dictionary-ai` tests and frontend API tests for OpenAI metadata.
7. Run focused tests, typechecks, targeted lint and final verification.

## Testing Strategy

Focused tests must cover:

- shared contract accepts OpenAI response metadata and rejects DeepSeek metadata;
- prompt registry and dictionary prompt still validate input/output;
- runtime config accepts disabled AI without key, requires OpenAI key when
  enabled, rejects blank key, rejects non-HTTPS OpenAI base URL in production;
- safety identifier hashes owner id and is max 64 characters;
- OpenAI provider sends Responses request with `store: false`,
  `safety_identifier`, structured output config, model profile mapping,
  max output tokens and no tools;
- OpenAI provider maps status/errors and rejects malformed, incomplete or refusal
  responses;
- AI generation service no longer imports DeepSeek code;
- dictionary AI service maps OpenAI provider result to the shared contract;
- frontend API wrapper parses OpenAI-backed responses;
- reference modal behavior remains unchanged.

## Acceptance Criteria

- No production code references `DeepSeek`, `deepseek`, or
  `ASTROLOGER_DEEPSEEK`.
- `ASTROLOGER_AI_PROVIDER` is `"openai"`.
- AI requests are made through the OpenAI Responses API.
- OpenAI API key exists only in backend runtime config.
- Browser code never imports or references OpenAI SDK or API key.
- Existing reference modal AI draft flow still works through
  `/dictionary/ai-draft`.
- Focused tests, package typechecks and targeted lint pass.

