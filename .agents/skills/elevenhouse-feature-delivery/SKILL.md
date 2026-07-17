---
name: elevenhouse-feature-delivery
description: Use when implementing a non-trivial ElevenHouse feature, workflow, backend module, API surface, cross-layer change, or user-visible behavior that must be carried from design and architecture through tested production code.
---

# ElevenHouse Feature Delivery

## Core principle

Own the complete requested contour. A passing local test or plausible patch is
not the outcome; observable production behavior with proportional evidence is.

## Required context

Read, in order:

1. `docs/development/agent-runbooks/00-task-intake.md`;
2. `docs/development/agent-workflow.md`;
3. the relevant product, architecture, API and ADR documents routed by intake;
4. the specialized runbook for each affected layer;
5. `docs/development/testing-strategy.md` and
   `docs/development/agent-runbooks/08-verification-and-git.md`.

**REQUIRED SUB-SKILL:** Use `elevenhouse-research` when the task introduces
novel/risky architecture, unfamiliar stack behavior, or product alternatives.

**REQUIRED SUB-SKILL:** Use `elevenhouse-design-parity` for any visible UI
creation, transfer, modification or completion claim.

## Shared-main execution

Execute in the existing ElevenHouse checkout on `main`. Do not use
`superpowers:using-git-worktrees`, create/switch a branch, stash, rebase or
relocate the task unless the user directly requests that Git operation.

At intake, before every coherent edit group, and before verification, refresh
the shared state exactly as required by `00-task-intake.md` and
`agent-workflow.md`. Re-read changed target files and adapt compatible
concurrent work; escalate only an irreconcilable semantic conflict.

Before staging or commit, follow the shared-index gate in
`08-verification-and-git.md`. Never sweep another agent's staged entries into a
combined commit or clear them to manufacture a clean index.

## Delivery loop

1. Record outcome, non-scope, definition of done, owned paths, authority,
   current evidence and required verification.
2. Trace route/state → frontend → contract → API → domain → DB → async effects
   → security/config/observability → tests/deploy. Inspect current code and
   sibling patterns at every affected boundary.
3. Surface only material product/architecture decisions. Resolve routine
   implementation choices from canonical sources and research.
4. Create or update a self-contained living ExecPlan for multi-step work.
5. Implement each observable behavior red → green → refactor. Keep files
   focused; preserve dependency direction; never substitute mocks, fake success,
   browser-only business state, silent fallback or hidden disabled behavior.
6. Run targeted checks, then every affected surface gate. For visible work,
   drive the real network-backed flow and complete reference comparison.
7. Review the whole diff for correctness, security, idempotency, data integrity,
   missing states, oversized/duplicated code, stale docs and unrelated edits.
8. Repeat implementation and verification until the full definition of done is
   demonstrated or a genuine external blocker is isolated.

## Completion contract

Finish with separate facts for implemented, verified, partial, deferred,
blocked, skipped checks, residual risk and unowned changes. Include exact
commands and runtime/visual artifact paths. Never infer success from a narrower
evidence level than the requested behavior.

## Stop conditions

Stop and ask only when progress requires a product-scope change, ADR change,
security/privacy trade-off, destructive/external authority, unavailable required
decision, or conflict with unowned work that cannot be safely adapted. A hard
technical problem is not by itself a reason to return control.
