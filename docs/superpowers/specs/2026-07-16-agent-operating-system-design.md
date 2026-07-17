# ElevenHouse Agent Operating System Design

**Date:** 2026-07-16
**Status:** Implemented
**Supersession:** Worktree isolation in the original upgrade path is replaced
by the
[Shared Main Concurrency Design](./2026-07-16-shared-main-concurrency-design.md).

## Purpose

ElevenHouse needs a repository-local operating system for coding agents, not a
larger collection of reminders. A user should be able to discuss product intent
and architecture with an agent, approve the consequential decisions, and then
let the agent research, plan, implement, test, inspect the real application and
iterate until the requested outcome is demonstrated.

The operating system must make production-quality behavior the default. It must
prevent agents from stopping at a plausible patch, copying prototype state into
production, hiding missing behavior behind fallbacks, or declaring visible UI
complete without browser evidence and visual comparison.

This design establishes the documentation and skill foundation for that
workflow. Mechanical enforcement through Codex hooks, CI policy, shared-main
coordination checks, automated visual regression and local observability is a
future phase built on the same contracts.

## User and Agent Responsibilities

The user owns product intent, business constraints and consequential product or
architecture choices. The agent owns technical discovery and execution:

1. inspect the repository, applicable instructions, current code and evidence;
2. research current architectural best practices and, when useful, comparable
   product solutions;
3. expose material options, assumptions and trade-offs;
4. produce a self-contained execution plan;
5. implement the complete approved contour with focused components and explicit
   interfaces;
6. test from the narrowest behavioral proof through the affected dependency
   surface;
7. drive the real application through Browser/Computer Use and inspect runtime
   state with Developer mode or equivalent CDP tooling;
8. compare visible UI with the exact `ElevenHouseDesign` route and state;
9. review its own diff and repeat the implementation-verification loop until
   acceptance is demonstrated or a genuine external blocker remains.

The agent asks the user only when a decision changes product meaning, accepted
architecture, security posture, destructive authority or external state in a
way that cannot be safely derived from existing sources. Routine implementation
choices stay with the agent.

## Source-of-Truth Model

The documentation must distinguish three independent kinds of truth.

### Product truth

Product behavior comes from the current user instruction, accepted product
documents, ADRs, shared contracts and domain rules. Research and the design
prototype may reveal options or missing cases, but they may not silently expand
or replace the approved product scope.

### Architecture truth

Architecture comes from accepted ADRs and canonical architecture, API,
security, data and operational documents, reconciled with current production
code. New architecture must be justified with repository evidence and current
primary-source research for the actual stack.

### Visual truth

`ElevenHouseDesign/` is the canonical visual contract for the corresponding
screen and state:

- layout and information hierarchy;
- component appearance and control geometry;
- spacing, typography, colors, borders, radii and shadows;
- icons and visible interaction patterns;
- responsive presentation represented by the reference.

The reference is not the authority for business rules, persistence, API state
machines, authorization, production component boundaries or runtime data. A
production workflow may differ from the prototype when product truth requires
it, but the resulting controls and states must retain the reference visual
language. Any intentional visible deviation requires a concrete product,
accessibility or production constraint recorded in the plan and evidence report.

## Instruction Architecture

### Root `AGENTS.md`

The root file becomes a concise routing document rather than an encyclopedia.
It retains only durable, high-priority invariants:

- closed SaaS/CRM product boundaries;
- source-of-truth precedence;
- architectural dependency rules;
- autonomy and escalation boundaries;
- no fake behavior, silent fallback or hidden incomplete state;
- local-process and destructive-action authority;
- required research, planning, implementation and verification loop;
- visual-contract requirement for user-facing work;
- pointers to canonical documents and repo-scoped skills.

Task-specific commands and procedures live outside the root file so they can be
loaded progressively and updated without crowding every task context.

### Canonical documentation

The active documentation layer is organized by responsibility:

- `docs/README.md`: map, precedence and ownership;
- `docs/product/`: product invariants and approved scope;
- `docs/architecture/` and `docs/decisions/`: system boundaries and decisions;
- `docs/api/`: public contracts, authorization and API ownership;
- `docs/development/`: operating model, commands, testing and evidence;
- `docs/development/agent-runbooks/`: task-specific procedures;
- `.agents/skills/`: reusable agent workflows with selective references and
  scripts;
- `docs/superpowers/specs/` and `docs/superpowers/plans/`: design history and
  execution artifacts, never the authority for current implemented behavior.

Historical specs and plans stay immutable except for explicit lifecycle/status
metadata. Durable decisions discovered during implementation must be promoted
to canonical documentation.

## Autonomous Feature Pipeline

Every non-trivial feature follows one continuous pipeline.

### 1. Intake and evidence baseline

The agent records outcome, scope, non-scope, source of truth, owned paths,
invariants, current runtime state, required authority and definition of done. It
checks the dirty worktree and treats unowned changes as valid external work.

### 2. Contour discovery

The agent traces the full dependency contour before proposing code: route,
screen state, contracts, domain ownership, persistence, events/jobs, security,
configuration, observability, tests and deployment implications. It reads
existing sibling implementations and relevant git history instead of inventing
parallel patterns.

### 3. Research

The agent performs research proportionate to novelty and risk. Research output
is attached to the design or execution plan and includes the question, sources,
findings, options, selected approach and rejected alternatives.

### 4. Design decision

The agent presents material product and architecture choices. It challenges
unsafe, unreliable or scope-breaking requests with evidence and recommends the
stronger production approach. It does not ask the user to choose routine class,
file or implementation details.

### 5. Self-contained execution plan

Complex work receives a living ExecPlan containing:

- purpose and observable user outcome;
- current context and exact paths;
- interfaces and dependency direction;
- component/file decomposition;
- progress, discoveries and decision log;
- TDD steps and exact commands;
- runtime/E2E and visual acceptance scenarios;
- recovery/idempotence notes;
- documentation and deployment impact;
- outcomes, gaps and retrospective.

The plan remains current while work proceeds. The agent continues between
milestones without repeatedly asking for permission unless a documented
authority boundary is crossed.

### 6. TDD implementation

For each independently testable behavior the agent follows red, green and
refactor. Tests must prove observable behavior rather than mocked call counts.
Production code must not contain test-only entrypoints, guessed response shapes,
fake success, local-only business state or silent provider fallbacks.

File boundaries follow responsibility and change coupling. React pages compose
focused components and feature models; they do not accumulate domain
derivations in JSX. Nest roots import feature modules; controllers remain thin;
domain ports and DB adapters retain their documented dependency direction.

### 7. Runtime and browser verification

User-visible work requires the real network-backed surface. The agent first
uses read-only process diagnostics and reuses already-running services. The
existing rule against unrequested process lifecycle changes remains in force.

When the required service is available, the agent uses Browser/Computer Use to
exercise the exact route, role, locale, viewport and state. Developer mode or
equivalent CDP inspection covers DOM, computed styles, console and network.
Required states include the ones affected by the change, such as loading,
empty, success, validation, error, disabled, retry and responsive states.

Browser unavailability or a stopped required service is reported as a blocked
acceptance check, not replaced with a claim based only on unit tests.

### 8. Visual parity loop

For UI work the agent captures the reference before editing, records relevant
measurements, implements the production behavior, captures the production state
at the same viewport and compares both. It iterates on visible differences and
records artifacts under a task-specific evidence directory. “Looks close” is
not acceptance evidence.

### 9. Self-review and completion gate

Before completion the agent reviews the complete diff for correctness,
security, boundary violations, unnecessary fallback behavior, missing tests,
oversized files, stale documentation and unrelated edits. It runs targeted
checks followed by the widest justified verification. The final report separates
implemented, verified, partial, deferred, blocked, skipped checks, residual risk
and unowned changes.

## Technical Research Contract

Technical research is mandatory before a new feature architecture, backend
module, API surface, security/auth flow, payment/data workflow, queue/worker,
infrastructure contour or unfamiliar framework capability is designed.

Source order:

1. accepted repository ADRs and current code;
2. official framework/vendor documentation;
3. standards, security guidance and primary research;
4. mature reference implementations when primary sources do not answer the
   integration question;
5. secondary commentary only as supporting context.

Research must be current enough for the decision. The agent records access date
and direct links, distinguishes sourced facts from inference, and validates
library behavior with a bounded spike when documentation alone is insufficient.
Research may not override an accepted ADR silently; it must surface the conflict
and either preserve the ADR or propose a replacement decision.

## Product Research Contract

Product research is appropriate when the user asks for alternatives, an
approved workflow is underspecified, the reference prototype exposes an
ambiguous interaction, or established products can reveal meaningful edge
states. It is not required for every narrow implementation.

The agent may examine official product documentation, help centers, public
demos, platform guidelines, standards and reputable UX research. Competitor
screens are evidence of possible patterns, not requirements to clone.

Every product research note separates:

- observed pattern;
- likely user problem it addresses;
- fit with ElevenHouse product invariants;
- privacy, accessibility and trust implications;
- alternatives and trade-offs;
- recommendation;
- product decisions still requiring the user.

Research cannot introduce astrologer discovery, cross-promotion, a new revenue
model, new protected-data use, a different role model or another business-scope
change without explicit user approval. For UI, external product research may
improve state coverage and ergonomics, while `ElevenHouseDesign` remains the
visual contract.

## Repo-Scoped Skills

The implementation adds focused skills under `.agents/skills/`. Each skill has
a narrow trigger description and loads only the references necessary for its
job.

### `elevenhouse-feature-delivery`

Orchestrates intake, contour discovery, research, architecture, planning, TDD,
implementation, self-review and evidence reporting for non-trivial features.

### `elevenhouse-design-parity`

Owns exact reference-route discovery, screenshot and computed-style capture,
component mapping, Browser/Computer Use verification and reference/production
comparison. It explicitly distinguishes visual fidelity from prototype
business logic.

### `elevenhouse-research`

Provides technical and product research templates, source hierarchy, freshness
rules, citation requirements, conflict handling and the boundary against silent
scope changes.

The skills reuse canonical runbooks rather than duplicating architecture facts.
Deterministic checks belong in scripts; judgment and routing belong in skill
instructions.

## Documentation Verification

The documentation layer gains a read-only verification script that can run
locally now and later from hooks or CI. It checks at least:

- relative Markdown links;
- required documents and headings;
- source-of-truth vocabulary;
- forbidden stale or contradictory statements;
- index coverage for active canonical documents;
- plan/spec lifecycle metadata;
- path and command existence where mechanically decidable.

The current documentation drift around `client-join`, `client-profile`, MinIO,
media storage and design-inventory readiness is corrected as part of the same
change. Historical plan contents are not rewritten to simulate current truth.

## Upgrade Path to Full Harness Engineering

This phase intentionally exposes stable enforcement points:

- documentation verification command;
- architecture/dependency checks;
- targeted and repository verification commands;
- browser scenario and visual evidence contract;
- structured ExecPlan and evidence artifacts;
- repo-scoped skills with explicit triggers.

A later phase can attach Codex hooks and CI to those same commands, add
structural linters and file-size policies, add non-destructive shared-checkout
coordination checks, automate screenshot comparison, expose logs/metrics/traces
to agents, and run scheduled documentation gardening. No policy needs to be
redesigned; declarative checks become mechanically enforced.

## Scope of the Documentation Revision

The implementation may update active canonical documents and add repo-scoped
skills/scripts. It does not change production product behavior, start or stop
local services, introduce CI gates, install project hooks, rewrite historical
implementation plans, or create infrastructure for isolated worktrees.

## Acceptance Criteria

The revision is accepted when:

1. `AGENTS.md` is a concise routing layer with unambiguous hard invariants.
2. Product, architecture and visual truth are explicitly separated everywhere.
3. The documented pipeline covers research through browser-backed acceptance
   and autonomous iteration.
4. Technical research is mandatory for novel/risky architecture and product
   research is available without authority to mutate scope.
5. UI guidance requires exact reference and production states, screenshots,
   computed-style evidence and Browser/Computer Use E2E.
6. Plans are self-contained living artifacts with observable acceptance.
7. Repo-scoped skills route the feature, research and design-parity workflows.
8. A deterministic documentation verifier passes.
9. Known active-document drift found in the audit is corrected.
10. All changed Markdown links resolve and `git diff --check` passes.

## Research Basis

This design applies the following current guidance:

- OpenAI Codex best practices: durable but concise `AGENTS.md`, plan-first work,
  reusable skills, tests and self-review.
- OpenAI harness engineering: repository knowledge as the system of record,
  progressive disclosure, mechanical architecture constraints and direct UI
  legibility through Chrome DevTools.
- OpenAI ExecPlans: self-contained living plans, explicit progress and decision
  logs, exact validation and observable outcomes.
- OpenAI Browser and Computer Use documentation: rendered-state interaction,
  screenshots and Developer mode/CDP inspection.
- Anthropic coding-agent guidance: give the agent a verification mechanism and
  use explore, plan, implement and adversarial-review loops.
- GitHub coding-agent guidance: scoped acceptance criteria, repository-local
  build/test instructions and agent-owned validation.

Primary references:

- <https://openai.com/index/harness-engineering/>
- <https://developers.openai.com/cookbook/articles/codex_exec_plans>
- <https://learn.chatgpt.com/guides/best-practices>
- <https://learn.chatgpt.com/docs/browser>
- <https://learn.chatgpt.com/docs/agent-configuration/agents-md>
- <https://code.claude.com/docs/en/best-practices>
- <https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results>
