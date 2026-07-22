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
- Source tested: `https://www.bodygraph.info/`
- Observation: public docs expose a structured example for
  `1980-01-01T00:00:00Z` with personality/design longitudes, gates, lines,
  centers, channels, type, profile and incarnation cross.
- Comparison result: the raw longitudes are useful as stable fixture input, but
  several published gate/line fields do not match the MIT `human-design-py`
  gate-wheel reference for the same longitudes. Example mismatches found during
  the spike include `personality.mercury`, `personality.jupiter`,
  `personality.saturn`, `design.north_node`, `design.south_node`,
  `design.mars` and `design.saturn`.
- Consequence: BodyGraph static docs were not promoted as a complete gold
  output. The first approved fixture uses BodyGraph raw longitudes plus the
  `human-design-py` gate-wheel reference; a second fixture still needs live API
  or manual external output that exposes authority directly.
- Source tested: `https://humandesignapi.nl/` and
  `https://api.humandesignapi.nl/v2/sample/visual-trial`
- Live request:
  `POST /v2/sample/visual-trial` with
  `{"birthdate":"1990-09-05","birthtime":"21:17","location":"Amsterdam"}` and
  `Origin: https://humandesignapi.nl`.
- Live response: `success=true`, `type=ChartResult`, `birthDateUtc=1990-09-05T19:17:00.000Z`.
- External categorical output: Projector, `2/4`, strategy
  `Wait for the Invitation`, authority `Sounding Board`, definition
  `Single Definition`, centers `Ajna` and `Head`, channel `47-64`.
- Local comparison: running the same birth data through local chart-engine
  (`Europe/Amsterdam`, `52.3676`, `4.9041`) and
  `buildHumanDesignIndividualBaseResult` matched the external type, profile,
  definition, centers, channel and all 26 activations. The external authority
  label `Sounding Board` maps to ElevenHouse authority code `mental`.
- Consequence: HumanDesignAPI live public trial is approved as the second static
  fixture row. The source still does not expose raw planetary longitudes, so
  fixture input longitudes are stored as local chart-engine resolved evidence
  for the same birth data.

## Static Fixture Test

- Added: `packages/domain/src/human-design/fixtures/approved-fixtures.ts`
- Added: `packages/domain/src/human-design/fixture-comparison.test.ts`
- Red proof: fixture comparison initially failed because the fixture module did
  not exist.
- Green proof:
  `pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/fixture-comparison.test.ts`
- Red proof for second fixture: comparison test failed with
  `expected 1 to be greater than or equal to 2`.
- Green proof:
  `pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/fixture-comparison.test.ts`
  passed with two approved typed fixtures.
- Red proof for boundary fixture requirement: comparison test failed with
  `expected 2 to be greater than or equal to 3` after the suite was tightened to
  require a `reference_boundary_case` fixture.
- Boundary fixture added:
  `reference-gate-line-boundaries-41-19-transition`, covering exact gate 41
  start, just before line 2, exact line 2 boundary, just before gate 19 and
  exact gate 19 start.
- Green proof:
  `pnpm exec vitest run --config vitest.config.ts packages/domain/src/human-design/fixture-comparison.test.ts`
  passed with three approved typed fixtures.

## Local DB Persistence Test

- Added:
  `packages/db/src/adapters/calculations/drizzle-human-design-approved-fixtures.integration.ts`
- Scope: local PostgreSQL only, guarded by `assertDevelopmentDatabaseUrl`.
- Red proof 1: running without `INTEGRATION_DATABASE_URL` failed with
  `INTEGRATION_DATABASE_URL is required for integration tests`.
- Red proof 2: running with `.env` initially failed because the test tried to
  import fixtures through the built `@elevenhouse/domain` package export.
- Fix: keep production domain imports through `@elevenhouse/domain`, but import
  approved fixture rows as source-level test assets from `packages/domain/src`.
- Green proof:
  `set -a && source .env && set +a && INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/calculations/drizzle-human-design-approved-fixtures.integration.ts`
  passed with one integration test.
- Green proof after adding the boundary fixture:
  `set -a && source .env && set +a && INTEGRATION_DATABASE_URL="$DATABASE_URL" pnpm test:integration packages/db/src/adapters/calculations/drizzle-human-design-approved-fixtures.integration.ts`
  passed with one integration test over the three approved fixture rows.
- Persistence behavior: for every approved fixture, the test creates a synthetic
  owner, inserts a linked `human_design`/`individual` calculation through
  `createCalculation` + `createDrizzleCalculationStore`, reads it back with
  `findByOwnerAndId`, and compares `result_data`, `result_summary`,
  `request_fingerprint`, `result_checksum`, participant and private client link.
- Cleanup: `afterAll` deletes calculation rows by synthetic `owner_user_id` and
  then deletes the synthetic user.

## Screenshot Note

Chrome DevTools MCP captured inline desktop and mobile screenshots during the
session, but file writes to `.design-qa/.../*.png` were rejected by the MCP
workspace-root configuration. This file records the textual evidence and
browser metrics available from the same session.

## Authenticated Screenshot Retry

- Date: 2026-07-22.
- Existing services checked read-only: `localhost:5174` frontend was available;
  `localhost:3002/health` returned `{"service":"astrologer-api","status":"ok"}`;
  `localhost:8011/ready` was unavailable, so preview/recalculate were not
  re-claimed in this retry.
- Chrome DevTools MCP page state recovered:
  `http://localhost:5174/human-design`, authenticated astrologer workspace,
  saved linked calculation reopened from the saved-list card for `Мария
  Иванова`.
- MCP file screenshot retry result: still blocked with
  `Access denied ... is not within any of the configured workspace roots` for
  both absolute and relative `.design-qa/.../*.png` paths.
- Headless Chrome fallback result: invalid for production evidence because a
  clean/copied profile opened the public registration page instead of the
  authenticated astrologer workspace; generated PNGs were removed.
- Desktop inline DevTools screenshot captured for viewport
  `1440x733 @2x`: linked state, saved calculation, bodygraph, property rail,
  detail panel and checksum `10bbb2f53839` were visible.
- Desktop metrics: `clientWidth=1440`, `scrollWidth=1440`,
  `bodyScrollWidth=1440`; overflow list was empty.
- Mobile inline DevTools screenshot captured for emulated viewport
  `390x844 @2x`: linked state, selected client, saved calculation, property
  cards and disabled future actions were visible.
- Mobile metrics: `clientWidth=390`, `scrollWidth=390`,
  `bodyScrollWidth=390`; no document-level horizontal overflow. Detected
  right-edge entries were inside clipped/scrollable UI controls: the global
  brand logo, disabled mode tabs and saved-card date text.

## Runtime Browser Recheck

- Date: 2026-07-22.
- Correction: current `astrologer-api` default and running chart-engine target
  use `http://localhost:8012`, not `8011`.
- Existing services checked read-only: `localhost:5174` frontend was available;
  `localhost:3002/health` returned
  `{"service":"astrologer-api","status":"ok"}`;
  `localhost:8012/ready` returned
  `{"service":"chart-engine","status":"ready"}`.
- Browser surface: Chrome DevTools MCP, production route
  `http://localhost:5174/human-design`, authenticated astrologer workspace,
  saved linked calculation for `Мария Иванова`.
- Runtime flow:
  - reopened saved linked calculation from the saved-list card;
  - clicked `Рассчитать`, received preview state `Бодиграф рассчитан`;
  - clicked `Привязать`, received linked state `Расчёт привязан`;
  - clicked `Обновить`, received linked state again.
- Network evidence:
  - `POST /api/human-design/preview` -> `200`;
  - `POST /api/human-design/calculations` -> `201`;
  - `GET /api/calculations?module=human_design&status=all&limit=50&offset=0`
    -> `200` after persistence;
  - `POST /api/human-design/calculations/d114b7d4-f221-4173-be4c-5f26e72a5161/recalculate`
    -> `200`;
  - saved-list refresh after recalculation -> `200`.
- Console evidence: Chrome DevTools reported no `error`, `warn` or `issue`
  console messages.
- Desktop metrics after recheck: viewport `1440x900 @2x`,
  `clientWidth=1440`, `scrollWidth=1440`, `bodyScrollWidth=1440`,
  no overflowing elements, linked state visible with `Мария Иванова`,
  `Проектор` and checksum `10bbb2f53839`.
- Mobile metrics after recheck: emulated viewport `390x844 @2x`,
  `clientWidth=390`, `scrollWidth=390`, `bodyScrollWidth=390`,
  no document-level horizontal overflow, linked state visible with
  `Мария Иванова`, `Проектор` and checksum `10bbb2f53839`.
- Remaining screenshot artifact blocker: Chrome DevTools MCP still rejects
  file writes under `.design-qa/...` with the configured workspace-root error,
  so screenshots are inline DevTools evidence rather than stored PNG files.

## File Screenshot Artifacts

- Date: 2026-07-22.
- Chrome DevTools MCP file writes still failed with the configured
  workspace-root error, so final PNG artifacts were captured through macOS
  `screencapture` against the active authenticated Chrome window.
- Desktop artifact:
  `.design-qa/human-design-method-fixtures/production-desktop-window-1440x900-2026-07-22.png`.
  Visual check confirmed authenticated `/human-design` linked state for
  `Мария Иванова`, saved calculation, bodygraph, property rail, detail area,
  action states and checksum surface. The capture includes browser chrome.
- Mobile artifact:
  `.design-qa/human-design-method-fixtures/production-mobile-window-390x844-2026-07-22.png`.
  Visual check confirmed emulated mobile linked state for `Мария Иванова`,
  selected individual mode, linked status, action buttons, saved calculation
  and property cards. The capture includes browser chrome.
