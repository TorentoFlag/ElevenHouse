# Human Design AI Draft Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the next Human Design end-state mode: `AI-разбор` as an editable,
checksum-bound interpretation draft for saved Human Design calculations.

**Architecture:** Follow the existing Numerology interpretation pattern rather
than inventing a new report store. AI receives a minimized deterministic
Human Design context, never birth data or raw longitudes, and the generated text
is saved through the shared `Calculations` interpretation use case as an
astrologer-editable draft.

**Tech Stack:** TypeScript, Zod prompt schemas, `@elevenhouse/ai`,
`@elevenhouse/domain`, NestJS `astrologer-api`, shared calculation
interpretations, React Query, Vitest.

## Sources

Accessed: 2026-07-23.

- `docs/superpowers/specs/2026-07-21-human-design-production-design.md` -
  approved AI guardrails: AI never calculates mechanics, receives minimized
  deterministic context and returns editable drafts.
- `apps/astrologer-api/src/modules/numerology/numerology.service.ts` -
  checksum-bound AI interpretation draft flow through shared calculations.
- `packages/ai/src/prompts/numerology-interpretation-draft.v1.ts` -
  structured-output prompt pattern with safe system instructions.
- `apps/astrologer-api/src/modules/matrix/matrix-report.service.ts` and
  `packages/domain/src/matrix/report/report-context.ts` - larger report context
  pattern when notes/report storage are involved.

## Decision Log

- 2026-07-23, agent: Use shared calculation interpretations for Human Design
  AI v1, not a Matrix-style report store, because Human Design has no approved
  private note/report contour yet and the requested mode is an editable draft
  attached to the current saved result.
- 2026-07-23, agent: Do not send names, birth data, phone/email, raw
  longitudes, request fingerprints or provider metadata to AI. Context includes
  only deterministic mechanics, checksum and selected locale.

## Progress

- [x] 2026-07-23: Plan created after transit mode frontend slice.
- [x] 2026-07-23: Task 1 foundation implemented: minimized domain context,
  structured prompt, RU/EN render helper and focused tests.
- [x] 2026-07-23: Task 2 contract and authenticated API route implemented
  through shared calculation interpretations.
- [x] 2026-07-23: Task 3 first frontend slice implemented: saved-result AI
  draft button, checksum-bound API mutation, latest draft display and stable
  backend error messaging.
- [x] 2026-07-23: Task 3 editable lifecycle implemented for saved
  individual/compatibility results through shared calculation interpretation
  save/approve mutations.
- [x] 2026-07-23: Transit-overlay AI context wired: request accepts an optional
  transit instant, backend recomputes the overlay through the Human Design
  provider and sends only minimized transit summary to AI.

## Plan of Work

### Task 1: Minimized Context And Prompt

**Files:**

- Create: `packages/domain/src/human-design/ai-context.ts`
- Create: `packages/domain/src/human-design/ai-context.test.ts`
- Modify: `packages/domain/src/human-design/index.ts`
- Create: `packages/ai/src/prompts/human-design-interpretation-draft.v1.ts`
- Modify: `packages/ai/src/index.ts`

Acceptance:

- Context supports individual, compatibility and optional transit overlay.
- Context contains no participant names, birth data, raw longitudes or
  fingerprints.
- Prompt output is structured JSON and can render RU/EN editable draft text.

Observed 2026-07-23: `buildHumanDesignAiContext` accepts saved individual or
compatibility results plus an optional transit overlay bound to the same natal
checksum. It exports only deterministic mechanics summaries and strips raw
longitudes, fingerprints, names and birth data. `humanDesignInterpretationDraftPromptV1`
uses structured JSON output and guardrails that prohibit AI mechanics
calculation, high-stakes advice and internal metadata disclosure.

### Task 2: Contract And API

Add `POST /human-design/calculations/:calculationId/ai-draft` with
`expectedResultChecksum`. The route must be authenticated, CSRF-protected,
owner-scoped, reject archived/stale records and save the generated text as a
draft interpretation through shared calculations.

Observed 2026-07-23: `createHumanDesignAiDraftRequestSchema` accepts only the
current expected checksum. `POST
/human-design/calculations/:calculationId/ai-draft` is CSRF-protected,
owner-scoped, validates saved Human Design result integrity, rejects stale
checksums before calling AI, derives locale from astrologer profile, generates
with `humanDesignInterpretationDraftPromptV1`, renders RU/EN draft text and
saves it as a shared calculation interpretation. Public calculation responses
expose only interpretation id/status/text.

### Task 3: Frontend AI Mode

Enable `AI-разбор` only for saved non-archived Human Design results. Display
current draft text from calculation interpretations, support AI generation,
editing and stale-state messaging without browser-generated fallback text.

Observed 2026-07-23: The Human Design toolbar enables `AI-разбор` for opened
saved non-archived individual/compatibility results, posts the current
`resultChecksum` to the CSRF-protected AI draft API, refreshes shared
calculations and renders the latest draft/approved interpretation in the right
panel. Backend stale/quota/provider failures map to stable Russian messages.
The panel editor now supports local text edits, checksum-bound save and approve
of the latest clean draft through the shared calculation interpretation API.
Transit overlay AI uses the same saved individual calculation, sends only the
selected instant from the browser and recomputes the overlay server-side before
building the minimized AI context.

### Task 4: Runtime Evidence

Run only when `astrologer-api` is listening on `3002` and AI runtime is
configured:

- authenticated saved Human Design calculation;
- AI draft request with current checksum;
- stale checksum rejection;
- edit draft locally in UI and save/approve via existing interpretation path if
  exposed;
- console/network clean.
