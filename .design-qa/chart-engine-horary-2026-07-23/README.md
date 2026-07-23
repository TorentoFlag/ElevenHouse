# Chart Engine Horary Browser Evidence - 2026-07-23

## Scope

- Production route: `http://localhost:5174/chart-engine?mode=horary`.
- Role/session: authenticated astrologer account
  `f261baf0-3724-4002-b07e-68882c033e9c`.
- Local CRM client seeded for proof:
  `11111111-2222-4333-8444-555555555555` / `Мария Иванова`.
- Scenario: select CRM client, fill horary question/category/date/time/timezone
  and coordinates, run calculation, open interpretations, reload.

## Runtime Setup

- Existing local PostgreSQL: `localhost:5432/elevenhouse`, Docker service
  `elevenhouse-postgres-1` healthy.
- Rebuilt current compiled artifacts:
  - `pnpm --filter @elevenhouse/astrologer-api... build`
  - `pnpm --filter @elevenhouse/chart-worker... build`
- Restarted stale local runtime processes after proving they served old code:
  - `apps/astrologer-api/dist/main.js`
  - `apps/chart-worker/dist/main.js`
  - `apps/chart-engine/.venv/bin/uvicorn chart_engine.main:app --port 8012`
- Current readiness evidence:
  - `curl http://localhost:8012/ready` -> `{"service":"chart-engine","status":"ready"}`
  - `curl http://localhost:3012/ready` -> worker ready with postgres, queue,
    worker and chartEngine ready.

## Browser Evidence

- Route after successful calculation:
  `http://localhost:5174/chart-engine?mode=horary&clientId=11111111-2222-4333-8444-555555555555&calculationId=1e939d97-250f-410d-8cc6-12b042e5ab34`
- Visible success state:
  - `Хорар рассчитан`
  - `Карта построена на момент вопроса; автоматический ответ не подключён.`
  - toolbar button `Актуальна`
  - PDF button disabled with horary tooltip
  - single-wheel chart, planet table, left rail distributions
- Interpretation tab evidence:
  - heading `ХОРАР · БИБЛИОТЕКА`
  - missing-entry copy uses exact `horary.*` codes, for example
    `horary.sun.leo`, `horary.sun.house.8`, `horary.question.career`
  - each missing entry offers `Создать трактовку`
  - AI block states that the horary AI contour and automated answer are not
    connected yet.
- Reload evidence:
  - reload preserved `mode=horary`, `clientId` and `calculationId`
  - screen returned to calculated horary result, not auth or empty state
- Console evidence:
  - no errors; only Vite debug connection and React DevTools info messages.

## Network Evidence

- Successful current requests:
  - `POST /api/charts/horary/jobs` -> 201, request id `1965`
  - `GET /api/charts/jobs/a5a31bdc-5c7d-44f6-a99f-8f4be80d4033` -> 200,
    request ids `1966`, `1967`
  - `GET /api/charts/calculations/1e939d97-250f-410d-8cc6-12b042e5ab34` -> 200,
    request id `1968`
  - `GET /api/dictionary/entries/by-codes?...horary...` -> 200/304, request
    ids `1969`, `1970`

## Runtime Issues Found And Resolved

- Initial browser POST returned 404 because `astrologer-api` was running an old
  `dist/main.js` process. Rebuilt dependency chain and restarted API.
- Next jobs failed with `CHART_ENGINE_HTTP_404` because the FastAPI process on
  `8012` was also old and did not yet expose `/v1/horary`. Restarted
  chart-engine after direct `POST /v1/horary` proved the stale route.
- Port `8000` is occupied by an unrelated `python -m http.server`; current
  chart engine runtime for this repo is `8012`.

## Artifact Note

Chrome DevTools MCP captured the rendered desktop viewport after success, but
its file-save path was denied by the MCP workspace-root guard. The screenshot
was still taken in-tool during this verification; this README records the
durable browser/network evidence.
