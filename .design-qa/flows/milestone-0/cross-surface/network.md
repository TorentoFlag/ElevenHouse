# Flows Milestone 0 browser and persistence evidence

Date: 2026-08-02 MSK

Authenticated production surface: `http://localhost:5174` with real requests
proxied to the local astrologer API. No browser fixtures or intercepted success
responses were used.

## Flows

- `GET /api/flows?status=all&limit=50&offset=0` returned 200/304 with total 5,
  four drafts, one paused definition and server runtime metadata
  `definition_only`, `executionAvailable=false`,
  `FLOW_RUNTIME_EXECUTION_UNAVAILABLE`, `legacy_preview`.
- `GET /api/flow-approvals?status=pending&limit=50&offset=0` returned 200/304.
- `GET /api/flows/<paused-flow-id>/runs?status=all&limit=20&offset=0`
  returned 200. The visible completed row is labeled `Архивный предпросмотр`
  and explicitly says that action execution is not confirmed.
- Authenticated CSRF-protected
  `POST /api/flow-runs/<valid-uuid>/cancel` returned 409 with
  `FLOW_RUNTIME_EXECUTION_UNAVAILABLE`; no runtime row was mutated.
- A fresh post-build passwordless session rechecked the same endpoint at
  2026-08-02 20:59 MSK through the web proxy with trusted Origin and CSRF
  enforcement. It returned typed 409 before runtime-store lookup; temporary
  authentication artifacts were removed after the request.
- Flows and runtime-history states had no browser console errors.

## Cross-surface projection

- Dashboard requested pending approvals and showed the runtime-unavailable
  notice instead of projecting legacy approvals as work.
- Inbox requested `/api/flows` but made no per-flow `/runs` requests while
  runtime history was legacy-only.
- A fresh CDP network trace after reload contained identity/profile, messaging,
  `/api/flows` and realtime requests, and no `/api/flows/<id>/runs` request.
- Dashboard, Inbox and runtime-history browser states had no console errors.

## Local PostgreSQL inventory

- flows: 4 draft, 1 paused, 0 active;
- flow runs: 1 completed legacy preview;
- flow approvals: 0;
- flow step runs: 1;
- flow runtime events: 1;
- flow delivery attempts: 0;
- flow suppressions: 0;
- unpublished Flows dispatch outbox events: 0.

Visual artifacts: `dashboard-production.png`, `inbox-production.png`,
`runtime-history-production.png`.
