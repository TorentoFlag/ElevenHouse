---
name: elevenhouse-design-parity
description: Use when creating, transferring, changing, reviewing, or claiming completion for any visible ElevenHouse UI, responsive state, component, icon, modal, table, dropdown, navigation, or browser-rendered product flow.
---

# ElevenHouse Design Parity

## Core principle

Match the approved production state to the exact `ElevenHouseDesign` visual
contract. Preserve production business logic; do not copy prototype runtime
architecture, local data or state machines.

Read `docs/development/agent-runbooks/01-design-to-production.md`,
`02-frontend-production.md` and `docs/development/testing-strategy.md`.

## Evidence matrix

Before editing, record:

- design area and inventory row;
- exact reference route/state and production route/state;
- role, locale, viewport and data/state prerequisites;
- reference source files and screenshot paths;
- approved business differences.

## Reference capture

1. Reuse the exact running design surface; do not substitute a screenshot of a
   different state.
2. Drive the relevant interaction with Browser/Computer Use.
3. Capture screenshots for affected desktop/mobile states.
4. Use Developer mode/CDP or equivalent inspection to record dimensions,
   padding, gaps, typography, colors, borders, radii, shadows, z-index,
   overflow, focus/hover/disabled behavior and responsive changes.
5. Inspect reference JSX only to locate visual composition and interactions.
   Reject `window.*`, localStorage, mocks, demo routing and prototype component
   boundaries as production patterns.

## Production implementation

Build app-owned composition from validated contracts and domain state. Keep one
focused component per file by default; move derived behavior to feature models;
extract only stable reusable visual primitives into `packages/design-system`.
Do not fill missing backend behavior with fake success, local business state,
silent fallback or a completion placeholder.

## Comparison loop

1. Exercise the real network-backed production flow with the same role, locale,
   viewport and equivalent state.
2. Check loading, empty, success, validation, error, disabled, retry, keyboard,
   focus and affected responsive states.
3. Inspect console, network, DOM and computed styles.
4. Capture production screenshots beside the reference evidence.
5. Compare geometry and visual tokens; fix visible differences; repeat.
6. Record each intentional deviation with a product, accessibility or production
   constraint and its approval/source.

For select, dropdown, modal, table, sidebar and overlay work, visual inspection
without measured state and interaction evidence is insufficient.

## Completion gate

Report reference and production artifact paths, route/state matrix, measured
properties, interactions exercised, console/network result, deviations and
unverified states. If the required service or browser surface is unavailable,
mark visual acceptance blocked. Component tests, static code reading or “looks
close” never substitute for rendered comparison.
