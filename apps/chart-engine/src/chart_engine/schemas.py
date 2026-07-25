from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel, Field, model_validator


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


class AstrocartographyRequest(BaseModel):
    schemaVersion: Literal["chart-request.v1"]
    method: Literal["astrocartography"]
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


class RelationshipSnapshot(BaseModel):
    primaryClientId: str
    partnerClientId: str


class SynastryRequest(BaseModel):
    schemaVersion: Literal["chart-request.v1"]
    method: Literal["synastry"]
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    partnerInputSnapshot: NatalInputSnapshot
    relationshipSnapshot: RelationshipSnapshot


class CompositeRequest(BaseModel):
    schemaVersion: Literal["chart-request.v1"]
    method: Literal["composite"]
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    partnerInputSnapshot: NatalInputSnapshot
    relationshipSnapshot: RelationshipSnapshot


class SolarReturnLocation(BaseModel):
    timezone: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class SolarReturnRequestSnapshot(BaseModel):
    year: int = Field(ge=1900, le=2100)
    returnType: Literal["solar"]
    location: SolarReturnLocation


class SolarReturnSnapshot(SolarReturnRequestSnapshot):
    resolvedAt: str


class SolarReturnRequest(BaseModel):
    schemaVersion: Literal["chart-request.v1"]
    method: Literal["solar_return"]
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    solarReturnSnapshot: SolarReturnRequestSnapshot


class ProgressionRequestSnapshot(BaseModel):
    targetDate: str
    progressionType: Literal["secondary"]


class ProgressionCalculationBasis(BaseModel):
    symbolicDate: str
    ageDays: int = Field(ge=0)
    dayForYearRatio: Literal[1]


class ProgressionSnapshot(ProgressionRequestSnapshot):
    calculationBasis: ProgressionCalculationBasis


class ProgressionRequest(BaseModel):
    schemaVersion: Literal["chart-request.v1"]
    method: Literal["progression"]
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    progressionSnapshot: ProgressionRequestSnapshot


class HoraryQuestionSnapshot(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    category: Literal[
        "relationship",
        "career",
        "money",
        "home",
        "health",
        "travel",
        "other",
    ] = "other"
    date: str
    time: str
    timezone: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class HoraryRequest(BaseModel):
    schemaVersion: Literal["chart-request.v1"]
    method: Literal["horary"]
    settings: NatalSettings
    questionSnapshot: HoraryQuestionSnapshot


class PlanetaryPositionsSettings(BaseModel):
    zodiac: Literal["tropical"] = "tropical"
    nodeType: Literal["true", "mean"]


class PlanetaryPositionsRequest(BaseModel):
    schemaVersion: Literal["chart-positions-request.v1"]
    method: Literal["planetary_positions"]
    settings: PlanetaryPositionsSettings
    inputSnapshot: NatalInputSnapshot


class AstroCalendarDateRange(BaseModel):
    start: date
    end: date

    @model_validator(mode="after")
    def validate_range(self):
        if self.end < self.start:
            raise ValueError("Astro calendar range end cannot be before start")
        if self.end - self.start > timedelta(days=93):
            raise ValueError("Astro calendar range cannot exceed 93 days")
        return self


class AstroCalendarRequest(BaseModel):
    start: date
    end: date
    timeZone: str = Field(min_length=1, max_length=100)
    settings: NatalSettings
    eventTypes: list[
        Literal[
            "global.moon_phase",
            "global.eclipse",
            "global.ingress",
            "client.birthday",
            "client.solar_window",
            "client.transit_aspect",
        ]
    ] = Field(
        default_factory=lambda: [
            "global.moon_phase",
            "global.eclipse",
            "global.ingress",
        ],
        max_length=6,
    )

    @model_validator(mode="after")
    def validate_range(self):
        AstroCalendarDateRange(start=self.start, end=self.end)
        return self


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


class ChartSolarReturnAspect(BaseModel):
    solarReturnPoint: str
    natalPoint: str
    type: str
    angle: float
    orb: float
    applying: bool | None = None
    strength: float | None = None


class ChartProgressionAspect(BaseModel):
    progressedPoint: str
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


class ChartSolarReturnRenderResult(BaseModel):
    natal: ChartRenderResult
    solarReturn: ChartRenderResult
    aspectsToNatal: list[ChartSolarReturnAspect]
    warnings: list[ChartWarning]


class ChartProgressionRenderResult(BaseModel):
    natal: ChartRenderResult
    progressed: ChartRenderResult
    aspectsToNatal: list[ChartProgressionAspect]
    warnings: list[ChartWarning]


class ChartSynastryAspect(BaseModel):
    primaryPoint: str
    partnerPoint: str
    type: str
    angle: float
    orb: float
    applying: bool | None = None
    strength: float | None = None


class ChartSynastryHouseOverlay(BaseModel):
    owner: Literal["primary", "partner"]
    point: str
    projectedHouseOwner: Literal["primary", "partner"]
    projectedHouse: int = Field(ge=1, le=12)


class ChartSynastryRelationshipScoreBreakdown(BaseModel):
    code: str
    points: float


class ChartSynastryRelationshipScore(BaseModel):
    value: float
    label: str
    breakdown: list[ChartSynastryRelationshipScoreBreakdown]


class ChartSynastryRenderResult(BaseModel):
    primary: ChartRenderResult
    partner: ChartRenderResult
    aspectsBetween: list[ChartSynastryAspect]
    houseOverlays: list[ChartSynastryHouseOverlay]
    relationshipScore: ChartSynastryRelationshipScore | None = None
    warnings: list[ChartWarning]


class ChartAstrocartographyPathPoint(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class ChartAstrocartographyLine(BaseModel):
    id: str
    point: Literal[
        "sun",
        "moon",
        "mercury",
        "venus",
        "mars",
        "jupiter",
        "saturn",
        "uranus",
        "neptune",
        "pluto",
    ]
    angle: Literal["asc", "dsc", "mc", "ic"]
    label: str
    path: list[ChartAstrocartographyPathPoint]


class ChartAstrocartographyRenderResult(BaseModel):
    lines: list[ChartAstrocartographyLine]
    warnings: list[ChartWarning]


class AstroCalendarWarningAction(BaseModel):
    type: Literal["create_dictionary_entry"]
    dictionaryCode: str
    suggestedCategory: Literal["planet-sign", "planet-house", "aspect", "calendar"]


class AstroCalendarWarning(BaseModel):
    code: Literal[
        "NO_PROFILE_TIMEZONE",
        "CLIENT_BIRTH_DATA_MISSING",
        "CLIENT_BIRTH_TIME_UNKNOWN",
        "CLIENT_BIRTH_TIME_APPROXIMATE",
        "CLIENT_SCOPE_TRUNCATED",
        "PROVIDER_PRECISION_LIMITED",
        "GENERATION_FAILED",
        "DICTIONARY_ENTRY_MISSING",
    ]
    severity: Literal["info", "warning", "error"]
    message: str = Field(min_length=1, max_length=500)
    clientId: str | None
    eventId: str | None
    dictionaryCode: str | None
    action: AstroCalendarWarningAction | None


class AstroCalendarClientRef(BaseModel):
    clientId: str
    displayName: str
    initials: str


class AstroCalendarChartLink(BaseModel):
    mode: Literal["transit", "solar_return"]
    clientId: str
    date: date


class AstroCalendarEvent(BaseModel):
    id: str
    source: Literal["global", "client"]
    type: Literal[
        "global.moon_phase",
        "global.eclipse",
        "global.ingress",
        "client.birthday",
        "client.solar_window",
        "client.transit_aspect",
    ]
    startsAt: str
    endsAt: str | None
    timePrecision: Literal["exact", "hour", "day"]
    title: str
    subtitle: str | None
    description: str | None
    tone: Literal["neutral", "supportive", "intense", "opportunity"]
    points: list[str]
    aspect: str | None
    sign: str | None
    clientRefs: list[AstroCalendarClientRef]
    chartLink: AstroCalendarChartLink | None
    dictionaryCodes: list[str]
    warnings: list[AstroCalendarWarning]


class AstroCalendarReadinessSummary(BaseModel):
    clientsTotal: int = Field(ge=0)
    clientsReady: int = Field(ge=0)
    clientsWithMissingBirthData: int = Field(ge=0)
    clientsWithUnknownBirthTime: int = Field(ge=0)
    clientsWithApproximateBirthTime: int = Field(ge=0)


class AstroCalendarSummary(BaseModel):
    eventCount: int = Field(ge=0)
    globalEventCount: int = Field(ge=0)
    clientEventCount: int = Field(ge=0)
    byType: dict[str, int]
    byTone: dict[str, int]


class AstroCalendarGenerationMetadata(BaseModel):
    status: Literal["ready", "calculating", "failed", "stale"]
    generationId: str | None
    fingerprint: str
    generatedAt: str | None
    provider: ProviderMetadata | None


class AstroCalendarRangeResponse(BaseModel):
    schemaVersion: Literal["astro-calendar-range.v1"]
    timeZone: str
    range: AstroCalendarDateRange
    generation: AstroCalendarGenerationMetadata
    events: list[AstroCalendarEvent]
    readiness: AstroCalendarReadinessSummary
    summary: AstroCalendarSummary
    dictionaryCodes: list[str]
    warnings: list[AstroCalendarWarning]


class StoredChartCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v1"]
    method: Literal["natal"]
    provider: ProviderMetadata
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    result: ChartRenderResult


class StoredChartAstrocartographyCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v1"]
    method: Literal["astrocartography"]
    provider: ProviderMetadata
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    result: ChartAstrocartographyRenderResult


class StoredChartTransitCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v1"]
    method: Literal["transit"]
    provider: ProviderMetadata
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    transitSnapshot: TransitSnapshot
    result: ChartTransitRenderResult


class StoredChartSynastryCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v1"]
    method: Literal["synastry"]
    provider: ProviderMetadata
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    partnerInputSnapshot: NatalInputSnapshot
    relationshipSnapshot: RelationshipSnapshot
    result: ChartSynastryRenderResult


class StoredChartCompositeCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v1"]
    method: Literal["composite"]
    provider: ProviderMetadata
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    partnerInputSnapshot: NatalInputSnapshot
    relationshipSnapshot: RelationshipSnapshot
    result: ChartRenderResult


class StoredChartSolarReturnCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v1"]
    method: Literal["solar_return"]
    provider: ProviderMetadata
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    solarReturnSnapshot: SolarReturnSnapshot
    result: ChartSolarReturnRenderResult


class StoredChartProgressionCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v1"]
    method: Literal["progression"]
    provider: ProviderMetadata
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    progressionSnapshot: ProgressionSnapshot
    result: ChartProgressionRenderResult


class StoredChartHoraryCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v1"]
    method: Literal["horary"]
    provider: ProviderMetadata
    settings: NatalSettings
    questionSnapshot: HoraryQuestionSnapshot
    result: ChartRenderResult


class PlanetaryPositionsPayload(BaseModel):
    schemaVersion: Literal["chart-positions-result.v1"]
    method: Literal["planetary_positions"]
    provider: ProviderMetadata
    settings: PlanetaryPositionsSettings
    inputSnapshot: NatalInputSnapshot
    positions: list[PlanetaryPosition]
