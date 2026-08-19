# AstroDiary Implementation Plan

Status: superseded on 2026-08-19 by the one-time paid-period contour.

This file used to describe a recurring client-subscription implementation plan.
That plan is no longer product truth. AstroDiary is now implemented as a
one-time paid product that grants one bounded paid period and reflection-cycle
allowance after a verified capture.

## Current execution direction

Use `docs/superpowers/specs/2026-08-11-astro-diary-design.md` only as the compact
current decision note:

- no recurring AstroDiary billing;
- no saved-card client credential;
- no renewal scheduler;
- no cancellation/revoke-renewal UI;
- no product `v1`/`v2` compatibility contour;
- old recurring registry keys are reserved/fail-closed, not orderable.

The remaining work should be planned from current code, current task reports and
the latest user instruction, not from the obsolete recurring breakdown that was
previously stored here.

## Current high-level sequence

1. Keep the one-time product constructor, client commerce and checkout authority
   aligned with `once/async/solo` AstroDiary.
2. Preserve the purpose-bound finance capture dispatch that immediately credits
   the astrologer's payable amount and activates exactly one paid period once.
3. Keep ClientSubscriptions/Entitlements as the paid-period access authority only;
   do not reintroduce recurring billing semantics.
4. Finish runtime gaps through normal production contours: API, workers,
   notifications, media, export, deletion, browser evidence and design parity.
5. Remove or rewrite any remaining docs/copy/tests that describe AstroDiary as a
   recurring subscription.

Historical task details remain available in Git history. Do not use this plan as
an active execution checklist.
