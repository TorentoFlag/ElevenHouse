# 0008. Private calculation PDF contour

Date: 2026-07-15

## Status

Accepted

## Context

Matrix and Numerology need downloadable consultation materials, but calculation
modules must not duplicate job tables, queues, storage adapters or lifecycle
rules. Results are current-state records rather than version history. PDF work
can outlive an HTTP request and must never export stale data, private storage
coordinates or internal AI metadata.

## Decision

`Calculations` owns one generic PDF lifecycle keyed by owner, calculation,
method, current result checksum, locale and authoritative source locator.
Module-owned API adapters validate eligibility and select that source:

- Matrix requires its current checksum-bound report in `ready` state.
- Pythagorean Numerology always exports the full deterministic individual or
  compatibility result; it includes the current approved interpretation when
  one exists, while absence of approval does not block export.
- Natal Chart exports the full deterministic current calculation result,
  including a vector chart wheel and owner-scoped dictionary entries looked up
  by exact chart codes. Missing dictionary entries are visible in the document
  and do not block export.

The API transaction creates the job/artifact and an outbox event. `workers`
relays identifiers to the `calculation.pdf` BullMQ queue, reloads the
authoritative source, rejects stale checksums, renders deterministically and
writes to private object storage. The download API returns only a short-lived
owner-scoped presigned URL.

Recalculation replaces the current result, invalidates related PDF jobs and
artifact/media references, and emits idempotent cleanup work. Old documents are
not retained as calculation versions. Storage deletion occurs before database
metadata deletion so a transient object-store failure remains retryable.

Renderers are registered by module and method. A future method such as Vedic
numerology adds its own engine, typed result and renderer without modifying the
Pythagorean engine or duplicating queue/storage infrastructure.

## Consequences

- Queue and outbox payloads contain identifiers only, never calculation or AI
  text.
- PostgreSQL is authoritative for job state; Redis is transport and requires
  AOF plus `maxmemory-policy=noeviction` in production.
- Worker shutdown must allow bounded in-flight PDF work to finish.
- Public contracts expose job status, safe failure text and presigned download
  data, but never bucket, object key, source locator, fingerprint, model,
  provider or prompt metadata.
- Matrix and Numerology keep module-specific eligibility rules while sharing
  lifecycle, persistence, retry, storage, cleanup and observability.
