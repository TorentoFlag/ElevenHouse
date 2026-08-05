# One-Time Pre-Launch Production Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the disposable ElevenHouse production PostgreSQL database exactly once, then install the current shared baseline and reviewed seed data.

**Architecture:** A database-maintenance CLI verifies an exact Docker PostgreSQL target and a release-bound confirmation before it can execute transactional destructive DDL. `Deploy Production` exposes the operation only through manually dispatched `prelaunch_reset=true`; it quiesces database writers, backs up the selected database, runs the reset, then applies the current baseline and seeds. Push-driven deploys never enable the reset command.

**Tech Stack:** GitHub Actions, SSH, Docker Compose, PostgreSQL, Drizzle, TypeScript, Vitest.

## Global Constraints

- ADR 0012 authorizes one combined shared-main baseline reset only for the disposable production database.
- Database target must be exactly PostgreSQL `postgres:5432/elevenhouse` in the production compose network.
- No reset happens without explicit workflow-dispatch input and release-bound confirmation.
- Destructive DDL starts only after writer quiescence, zero client sessions, and backup.
- A fresh empty-database rehearsal and affected repository checks are required before dispatch.

---

### Task 1: Exact-Target Reset Guard

**Files:**
- Create: `packages/db/scripts/production-prelaunch-reset.ts`
- Create: `packages/db/scripts/production-prelaunch-reset.test.ts`
- Modify: `packages/db/package.json`

- [x] Write tests for required confirmation and exact host/database validation.
- [x] Implement a CLI that validates target identity before beginning a transaction, acquires an advisory lock, resets only `public` and `drizzle`, and rolls back on failure.
- [x] Add a package command that requires explicit expected host, database, release, and confirmation inputs.
- [x] Run the focused test and DB typecheck.

### Task 2: Explicit Deploy Control

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `packages/db/src/production-deploy-hardening.test.ts`
- Modify: `docs/development/commands.md`

- [x] Add a default-false `prelaunch_reset` workflow-dispatch input.
- [x] Preserve normal preflight on all ordinary deploys; run reset only after backup when the input is true.
- [x] Pass release-bound confirmation and exact compose target to the maintenance CLI.
- [x] Test that push-driven deploys cannot reset, and that reset occurs after writer quiescence and backup but before migrator.

### Task 3: Rehearsal And Release

**Files:**
- Modify: only reviewed release paths from Tasks 1-2 and the complete current shared baseline.

- [x] Run the production-shaped reset CLI, fresh migration and seed on local ElevenHouse PostgreSQL; inspect the financial schema.
- [ ] Run affected tests, typechecks, and `pnpm verify` where the shared release permits it.
- [ ] Run GitNexus change detection, stage the approved combined release, commit, push, and manually dispatch the one-time reset deploy.
- [ ] Verify the GitHub deployment, production schema/seed state, public health endpoints, and authenticated Flow route.
