# Human Design Fixture And Responsive QA Evidence

Date: 2026-07-22

## Scope

- Production route: `http://localhost:5174/human-design`
- Role: authenticated astrologer `c6b1c066-c65d-41f1-918f-e5149519729d`
- CRM client: `22222222-2222-4222-8222-222222222222` (`Мария Иванова`)
- Birth data source: CRM `client_birth_data`, not browser input
- Fixture candidate: Rome, 1990-07-15, 10:30, `Europe/Rome`,
  `41.9028`, `12.4964`

## Local Runtime

- `chart-engine` `/ready`: `200`
- `chart-engine` OpenAPI includes `/v1/positions`
- Direct `/v1/positions` for the Rome fixture: `200`
- `astrologer-api` `/health`: `200`

## Browser E2E

- `POST /api/human-design/preview`: `200`
- `POST /api/human-design/calculations`: `201`
- `GET /api/calculations?module=human_design&status=all&limit=50&offset=0`:
  `200`
- `POST /api/human-design/calculations/d114b7d4-f221-4173-be4c-5f26e72a5161/recalculate`:
  `200`
- Console: no application errors; only Vite and React development messages.

## Persisted Record

- `calculation_records.id`: `d114b7d4-f221-4173-be4c-5f26e72a5161`
- `module`: `human_design`
- `mode`: `individual`
- `method_code`: `human_design_classic`
- `status`: `linked`
- `result_checksum`: `sha256:10bbb2f538398463c54ff3ea5e7deb945c59f1a17a2f64196175701a10ed56e1`
- `result_summary`: `projector`, `2/5`, `emotional`, `split`
- `calculation_participants`: subject CRM client
  `22222222-2222-4222-8222-222222222222`
- `calculation_client_links.visibility`: `private_to_astrologer`

## Responsive QA

Desktop viewport:

- Viewport: `1440x900`
- State: linked saved calculation selected
- Observed: title, client selector, disabled future modes/actions, saved list,
  property rail, bodygraph, detail panel and checksum render without blank
  areas.

Mobile viewport:

- Requested viewport: `390x844`
- Chrome DevTools reported viewport: `500x733`
- Before fix: Human Design page/layout elements extended to `right=516` with
  viewport width `500`, causing visible horizontal clipping.
- Fix: mobile `.page` horizontal negative margin changed from inherited
  `-32px` to `-16px`.
- After fix: `documentElement.clientWidth = 500`,
  `documentElement.scrollWidth = 500`, `body.scrollWidth = 500`.
- After fix overflow list contains only the global navigation brand logo at
  `left=-5`; Human Design page/body/toolbar/workspace no longer overflow the
  right edge.

## External Fixture Spike

- Source tested: `https://roxyapi.com/tools/human-design/bodygraph`
- Observation: form exposes date, time, city and language inputs.
- Blocker: Cloudflare Turnstile human verification prevents reliable automated
  result extraction through Chrome DevTools.
- Consequence: external fixture approval needs either an API key, a manual
  human-approved output copied into static fixture JSON, or another accepted
  calculator source.

## Screenshot Note

Chrome DevTools MCP captured inline desktop and mobile screenshots during the
session, but file writes to `.design-qa/.../*.png` were rejected by the MCP
workspace-root configuration. This file records the textual evidence and
browser metrics available from the same session.
