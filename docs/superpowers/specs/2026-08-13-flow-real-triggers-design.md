# Real Flow Triggers Design

## Purpose

Extend the existing durable Flow runtime from the current `booking_confirmed`
and `manual_client` triggers to the first three real client-event starts:
`product_purchased`, `first_inbound_message`, and `client_lifecycle_changed`.
The result is a single normalized-event path: a source module persists its
business transition and an outbox fact atomically; Flows then admits every
eligible active flow using its pinned immutable version, activation epoch,
dedupe and repeat policy.

## Scope

- Fixed client lifecycle statuses, independent of relationship access status:
  `new`, `active`, `waiting_for_client`, `in_service`, `inactive`.
- Automatic lifecycle transitions:
  explicit relationship creation -> `new`; first captured client order ->
  `active`; booking service start -> `in_service`; service completion ->
  `active`; a 90-day inactivity sweep -> `inactive`; the next qualifying
  purchase, booking, inbound message or astrologer action -> `active`.
- Audited manual correction with an explicit override mode. While overridden,
  automatic candidate transitions are recorded but do not change the visible
  lifecycle status. An explicit return-to-automatic command ends the override.
- The three trigger configurations and their source-specific filters:
  product IDs, first inbound message in an already-related client thread, and
  exact lifecycle `from -> to` transition.
- Common repeat policies from the product checklist: once per client, once per
  occurrence, and only after the prior run reaches a terminal state.
- Existing `booking_confirmed` and `manual_client` semantics remain unchanged
  and are adapted to the common normalized-event admission contract only when
  that does not change their effective-time, idempotency or snapshot behavior.

## Non-scope

- The other six automatic starts, generic payload expressions, arbitrary CRM
  statuses, arbitrary delays/waits, new action nodes, archive/delete/duplicate
  lifecycle, or AI flow generation.
- Replacing `client_astrologer_relationships.status` (`active`, `archived`,
  `blocked`): it remains access and authorization truth.
- Retrospective enrollment: an event that occurred before the activation epoch
  is permanently ineligible.

## Architecture

### Client lifecycle

`ClientLifecycle` is a separate Clients-owned aggregate keyed by immutable
relationship ID. Its current projection contains lifecycle status, management
mode (`automatic` or `manual_override`), revision and last-activity time. An
append-only history stores every proposed and applied transition with source
event ID, actor or system cause, timestamp, previous/next status, and override
disposition. It is not a mutable label catalog.

Source modules call a Clients domain port inside their existing transaction.
The port records the candidate transition, applies it only when automatic mode
permits it, and writes a redacted `client.lifecycle.changed.v1` outbox event in
the same transaction when the visible lifecycle changes. Manual override and
return-to-automatic are CSRF-protected, idempotent Clients commands with audit
records; neither is implemented as a direct Flow write.

### Normalized Flow events

Flows owns a strict versioned normalized-event envelope containing: owner,
source, immutable source event ID, occurrence key, occurred time, client or
booking subject provenance, allowlisted payload, retention/redaction version,
and canonical payload hash. The trigger matcher sees only the allowlisted
fields. No browser may provide relationship, order, event timing or subject
provenance.

Each source adapter maps its authoritative outbox fact to that envelope:

| Start | Authoritative source | Trigger filter |
| --- | --- | --- |
| Product purchased | captured client order, not checkout intent or provider-pending state | zero or more immutable product IDs |
| First inbound message | successfully persisted inbound Messaging message in one linked client thread, determined by a durable first-message uniqueness proof | no user-supplied content filter |
| Client status changed | applied Clients lifecycle history row | required exact `from` and `to` fixed statuses |

Admission searches all active epochs matching owner, trigger kind and source
filter. It evaluates the source occurrence against that epoch's effective time,
then persists at most one run per flow, subject and selected repeat policy. A
single event can create runs for multiple flows; retransmission cannot create a
duplicate run. The created run pins the immutable Flow version, manifest and
activation epoch exactly as the current runtime does.

### Repeat policy

`once_per_client` creates at most one run for a flow/client across activation
epochs. `once_per_occurrence` is the current behavior and dedupes on the
immutable event occurrence. `after_previous_terminal` admits a new occurrence
only when no non-terminal run exists for that flow/client. Rejections are
durable, inspectable ingestion results rather than silent drops.

### Inactivity

The existing `workers` application owns a bounded, database-clock-based sweep.
It selects automatic lifecycle projections whose last qualifying activity is at
least 90 days old, locks/rechecks each candidate, records the automatic
transition and emits the lifecycle event atomically. The sweep never resurrects
archived or blocked relationships, bypasses a manual override, or makes an
external provider call.

## Invariants

- Relationship `status` and lifecycle `status` are distinct types, columns and
  authorization decisions.
- Payment refunds, cancellation and subscription changes do not stop an
  already-admitted Flow run.
- Product and lifecycle references are immutable IDs/enums; renamed display
  text cannot break a trigger. Invalid/deleted referenced products block a
  new activation while existing pinned runs remain intact.
- Every trigger has exactly one root trigger node; a graph still has exactly
  one trigger and every reachable path still terminates.
- All new source writes use transactional outbox and durable idempotency;
  provider callback retries and worker retries are safe.
- Consent and direct-link relationship checks are enforced by the owning source
  before the normalized event reaches Flows.

## Error and operations behavior

An unavailable Flow runtime consumes the source event as a sanitized,
inspectable `execution_unavailable` disposition and creates no run. A malformed
or internally inconsistent source fact fails closed and remains observable for
operations. A lifecycle transition can succeed independently of Flow runtime
availability; Flow is a consumer, not the owner of client state.

## Verification

- Contract and domain tests cover allowed trigger configurations, repeat policy,
  lifecycle transition/override precedence, first-message and first-purchase
  identity, effective-time exclusion, multi-flow admission and duplicate
  delivery.
- PostgreSQL integration tests prove atomic source transition/outbox/history,
  constraints, cross-epoch behavior and concurrent admission.
- API E2E proves authenticated owner scope, CSRF/idempotency, non-enumeration,
  audit responses and explicit rejection states.
- Worker tests prove bounded inactivity sweep/retry behavior with the database
  clock.
- `/flows` browser acceptance covers trigger configuration, validation and
  activation error states against the exact design reference when the browser
  surface is available.

## Research

Question: how to extend real Flow starts without creating a second execution
authority or accepting unsafe payload provenance.

Repository evidence: ADR 0011 assigns durable execution, effective-time
activation epochs, transactional state/trace/outbox writes and pinned versions
to the PostgreSQL Flow runtime. `client_astrologer_relationships.status` is
already authorization state and cannot be repurposed.

Recommendation: introduce a Clients-owned fixed lifecycle aggregate and use a
strict normalized-event adapter per source. Rejected alternatives are
source-specific Flow handlers (inconsistent semantics) and an open user-defined
event/payload DSL (unbounded privacy, consent and validation surface).

User decisions: fixed lifecycle enum; automatic transitions with audited manual
override; 90-day inactivity policy; first implementation starts are purchased
product, first inbound message and lifecycle transition.
