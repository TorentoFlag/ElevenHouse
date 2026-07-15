# AI Global Timeout Design

Date: 2026-07-15
Status: approved by explicit user instruction
Scope: `astrologer-api` AI provider request timeout

## Decision

Set one global AI request timeout of 90 seconds for every AI generation flow.
The value remains runtime-configurable through `ASTROLOGER_AI_TIMEOUT_MS`; only
its canonical default and documented environment example change from 15,000 to
90,000 milliseconds.

## Considered Approaches

1. **Global 90-second timeout — selected.** This directly implements the user's
   instruction and fixes the observed 22-second Numerology request without
   introducing new configuration branches.
2. **Separate fast and quality timeouts — rejected for this change.** It offers
   finer operational control but conflicts with the requested single value for
   all flows.
3. **Per-prompt timeouts — rejected for this change.** It is the most granular
   option but expands prompt contracts and provider boundaries unnecessarily.

## Architecture And Behavior

- `createAstrologerApiRuntimeConfig` remains the source of the validated value.
- `OpenAiProvider` continues to pass the resolved timeout to the SDK.
- Explicit environment overrides remain supported.
- Retry policy, API contracts, frontend behavior, error mapping, models and
  prompt definitions do not change.
- No secret or provider metadata is added to public contracts or UI.

## Verification

- A runtime-config test must fail against the old 15-second default and pass
  only after the default becomes 90 seconds.
- The canonical `.env.example` must advertise `90000`.
- Run the focused runtime-config test and `pnpm verify`.
- The already-running API process is not restarted without a separate explicit
  lifecycle instruction.
