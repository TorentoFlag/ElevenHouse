# AI Global Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the validated global AI request timeout default from 15 seconds to 90 seconds for every `astrologer-api` AI flow.

**Architecture:** Keep the existing single `ASTROLOGER_AI_TIMEOUT_MS` runtime setting and provider wiring. Change only its canonical default, the default-config expectation, and the environment example; explicit deployments may still override it.

**Tech Stack:** TypeScript, NestJS configuration, Zod, Vitest, pnpm.

## Global Constraints

- The global default is exactly `90000` milliseconds.
- Retry policy, API contracts, models, prompts and frontend behavior do not change.
- No AI provider, model or prompt metadata becomes public.
- Do not restart the running API without a separate explicit lifecycle instruction.

---

### Task 1: Increase The Global AI Timeout

**Files:**
- Modify: `apps/astrologer-api/src/config/runtime-config.test.ts`
- Modify: `apps/astrologer-api/src/config/runtime-config.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `createAstrologerApiRuntimeConfig(source)` and `ASTROLOGER_AI_TIMEOUT_MS`.
- Produces: `astrologerApi.ai.timeoutMs === 90000` when no explicit override is provided.

- [ ] **Step 1: Write the failing default-config test**

Change the `defaultAiConfig` expectation to:

```ts
timeoutMs: 90_000,
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts apps/astrologer-api/src/config/runtime-config.test.ts
```

Expected: FAIL because the current runtime default is `15000`.

- [ ] **Step 3: Implement the 90-second default**

In `runtime-config.ts`, set:

```ts
ASTROLOGER_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
```

In `.env.example`, set:

```dotenv
ASTROLOGER_AI_TIMEOUT_MS=90000
```

- [ ] **Step 4: Verify GREEN and repository integrity**

Run:

```bash
pnpm exec vitest run --config vitest.config.ts apps/astrologer-api/src/config/runtime-config.test.ts
pnpm verify
git diff --check
```

Expected: focused tests pass, repository verification exits `0`, and the diff has no whitespace errors.

- [ ] **Step 5: Commit implementation**

```bash
git add .env.example \
  apps/astrologer-api/src/config/runtime-config.ts \
  apps/astrologer-api/src/config/runtime-config.test.ts
git commit -m "fix(ai): increase global request timeout"
```
