# Chart Engine Natal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ElevenHouse repository policy overrides generic worktree/feature-branch guidance: execute in the existing checkout on `main`, preserve concurrent changes, and do not commit without separate user authority.

**Goal:** Deliver the first production chart-engine slice: authenticated astrologers can calculate and view server-backed natal charts for CRM clients with complete birth data.

**Architecture:** `astrologer-api` owns auth, CSRF, CRM birth-data hydration, calculation-ready validation, idempotent job creation, and result lookup. PostgreSQL owns durable job/result state and the transactional outbox; BullMQ carries only `{ jobId }`; `apps/chart-worker` calls a private Python `apps/chart-engine` service that wraps Kerykeion and returns validated ElevenHouse canonical chart JSON.

**Tech Stack:** TypeScript 6, NestJS, Drizzle ORM, PostgreSQL, BullMQ/Redis, Zod-backed contracts, React 19, Vite 8, TanStack Query 5, Python 3.10+, FastAPI, Pydantic, Uvicorn, Kerykeion 5.12.x, Vitest, pytest, Docker, GitHub Actions.

## Global Constraints

- Work only in the current ElevenHouse checkout on `main`.
- Re-read complete target files and their path-scoped diff before every edit group.
- Preserve all unowned modifications, especially the existing calendar and `.design-qa` changes.
- Follow red-green-refactor. No production implementation precedes the failing test or spike assertion that specifies it.
- Do not start, stop, restart, or kill frontend, API, worker, Docker, PostgreSQL, Redis, or long-running services without direct user authority.
- Do not commit, push, create a PR, switch branches, stash, rebase, or create a worktree without direct user authority.
- First production method is `natal` only.
- AstroCalendar, transits, returns, synastry, composite, progressions, directions, manual subjects, AI interpretations, chart PDF export, and public/client sharing are out of scope.
- `birthTimePrecision = unknown` blocks calculation; `birthTimePrecision = approximate` calculates with a warning.
- Frontend must not expose technical queue wording; backend `queued` and `processing` both display as one calculating state.
- Do not store raw Kerykeion JSON, provider SVG, client names, phone numbers, CRM notes, frontend layout coordinates, or style metadata in canonical chart results.
- Keep private birth input snapshots separate from renderable chart results and future public/client-visible DTOs.
- State-changing chart routes must use `astrologer-api` CSRF route metadata.
- Controllers must not publish directly to Redis/BullMQ. API transactions write DB state plus outbox; a relay publishes `{ jobId }`.
- `chart_calculation_jobs` must use nullable `result_calculation_id` or equivalent and must not require a completed `calculation_records` row before success.
- Kerykeion calls must be process-isolated or locked until a bounded spike proves a safer concurrency model.
- Visible frontend completion requires real browser evidence against `ElevenHouseDesign` and a network-backed production state.

---

## Source Artifacts

- Spec: `docs/superpowers/specs/2026-07-20-chart-engine-natal-design.md`
- Reference UI: `ElevenHouseDesign/app/engine.jsx`, `engine-data.jsx`, `engine-modes.jsx`, `engine-tables.jsx`, `engine-wheel.jsx`, `wheel.jsx`
- Product mapping: `docs/architecture/design-reference-inventory.md`
- Worker runbook: `docs/development/agent-runbooks/06-workers-and-events.md`
- API/security ADR: `docs/decisions/0007-cookie-auth-csrf-and-idempotency.md`
- App boundary ADR: `docs/decisions/0001-monorepo-and-app-boundaries.md`
- Existing worker pattern: `apps/workers/src/calculation-pdf/*`
- Existing API security pattern: `apps/astrologer-api/src/modules/bookings/bookings.controller.ts`
- Current chart worker scaffold: `apps/chart-worker/src/main.ts`

## Implementation Status Update (2026-07-22)

This ExecPlan is historical and should not be read as the current checkbox
tracker. The natal production slice has since landed in the repository:

- private `apps/chart-engine` FastAPI/Kerykeion runtime and `chart-worker`;
- shared chart contracts, domain flow, persistence and authenticated
  `astrologer-api` jobs/results/recalculation routes;
- `/chart-engine` natal surface with CRM client selection, real result state,
  vector wheel, tables, settings, hover details, Dictionary-backed
  interpretations, disabled future modes and explicit state matrix;
- private chart PDF export through the generic calculation-PDF lifecycle,
  including deterministic wheel/tables/settings/warnings and owner-scoped
  Dictionary interpretation lookup by exact chart codes.

The original constraint that chart PDF export was out of scope is stale. PDF
became an approved follow-up and is now documented in
`docs/decisions/0008-private-calculation-pdf-contour.md`,
`docs/api/api-boundaries.md` and `docs/architecture/backend-modules.md`.

Remaining chart-engine product work should now be tracked as follow-up specs:
first transits, then synastry, solar return, progressions, composite, child
chart interpretation mode, horary and astrocartography. New methods must not be
enabled in the UI until their backend contracts, provider adapter, state matrix,
Dictionary codes and browser evidence exist.

## File Structure

### Documentation and Deployment

- Modify: `docs/decisions/0001-monorepo-and-app-boundaries.md`
- Modify: `docs/architecture/repository-structure.md`
- Modify: `docs/architecture/deployment-topology.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `.github/workflows/deploy.yml`
- Modify: `deployment/compose/compose.production.yml`

### Python Chart Engine

- Create: `apps/chart-engine/pyproject.toml`
- Create: `apps/chart-engine/README.md`
- Create: `apps/chart-engine/src/chart_engine/__init__.py`
- Create: `apps/chart-engine/src/chart_engine/main.py`
- Create: `apps/chart-engine/src/chart_engine/schemas.py`
- Create: `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`
- Create: `apps/chart-engine/src/chart_engine/settings.py`
- Create: `apps/chart-engine/tests/test_health.py`
- Create: `apps/chart-engine/tests/test_natal_contract.py`
- Create: `apps/chart-engine/tests/test_kerykeion_spike.py`

### Shared Contracts, Domain, Validation

- Modify: `packages/validation/src/common/time-zone.ts`
- Modify: `packages/validation/src/common/time-zone.test.ts`
- Modify: `packages/contracts/src/clients.ts`
- Modify: `packages/contracts/src/clients.test.ts`
- Create: `packages/contracts/src/charts.ts`
- Create: `packages/contracts/src/charts.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/domain/src/charts/chart-types.ts`
- Create: `packages/domain/src/charts/chart-errors.ts`
- Create: `packages/domain/src/charts/chart-birth-data-readiness.ts`
- Create: `packages/domain/src/charts/chart-use-cases.ts`
- Create: `packages/domain/src/charts/chart-use-cases.test.ts`
- Create: `packages/domain/src/charts/index.ts`
- Modify: `packages/domain/src/index.ts`

### Database

- Create: `packages/db/src/schema/calculations/chart-calculation-jobs.schema.ts`
- Modify: `packages/db/src/schema/calculations/calculation-values.ts`
- Modify: `packages/db/src/schema/calculations/index.ts`
- Modify: `packages/db/src/schema/calculations/relations.schema.ts`
- Modify: `packages/db/src/schema/calculations/calculations.schema.test.ts`
- Modify: `packages/db/src/schema/clients/client-birth-data.schema.ts`
- Modify: `packages/db/src/schema/clients/client-values.ts`
- Modify: `packages/db/src/schema/clients/relations.schema.ts`
- Create: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`
- Create: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts`
- Create: `packages/db/src/adapters/charts/index.ts`
- Modify: `packages/db/src/adapters/index.ts`

### Chart Worker

- Modify: `apps/chart-worker/package.json`
- Modify: `apps/chart-worker/src/main.ts`
- Modify: `apps/chart-worker/src/readiness.ts`
- Create: `apps/chart-worker/src/chart-engine-client.ts`
- Create: `apps/chart-worker/src/chart-engine-client.test.ts`
- Create: `apps/chart-worker/src/chart-jobs.queue.ts`
- Create: `apps/chart-worker/src/chart-jobs.queue.test.ts`
- Create: `apps/chart-worker/src/chart-jobs.outbox-relay.ts`
- Create: `apps/chart-worker/src/chart-jobs.outbox-relay.test.ts`
- Create: `apps/chart-worker/src/chart-jobs.processor.ts`
- Create: `apps/chart-worker/src/chart-jobs.processor.test.ts`
- Create: `apps/chart-worker/src/chart-worker-runtime.ts`
- Create: `apps/chart-worker/src/chart-worker-runtime.test.ts`

### Astrologer API

- Modify: `apps/astrologer-api/src/app.module.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.controller.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.module.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.service.test.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.tokens.ts`
- Create: `apps/astrologer-api/src/modules/charts/chart-http-errors.ts`

### Astrologer Web

- Modify: `apps/astrologer-web/src/router.tsx`
- Create: `apps/astrologer-web/src/features/charts/api/chartsApi.ts`
- Create: `apps/astrologer-web/src/features/charts/api/chartsApi.test.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartEngineState.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts`
- Create: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
- Create: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`
- Create: `apps/astrologer-web/src/features/charts/components/ChartWheel.tsx`
- Create: `apps/astrologer-web/src/features/charts/components/ChartTables.tsx`
- Create: `apps/astrologer-web/src/features/charts/components/ChartSettingsPanel.tsx`
- Create: `apps/astrologer-web/src/pages/chart-engine/ChartEngineRoute.tsx`
- Create: `apps/astrologer-web/src/pages/chart-engine/ChartEngineRoute.test.tsx`

---

## Task 1: Register `apps/chart-engine` as an Accepted Deployable

**Files:**

- Modify: `docs/decisions/0001-monorepo-and-app-boundaries.md`
- Modify: `docs/architecture/repository-structure.md`
- Modify: `docs/architecture/deployment-topology.md`
- Modify: `docs/architecture/backend-modules.md`
- Modify: `docs/architecture/design-reference-inventory.md`
- Modify: `.github/workflows/deploy.yml`
- Modify: `deployment/compose/compose.production.yml`

**Interfaces:**

- Consumes: approved spec at `docs/superpowers/specs/2026-07-20-chart-engine-natal-design.md`.
- Produces: repository docs and deployment matrix that recognize `apps/chart-engine` as a private Python deployable with `/live` and `/ready`.

- [ ] **Step 1: Re-read current docs and deployment files**

```bash
sed -n '1,120p' docs/decisions/0001-monorepo-and-app-boundaries.md
sed -n '1,130p' docs/architecture/repository-structure.md
sed -n '1,220p' docs/architecture/deployment-topology.md
sed -n '130,190p' docs/architecture/backend-modules.md
sed -n '160,185p' docs/architecture/design-reference-inventory.md
sed -n '45,150p' .github/workflows/deploy.yml
sed -n '1,240p' deployment/compose/compose.production.yml
git diff -- docs/decisions/0001-monorepo-and-app-boundaries.md docs/architecture/repository-structure.md docs/architecture/deployment-topology.md docs/architecture/backend-modules.md docs/architecture/design-reference-inventory.md .github/workflows/deploy.yml deployment/compose/compose.production.yml
```

Expected: command output shows current accepted apps include `chart-worker` but not `chart-engine`; path-scoped diff is empty or only contains agent-owned changes from this task.

- [ ] **Step 2: Run docs check before edits**

```bash
pnpm docs:check
```

Expected: `agent-docs: ok`.

- [ ] **Step 3: Update architecture docs**

Add `chart-engine` to backend apps/processes in `docs/decisions/0001-monorepo-and-app-boundaries.md` and state that it is a private Python calculation runtime, not a business microservice. Add `apps/chart-engine/` to `docs/architecture/repository-structure.md`. Update deployment topology so chart flow is:

```text
astrologer-web -> astrologer-api -> PostgreSQL / Redis / Queue
Queue -> chart-worker -> chart-engine
```

In `docs/architecture/backend-modules.md`, add:

```markdown
### Chart Engine

`astrologer-api` owns chart request authorization, CSRF route metadata, CRM birth-data hydration, calculation-ready validation and job creation. `chart-worker` owns BullMQ delivery, leases, retries and result persistence. `apps/chart-engine` is a private Python/FastAPI runtime that wraps Kerykeion and returns ElevenHouse canonical chart JSON. Controllers do not enqueue BullMQ jobs directly; API transactions write an outbox event and the relay publishes `{ jobId }`.
```

In `docs/architecture/design-reference-inventory.md`, keep `ElevenHouseDesign` as visual truth and add that chart calculations must use the backend/worker/Python contour.

- [ ] **Step 4: Add CI image matrix entry**

In `.github/workflows/deploy.yml`, add a matrix entry after `elevenhouse-chart-worker`:

```yaml
          - image: elevenhouse-chart-engine
            dockerfile: deployment/docker/chart-engine.Dockerfile
            app_filter: ""
            app_dir: chart-engine
            build_args: ""
```

Do not modify existing Node images.

- [ ] **Step 5: Add production compose service**

In `deployment/compose/compose.production.yml`, add a private `chart-engine` service that is not routed by Caddy and is reachable by `chart-worker` on the compose network:

```yaml
  chart-engine:
    image: ${IMAGE_NAMESPACE}/elevenhouse-chart-engine:${IMAGE_TAG}
    restart: unless-stopped
    environment:
      CHART_ENGINE_HOST: 0.0.0.0
      CHART_ENGINE_PORT: "8012"
      CHART_ENGINE_WORKERS: ${CHART_ENGINE_WORKERS:-2}
    expose:
      - "8012"
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8012/ready"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
```

Add `CHART_ENGINE_BASE_URL=http://chart-engine:8012` to `chart-worker` environment.

- [ ] **Step 6: Verify docs/deploy edit**

```bash
pnpm docs:check
git diff --check -- docs/decisions/0001-monorepo-and-app-boundaries.md docs/architecture/repository-structure.md docs/architecture/deployment-topology.md docs/architecture/backend-modules.md docs/architecture/design-reference-inventory.md .github/workflows/deploy.yml deployment/compose/compose.production.yml
```

Expected: docs check passes; diff check prints no output.

- [ ] **Step 7: Checkpoint without committing**

```bash
git status --short
git diff -- docs/decisions/0001-monorepo-and-app-boundaries.md docs/architecture/repository-structure.md docs/architecture/deployment-topology.md docs/architecture/backend-modules.md docs/architecture/design-reference-inventory.md .github/workflows/deploy.yml deployment/compose/compose.production.yml
```

Expected: only Task 1 owned paths changed. Do not commit unless the user separately authorizes staging and commit.

---

## Task 2: Build the Kerykeion Provider Spike and Minimal Python Runtime

**Files:**

- Create: `apps/chart-engine/pyproject.toml`
- Create: `apps/chart-engine/README.md`
- Create: `apps/chart-engine/src/chart_engine/__init__.py`
- Create: `apps/chart-engine/src/chart_engine/main.py`
- Create: `apps/chart-engine/src/chart_engine/schemas.py`
- Create: `apps/chart-engine/src/chart_engine/kerykeion_adapter.py`
- Create: `apps/chart-engine/src/chart_engine/settings.py`
- Create: `apps/chart-engine/tests/test_health.py`
- Create: `apps/chart-engine/tests/test_natal_contract.py`
- Create: `apps/chart-engine/tests/test_kerykeion_spike.py`
- Create: `deployment/docker/chart-engine.Dockerfile`

**Interfaces:**

- Consumes: private HTTP contract later called by `apps/chart-worker`.
- Produces: FastAPI app with `GET /live`, `GET /ready`, `POST /v1/natal`, Pydantic request/response models, and Kerykeion field/timing evidence.

- [ ] **Step 1: Create Python package metadata**

Create `apps/chart-engine/pyproject.toml`:

```toml
[build-system]
requires = ["setuptools>=69"]
build-backend = "setuptools.build_meta"

[project]
name = "elevenhouse-chart-engine"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
  "fastapi>=0.115,<1.0",
  "uvicorn[standard]>=0.30,<1.0",
  "pydantic>=2.8,<3.0",
  "kerykeion>=5.12,<5.13"
]

[project.optional-dependencies]
test = [
  "pytest>=8.2,<9.0",
  "httpx>=0.27,<1.0"
]

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]
```

- [ ] **Step 2: Write failing health tests**

Create `apps/chart-engine/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from chart_engine.main import app


def test_live_returns_service_status():
    client = TestClient(app)

    response = client.get("/live")

    assert response.status_code == 200
    assert response.json()["service"] == "chart-engine"
    assert response.json()["status"] == "live"


def test_ready_returns_service_status():
    client = TestClient(app)

    response = client.get("/ready")

    assert response.status_code == 200
    assert response.json()["service"] == "chart-engine"
    assert response.json()["status"] == "ready"
```

- [ ] **Step 3: Run health tests to verify failure**

```bash
cd apps/chart-engine
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ".[test]"
pytest tests/test_health.py -q
```

Expected before implementation: import failure for `chart_engine.main` or missing routes.

- [ ] **Step 4: Implement minimal FastAPI app**

Create `apps/chart-engine/src/chart_engine/__init__.py`:

```python
__all__ = ["__version__"]

__version__ = "0.1.0"
```

Create `apps/chart-engine/src/chart_engine/main.py`:

```python
from fastapi import FastAPI

from chart_engine.kerykeion_adapter import calculate_natal
from chart_engine.schemas import HealthResponse, NatalRequest, StoredChartCalculationPayload

app = FastAPI(title="ElevenHouse Chart Engine", version="0.1.0")


@app.get("/live", response_model=HealthResponse)
def live() -> HealthResponse:
    return HealthResponse(service="chart-engine", status="live")


@app.get("/ready", response_model=HealthResponse)
def ready() -> HealthResponse:
    return HealthResponse(service="chart-engine", status="ready")


@app.post("/v1/natal", response_model=StoredChartCalculationPayload)
def natal(request: NatalRequest) -> StoredChartCalculationPayload:
    return calculate_natal(request)
```

- [ ] **Step 5: Define Pydantic schemas**

Create `apps/chart-engine/src/chart_engine/schemas.py` with exact public names:

```python
from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    service: Literal["chart-engine"]
    status: Literal["live", "ready"]


class NatalSettings(BaseModel):
    zodiac: Literal["tropical"] = "tropical"
    houseSystem: str = Field(min_length=1)
    nodeType: Literal["true", "mean"]
    aspectPreset: Literal["major", "major_minor"]
    orbMultiplier: float = Field(ge=0.5, le=1.5)


class NatalInputSnapshot(BaseModel):
    birthDate: str
    birthTime: str
    timezone: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    birthTimePrecision: Literal["exact", "approximate"]
    dstOccurrence: Literal["first", "second"] | None = None


class NatalRequest(BaseModel):
    schemaVersion: Literal["chart-request.v1"]
    method: Literal["natal"]
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot


class ProviderMetadata(BaseModel):
    name: Literal["kerykeion"]
    version: str
    ephemeris: str


class ChartPoint(BaseModel):
    id: str
    label: str
    longitude: float
    sign: str
    signDegree: float
    house: int | None = None
    retrograde: bool | None = None


class ChartHouse(BaseModel):
    number: int = Field(ge=1, le=12)
    longitude: float
    sign: str
    signDegree: float


class ChartAspect(BaseModel):
    pointA: str
    pointB: str
    type: str
    angle: float
    orb: float
    applying: bool | None = None
    strength: float | None = None


class ChartDistributions(BaseModel):
    elements: dict[str, int]
    modalities: dict[str, int]
    polarity: dict[str, int]


class ChartWarning(BaseModel):
    code: str
    message: str


class ChartRenderResult(BaseModel):
    points: list[ChartPoint]
    houses: list[ChartHouse]
    aspects: list[ChartAspect]
    distributions: ChartDistributions
    warnings: list[ChartWarning]


class StoredChartCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v1"]
    method: Literal["natal"]
    provider: ProviderMetadata
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    result: ChartRenderResult
```

- [ ] **Step 6: Write natal contract test**

Create `apps/chart-engine/tests/test_natal_contract.py`:

```python
from fastapi.testclient import TestClient

from chart_engine.main import app


def test_natal_returns_canonical_shape():
    client = TestClient(app)
    payload = {
        "schemaVersion": "chart-request.v1",
        "method": "natal",
        "settings": {
            "zodiac": "tropical",
            "houseSystem": "placidus",
            "nodeType": "true",
            "aspectPreset": "major",
            "orbMultiplier": 1.0,
        },
        "inputSnapshot": {
            "birthDate": "1990-07-15",
            "birthTime": "10:30",
            "timezone": "Europe/Rome",
            "latitude": 41.9028,
            "longitude": 12.4964,
            "birthTimePrecision": "exact",
        },
    }

    response = client.post("/v1/natal", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == "chart-result.v1"
    assert data["method"] == "natal"
    assert data["provider"]["name"] == "kerykeion"
    assert data["settings"] == payload["settings"]
    assert data["inputSnapshot"] == payload["inputSnapshot"]
    point_ids = {point["id"] for point in data["result"]["points"]}
    assert {"sun", "moon", "ascendant", "midheaven", "north_node", "south_node"}.issubset(point_ids)
    assert len(data["result"]["houses"]) == 12
```

- [ ] **Step 7: Implement Kerykeion adapter**

Create `apps/chart-engine/src/chart_engine/kerykeion_adapter.py` with a real adapter, not fake data:

```python
from importlib.metadata import version

from kerykeion import AstrologicalSubjectFactory

from chart_engine.schemas import (
    ChartDistributions,
    ChartHouse,
    ChartPoint,
    ChartRenderResult,
    NatalRequest,
    ProviderMetadata,
    StoredChartCalculationPayload,
)

HOUSE_SYSTEMS = {
    "placidus": "P",
    "koch": "K",
    "whole_sign": "W",
    "equal": "A",
    "regiomontanus": "R",
}

POINT_ATTRIBUTES = {
    "sun": ("Sun", "sun"),
    "moon": ("Moon", "moon"),
    "mercury": ("Mercury", "mercury"),
    "venus": ("Venus", "venus"),
    "mars": ("Mars", "mars"),
    "jupiter": ("Jupiter", "jupiter"),
    "saturn": ("Saturn", "saturn"),
    "uranus": ("Uranus", "uranus"),
    "neptune": ("Neptune", "neptune"),
    "pluto": ("Pluto", "pluto"),
    "ascendant": ("Ascendant", "ascendant"),
    "midheaven": ("Midheaven", "medium_coeli"),
    "north_node": ("North Node", "mean_node"),
    "south_node": ("South Node", "true_south_node"),
}

HOUSE_ATTRIBUTES = [
    "first_house",
    "second_house",
    "third_house",
    "fourth_house",
    "fifth_house",
    "sixth_house",
    "seventh_house",
    "eighth_house",
    "ninth_house",
    "tenth_house",
    "eleventh_house",
    "twelfth_house",
]


def calculate_natal(request: NatalRequest) -> StoredChartCalculationPayload:
    year, month, day = [int(part) for part in request.inputSnapshot.birthDate.split("-")]
    hour, minute = [int(part) for part in request.inputSnapshot.birthTime.split(":")]
    house_system = HOUSE_SYSTEMS[request.settings.houseSystem]

    subject = AstrologicalSubjectFactory.from_birth_data(
        name="subject",
        year=year,
        month=month,
        day=day,
        hour=hour,
        minute=minute,
        lng=request.inputSnapshot.longitude,
        lat=request.inputSnapshot.latitude,
        tz_str=request.inputSnapshot.timezone,
        online=False,
        zodiac_type="Tropical",
        houses_system_identifier=house_system,
    )

    points = [_map_point(point_id, label, getattr(subject, attr)) for point_id, (label, attr) in POINT_ATTRIBUTES.items()]
    houses = [_map_house(index + 1, getattr(subject, attr)) for index, attr in enumerate(HOUSE_ATTRIBUTES)]

    return StoredChartCalculationPayload(
        schemaVersion="chart-result.v1",
        method="natal",
        provider=ProviderMetadata(
            name="kerykeion",
            version=version("kerykeion"),
            ephemeris="swiss-ephemeris",
        ),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        result=ChartRenderResult(
            points=points,
            houses=houses,
            aspects=[],
            distributions=ChartDistributions(elements={}, modalities={}, polarity={}),
            warnings=[],
        ),
    )


def _map_point(point_id: str, label: str, model: object) -> ChartPoint:
    return ChartPoint(
        id=point_id,
        label=label,
        longitude=float(getattr(model, "abs_pos")),
        sign=str(getattr(model, "sign")).lower(),
        signDegree=float(getattr(model, "position")),
        house=_house_number(getattr(model, "house", None)),
        retrograde=getattr(model, "retrograde", None),
    )


def _map_house(number: int, model: object) -> ChartHouse:
    return ChartHouse(
        number=number,
        longitude=float(getattr(model, "abs_pos")),
        sign=str(getattr(model, "sign")).lower(),
        signDegree=float(getattr(model, "position")),
    )


def _house_number(value: object) -> int | None:
    if value is None:
        return None
    names = {
        "First_House": 1,
        "Second_House": 2,
        "Third_House": 3,
        "Fourth_House": 4,
        "Fifth_House": 5,
        "Sixth_House": 6,
        "Seventh_House": 7,
        "Eighth_House": 8,
        "Ninth_House": 9,
        "Tenth_House": 10,
        "Eleventh_House": 11,
        "Twelfth_House": 12,
    }
    return names.get(str(value))
```

- [ ] **Step 8: Run Python tests**

```bash
cd apps/chart-engine
. .venv/bin/activate
pytest -q
```

Expected: health and natal contract tests pass. If the adapter exposes a Kerykeion field name mismatch, update the adapter and test in the same task and record the exact field mapping in `apps/chart-engine/README.md`.

- [ ] **Step 9: Add spike notes**

Create `apps/chart-engine/README.md`:

```markdown
# ElevenHouse Chart Engine

Private Python/FastAPI runtime for provider-backed chart calculations.

## First provider

- Provider: Kerykeion 5.12.x
- Runtime: Python >=3.10, Docker image currently uses Python 3.12 slim
- Public service endpoints: `/live`, `/ready`, `/v1/natal`
- Network exposure: private backend network only

## Provider boundary

The service returns ElevenHouse canonical chart JSON. It does not return raw Kerykeion models or SVG.

## Concurrency

Kerykeion/Swiss Ephemeris calculations are treated as process-isolated work. Increase throughput with Uvicorn worker processes or service replicas after benchmark evidence.
```

- [ ] **Step 10: Add chart-engine Dockerfile**

Create `deployment/docker/chart-engine.Dockerfile`:

```dockerfile
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential curl \
  && rm -rf /var/lib/apt/lists/*

COPY apps/chart-engine/pyproject.toml ./apps/chart-engine/pyproject.toml
COPY apps/chart-engine/src ./apps/chart-engine/src

RUN python -m pip install --upgrade pip \
  && python -m pip install ./apps/chart-engine

ENV CHART_ENGINE_HOST=0.0.0.0
ENV CHART_ENGINE_PORT=8012
ENV CHART_ENGINE_WORKERS=2

EXPOSE 8012

CMD ["sh", "-c", "uvicorn chart_engine.main:app --host ${CHART_ENGINE_HOST} --port ${CHART_ENGINE_PORT} --workers ${CHART_ENGINE_WORKERS}"]
```

- [ ] **Step 11: Verify Task 2**

```bash
cd apps/chart-engine
. .venv/bin/activate
pytest -q
cd ../..
git diff --check -- apps/chart-engine deployment/docker/chart-engine.Dockerfile
```

Expected: pytest passes; diff check prints no output.

---

## Task 3: Harden Birth Data Readiness and Timezone/DST Validation

**Files:**

- Modify: `packages/validation/src/common/time-zone.ts`
- Modify: `packages/validation/src/common/time-zone.test.ts`
- Modify: `packages/contracts/src/clients.ts`
- Modify: `packages/contracts/src/clients.test.ts`
- Modify: `packages/db/src/schema/clients/client-birth-data.schema.ts`
- Modify: `packages/db/src/schema/clients/client-values.ts`
- Create: `packages/domain/src/charts/chart-birth-data-readiness.ts`
- Create: `packages/domain/src/charts/chart-birth-data-readiness.test.ts`
- Create: `packages/domain/src/charts/chart-errors.ts`
- Create: `packages/domain/src/charts/index.ts`

**Interfaces:**

- Consumes: existing client birth data fields.
- Produces:
  - `chartBirthTimeDstOccurrenceValues = ["first", "second"]`.
  - `ChartBirthDataReadinessErrorCode`.
  - `assertChartBirthDataReady(input): ChartReadyBirthData`.

- [ ] **Step 1: Write validation tests**

Create `packages/domain/src/charts/chart-birth-data-readiness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertChartBirthDataReady } from "./chart-birth-data-readiness";

const base = {
  birthDate: "1990-07-15",
  birthTime: "10:30",
  birthTimePrecision: "exact" as const,
  birthTimezone: "Europe/Rome",
  birthLatitude: 41.9028,
  birthLongitude: 12.4964,
  birthTimeDstOccurrence: null
};

describe("assertChartBirthDataReady", () => {
  it("returns normalized ready birth data for exact time", () => {
    expect(assertChartBirthDataReady(base)).toEqual({
      birthDate: "1990-07-15",
      birthTime: "10:30",
      birthTimePrecision: "exact",
      birthTimezone: "Europe/Rome",
      birthLatitude: 41.9028,
      birthLongitude: 12.4964,
      birthTimeDstOccurrence: null
    });
  });

  it("rejects unknown birth time", () => {
    expect(() =>
      assertChartBirthDataReady({ ...base, birthTime: null, birthTimePrecision: "unknown" })
    ).toThrow("CHART_BIRTH_TIME_REQUIRED");
  });

  it("rejects non-IANA timezone values", () => {
    expect(() => assertChartBirthDataReady({ ...base, birthTimezone: "Rome" })).toThrow(
      "CHART_BIRTH_TIMEZONE_INVALID"
    );
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm test -- packages/domain/src/charts/chart-birth-data-readiness.test.ts
```

Expected before implementation: module not found.

- [ ] **Step 3: Add DST occurrence values to DB schema**

In `packages/db/src/schema/clients/client-values.ts`, add:

```ts
export const clientBirthTimeDstOccurrenceValues = ["first", "second"] as const;
export type ClientBirthTimeDstOccurrence = (typeof clientBirthTimeDstOccurrenceValues)[number];
```

In `packages/db/src/schema/clients/client-birth-data.schema.ts`, add column:

```ts
birthTimeDstOccurrence: text("birth_time_dst_occurrence"),
```

Add check:

```ts
check(
  "client_birth_data_time_dst_occurrence_check",
  sql`${table.birthTimeDstOccurrence} is null or ${table.birthTimeDstOccurrence} in ${sql.raw(formatClientSqlValues(clientBirthTimeDstOccurrenceValues))}`
)
```

- [ ] **Step 4: Harden shared client contract timezone**

In `packages/contracts/src/clients.ts`, import `ianaTimeZoneSchema` from `@elevenhouse/validation`. Replace `birthTimezone: nullableTrimmedStringRequestSchema` with a nullable schema that validates IANA names:

```ts
const nullableIanaTimeZoneRequestSchema = z
  .union([ianaTimeZoneSchema, z.null(), z.undefined()])
  .transform((value) => value ?? null);
```

Add `birthTimeDstOccurrence`:

```ts
birthTimeDstOccurrence: z.enum(["first", "second"]).nullable().optional().transform((value) => value ?? null),
```

- [ ] **Step 5: Implement readiness domain function**

Create `packages/domain/src/charts/chart-errors.ts`:

```ts
export class ChartBirthDataReadinessError extends Error {
  constructor(readonly code: ChartBirthDataReadinessErrorCode) {
    super(code);
    this.name = "ChartBirthDataReadinessError";
  }
}

export type ChartBirthDataReadinessErrorCode =
  | "CHART_BIRTH_DATE_REQUIRED"
  | "CHART_BIRTH_TIME_REQUIRED"
  | "CHART_BIRTH_TIMEZONE_REQUIRED"
  | "CHART_BIRTH_TIMEZONE_INVALID"
  | "CHART_BIRTH_COORDINATES_REQUIRED";
```

Create `packages/domain/src/charts/chart-birth-data-readiness.ts`:

```ts
import { ianaTimeZoneSchema } from "@elevenhouse/validation";
import { ChartBirthDataReadinessError } from "./chart-errors";

export type ChartBirthDataInput = {
  readonly birthDate: string | null;
  readonly birthTime: string | null;
  readonly birthTimePrecision: "exact" | "approximate" | "unknown";
  readonly birthTimezone: string | null;
  readonly birthLatitude: number | null;
  readonly birthLongitude: number | null;
  readonly birthTimeDstOccurrence: "first" | "second" | null;
};

export type ChartReadyBirthData = {
  readonly birthDate: string;
  readonly birthTime: string;
  readonly birthTimePrecision: "exact" | "approximate";
  readonly birthTimezone: string;
  readonly birthLatitude: number;
  readonly birthLongitude: number;
  readonly birthTimeDstOccurrence: "first" | "second" | null;
};

export function assertChartBirthDataReady(input: ChartBirthDataInput): ChartReadyBirthData {
  if (!input.birthDate) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_DATE_REQUIRED");
  }
  if (!input.birthTime || input.birthTimePrecision === "unknown") {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_TIME_REQUIRED");
  }
  if (!input.birthTimezone) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_TIMEZONE_REQUIRED");
  }
  const parsedTimezone = ianaTimeZoneSchema.safeParse(input.birthTimezone);
  if (!parsedTimezone.success) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_TIMEZONE_INVALID");
  }
  if (input.birthLatitude === null || input.birthLongitude === null) {
    throw new ChartBirthDataReadinessError("CHART_BIRTH_COORDINATES_REQUIRED");
  }
  return {
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    birthTimePrecision: input.birthTimePrecision,
    birthTimezone: parsedTimezone.data,
    birthLatitude: input.birthLatitude,
    birthLongitude: input.birthLongitude,
    birthTimeDstOccurrence: input.birthTimeDstOccurrence
  };
}
```

Create `packages/domain/src/charts/index.ts`:

```ts
export * from "./chart-birth-data-readiness";
export * from "./chart-errors";
```

- [ ] **Step 6: Run readiness tests**

```bash
pnpm test -- packages/domain/src/charts/chart-birth-data-readiness.test.ts packages/contracts/src/clients.test.ts packages/db/src/schema/calculations/calculations.schema.test.ts
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/db typecheck
```

Expected: tests and typechecks pass.

---

## Task 4: Define Shared Chart Contracts and Domain Use Cases

**Files:**

- Create: `packages/contracts/src/charts.ts`
- Create: `packages/contracts/src/charts.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/domain/src/charts/chart-types.ts`
- Create: `packages/domain/src/charts/chart-use-cases.ts`
- Create: `packages/domain/src/charts/chart-use-cases.test.ts`
- Modify: `packages/domain/src/charts/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `assertChartBirthDataReady`.
- Produces:
  - `chartNatalJobCreateRequestSchema`
  - `chartJobResponseSchema`
  - `storedChartCalculationPayloadSchema`
  - `CreateNatalChartJobUseCase`
  - `ChartCalculationJobStore`

- [ ] **Step 1: Write contract tests**

Create `packages/contracts/src/charts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  chartNatalJobCreateRequestSchema,
  chartJobResponseSchema,
  storedChartCalculationPayloadSchema
} from "./charts";

describe("chart contracts", () => {
  it("accepts natal job request by client id and settings only", () => {
    expect(
      chartNatalJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        settings: {
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).toMatchObject({ settings: { houseSystem: "placidus" } });
  });

  it("rejects browser-supplied birth data in create request", () => {
    expect(() =>
      chartNatalJobCreateRequestSchema.parse({
        clientId: "00000000-0000-4000-8000-000000000001",
        birthDate: "1990-07-15",
        settings: {
          houseSystem: "placidus",
          nodeType: "true",
          aspectPreset: "major",
          orbMultiplier: 1
        }
      })
    ).toThrow();
  });

  it("uses one public calculating state for queued and processing", () => {
    expect(chartJobResponseSchema.parse({ id: "00000000-0000-4000-8000-000000000002", status: "calculating" }).status).toBe(
      "calculating"
    );
  });

  it("separates private input snapshot from render result", () => {
    const payload = storedChartCalculationPayloadSchema.parse({
      schemaVersion: "chart-result.v1",
      method: "natal",
      provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
      settings: { zodiac: "tropical", houseSystem: "placidus", nodeType: "true", aspectPreset: "major", orbMultiplier: 1 },
      inputSnapshot: {
        birthDate: "1990-07-15",
        birthTime: "10:30",
        timezone: "Europe/Rome",
        latitude: 41.9028,
        longitude: 12.4964,
        birthTimePrecision: "exact"
      },
      result: { points: [], houses: [], aspects: [], distributions: { elements: {}, modalities: {}, polarity: {} }, warnings: [] }
    });

    expect(payload.result).not.toHaveProperty("birthDate");
  });
});
```

- [ ] **Step 2: Run contract tests to verify failure**

```bash
pnpm test -- packages/contracts/src/charts.test.ts
```

Expected before implementation: module not found.

- [ ] **Step 3: Implement chart contracts**

Create `packages/contracts/src/charts.ts` with Zod schemas for:

```ts
export const chartSettingsSchema = z.object({
  zodiac: z.literal("tropical").optional().default("tropical"),
  houseSystem: z.enum(["placidus", "koch", "whole_sign", "equal", "regiomontanus"]),
  nodeType: z.enum(["true", "mean"]),
  aspectPreset: z.enum(["major", "major_minor"]),
  orbMultiplier: z.number().min(0.5).max(1.5)
}).strict();
```

Include `chartNatalJobCreateRequestSchema`, `chartJobResponseSchema`, `storedChartCalculationPayloadSchema`, and inferred exported types. Public job status values must be:

```ts
export const chartPublicJobStatusSchema = z.enum(["calculating", "succeeded", "failed"]);
```

Do not expose raw backend `queued` or `processing` in public frontend contracts.

- [ ] **Step 4: Export chart contracts**

Modify `packages/contracts/src/index.ts`:

```ts
export * from "./charts";
```

- [ ] **Step 5: Implement domain types and use-case shell**

Create `packages/domain/src/charts/chart-types.ts`:

```ts
import type { StoredChartCalculationPayload } from "@elevenhouse/contracts";

export type ChartCalculationMethod = "natal";
export type ChartJobStatus = "queued" | "processing" | "succeeded" | "failed";

export type ChartCalculationJob = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly resultCalculationId: string | null;
  readonly method: ChartCalculationMethod;
  readonly status: ChartJobStatus;
  readonly inputFingerprint: string;
};

export type ChartCalculationJobStore = {
  readonly createOrReuseNatalJob: (input: CreateOrReuseNatalJobInput) => Promise<CreateOrReuseNatalJobResult>;
  readonly getOwnerScopedJob: (input: { ownerUserId: string; jobId: string }) => Promise<ChartCalculationJob | null>;
  readonly getOwnerScopedResult: (input: { ownerUserId: string; calculationId: string }) => Promise<StoredChartCalculationPayload | null>;
};

export type CreateOrReuseNatalJobInput = {
  readonly ownerUserId: string;
  readonly clientId: string;
  readonly inputFingerprint: string;
  readonly inputSnapshot: unknown;
  readonly settingsSnapshot: unknown;
};

export type CreateOrReuseNatalJobResult =
  | { readonly kind: "existing_result"; readonly calculationId: string }
  | { readonly kind: "active_job"; readonly jobId: string };
```

Create `packages/domain/src/charts/chart-use-cases.ts` with `CreateNatalChartJobUseCase` that delegates to `ChartCalculationJobStore`. Keep CRM hydration in API service; domain use case receives already validated input snapshot and fingerprint.

- [ ] **Step 6: Run contracts/domain tests**

```bash
pnpm test -- packages/contracts/src/charts.test.ts packages/contracts/src/index.test.ts packages/domain/src/charts/chart-use-cases.test.ts
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
```

Expected: tests and typechecks pass.

---

## Task 5: Add `chart_calculation_jobs` Persistence and Idempotent Store

**Files:**

- Create: `packages/db/src/schema/calculations/chart-calculation-jobs.schema.ts`
- Modify: `packages/db/src/schema/calculations/calculation-values.ts`
- Modify: `packages/db/src/schema/calculations/index.ts`
- Modify: `packages/db/src/schema/calculations/relations.schema.ts`
- Modify: `packages/db/src/schema/calculations/calculations.schema.test.ts`
- Create: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts`
- Create: `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts`
- Create: `packages/db/src/adapters/charts/index.ts`
- Modify: `packages/db/src/adapters/index.ts`

**Interfaces:**

- Consumes: `ChartCalculationJobStore` domain interface.
- Produces: Drizzle schema and store that atomically creates/reuses active jobs and links `result_calculation_id` only after success.

- [ ] **Step 1: Write schema tests**

In `packages/db/src/schema/calculations/calculations.schema.test.ts`, add assertions that generated schema exports `chartCalculationJobs` and includes `resultCalculationId` but not a required pre-success `calculationId`.

```ts
import { chartCalculationJobs } from "./chart-calculation-jobs.schema";

it("defines chart calculation jobs with nullable result calculation id", () => {
  expect(chartCalculationJobs).toBeDefined();
  expect(chartCalculationJobs.resultCalculationId).toBeDefined();
});
```

- [ ] **Step 2: Run schema tests to verify failure**

```bash
pnpm test -- packages/db/src/schema/calculations/calculations.schema.test.ts
```

Expected before implementation: missing schema export.

- [ ] **Step 3: Implement schema**

Create `packages/db/src/schema/calculations/chart-calculation-jobs.schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "../identity/accounts.schema";
import { clientProfiles } from "../clients/client-profiles.schema";
import { calculationRecords } from "./calculation-records.schema";

export const chartCalculationJobs = pgTable(
  "chart_calculation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clientProfiles.clientUserId, { onDelete: "cascade" }),
    resultCalculationId: uuid("result_calculation_id").references(() => calculationRecords.id, { onDelete: "set null" }),
    method: text("method").notNull(),
    status: text("status").notNull().default("queued"),
    inputFingerprint: text("input_fingerprint").notNull(),
    inputSnapshot: jsonb("input_snapshot").notNull(),
    settingsSnapshot: jsonb("settings_snapshot").notNull(),
    provider: text("provider").notNull().default("kerykeion"),
    schemaVersion: text("schema_version").notNull().default("chart-result.v1"),
    attempts: text("attempts").notNull().default("0"),
    maxAttempts: text("max_attempts").notNull().default("3"),
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("chart_calculation_jobs_owner_idx").on(table.ownerUserId),
    index("chart_calculation_jobs_client_idx").on(table.clientId),
    uniqueIndex("chart_calculation_jobs_active_fingerprint_unique")
      .on(table.ownerUserId, table.inputFingerprint)
      .where(sql`${table.status} in ('queued', 'processing')`),
    uniqueIndex("chart_calculation_jobs_success_fingerprint_unique")
      .on(table.ownerUserId, table.inputFingerprint)
      .where(sql`${table.status} = 'succeeded'`)
  ]
);
```

During implementation, prefer integer columns for attempts if current DB conventions support them. If changed, update the test and store types in the same task.

- [ ] **Step 4: Export schema**

Modify `packages/db/src/schema/calculations/index.ts`:

```ts
export * from "./chart-calculation-jobs.schema";
```

Modify relations schema to relate job to owner, client and result calculation.

- [ ] **Step 5: Write store integration tests**

Create `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts` with cases:

```ts
it("reuses an active job for the same owner and fingerprint", async () => {
  const first = await store.createOrReuseNatalJob(input);
  const second = await store.createOrReuseNatalJob(input);

  expect(first.kind).toBe("active_job");
  expect(second).toEqual(first);
});

it("does not require calculation record before success", async () => {
  const created = await store.createOrReuseNatalJob(input);
  const row = await db.query.chartCalculationJobs.findFirst({ where: eq(chartCalculationJobs.id, created.jobId) });

  expect(row?.resultCalculationId).toBeNull();
});
```

Use the existing DB integration test harness from `drizzle-calculation-store.integration.ts`.

- [ ] **Step 6: Implement Drizzle store**

Create `packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.ts` implementing:

```ts
export class DrizzleChartCalculationJobStore implements ChartCalculationJobStore {
  async createOrReuseNatalJob(input: CreateOrReuseNatalJobInput): Promise<CreateOrReuseNatalJobResult> {
    // Implement with PostgreSQL transaction and unique fingerprint indexes.
  }

  async getOwnerScopedJob(input: { ownerUserId: string; jobId: string }): Promise<ChartCalculationJob | null> {
    // Load only rows owned by ownerUserId.
  }

  async getOwnerScopedResult(input: { ownerUserId: string; calculationId: string }): Promise<StoredChartCalculationPayload | null> {
    // Load existing calculation_records resultData after owner check.
  }
}
```

The actual code must not store full provider response in Redis or outbox payloads.

- [ ] **Step 7: Generate migration and run DB checks**

```bash
pnpm --filter @elevenhouse/db db:generate
pnpm test -- packages/db/src/schema/calculations/calculations.schema.test.ts packages/db/src/adapters/charts/drizzle-chart-calculation-job-store.integration.ts
pnpm --filter @elevenhouse/db typecheck
```

Expected: migration generated, tests and typecheck pass. Do not run `db:reset` without explicit user authority and verified local DB target.

---

## Task 6: Implement Chart Worker Queue, Outbox Relay, Processor, and Python Client

**Files:**

- Modify: `apps/chart-worker/package.json`
- Modify: `apps/chart-worker/src/main.ts`
- Modify: `apps/chart-worker/src/readiness.ts`
- Create: `apps/chart-worker/src/chart-engine-client.ts`
- Create: `apps/chart-worker/src/chart-engine-client.test.ts`
- Create: `apps/chart-worker/src/chart-jobs.queue.ts`
- Create: `apps/chart-worker/src/chart-jobs.queue.test.ts`
- Create: `apps/chart-worker/src/chart-jobs.outbox-relay.ts`
- Create: `apps/chart-worker/src/chart-jobs.outbox-relay.test.ts`
- Create: `apps/chart-worker/src/chart-jobs.processor.ts`
- Create: `apps/chart-worker/src/chart-jobs.processor.test.ts`
- Create: `apps/chart-worker/src/chart-worker-runtime.ts`
- Create: `apps/chart-worker/src/chart-worker-runtime.test.ts`

**Interfaces:**

- Consumes: DB job store, outbox relay adapter, Python `/v1/natal`.
- Produces: BullMQ queue `chart.calculation`, job name `calculate-natal-chart`, payload `{ jobId: string }`, processor that persists canonical result idempotently.

- [ ] **Step 1: Add chart-worker dependencies**

Modify `apps/chart-worker/package.json` dependencies:

```json
{
  "dependencies": {
    "@elevenhouse/contracts": "workspace:*",
    "@elevenhouse/db": "workspace:*",
    "@elevenhouse/domain": "workspace:*",
    "@elevenhouse/observability": "workspace:*",
    "bullmq": "^5.0.0",
    "ioredis": "^5.0.0",
    "zod": "^4.0.0"
  }
}
```

Use exact versions already present elsewhere in the lockfile if the repo has pinned BullMQ/ioredis versions.

- [ ] **Step 2: Write queue tests**

Create `apps/chart-worker/src/chart-jobs.queue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildChartCalculationBullMqJobId, chartCalculationQueueName, chartCalculationJobName } from "./chart-jobs.queue";

describe("chart jobs queue contract", () => {
  it("uses identifiers only", () => {
    const jobId = "00000000-0000-4000-8000-000000000001";

    expect(chartCalculationQueueName).toBe("chart.calculation");
    expect(chartCalculationJobName).toBe("calculate-natal-chart");
    expect(buildChartCalculationBullMqJobId(jobId)).toBe("chart-calculation:00000000-0000-4000-8000-000000000001");
  });
});
```

- [ ] **Step 3: Implement queue contract**

Create `apps/chart-worker/src/chart-jobs.queue.ts`:

```ts
export const chartCalculationQueueName = "chart.calculation";
export const chartCalculationJobName = "calculate-natal-chart";

export type ChartCalculationQueuePayload = {
  readonly jobId: string;
};

export function buildChartCalculationBullMqJobId(jobId: string): string {
  return `chart-calculation:${jobId}`;
}
```

- [ ] **Step 4: Write Python client tests**

Create `apps/chart-worker/src/chart-engine-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ChartEngineHttpClient } from "./chart-engine-client";

describe("ChartEngineHttpClient", () => {
  it("posts natal input to the private chart engine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: "chart-result.v1",
        method: "natal",
        provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
        settings: { zodiac: "tropical", houseSystem: "placidus", nodeType: "true", aspectPreset: "major", orbMultiplier: 1 },
        inputSnapshot: { birthDate: "1990-07-15", birthTime: "10:30", timezone: "Europe/Rome", latitude: 41.9, longitude: 12.49, birthTimePrecision: "exact" },
        result: { points: [], houses: [], aspects: [], distributions: { elements: {}, modalities: {}, polarity: {} }, warnings: [] }
      })
    });
    const client = new ChartEngineHttpClient({ baseUrl: "http://chart-engine:8012", fetchFn: fetchMock });

    await client.calculateNatal({ schemaVersion: "chart-request.v1", method: "natal", settings: { houseSystem: "placidus", nodeType: "true", aspectPreset: "major", orbMultiplier: 1 }, inputSnapshot: { birthDate: "1990-07-15", birthTime: "10:30", timezone: "Europe/Rome", latitude: 41.9, longitude: 12.49, birthTimePrecision: "exact" } });

    expect(fetchMock).toHaveBeenCalledWith("http://chart-engine:8012/v1/natal", expect.objectContaining({ method: "POST" }));
  });
});
```

- [ ] **Step 5: Implement Python client**

Create `apps/chart-worker/src/chart-engine-client.ts`:

```ts
import { storedChartCalculationPayloadSchema, type StoredChartCalculationPayload } from "@elevenhouse/contracts";

export type ChartEngineHttpClientInput = {
  readonly baseUrl: string;
  readonly fetchFn?: typeof fetch;
};

export class ChartEngineHttpClient {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(input: ChartEngineHttpClientInput) {
    this.baseUrl = input.baseUrl.replace(/\/$/, "");
    this.fetchFn = input.fetchFn ?? fetch;
  }

  async calculateNatal(payload: unknown): Promise<StoredChartCalculationPayload> {
    const response = await this.fetchFn(`${this.baseUrl}/v1/natal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`CHART_ENGINE_HTTP_${response.status}`);
    }
    return storedChartCalculationPayloadSchema.parse(await response.json());
  }
}
```

- [ ] **Step 6: Implement processor and relay tests**

Create tests for:

- relay publishes only `{ jobId }`;
- processor loads input snapshot from DB by job id;
- duplicate processing of succeeded job is a no-op;
- retryable HTTP failure throws retryable error;
- permanent validation failure marks job failed without retry.

Use local fakes for DB store and chart engine client. Do not connect to Redis in unit tests.

- [ ] **Step 7: Wire runtime**

Modify `apps/chart-worker/src/main.ts` to start readiness and chart runtime. Preserve existing health host/port defaults. Add graceful shutdown that closes BullMQ worker, queue, Redis and readiness server.

- [ ] **Step 8: Run worker checks**

```bash
pnpm test -- apps/chart-worker/src/chart-jobs.queue.test.ts apps/chart-worker/src/chart-engine-client.test.ts apps/chart-worker/src/chart-jobs.outbox-relay.test.ts apps/chart-worker/src/chart-jobs.processor.test.ts apps/chart-worker/src/chart-worker-runtime.test.ts apps/chart-worker/src/readiness.test.ts
pnpm --filter @elevenhouse/chart-worker typecheck
pnpm --filter @elevenhouse/chart-worker build
```

Expected: tests, typecheck and build pass.

---

## Task 7: Add Astrologer API Chart Module

**Files:**

- Modify: `apps/astrologer-api/src/app.module.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.controller.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.module.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.service.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.service.test.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts`
- Create: `apps/astrologer-api/src/modules/charts/charts.tokens.ts`
- Create: `apps/astrologer-api/src/modules/charts/chart-http-errors.ts`

**Interfaces:**

- Consumes: chart contracts, birth-data readiness, Drizzle job store.
- Produces:
  - `POST /charts/natal/jobs`
  - `GET /charts/jobs/:jobId`
  - `GET /charts/calculations/:calculationId`
  - `POST /charts/calculations/:calculationId/recalculate`

- [ ] **Step 1: Write controller security test**

Create `apps/astrologer-api/src/modules/charts/charts.e2e.test.ts` with one focused test proving `POST /charts/natal/jobs` rejects missing CSRF for authenticated cookie requests, following existing bookings E2E setup.

Expected status: `403`.

- [ ] **Step 2: Write service unit tests**

Create `apps/astrologer-api/src/modules/charts/charts.service.test.ts` with cases:

```ts
it("hydrates birth data from CRM and never uses browser birth data", async () => {
  await service.createNatalJob({
    body: { clientId, settings },
    request: authenticatedRequest
  });

  expect(clientStore.getOwnerScopedBirthData).toHaveBeenCalledWith({ ownerUserId, clientId });
  expect(jobStore.createOrReuseNatalJob).toHaveBeenCalledWith(expect.objectContaining({ clientId }));
});

it("maps unknown birth time to actionable validation error", async () => {
  clientStore.getOwnerScopedBirthData.mockResolvedValue({ ...birthData, birthTime: null, birthTimePrecision: "unknown" });

  await expect(service.createNatalJob({ body: { clientId, settings }, request: authenticatedRequest })).rejects.toThrow(
    "CHART_BIRTH_TIME_REQUIRED"
  );
});
```

- [ ] **Step 3: Run API tests to verify failure**

```bash
pnpm test -- apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts
```

Expected before implementation: module not found.

- [ ] **Step 4: Implement controller**

Create `apps/astrologer-api/src/modules/charts/charts.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AstrologerSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { RequireCsrf } from "../security/route-policy/route-security-policy";
import { ChartsService } from "./charts.service";

@Controller("charts")
@UseGuards(AstrologerSessionAuthGuard)
export class ChartsController {
  constructor(private readonly service: ChartsService) {}

  @Post("natal/jobs")
  @RequireCsrf()
  createNatalJob(@Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.createNatalJob({ body, request });
  }

  @Get("jobs/:jobId")
  getJob(@Param("jobId") jobId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.getJob({ jobId, request });
  }

  @Get("calculations/:calculationId")
  getCalculation(@Param("calculationId") calculationId: string, @Req() request: AstrologerSessionRequest) {
    return this.service.getCalculation({ calculationId, request });
  }

  @Post("calculations/:calculationId/recalculate")
  @RequireCsrf()
  recalculate(@Param("calculationId") calculationId: string, @Body() body: unknown, @Req() request: AstrologerSessionRequest) {
    return this.service.recalculate({ calculationId, body, request });
  }
}
```

- [ ] **Step 5: Implement service**

`ChartsService` must:

- parse body with `chartNatalJobCreateRequestSchema`;
- verify owner-scoped relationship via existing clients store/service;
- load birth data server-side;
- call `assertChartBirthDataReady`;
- normalize settings;
- compute SHA-256 fingerprint from method, client id, ready birth snapshot, settings, schema version and provider version;
- call job store create/reuse in transaction that writes outbox event;
- map backend `queued` and `processing` to public `calculating`;
- return completed result when fingerprint already succeeded.

- [ ] **Step 6: Register module**

Create `apps/astrologer-api/src/modules/charts/charts.module.ts` and import it from `apps/astrologer-api/src/app.module.ts`. Follow existing module composition style; root app module imports the feature module, not individual providers.

- [ ] **Step 7: Run API checks**

```bash
pnpm test -- apps/astrologer-api/src/modules/charts/charts.service.test.ts apps/astrologer-api/src/modules/charts/charts.e2e.test.ts
pnpm --filter @elevenhouse/astrologer-api typecheck
```

Expected: tests and typecheck pass.

---

## Task 8: Add Natal-Only Frontend Integration

**Files:**

- Modify: `apps/astrologer-web/src/router.tsx`
- Create: `apps/astrologer-web/src/features/charts/api/chartsApi.ts`
- Create: `apps/astrologer-web/src/features/charts/api/chartsApi.test.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartEngineState.ts`
- Create: `apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts`
- Create: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.tsx`
- Create: `apps/astrologer-web/src/features/charts/components/ChartEnginePage.test.tsx`
- Create: `apps/astrologer-web/src/features/charts/components/ChartWheel.tsx`
- Create: `apps/astrologer-web/src/features/charts/components/ChartTables.tsx`
- Create: `apps/astrologer-web/src/features/charts/components/ChartSettingsPanel.tsx`
- Create: `apps/astrologer-web/src/pages/chart-engine/ChartEngineRoute.tsx`
- Create: `apps/astrologer-web/src/pages/chart-engine/ChartEngineRoute.test.tsx`

**Interfaces:**

- Consumes: chart API contracts.
- Produces: `/chart-engine` natal-only page that maps queued/processing to one calculating UI and renders from canonical result only.

- [ ] **Step 1: Before UI work, use `elevenhouse-design-parity`**

Read `.agents/skills/elevenhouse-design-parity/SKILL.md` and follow its pre-implementation reference inspection workflow. Capture the relevant `ElevenHouseDesign/app/engine*.jsx` state. Do not call UI complete without browser evidence later.

- [ ] **Step 2: Write state model tests**

Create `apps/astrologer-web/src/features/charts/model/chartEngineState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toVisibleChartJobState } from "./chartEngineState";

describe("toVisibleChartJobState", () => {
  it.each(["queued", "processing"] as const)("maps %s to calculating", (status) => {
    expect(toVisibleChartJobState(status)).toBe("calculating");
  });

  it("keeps succeeded visible as succeeded", () => {
    expect(toVisibleChartJobState("succeeded")).toBe("succeeded");
  });
});
```

- [ ] **Step 3: Implement state model**

Create `apps/astrologer-web/src/features/charts/model/chartEngineState.ts`:

```ts
export type BackendChartJobStatus = "queued" | "processing" | "succeeded" | "failed";
export type VisibleChartJobState = "calculating" | "succeeded" | "failed";

export function toVisibleChartJobState(status: BackendChartJobStatus): VisibleChartJobState {
  if (status === "queued" || status === "processing") {
    return "calculating";
  }
  return status;
}
```

- [ ] **Step 4: Write API tests**

Create `apps/astrologer-web/src/features/charts/api/chartsApi.test.ts` with mocked `fetch` proving:

- create request sends `clientId` and `settings` only;
- request does not send birth date/time/timezone/coordinates;
- CSRF header helper used by existing app API layer is preserved.

- [ ] **Step 5: Implement frontend API client**

Create `apps/astrologer-web/src/features/charts/api/chartsApi.ts` following existing feature API style. Export:

```ts
export async function createNatalChartJob(input: {
  readonly clientId: string;
  readonly settings: ChartSettings;
}): Promise<ChartJobResponse>;

export async function getChartJob(jobId: string): Promise<ChartJobResponse>;
export async function getChartCalculation(calculationId: string): Promise<StoredChartCalculationPayload>;
export async function recalculateChart(input: { readonly calculationId: string; readonly settings: ChartSettings }): Promise<ChartJobResponse>;
```

- [ ] **Step 6: Implement natal-only page components**

Build visible states:

- incomplete birth data CTA;
- calculating state for backend queued/processing;
- success state from saved `result`;
- failed permanent CTA;
- retry state;
- stale recalculation state.

Do not show transits/returns/synastry/composite as working. Use disabled controls or hide them according to exact design/reference acceptance.

- [ ] **Step 7: Run frontend tests**

```bash
pnpm test -- apps/astrologer-web/src/features/charts apps/astrologer-web/src/pages/chart-engine
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: tests and typecheck pass.

---

## Task 9: Cross-Layer Verification and Browser Acceptance

**Files:**

- Verify: all files changed by Tasks 1-8.
- Create evidence only if current project convention requires it under `.design-qa/chart-engine-natal/`.

**Interfaces:**

- Consumes: completed implementation.
- Produces: evidence that natal works through real backend paths and UI matches reference for implemented states.

- [ ] **Step 1: Run targeted automated checks**

```bash
pnpm docs:check
pnpm test -- packages/contracts/src/charts.test.ts packages/domain/src/charts packages/db/src/adapters/charts apps/chart-worker/src apps/astrologer-api/src/modules/charts apps/astrologer-web/src/features/charts apps/astrologer-web/src/pages/chart-engine
pnpm --filter @elevenhouse/contracts typecheck
pnpm --filter @elevenhouse/domain typecheck
pnpm --filter @elevenhouse/db typecheck
pnpm --filter @elevenhouse/chart-worker typecheck
pnpm --filter @elevenhouse/astrologer-api typecheck
pnpm --filter @elevenhouse/astrologer-web typecheck
```

Expected: all targeted checks pass.

- [ ] **Step 2: Run Python checks**

```bash
cd apps/chart-engine
. .venv/bin/activate
pytest -q
cd ../..
```

Expected: all Python tests pass.

- [ ] **Step 3: Run affected builds**

```bash
pnpm --filter @elevenhouse/chart-worker build
pnpm --filter @elevenhouse/astrologer-api build
pnpm --filter @elevenhouse/astrologer-web build
```

Expected: all builds pass.

- [ ] **Step 4: Run repository gate if targeted checks pass**

```bash
pnpm verify
```

Expected: lint, typecheck, test and build all pass.

- [ ] **Step 5: Browser/runtime gate**

Do not start services without direct user authority. If the required frontend/API/worker/chart-engine/PostgreSQL/Redis services are already running, use the existing browser/Computer Use surface to verify:

- authenticated astrologer can open `/chart-engine`;
- natal request is sent without birth data in browser payload;
- UI displays calculating state without queue wording;
- successful result reloads from backend;
- approximate birth time shows warning;
- unknown birth time shows CTA;
- unsupported methods are hidden or disabled;
- console and network are clean;
- desktop and mobile viewports match the approved reference for implemented states.

If required services are not running, report browser acceptance as blocked by runtime availability, not passed.

- [ ] **Step 6: Final diff and evidence report**

```bash
git status --short
git diff --check
```

Expected: diff check prints no output. Final report must separate implemented, verified, blocked, deferred, skipped checks and unowned changes.

---

## Self-Review Checklist

- Spec section 2 product decisions are covered by Tasks 2, 4, 7 and 8.
- Spec section 4 repository context is covered by Tasks 1, 3 and 5.
- Spec section 5 research and provider source truth are covered by Tasks 1 and 2.
- Spec section 6 architecture is covered by Tasks 5, 6 and 7.
- Spec section 7 API design is covered by Task 7.
- Spec section 8 idempotency/fingerprint behavior is covered by Tasks 4, 5, 6 and 7.
- Spec section 9 job persistence is covered by Task 5.
- Spec section 10 canonical result/private input separation is covered by Tasks 2, 4, 6 and 8.
- Spec section 12 birth readiness is covered by Task 3.
- Spec sections 13-15 failure, scaling and observability are covered by Tasks 5, 6 and 9.
- Spec section 16 deployment impact is covered by Task 1.
- Spec sections 17-18 frontend/testing are covered by Tasks 8 and 9.
- Spec section 19 rollout sequence is reflected in task order.

## Execution Handoff

Plan execution should start at Task 1 and should not skip the provider spike. The first task changes architecture/deployment truth; do not code the Python deployable before the docs and deployment boundary are accepted in the local diff.
