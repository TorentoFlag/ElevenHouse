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
