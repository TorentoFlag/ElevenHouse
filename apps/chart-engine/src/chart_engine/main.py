from fastapi import FastAPI

from chart_engine.kerykeion_adapter import (
    calculate_composite,
    calculate_natal,
    calculate_planetary_positions,
    calculate_progression,
    calculate_horary,
    calculate_solar_return,
    calculate_synastry,
    calculate_transit,
)
from chart_engine.schemas import (
    CompositeRequest,
    HealthResponse,
    HoraryRequest,
    NatalRequest,
    PlanetaryPositionsPayload,
    PlanetaryPositionsRequest,
    ProgressionRequest,
    SolarReturnRequest,
    StoredChartCalculationPayload,
    StoredChartCompositeCalculationPayload,
    StoredChartHoraryCalculationPayload,
    StoredChartProgressionCalculationPayload,
    StoredChartSolarReturnCalculationPayload,
    StoredChartSynastryCalculationPayload,
    StoredChartTransitCalculationPayload,
    SynastryRequest,
    TransitRequest,
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


@app.post("/v1/transits", response_model=StoredChartTransitCalculationPayload, response_model_exclude_none=True)
def transits(request: TransitRequest) -> StoredChartTransitCalculationPayload:
    return calculate_transit(request)


@app.post(
    "/v1/synastry",
    response_model=StoredChartSynastryCalculationPayload,
    response_model_exclude_none=True,
)
def synastry(request: SynastryRequest) -> StoredChartSynastryCalculationPayload:
    return calculate_synastry(request)


@app.post(
    "/v1/composite",
    response_model=StoredChartCompositeCalculationPayload,
    response_model_exclude_none=True,
)
def composite(request: CompositeRequest) -> StoredChartCompositeCalculationPayload:
    return calculate_composite(request)


@app.post(
    "/v1/solar-return",
    response_model=StoredChartSolarReturnCalculationPayload,
    response_model_exclude_none=True,
)
def solar_return(request: SolarReturnRequest) -> StoredChartSolarReturnCalculationPayload:
    return calculate_solar_return(request)


@app.post(
    "/v1/progressions",
    response_model=StoredChartProgressionCalculationPayload,
    response_model_exclude_none=True,
)
def progressions(request: ProgressionRequest) -> StoredChartProgressionCalculationPayload:
    return calculate_progression(request)


@app.post("/v1/horary", response_model=StoredChartHoraryCalculationPayload, response_model_exclude_none=True)
def horary(request: HoraryRequest) -> StoredChartHoraryCalculationPayload:
    return calculate_horary(request)


@app.post("/v1/positions", response_model=PlanetaryPositionsPayload, response_model_exclude_none=True)
def positions(request: PlanetaryPositionsRequest) -> PlanetaryPositionsPayload:
    return calculate_planetary_positions(request)
