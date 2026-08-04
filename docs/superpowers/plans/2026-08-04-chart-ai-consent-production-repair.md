# Chart AI consent production repair

## Purpose / Big Picture

Make the chart AI draft available through a complete, consent-bound production
flow: a client with an explicit relationship can read the exact current notice,
grant or revoke consent in the client cabinet, and the astrologer can then
generate a real chart AI draft. The astrologer UI must distinguish a missing
consent from an AI-provider failure.

## Progress

- 2026-08-04: reproduced the production failure on calculation
  `02705da9-9737-4edf-b5d7-74835a72ddd5`. `POST /charts/calculations/:id/ai-draft`
  returned `403 CHART_AI_CONSENT_REQUIRED`; no provider request was made.
- 2026-08-04: confirmed `https://app.elevenhouse.ai/api/me/consents?locale=ru`
  returns `404`, so production lacks the client-consent delivery contour.
- 2026-08-04: committed and pushed `a95b00a` to show the typed consent reason
  instead of the generic AI-failure message. CI run `30921413900` is pending.
- Pending: independently review and integrate the already-present consent
  module without staging unrelated shared-tree changes; deploy and prove the
  client grant -> chart AI generation path.

## Discoveries and decisions

- The consent guard is correct and fail-closed. Bypassing it or inserting a
  fabricated consent record would not prove the customer workflow.
- The defect is incomplete delivery, not an OpenAI outage: the API route and
  client UI are absent from production even though the chart API requires them.
- Consent is per explicit client-astrologer relationship, locale/policy/hash
  bound, CSRF-protected and revocable. The public API owns that evidence.

## Context and interfaces

`client-web /me` -> `GET /me/consents?locale` -> `public-api ClientConsentsModule`
-> `ClientConsentStore` -> `client_data_consents`; grant uses
`PUT /me/consents/:astrologerUserId/chart-ai`; revoke uses
`DELETE /me/consents/:consentId`. Chart generation remains
`astrologer-web` -> `POST /charts/calculations/:id/ai-draft` and accepts only
current relationship-scoped evidence.

## Plan of work

1. Review the existing consent-module diff and its contracts/domain/DB
   dependencies. Isolate only consent paths from unrelated shared edits.
2. Run red/green behavior, public API HTTP/PostgreSQL integration, app
   typecheck/build, and security/CSRF/idempotency checks.
3. Commit the isolated production contour and wait for clean CI/deploy.
4. In production, authenticate a test client, grant consent for the test
   astrologer relationship, generate one chart AI draft, reload it, and verify
   revocation blocks the next generation without calling the provider.
5. Record browser/network/console and visual evidence for RU and the changed
   missing-consent state. Remove only data owned by the test if cleanup is
   compatible with immutable consent evidence.

## Validation and recovery

Do not reset or modify production data outside an explicitly created test
relationship. Provider generation is one real request per idempotency command;
ambiguous outcomes are reconciled rather than retried blindly. If the existing
shared-tree consent work is semantically incompatible, preserve it and surface
the exact conflict instead of overwriting it.
