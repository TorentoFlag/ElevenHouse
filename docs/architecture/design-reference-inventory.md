# Design Implementation Inventory

`ElevenHouseDesign/` supplies the visual contract for an exact screen and state:
layout, controls, spacing, typography, colour, icons and responsive behaviour.
It does not supply product behaviour, persistence, API shape or production
component boundaries. Those come from user instruction, product docs, ADRs,
contracts and verified code.

This is the compact routing index for design work. It maps a design area to its
production owner and current readiness; the linked surface file contains the
current ownership/readiness facts. It is not a roadmap or an implementation-plan
archive.

## Status Legend

- `ready`: the production layer exists and can be integrated or extended now.
- `partial`: a production layer exists, but does not cover the full reference
  flow.
- `missing`: real integration needs a new production contour.
- `wrong-surface`: the reference belongs to another app or API.
- `design-only`: visual QA/authoring input, not production runtime code.

## Surface Routing

| Surface | Production owner | Current readiness and evidence pointer |
| --- | --- | --- |
| [Astrologer surfaces](./design-surfaces/astrologer.md) | `apps/landing`, `apps/astrologer-web`, `apps/astrologer-api`, workers | Mixed: calculation, calendar, products, reference, finance, inbox and settings have production slices; dashboard, flows and several future contours remain partial. |
| [Client surfaces](./design-surfaces/client.md) | `apps/client-web`, `apps/public-api` | Direct-link identity, relationship, birth-profile and booking-entry foundations exist; public reads, client checkout and most cabinet modules remain partial or missing. |
| [Admin surfaces](./design-surfaces/admin.md) | `apps/admin-web`, `apps/admin-api` | Finance-policy/risk/payout evidence, tariff and refund-candidate contours exist; broader internal operations remain missing. |
| [Cross-cutting assets and baseline](./design-surfaces/cross-cutting.md) | design system, shared contracts, API/domain/DB and workers | Current app/module baseline, prototype exclusions, design assets and extraction boundaries. |

## Current Backend Module Coverage

This compact list keeps the routing index mechanically aligned with the current
Nest module directories; ownership/readiness detail stays in the linked surface
files.

- `public-api`: `booking`, `client-commerce`, `client-consents`, `client-join`,
  `client-profile`, `database`, `health`, `identity`, `orders`, `payments`,
  `redis`, `refund-candidates`, `security`, `sessions`.
- `astrologer-api`: `ai`, `astro-calendar`, `astrologer-profile`,
  `availability`, `bookings`, `calculations`, `calendar`, `charts`, `clients`,
  `clock`, `database`, `dictionary`, `dictionary-ai`, `finance`, `flows`,
  `health`, `human-design`, `identity`, `matrix`, `media`, `messaging`,
  `numerology`, `platform-billing`, `platform-entitlements`,
  `platform-tariffs`, `products`, `redis`, `security`, `sessions`, `verification`.
- `admin-api`: `database`, `finance-authorizations`, `finance-policies`,
  `fiscal-profiles`, `health`, `identity`, `payout-evidence`,
  `platform-tariffs`, `refund-candidates`, `saved-card-disclosures`, `security`.

## How To Use This Index

1. Start with the matching surface file and select the exact reference row.
2. Verify its readiness against current code; use `partial` only for the stated
   production-backed slice and never simulate a missing backend workflow.
3. Read the corresponding product, architecture, API and ADR sources to define
   behaviour. Use the exact reference route/state only to define visual
   acceptance.
4. For visible work, follow
   [`01-design-to-production`](../development/agent-runbooks/01-design-to-production.md),
   [`02-frontend-production`](../development/agent-runbooks/02-frontend-production.md)
   and [`testing strategy`](../development/testing-strategy.md).

When a change alters readiness, update the relevant surface row and its concise
evidence pointer. Product sequencing belongs in
[`product/roadmap.md`](../product/roadmap.md); durable architecture belongs in
the relevant architecture document or ADR. Do not retain task plans, dated
browser transcripts or superseded implementation narratives here.
