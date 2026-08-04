from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

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
from chart_engine.provider_runtime import (
    ProviderCalculationCapacityError,
    ProviderCalculationShutdownError,
    ProviderCalculationTimeoutError,
    ProviderCalculationUnavailableError,
    ProviderReadinessError,
    ProviderReadinessUnavailableError,
    ProviderRuntime,
)

provider_runtime = ProviderRuntime()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    provider_runtime.shutdown()


app = FastAPI(title="ElevenHouse Chart Engine", version="0.1.0", lifespan=lifespan)

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
    detail = [
        {
            "type": str(issue.get("type", "value_error")),
            "loc": [part for part in issue.get("loc", ()) if isinstance(part, (str, int))],
            "msg": str(issue.get("msg", "Invalid request")),
        }
        for issue in error.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(ProviderCalculationTimeoutError)
async def provider_calculation_timeout_error(
    _request: Request,
    error: ProviderCalculationTimeoutError,
) -> JSONResponse:
    return JSONResponse(status_code=504, content={"detail": str(error)})


@app.exception_handler(ProviderCalculationCapacityError)
async def provider_calculation_capacity_error(
    _request: Request,
    error: ProviderCalculationCapacityError,
) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(error)})


@app.exception_handler(ProviderCalculationShutdownError)
async def provider_calculation_shutdown_error(
    _request: Request,
    error: ProviderCalculationShutdownError,
) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(error)})


@app.exception_handler(ProviderCalculationUnavailableError)
async def provider_calculation_unavailable_error(
    _request: Request,
    error: ProviderCalculationUnavailableError,
) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(error)})


@app.exception_handler(ProviderReadinessError)
async def provider_profile_error(
    _request: Request,
    error: ProviderReadinessError,
) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(error)})


@app.get("/live", response_model=HealthResponse)
def live() -> HealthResponse:
    return HealthResponse(service="chart-engine", status="live")


@app.get("/ready", response_model=ProviderReadinessResponse)
def ready() -> ProviderReadinessResponse:
    try:
        metadata = provider_runtime.ready()
    except ProviderReadinessUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ProviderReadinessError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return ProviderReadinessResponse(
        service="chart-engine",
        status="ready",
        provider=metadata,
        capabilities=CAPABILITIES,
    )


@app.post("/v1/natal", response_model=StoredChartCalculationPayload)
def natal(request: NatalRequest) -> StoredChartCalculationPayload:
    return provider_runtime.calculate("natal", request)


@app.post(
    "/v1/astrocartography",
    response_model=StoredChartAstrocartographyCalculationPayload,
)
def astrocartography(request: AstrocartographyRequest) -> StoredChartAstrocartographyCalculationPayload:
    return provider_runtime.calculate("astrocartography", request)


@app.post(
    "/v1/astro-calendar/range",
    response_model=AstroCalendarRangeResponse,
)
def astro_calendar_range(request: AstroCalendarRequest) -> AstroCalendarRangeResponse:
    return provider_runtime.calculate("astro_calendar", request)


@app.post("/v1/transits", response_model=StoredChartTransitCalculationPayload)
def transits(request: TransitRequest) -> StoredChartTransitCalculationPayload:
    return provider_runtime.calculate("transit", request)


@app.post(
    "/v1/synastry",
    response_model=StoredChartSynastryCalculationPayload,
)
def synastry(request: SynastryRequest) -> StoredChartSynastryCalculationPayload:
    return provider_runtime.calculate("synastry", request)


@app.post(
    "/v1/composite",
    response_model=StoredChartCompositeCalculationPayload,
)
def composite(request: CompositeRequest) -> StoredChartCompositeCalculationPayload:
    return provider_runtime.calculate("composite", request)


@app.post(
    "/v1/solar-return",
    response_model=StoredChartSolarReturnCalculationPayload,
)
def solar_return(request: SolarReturnRequest) -> StoredChartSolarReturnCalculationPayload:
    return provider_runtime.calculate("solar_return", request)


@app.post(
    "/v1/progressions",
    response_model=StoredChartProgressionCalculationPayload,
)
def progressions(request: ProgressionRequest) -> StoredChartProgressionCalculationPayload:
    return provider_runtime.calculate("progression", request)


@app.post("/v1/horary", response_model=StoredChartHoraryCalculationPayload)
def horary(request: HoraryRequest) -> StoredChartHoraryCalculationPayload:
    return provider_runtime.calculate("horary", request)


@app.post("/v1/positions", response_model=PlanetaryPositionsPayload, response_model_exclude_none=True)
def positions(request: PlanetaryPositionsRequest) -> PlanetaryPositionsPayload:
    return provider_runtime.calculate("positions", request)
