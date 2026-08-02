import math
from datetime import date, datetime, time
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from chart_engine.kerykeion_adapter import (
    calculate_astro_calendar_range,
    calculate_astrocartography,
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
    AstroCalendarRangeResponse,
    AstroCalendarRequest,
    AstrocartographyRequest,
    CompositeRequest,
    HealthResponse,
    HoraryRequest,
    NatalRequest,
    PlanetaryPositionsPayload,
    PlanetaryPositionsRequest,
    ProviderReadinessResponse,
    ProgressionRequest,
    SolarReturnRequest,
    StoredChartAstrocartographyCalculationPayload,
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
from chart_engine.provider_runtime import ProviderReadinessError, ProviderRuntime

app = FastAPI(title="ElevenHouse Chart Engine", version="0.1.0")
provider_runtime = ProviderRuntime()

CAPABILITIES = [
    "natal",
    "astrocartography",
    "transit",
    "synastry",
    "composite",
    "solar_return",
    "progression",
    "horary",
    "planetary_positions",
    "astro_calendar",
]


@app.exception_handler(RequestValidationError)
async def request_validation_error(
    _request: Request,
    error: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": _json_safe(error.errors())})


@app.get("/live", response_model=HealthResponse)
def live() -> HealthResponse:
    return HealthResponse(service="chart-engine", status="live")


@app.get("/ready", response_model=ProviderReadinessResponse)
def ready() -> ProviderReadinessResponse:
    try:
        metadata = provider_runtime.ready()
    except ProviderReadinessError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return ProviderReadinessResponse(
        service="chart-engine",
        status="ready",
        provider=metadata,
        capabilities=CAPABILITIES,
    )


@app.post("/v1/natal", response_model=StoredChartCalculationPayload)
def natal(request: NatalRequest) -> StoredChartCalculationPayload:
    return provider_runtime.calculate(lambda: calculate_natal(request, provider_runtime.metadata()))


@app.post(
    "/v1/astrocartography",
    response_model=StoredChartAstrocartographyCalculationPayload,
)
def astrocartography(request: AstrocartographyRequest) -> StoredChartAstrocartographyCalculationPayload:
    return provider_runtime.calculate(
        lambda: calculate_astrocartography(request, provider_runtime.metadata())
    )


@app.post(
    "/v1/astro-calendar/range",
    response_model=AstroCalendarRangeResponse,
)
def astro_calendar_range(request: AstroCalendarRequest) -> AstroCalendarRangeResponse:
    return provider_runtime.calculate(
        lambda: calculate_astro_calendar_range(request, provider_runtime.metadata())
    )


@app.post("/v1/transits", response_model=StoredChartTransitCalculationPayload)
def transits(request: TransitRequest) -> StoredChartTransitCalculationPayload:
    return provider_runtime.calculate(lambda: calculate_transit(request, provider_runtime.metadata()))


@app.post(
    "/v1/synastry",
    response_model=StoredChartSynastryCalculationPayload,
)
def synastry(request: SynastryRequest) -> StoredChartSynastryCalculationPayload:
    return provider_runtime.calculate(lambda: calculate_synastry(request, provider_runtime.metadata()))


@app.post(
    "/v1/composite",
    response_model=StoredChartCompositeCalculationPayload,
)
def composite(request: CompositeRequest) -> StoredChartCompositeCalculationPayload:
    return provider_runtime.calculate(lambda: calculate_composite(request, provider_runtime.metadata()))


@app.post(
    "/v1/solar-return",
    response_model=StoredChartSolarReturnCalculationPayload,
)
def solar_return(request: SolarReturnRequest) -> StoredChartSolarReturnCalculationPayload:
    return provider_runtime.calculate(
        lambda: calculate_solar_return(request, provider_runtime.metadata())
    )


@app.post(
    "/v1/progressions",
    response_model=StoredChartProgressionCalculationPayload,
)
def progressions(request: ProgressionRequest) -> StoredChartProgressionCalculationPayload:
    return provider_runtime.calculate(
        lambda: calculate_progression(request, provider_runtime.metadata())
    )


@app.post("/v1/horary", response_model=StoredChartHoraryCalculationPayload)
def horary(request: HoraryRequest) -> StoredChartHoraryCalculationPayload:
    return provider_runtime.calculate(lambda: calculate_horary(request, provider_runtime.metadata()))


@app.post("/v1/positions", response_model=PlanetaryPositionsPayload, response_model_exclude_none=True)
def positions(request: PlanetaryPositionsRequest) -> PlanetaryPositionsPayload:
    return provider_runtime.calculate(
        lambda: calculate_planetary_positions(request, provider_runtime.metadata())
    )


def _json_safe(value: Any) -> Any:
    if isinstance(value, BaseException):
        return str(value)
    if isinstance(value, float) and not math.isfinite(value):
        if math.isnan(value):
            return "NaN"
        return "Infinity" if value > 0 else "-Infinity"
    if isinstance(value, (date, datetime, time)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value
