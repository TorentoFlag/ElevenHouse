from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    service: Literal["chart-engine"]
    status: Literal["live", "ready"]


class NatalSettings(BaseModel):
    zodiac: Literal["tropical"] = "tropical"
    houseSystem: Literal["placidus", "koch", "whole_sign", "equal", "regiomontanus"]
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


class TransitSnapshot(BaseModel):
    date: str
    time: str
    timezone: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class TransitRequest(BaseModel):
    schemaVersion: Literal["chart-request.v1"]
    method: Literal["transit"]
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    transitSnapshot: TransitSnapshot


class PlanetaryPositionsSettings(BaseModel):
    zodiac: Literal["tropical"] = "tropical"
    nodeType: Literal["true", "mean"]


class PlanetaryPositionsRequest(BaseModel):
    schemaVersion: Literal["chart-positions-request.v1"]
    method: Literal["planetary_positions"]
    settings: PlanetaryPositionsSettings
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


class ChartTransitAspect(BaseModel):
    transitPoint: str
    natalPoint: str
    type: str
    angle: float
    orb: float
    applying: bool | None = None
    strength: float | None = None


class PlanetaryPosition(BaseModel):
    id: Literal[
        "sun",
        "moon",
        "north_node",
        "mercury",
        "venus",
        "mars",
        "jupiter",
        "saturn",
        "uranus",
        "neptune",
        "pluto",
    ]
    longitude: float = Field(ge=0, lt=360)
    retrograde: bool | None = None


class ChartRenderResult(BaseModel):
    points: list[ChartPoint]
    houses: list[ChartHouse]
    aspects: list[ChartAspect]
    distributions: ChartDistributions
    warnings: list[ChartWarning]


class ChartTransitRenderResult(BaseModel):
    natal: ChartRenderResult
    transit: ChartRenderResult
    aspectsToNatal: list[ChartTransitAspect]
    warnings: list[ChartWarning]


class StoredChartCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v1"]
    method: Literal["natal"]
    provider: ProviderMetadata
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    result: ChartRenderResult


class StoredChartTransitCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v1"]
    method: Literal["transit"]
    provider: ProviderMetadata
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    transitSnapshot: TransitSnapshot
    result: ChartTransitRenderResult


class PlanetaryPositionsPayload(BaseModel):
    schemaVersion: Literal["chart-positions-result.v1"]
    method: Literal["planetary_positions"]
    provider: ProviderMetadata
    settings: PlanetaryPositionsSettings
    inputSnapshot: NatalInputSnapshot
    positions: list[PlanetaryPosition]
