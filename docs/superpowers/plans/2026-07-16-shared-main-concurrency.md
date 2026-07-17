# Shared Main Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan inline task-by-task.
> ElevenHouse repository policy overrides generic worktree/feature-branch
> guidance: execute in the existing checkout on `main` and preserve concurrent
> changes.

**Goal:** Make direct shared-`main` execution the canonical and mechanically
checked ElevenHouse agent workflow.

**Architecture:** Root instructions define the hard Git invariant; workflow and
runbooks define intake, optimistic concurrency and shared-index procedures; the
feature-delivery skill routes agents through those procedures. The existing
Node documentation verifier enforces required markers and rejects an explicit
worktree-skill recommendation in active policy.

**Tech Stack:** Markdown, Node.js ESM, `node:test`, pnpm.

**Status:** Implemented and verified; uncommitted pending user authority.

## Global Constraints

- Work only in the existing ElevenHouse checkout on `main`.
- Do not create or enter worktrees or branches and do not use checkout, switch,
  stash, rebase or cherry-pick without a direct user instruction.
- Re-read target files and path-scoped diffs before each coherent edit group.
- Preserve all unowned changes and stage only exact owned paths.
- Do not control long-running local processes.
- Do not modify production product code.

## Purpose / Big Picture

After this plan, an agent opening ElevenHouse receives one unambiguous answer:
it implements features in the existing shared checkout on `main`. The agent
refreshes current files and Git state around edits, preserves concurrent work,
and treats the shared index as another ownership boundary. `pnpm docs:check`
provides a deterministic signal if essential policy is removed or the active
feature skill starts requiring a worktree again.

## Progress

- [x] 2026-07-16: shared-main design approved and committed as `effc5c2`.
- [x] 2026-07-16: target files, existing policy and verifier API inspected.
- [x] Task 1: verifier RED/GREEN cycle.
- [x] Task 2: canonical documentation changes.
- [x] Task 3: skill pressure tests, historical note and final verification.

## Surprises & Discoveries

- The current root instructions protect unowned changes but do not prohibit a
  generic worktree or branch workflow.
- The current agent operating-system design still names isolated per-worktree
  services as a future upgrade, contradicting the approved direction.
- `superpowers:executing-plans` normally requires worktree isolation; the direct
  user decision and ElevenHouse repository policy override that generic step.
- Baseline feature-skill pressure tests preserved compatible unowned work but
  found no explicit worktree or shared-index rule; the modified skill supplied
  the required answer in all three repeated scenarios.

## Decision Log

- **2026-07-16, user:** selected direct shared-`main` work instead of worktree
  isolation.
- **2026-07-16, agent:** use optimistic filesystem/Git refreshes rather than a
  lock service; escalate only incompatible semantic intent.
- **2026-07-16, agent:** keep mechanical enforcement narrow: required headings
  plus a positive worktree-skill contradiction, not a blanket word ban.
- **2026-07-16, agent:** do not commit implementation without separate commit
  authority; local file changes and verification remain in scope.

## Outcomes & Retrospective

Canonical policy, runbooks, feature-skill routing and deterministic checker
coverage are implemented in the working tree. RED produced two expected test
failures; GREEN passed all seven checker tests. Three baseline and three
post-change read-only pressure scenarios established that the skill now handles
worktree pressure, a pre-populated shared index and stale target inspection.
`pnpm verify` completed lint, 31 typecheck tasks, 368 test files with 1574 tests,
and 22 package builds. Documentation gates checked 73 Markdown files. No
concurrent or unowned changes appeared during the implementation; all ten
working-tree paths belong to this plan. No commit was created because the user
did not separately authorize one.

## Context and Orientation

`AGENTS.md` is the hard-invariant router. Detailed execution behavior belongs
in `docs/development/agent-workflow.md`; intake and shared-index procedures live
in runbooks `00` and `08`. The feature-delivery skill must route into those
canonical files without duplicating volatile process detail. The verifier is
`scripts/agent-docs/check-agent-docs.mjs`; its isolated fixture tests are in the
adjacent `.test.mjs` file.

## Interfaces and Dependencies

The public verifier interface remains:

```js
checkAgentDocs({ rootDir })
// => Promise<{ filesChecked: number, errors: string[] }>
```

No application, package or runtime interface changes. Policy markers become a
contract between active Markdown files, fixtures and the verifier.

## Plan of Work

Task 1 establishes failing tests and the smallest enforcement logic. Task 2
publishes the canonical behavior that satisfies the new contract. Task 3
validates the skill under pressure, removes the historical contradiction and
closes the plan with repository evidence.

## Validation and Acceptance

Acceptance requires fresh successful output from:

```bash
pnpm docs:check:test
pnpm docs:check
git diff --check
```

It also requires a targeted contradiction scan, complete diff review and a
line-by-line comparison with the approved shared-main specification. No browser
or Runtime E2E evidence applies because the change has no visible application
surface.

## Idempotence and Recovery

All edits and verification commands are local and repeatable. The checker uses
temporary fixture directories and does not mutate the repository. If a target
changes concurrently, re-read its complete content and path diff, then adapt
the patch; never reset, stash or overwrite the concurrent change.

## Artifacts and Notes

- Approved design:
  `docs/superpowers/specs/2026-07-16-shared-main-concurrency-design.md`.
- Execution plan: this file.
- Automated evidence: terminal output from documentation tests/checker and Git
  diff checks; no persistent screenshot artifact is needed.

---

### Task 1: Mechanically specify the shared-main policy

**Files:**

- Modify: `scripts/agent-docs/check-agent-docs.test.mjs`
- Modify: `scripts/agent-docs/check-agent-docs.mjs`

**Interfaces:**

- Consumes: existing `checkAgentDocs({ rootDir })` fixture API.
- Produces: required policy markers and a deterministic contradiction error for
  `superpowers:using-git-worktrees` when recommended by the active
  feature-delivery skill.

- [x] **Step 1: Add required fixture markers**

  Extend fixture content so `AGENTS.md`, `agent-workflow.md`, task intake,
  verification-and-git and feature-delivery contain their canonical shared-main
  headings.

- [x] **Step 2: Add failing missing-policy tests**

  Add a test that removes the shared-main heading from `AGENTS.md` and expects
  `missing required marker`.

- [x] **Step 3: Add failing contradiction test**

  Replace the feature-delivery fixture with valid frontmatter plus
  `**REQUIRED SUB-SKILL:** Use superpowers:using-git-worktrees.` and expect a
  `forbidden shared-main contradiction` error.

- [x] **Step 4: Verify RED**

  Run `pnpm docs:check:test`. Expected: the new missing-policy and contradiction
  assertions fail because the checker does not enforce them yet.

- [x] **Step 5: Implement minimal checker rules**

  Add exact required markers for canonical policy files and a file-scoped
  forbidden pattern that detects a positive/required invocation of
  `superpowers:using-git-worktrees` in feature delivery without rejecting
  historical specs or prohibitive wording.

- [x] **Step 6: Verify GREEN**

  Run `pnpm docs:check:test`. Expected: all checker tests pass.

### Task 2: Publish the canonical shared-checkout protocol

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/development/agent-workflow.md`
- Modify: `docs/development/agent-runbooks/00-task-intake.md`
- Modify: `docs/development/agent-runbooks/08-verification-and-git.md`
- Modify: `docs/development/agent-runbooks/README.md`

**Interfaces:**

- Consumes: approved design
  `docs/superpowers/specs/2026-07-16-shared-main-concurrency-design.md`.
- Produces: one hard invariant and one consistent intake/edit/index/completion
  protocol used by all agents.

- [x] **Step 1: Refresh shared state before editing**

  Run `git status --short`, re-read each target and inspect
  `git diff -- <target>` before applying the documentation patch.

- [x] **Step 2: Add the root hard invariant**

  Add `## Shared-main concurrency` to `AGENTS.md`: existing checkout on `main`,
  forbidden relocation/history operations, repo precedence over generic skills,
  concurrent-change preservation and semantic-conflict escalation.

- [x] **Step 3: Add the operational workflow**

  Add `## Shared Checkout Protocol` to `agent-workflow.md` with intake snapshot,
  owned paths, pre-edit re-read/path diff, post-edit refresh and conflict
  resolution. Clarify that delegated read-only or bounded work does not create
  filesystem isolation.

- [x] **Step 4: Strengthen intake**

  Require current branch, status, staged-state and owned/unowned path capture;
  require a fresh file plus path diff immediately before each edit group.

- [x] **Step 5: Strengthen Git verification**

  Add a shared-index section requiring cached-diff inspection, exact path
  staging, no broad add/reset/unstage and no aggregate commit over unowned index
  entries.

- [x] **Step 6: Update routing index**

  Make the runbook index identify shared-main intake and shared-index completion
  responsibilities.

- [x] **Step 7: Inspect the complete documentation diff**

  Run `git diff -- AGENTS.md docs/development/agent-workflow.md
  docs/development/agent-runbooks` and verify all compatible existing guidance
  remains intact.

### Task 3: Route feature delivery and close documentation drift

**Files:**

- Modify: `.agents/skills/elevenhouse-feature-delivery/SKILL.md`
- Modify: `docs/superpowers/specs/2026-07-16-agent-operating-system-design.md`
- Update: `docs/superpowers/plans/2026-07-16-shared-main-concurrency.md`

**Interfaces:**

- Consumes: canonical workflow/runbook policy from Task 2.
- Produces: a concise skill routing rule, superseded historical worktree note
  and fresh repository evidence.

- [x] **Step 1: Run skill RED pressure scenarios**

  With the current skill but without the new shared-main section, test three
  read-only scenarios: pressure to create a worktree, a pre-populated shared
  index before commit, and a target file changed after initial inspection.
  Record whether the skill itself supplies the required decision.

- [x] **Step 2: Add minimal skill guidance**

  Add `## Shared-main execution` that requires the current checkout, state
  refreshes and canonical runbooks, and explicitly rejects the generic
  worktree skill. Keep details in canonical docs rather than duplicating them.

- [x] **Step 3: Run skill GREEN pressure scenarios**

  Repeat the same three scenarios against the modified skill. Expected: every
  answer keeps the current checkout, preserves unowned index/file changes and
  escalates only irreconcilable semantic conflicts.

- [x] **Step 4: Supersede the historical upgrade-path sentence**

  Mark isolated per-worktree services in the earlier operating-system design
  as superseded by the shared-main design; do not rewrite unrelated historical
  content.

- [x] **Step 5: Run targeted and full documentation gates**

  Run `pnpm docs:check:test`, `pnpm docs:check`, `git diff --check`, and scan
  active policy for `worktree`, branch relocation and shared-index
  contradictions.

- [x] **Step 6: Review acceptance and shared state**

  Re-read the approved spec line-by-line, inspect `git status --short`,
  `git diff --stat`, every owned path diff and `git diff --cached --name-status`.
  Record completed evidence and any concurrent/unowned changes in the plan and
  final report. Do not commit unless the user separately authorizes the commit.
