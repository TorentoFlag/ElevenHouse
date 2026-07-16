# ElevenHouse Shared Main Concurrency Design

**Date:** 2026-07-16
**Status:** Approved direction; implementation pending

## Purpose

ElevenHouse agents work directly in the repository's existing checkout on
`main`. They do not create isolated Git worktrees or private feature branches.
Because several agents or the user may edit the same checkout concurrently, the
repository needs an explicit coordination protocol that preserves unrelated
work without weakening delivery, verification or ownership requirements.

This policy replaces the future worktree-isolation direction mentioned in the
agent operating-system design. Shared-main execution is intentional, not a
temporary fallback.

## Hard Git Policy

Unless the user explicitly requests a different Git operation for the current
task, every agent must:

- stay in the existing ElevenHouse checkout and on its current `main` branch;
- never create or enter a Git worktree;
- never create or switch branches;
- never run `git checkout`, `git switch`, `git stash`, `git rebase`,
  `git cherry-pick` or another operation that relocates or rewrites shared work;
- never invoke a generic worktree workflow or skill for ElevenHouse;
- never use implicit isolation as a prerequisite for planning or execution.

The repository policy takes precedence over generic agent guidance that
recommends a worktree or a feature branch. A direct user instruction may grant
an exception, but the agent must constrain that exception to the named task and
operation.

## Shared-Checkout Ownership Model

All agents and the user may modify the same filesystem concurrently. A dirty
worktree is therefore expected state, not a reason to stop or clean it.

At intake, an agent records:

1. the current branch and `git status --short` output;
2. the paths it expects to own for the task;
3. pre-existing modified, untracked and staged paths that it does not own;
4. any known overlap with another active task.

Ownership is task-scoped, not branch-scoped. A path is not safe to overwrite
merely because it was clean at intake. Any change the current agent did not
make is user or another-agent work and must be preserved.

## Optimistic Concurrency Protocol

Agents coordinate through current filesystem and Git evidence rather than
locks. Before each coherent edit group, the agent must re-read every target
file and inspect its current path-scoped diff. It must not apply a patch derived
from a stale snapshot when the target has changed since inspection.

After an edit group, the agent checks the affected path diff again. Before
verification and before reporting completion, it refreshes repository status
and distinguishes its own changes from concurrent changes.

When concurrent work touches the same file, the agent must:

1. inspect the new complete file and path-scoped diff;
2. adapt its change to preserve both compatible intentions;
3. rerun the checks affected by the combined state;
4. report the overlap in the final evidence summary.

The agent asks the user only when the overlap is a genuine semantic conflict
that cannot be resolved without choosing between incompatible product,
architecture, security or data behaviors. The report names the exact paths,
conflicting intentions and available choices. It must not resolve such a
conflict by reverting, formatting over, hiding or silently dropping the other
change.

Shared checkout does not authorize shared process control. Existing rules for
frontend, API, worker, Docker, database and queue lifecycle remain unchanged.

## Shared Index and Commit Protocol

The Git index is also shared mutable state. An agent stages or commits only
when the user requested it or the accepted workflow explicitly includes it.

Immediately before staging, the agent refreshes:

- `git status --short`;
- the diff for every owned path;
- `git diff --cached --name-status` and the cached diff relevant to the task.

The agent stages exact owned paths only. It never uses broad staging commands
that may capture concurrent work, never un-stages cached changes it does not
own, and never resets the index to obtain a clean commit.

If the index already contains unowned changes, the agent must not create a
combined commit. It leaves its work uncommitted or asks the user how to proceed
when a commit is required. A commit message or final report must not claim
ownership of paths contributed by another agent or the user.

## Documentation Changes

Implementation of this design updates the following active surfaces:

- root `AGENTS.md` with the hard shared-main invariant and precedence over
  generic worktree guidance;
- `docs/development/agent-workflow.md` with the shared-checkout ownership and
  optimistic-concurrency protocol;
- `docs/development/agent-runbooks/00-task-intake.md` with intake and pre-edit
  refresh requirements;
- `docs/development/agent-runbooks/08-verification-and-git.md` with shared-index,
  staging, commit and final-status checks;
- `.agents/skills/elevenhouse-feature-delivery/SKILL.md` so feature delivery
  cannot route into a worktree workflow;
- the agent documentation verifier and its tests with deterministic policy
  markers and contradiction detection;
- the earlier agent operating-system design only where needed to mark its
  worktree upgrade-path statement as superseded by this decision.

No production code, local-service lifecycle, Git hook, CI gate, lock service or
automatic commit mechanism is part of this change.

## Mechanical Verification

The documentation verifier must fail when the active policy loses its required
shared-main markers or reintroduces generic worktree isolation as the normal
ElevenHouse workflow. Tests cover both missing-policy and contradictory-policy
fixtures.

The verifier does not attempt to ban every occurrence of the word `worktree`:
the documentation must be able to state the prohibition and preserve historical
context. It checks canonical files and unambiguous positive recommendations
instead.

## Acceptance Criteria

The revision is accepted when:

1. agents are unambiguously required to work in the existing checkout on
   `main` by default;
2. worktrees, private branches, checkout/switch, stash and history-rewriting
   workflows require a direct user instruction;
3. intake, pre-edit, post-edit, verification and completion checkpoints refresh
   shared state;
4. concurrent compatible edits are preserved and integrated rather than
   reverted;
5. semantic conflicts have a precise escalation rule;
6. staging is path-scoped and existing unowned index entries cannot be swept
   into an agent commit;
7. the feature-delivery skill cannot invoke a generic worktree workflow;
8. the active documentation no longer recommends isolated worktrees as a
   future ElevenHouse execution model;
9. documentation verifier tests, the verifier itself and `git diff --check`
   pass.

## Later Enforcement Options

If documentation alone proves insufficient, the same contract can later be
enforced with non-destructive preflight checks, path-ownership manifests or
coordination metadata. Such enforcement must preserve direct shared-main work
and must not introduce worktrees, automatic stashing, implicit branch creation
or destructive conflict resolution.
