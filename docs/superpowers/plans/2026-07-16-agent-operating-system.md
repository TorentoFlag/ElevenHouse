# ElevenHouse Agent Operating System Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with an explicit red/green verification loop. Update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` as work proceeds.

**Goal:** Turn the approved agent-operating-system design into concise canonical guidance, reusable repo skills, deterministic documentation checks, current architecture facts, and a browser-backed feature-delivery workflow.

**Architecture:** Keep durable invariants and routing in the root `AGENTS.md`; keep detailed procedures in canonical development documents and `.agents/skills`. Add a dependency-free Node documentation verifier as the first mechanical enforcement point, then align active architecture/API/design documents with the current repository.

**Tech Stack:** Markdown, Codex Agent Skills, Node.js ESM, `node:test`, pnpm, Git.

## Global Constraints

- Preserve ElevenHouse product, security, module, DB, dirty-worktree and local-process invariants.
- `ElevenHouseDesign` is visual truth, not business-logic or production-architecture truth.
- Do not change production feature behavior or manage local long-running processes.
- Do not rewrite historical specs/plans to look current.
- Product research proposes evidence-backed options but cannot silently change scope.
- Technical research uses current primary sources before novel or risky architecture.

## Progress

- [x] (2026-07-16) Research and approved design recorded in `docs/superpowers/specs/2026-07-16-agent-operating-system-design.md`.
- [x] (2026-07-16) Added and tested the deterministic documentation verifier; 5 fixture tests pass.
- [x] (2026-07-16) Rewrote root routing and canonical agent operating model; `AGENTS.md` is 13.7 KiB.
- [ ] Add research, feature-delivery and design-parity repo skills.
- [ ] Strengthen design, frontend, testing and verification runbooks.
- [ ] Correct known active-document drift.
- [ ] Run complete documentation and repository-scoped verification.

## Surprises & Discoveries

- The audit found no broken relative Markdown links before implementation.
- `public-api` already contains `client-join` and `client-profile`, while active docs still call the client relationship contour missing.
- Docker Compose already includes MinIO, while the local-services runbook says it includes only PostgreSQL and Redis.
- `media-storage.md` is written as a future implementation plan despite the media schema, adapters, API routes and MinIO infrastructure already existing.

## Decision Log

- **Decision:** Implement the approved layered option before hooks/CI.
  **Rationale:** It creates stable commands and skill contracts that the future harness can enforce without redesign.
  **Date:** 2026-07-16
- **Decision:** Use three focused repo skills instead of one large skill.
  **Rationale:** Progressive disclosure keeps research and visual-detail instructions out of unrelated tasks.
  **Date:** 2026-07-16
- **Decision:** Execute inline.
  **Rationale:** Current repository/session policy does not authorize subagent delegation.
  **Date:** 2026-07-16

## Outcomes & Retrospective

Pending implementation.

## File Map

- Create `scripts/agent-docs/check-agent-docs.mjs`: dependency-free documentation checks.
- Create `scripts/agent-docs/check-agent-docs.test.mjs`: verifier regression tests using temporary fixtures.
- Modify `package.json`: expose `docs:check` and `docs:check:test` commands.
- Modify `AGENTS.md`: concise source routing and hard execution invariants.
- Modify `docs/README.md`: canonical document map and lifecycle.
- Modify `docs/development/agent-workflow.md`: end-to-end autonomous feature pipeline and ExecPlan contract.
- Create `docs/development/research-strategy.md`: technical/product research contract and note template.
- Modify `docs/development/testing-strategy.md`: runtime, E2E, design-parity and evidence gates.
- Modify `docs/development/commands.md`: documentation verification commands.
- Modify `docs/development/agent-runbooks/*.md`: routing, design transfer, frontend, verification and docs maintenance.
- Create `.agents/skills/elevenhouse-feature-delivery/SKILL.md`.
- Create `.agents/skills/elevenhouse-research/SKILL.md`.
- Create `.agents/skills/elevenhouse-design-parity/SKILL.md`.
- Modify active architecture/API/design documents where the audit proved drift.

---

### Task 1: Deterministic Documentation Verification

**Files:**

- Create: `scripts/agent-docs/check-agent-docs.mjs`
- Create: `scripts/agent-docs/check-agent-docs.test.mjs`
- Modify: `package.json`
- Modify: `docs/development/commands.md`

**Interfaces:**

- Produces `checkAgentDocs({ rootDir }) -> { filesChecked, errors }` and a CLI that exits non-zero on errors.
- Checks relative Markdown links, required canonical files/headings, root instruction size, skill frontmatter, and known contradictory active-doc statements.

- [x] **Step 1: Write failing verifier tests**

Use `node:test` temporary repositories to prove that the checker rejects a broken link, missing skill frontmatter, oversized `AGENTS.md`, and a known stale statement, while accepting a minimal valid fixture.

- [x] **Step 2: Run the tests and confirm red**

Run:

```bash
node --test scripts/agent-docs/check-agent-docs.test.mjs
```

Expected: failure because `check-agent-docs.mjs` does not exist.

- [x] **Step 3: Implement the dependency-free checker**

The CLI must print one error per line with a file-relative location and finish with either `agent-docs: ok` or a non-zero summary. It must not write files.

- [x] **Step 4: Expose canonical commands**

Add:

```json
"docs:check": "node scripts/agent-docs/check-agent-docs.mjs",
"docs:check:test": "node --test scripts/agent-docs/check-agent-docs.test.mjs"
```

Document both commands in `docs/development/commands.md`.

- [x] **Step 5: Verify green**

Run:

```bash
pnpm docs:check:test
pnpm docs:check
```

Expected: tests pass; repository check may initially report the stale statements that later tasks remove.

### Task 2: Root Routing and Canonical Operating Model

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/README.md`
- Modify: `docs/development/agent-workflow.md`
- Create: `docs/development/research-strategy.md`
- Modify: `docs/development/agent-runbooks/README.md`
- Modify: `docs/development/agent-runbooks/00-task-intake.md`

**Interfaces:**

- `AGENTS.md` routes tasks to canonical docs and skills while retaining hard invariants.
- `agent-workflow.md` defines the autonomous pipeline and living ExecPlan format.
- `research-strategy.md` owns technical and product research rules.

- [x] **Step 1: Rewrite `AGENTS.md` as a concise map**

Retain product, architecture, security, DB, process authority, no-fallback, visual contract and completion rules. Add explicit routing to the three repo skills and research strategy. Keep it below the verifier threshold.

- [x] **Step 2: Separate sources of truth in `docs/README.md`**

Define product truth, architecture truth, visual truth, implemented-state evidence and artifact lifecycle. Make clear that design business behavior is only input until accepted by product/domain sources.

- [x] **Step 3: Replace the lightweight workflow with the approved pipeline**

Document intake, contour discovery, research, decisions, living plan, TDD, runtime/browser validation, visual parity, self-review and evidence reporting. Include mandatory `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` plan sections.

- [x] **Step 4: Add the research strategy**

Include source hierarchy, freshness, direct-link citations, inference labels, bounded spikes, ADR conflict handling, product-pattern comparison, privacy/accessibility analysis and the no-silent-scope-change boundary.

- [x] **Step 5: Update runbook routing and intake**

Make research and plan selection deterministic from risk/novelty and add definition-of-done, runtime state and research requirements to intake output.

### Task 3: Repo-Scoped Skills

**Files:**

- Create: `.agents/skills/elevenhouse-feature-delivery/SKILL.md`
- Create: `.agents/skills/elevenhouse-research/SKILL.md`
- Create: `.agents/skills/elevenhouse-design-parity/SKILL.md`

**Interfaces:**

- Skills use concise YAML `name` and `description` frontmatter.
- Skills reference canonical docs rather than copying volatile architecture facts.

- [ ] **Step 1: Apply skill-authoring guidance**

Read and follow the available `skill-creator` and `superpowers:writing-skills` instructions before creating skill files.

- [ ] **Step 2: Create `elevenhouse-feature-delivery`**

Trigger on non-trivial ElevenHouse feature implementation. Route the agent through intake, full-contour discovery, applicable research/design skills, a living plan, TDD, self-review and required evidence.

- [ ] **Step 3: Create `elevenhouse-research`**

Trigger on novel/risky architecture and product-solution research. Require question, sources, findings, options, recommendation, rejected alternatives and decisions requiring the user.

- [ ] **Step 4: Create `elevenhouse-design-parity`**

Trigger on any visible UI implementation or review. Require exact reference/production route-state pairs, before/after screenshots, computed-style measurements, real network-backed E2E and documented intentional deviations.

- [ ] **Step 5: Verify skill discovery shape**

Run:

```bash
pnpm docs:check
```

Expected: all repo skill frontmatter and required references pass.

### Task 4: Testing, Browser and Visual-Parity Contracts

**Files:**

- Modify: `docs/development/testing-strategy.md`
- Modify: `docs/development/agent-runbooks/01-design-to-production.md`
- Modify: `docs/development/agent-runbooks/02-frontend-production.md`
- Modify: `docs/development/agent-runbooks/08-verification-and-git.md`
- Modify: `docs/development/agent-runbooks/09-documentation-maintenance.md`

**Interfaces:**

- Visible UI completion requires automated tests plus runtime E2E and design-parity evidence.
- Missing runtime/browser access produces a blocked check, never an inferred success.

- [ ] **Step 1: Expand the evidence ladder**

Define behavioral unit, integration, API, frontend, runtime E2E, design parity, accessibility and repository gates. Specify when each is mandatory and what evidence is recorded.

- [ ] **Step 2: Correct the design-transfer contract**

Replace any claim that prototype UX/business flow is automatically canonical. Require the agent to reconcile product behavior first, then reproduce exact visual language for the approved states. Remove placeholder/silent-disabled behavior as an acceptable completion strategy.

- [ ] **Step 3: Add exact browser procedure**

Require route, role, locale, viewport, data fixture/state, screenshot, DOM/computed styles, interactions, network, console, responsive states and comparison artifacts. Prefer Browser/Computer Use for rendered interaction and Developer mode/CDP for inspection.

- [ ] **Step 4: Strengthen frontend decomposition**

Require one focused component per file by default, feature models for derived logic, app-owned composition, design-system extraction only for stable reusable primitives, and explicit accessibility behavior.

- [ ] **Step 5: Strengthen completion and docs maintenance**

Require self-review for fallbacks, oversized files, missing edge states, stale docs and incomplete visual evidence. Add `pnpm docs:check` to docs acceptance.

### Task 5: Reconcile Current Documentation Drift

**Files:**

- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/architecture/media-storage.md`
- Modify: `docs/api/api-boundaries.md`
- Modify: `docs/development/local-setup.md`
- Modify: `docs/development/agent-runbooks/07-local-services.md`
- Modify other active canonical docs only where repository evidence proves the same fact is stale.

**Interfaces:**

- Current-state claims must match discoverable code and configuration.
- Future target architecture must be visibly separated from implemented baseline.

- [ ] **Step 1: Correct public client-contour state**

Record existing `client-join` and `client-profile` modules/contracts without overstating missing booking/orders/payment work.

- [ ] **Step 2: Convert media storage to current/remaining state**

Document implemented schema, adapters, S3-compatible storage, MinIO, API routes and current purposes; retain only genuine remaining work as gaps.

- [ ] **Step 3: Correct local infrastructure statements**

List PostgreSQL, Redis, MinIO and `minio-init` accurately while preserving the no-unrequested-process-management rule.

- [ ] **Step 4: Refresh design inventory framing and statuses**

Remove stale “first implementation slice” guidance, update validation date, make its role a mapping/status inventory rather than product/visual authority, and correct facts verified from current code.

### Task 6: Full Verification and Handoff

**Files:** all files changed by Tasks 1–5.

- [ ] **Step 1: Run focused checker tests**

```bash
pnpm docs:check:test
```

- [ ] **Step 2: Run the repository documentation checker**

```bash
pnpm docs:check
```

- [ ] **Step 3: Check Markdown formatting and links**

```bash
git diff --check
```

- [ ] **Step 4: Audit requirements and contradictions**

Use `rg` to confirm the research contract, product/architecture/visual separation, Browser/Computer Use E2E, exact design parity, no-fallback rule, living-plan sections and upgrade path all appear in active canonical guidance.

- [ ] **Step 5: Review the complete diff**

Confirm no production behavior, historical plan content, unowned files or process lifecycle state changed. Update this plan's progress, discoveries, decision log and retrospective with actual evidence.
