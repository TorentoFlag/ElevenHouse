# AstroDiary Product and Architecture Decision

Date: 2026-08-11
Status: superseded by one-time paid-period decision on 2026-08-19
Visual reference: `ElevenHouseDesign/app/journal.jsx`
Production routes: `/astro-diary` for astrologers and
`/me/astrologers/:astrologerUserId/journal` for clients

## Current product decision

AstroDiary is sold as a one-time client purchase from one already-related
astrologer. A successful payment creates one bounded paid access period with a
fixed reflection-cycle allowance. It is not a recurring client subscription, not
an ongoing saved-card billing product and not a platform tariff feature.

The astrologer configures the product name, price and AstroDiary work terms from
the fixed AstroDiary template. Subscription names and plan labels are not hard
coded; admins and astrologers configure commercial naming through product
configuration. Any prototype copy such as “Pro” is reference-only visual text,
not product truth.

The client buys access to a bounded human service:

- one relationship-bound journal;
- a configured number of reflection cycles for the paid period;
- response SLA, working weekdays and service timezone from the sold product
  revision;
- attachments, voice, astrology context, private astrologer AI drafts, PDF
  export and deletion/redaction flows where implemented.

Unused cycles do not roll over. When the paid period ends, new cycles are
blocked, existing purchased/open obligations can be completed according to the
server access policy, and history remains readable unless relationship/security
or erasure policy says otherwise.

## Explicitly not in scope

The following recurring contour from the original 2026-08-11 draft is no longer
product truth:

- client saved-card credential purpose for AstroDiary;
- automatic renewal invoices or charge commands;
- renewal scheduler;
- cancellation/revoke-renewal workflow;
- “next charge” UI;
- recurring billing readiness gate;
- subscription upsell copy such as “in Pro”;
- any separate product `v1`/`v2` compatibility path for this change.

Historical immutable rows or internal event schema identifiers may remain in the
database if they are already committed history, but no production checkout path
may select the old recurring AstroDiary registry key. The current runtime path
must be fail-closed: one verified client-order capture activates exactly one paid
period and allowance once.

## Architecture contour

The implementation still uses the existing ClientSubscriptions/Entitlements
tables as the paid-period and access authority, but only for a single purchased
period. The domain name is historical; it does not imply recurring billing for
AstroDiary.

Required activation chain:

```text
client checkout for the exact AstroDiary once/async/solo product
  -> finance order and capture authority bind the immutable sold product terms
  -> verified capture dispatches the purpose-bound AstroDiary paid-period event
  -> ClientSubscriptions creates the paid period, allowance and entitlement once
  -> AstroDiary activation creates or unlocks the relationship journal
```

Finance remains the payment/provider authority. AstroDiary does not call ArcPay
directly and does not infer access from browser state or mutable product rows.

## Durable product rules retained from the original design

- One journal per active client-astrologer relationship and journal epoch.
- No public astrologer catalogue, marketplace discovery, cross-promotion, group
  journals, assistant/team inbox or Messaging fallback.
- One open reflection cycle at a time.
- Drafts are private, server-owned and require explicit publish.
- AI helps the astrologer prepare editable drafts; it never auto-publishes and
  never becomes a client-facing persona.
- Media and voice are private Diary assets with server authorization.
- Outbox/events remain IDs-only and body-free.
- Financial refund or chargeback facts revoke future writes according to the
  finance authority; no browser fallback fabricates entitlement.

## Definition of done for the current one-time contour

AstroDiary paid access is complete only when:

- astrologers can configure and activate the fixed one-time AstroDiary product;
- client commerce lists it as a one-time paid product for already-related
  clients;
- verified capture immediately accrues the astrologer's payable amount and
  activates exactly one paid period/allowance;
- duplicate capture and replay are idempotent;
- old recurring AstroDiary registry keys are rejected by checkout authority;
- both client and astrologer can use the paid journal through real API, DB,
  network-backed browser flows and responsive UI;
- period end, relationship blocking, refund/chargeback revocation, export and
  deletion have typed server-owned states;
- docs and visible copy do not describe AstroDiary as a recurring subscription.

This file is intentionally short. The previous long implementation draft was an
execution artifact and must not be used as current product truth.
