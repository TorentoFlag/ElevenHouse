# Landing Motion System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished, production-safe motion layer to `apps/landing` without increasing layout shift or adding a heavy animation runtime.

**Architecture:** Use CSS-first compositor animations with a small React `IntersectionObserver` wrapper for reveal-once behavior. Keep all motion constants in one CSS/module boundary, reuse design-system motion where it already exists, and progressively enhance scroll-linked effects only through CSS/support checks.

**Tech Stack:** React 19, Vite, TypeScript, CSS keyframes/transitions, IntersectionObserver, existing ElevenHouse design-system motion.

---

### Task 1: Motion Contract Tests

**Files:**
- Create: `apps/landing/src/motion/LandingReveal.test.tsx`
- Create: `apps/landing/src/motion/landingMotion.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that require:
- `LandingReveal` renders with `data-motion="reveal"` and marks itself visible when `IntersectionObserver` reports an intersecting entry.
- motion CSS imports/use are present in the landing style source.
- reduced-motion CSS and compositor-only reveal keyframes exist.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm test apps/landing/src/motion/LandingReveal.test.tsx apps/landing/src/motion/landingMotion.test.ts`

Expected: fail because `apps/landing/src/motion/*` does not exist.

### Task 2: Motion Runtime

**Files:**
- Create: `apps/landing/src/motion/LandingReveal.tsx`
- Create: `apps/landing/src/motion/useLandingReveal.ts`
- Create: `apps/landing/src/motion/types.ts`
- Modify: `apps/landing/src/pages/home/LandingPage.tsx`
- Modify section files under `apps/landing/src/pages/home/sections/`

- [ ] **Step 1: Implement reveal primitives**

Create a typed reveal component with `as`, `variant`, `delay`, `className`, and `children` props. Use `IntersectionObserver` once per element, default to visible when the API is unavailable, and do not run observers under reduced motion.

- [ ] **Step 2: Apply reveal primitives**

Wrap major landing sections, section heads, hero content groups, cards, pricing cards, quotes, and final CTA content with `LandingReveal`. Use stable delays and variants; do not animate layout dimensions.

- [ ] **Step 3: Run focused tests**

Run: `pnpm test apps/landing/src/motion/LandingReveal.test.tsx apps/landing/src/motion/landingMotion.test.ts apps/landing/src/App.test.tsx`

Expected: pass.

### Task 3: CSS Motion Choreography

**Files:**
- Modify: `apps/landing/src/styles.css`

- [ ] **Step 1: Add motion tokens and keyframes**

Add `--landing-motion-*` variables, reveal variants, stagger classes, hover/tap polish, scroll-linked progressive enhancement, and reduced-motion overrides.

- [ ] **Step 2: Reduce expensive permanent motion**

Keep cosmos atmosphere, but reduce constant spark/blob load on small screens and reduced-motion. Avoid adding persistent blur/filter animations.

- [ ] **Step 3: Verify styles**

Run: `pnpm exec eslint "apps/landing/src/**/*.{ts,tsx}" apps/landing/vite.config.ts && pnpm --filter @elevenhouse/landing typecheck && pnpm --filter @elevenhouse/landing build`

Expected: all commands exit 0.

### Task 4: Browser QA

**Files:**
- No source changes expected unless QA finds defects.

- [ ] **Step 1: Desktop rendered QA**

Use Browser/Chrome tooling on `http://localhost:5175/#top`: verify page identity, no framework overlay, console health, screenshot evidence, language switch, feature tabs, pricing toggle, FAQ.

- [ ] **Step 2: Mobile rendered QA**

Resize to a mobile viewport and verify no overlap/clipping, readable hero/nav/CTA, and reduced visual noise.

- [ ] **Step 3: Performance sanity**

Run Chrome performance trace and confirm CLS stays `0.00`; inspect for obvious non-composited animation warnings or long interaction delays.

- [ ] **Step 4: Final verification**

Run: `pnpm test apps/landing/src/App.test.tsx apps/landing/src/motion/LandingReveal.test.tsx apps/landing/src/motion/landingMotion.test.ts && pnpm --filter @elevenhouse/landing typecheck && pnpm exec eslint "apps/landing/src/**/*.{ts,tsx}" apps/landing/vite.config.ts && pnpm --filter @elevenhouse/landing build && git diff --check`

Expected: all commands exit 0.
