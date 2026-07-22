from fastapi import FastAPI

from chart_engine.kerykeion_adapter import calculate_natal, calculate_planetary_positions
from chart_engine.schemas import (
    HealthResponse,
    NatalRequest,
    PlanetaryPositionsPayload,
    PlanetaryPositionsRequest,
    StoredChartCalculationPayload,
)

app = FastAPI(title="ElevenHouse Chart Engine", version="0.1.0")


@app.get("/live", response_model=HealthResponse)
def live() -> HealthResponse:
    return HealthResponse(service="chart-engine", status="live")


@app.get("/ready", response_model=HealthResponse)
def ready() -> HealthResponse:
    return HealthResponse(service="chart-engine", status="ready")


@app.post("/v1/natal", response_model=StoredChartCalculationPayload, response_model_exclude_none=True)
def natal(request: NatalRequest) -> StoredChartCalculationPayload:
    return calculate_natal(request)


@app.post("/v1/positions", response_model=PlanetaryPositionsPayload, response_model_exclude_none=True)
def positions(request: PlanetaryPositionsRequest) -> PlanetaryPositionsPayload:
    return calculate_planetary_positions(request)
