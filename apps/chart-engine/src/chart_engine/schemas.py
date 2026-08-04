from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel as PydanticBaseModel
from pydantic import ConfigDict, Field, field_validator, model_validator

from chart_engine.civil_time import CivilTimeError, resolve_civil_time


class BaseModel(PydanticBaseModel):
    model_config = ConfigDict(extra="forbid")


class HealthResponse(BaseModel):
    service: Literal["chart-engine"]
    status: Literal["live", "ready"]


EPHEMERIS_FLAGS_BY_BACKEND = {
    "moshier": {"FLG_MOSEPH", "FLG_SPEED"},
    "swiss-ephemeris": {"FLG_SWIEPH", "FLG_SPEED"},
}

CHART_ENGINE_CAPABILITIES = {
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
}

EPHEMERIS_MIN_DATE = date(1800, 1, 1)
EPHEMERIS_MAX_DATE = date(2399, 12, 31)


class ChartExecutionProfile(BaseModel):
    provider: Literal["kerykeion"]
    kerykeionVersion: Literal["5.12.9"]
    pyswissephVersion: Literal["2.10.3.2"]
    expectedEphemeris: Literal["swiss-ephemeris", "moshier"]
    expectedEphemerisFlags: list[
        Literal["FLG_MOSEPH", "FLG_SWIEPH", "FLG_SPEED"]
    ] = Field(min_length=1)
    expectedEphemerisDataRevision: str | None = Field(
        pattern=r"^sha256:[0-9a-f]{64}$"
    )

    @model_validator(mode="after")
    def validate_profile(self):
        if set(self.expectedEphemerisFlags) != EPHEMERIS_FLAGS_BY_BACKEND[
            self.expectedEphemeris
        ] or len(self.expectedEphemerisFlags) != 2:
            raise ValueError("CHART_EXPECTED_EPHEMERIS_FLAGS_INVALID")
        if self.expectedEphemeris == "swiss-ephemeris" and not self.expectedEphemerisDataRevision:
            raise ValueError("CHART_EXPECTED_EPHEMERIS_DATA_REVISION_REQUIRED")
        if self.expectedEphemeris == "moshier" and self.expectedEphemerisDataRevision is not None:
            raise ValueError("CHART_EXPECTED_EPHEMERIS_DATA_REVISION_FORBIDDEN")
        return self


class NatalSettings(BaseModel):
    zodiac: Literal["tropical"] = "tropical"
    houseSystem: Literal["placidus", "koch", "whole_sign", "equal", "regiomontanus"]
    nodeType: Literal["true", "mean"]
    aspectPreset: Literal["major", "major_minor"]
    orbMultiplier: float = Field(ge=0.5, le=1.5, allow_inf_nan=False)


class NatalInputSnapshot(BaseModel):
    birthDate: str
    birthTime: str
    timezone: str
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    birthTimePrecision: Literal["exact", "approximate"]
    dstOccurrence: Literal["first", "second"] | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )

    @field_validator("birthDate")
    @classmethod
    def validate_birth_date(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat(value)
        except ValueError as error:
            raise ValueError("CHART_BIRTH_DATE_INVALID") from error
        if parsed.isoformat() != value:
            raise ValueError("CHART_BIRTH_DATE_INVALID")
        _validate_ephemeris_date(parsed)
        return value

    @field_validator("birthTime")
    @classmethod
    def validate_birth_time(cls, value: str) -> str:
        _validate_clock_time(value)
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        _validate_timezone(value)
        return value

    @model_validator(mode="after")
    def validate_civil_time(self):
        try:
            resolve_civil_time(
                self.birthDate,
                self.birthTime,
                self.timezone,
                self.dstOccurrence,
            )
        except CivilTimeError as error:
            raise ValueError(str(error)) from error
        return self


class NatalRequest(BaseModel):
    schemaVersion: Literal["chart-request.v2"]
    method: Literal["natal"]
    methodVersion: Literal["chart.natal.kerykeion-5.12.v2"]
    executionProfile: ChartExecutionProfile
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot

    @model_validator(mode="after")
    def validate_provider_latitude(self):
        _validate_provider_latitude(self.settings, self.inputSnapshot.latitude)
        return self


class AstrocartographyRequest(BaseModel):
    schemaVersion: Literal["chart-request.v2"]
    method: Literal["astrocartography"]
    methodVersion: Literal["chart.astrocartography.swisseph.v2"]
    executionProfile: ChartExecutionProfile
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot

    @model_validator(mode="after")
    def validate_provider_latitude(self):
        _validate_provider_latitude(self.settings, self.inputSnapshot.latitude)
        return self


class TransitSnapshot(BaseModel):
    date: str
    time: str
    timezone: str
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    dstOccurrence: Literal["first", "second"] | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        _validate_calendar_date(value)
        return value

    @field_validator("time")
    @classmethod
    def validate_time(cls, value: str) -> str:
        _validate_clock_time(value)
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        _validate_timezone(value)
        return value

    @model_validator(mode="after")
    def validate_civil_time(self):
        try:
            resolution = resolve_civil_time(
                self.date,
                self.time,
                self.timezone,
                self.dstOccurrence,
            )
        except CivilTimeError as error:
            raise ValueError(str(error)) from error
        self.dstOccurrence = resolution.occurrence
        return self


class TransitRequest(BaseModel):
    schemaVersion: Literal["chart-request.v2"]
    method: Literal["transit"]
    methodVersion: Literal["chart.transit.kerykeion-5.12.v2"]
    executionProfile: ChartExecutionProfile
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    transitSnapshot: TransitSnapshot

    @model_validator(mode="after")
    def validate_provider_latitudes(self):
        _validate_provider_latitude(self.settings, self.inputSnapshot.latitude)
        _validate_provider_latitude(self.settings, self.transitSnapshot.latitude)
        return self


class SynastryRequest(BaseModel):
    schemaVersion: Literal["chart-request.v2"]
    method: Literal["synastry"]
    methodVersion: Literal["chart.synastry.kerykeion-5.12.v2"]
    executionProfile: ChartExecutionProfile
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    partnerInputSnapshot: NatalInputSnapshot

    @model_validator(mode="after")
    def validate_provider_latitudes(self):
        _validate_provider_latitude(self.settings, self.inputSnapshot.latitude)
        _validate_provider_latitude(self.settings, self.partnerInputSnapshot.latitude)
        return self


class CompositeRequest(BaseModel):
    schemaVersion: Literal["chart-request.v2"]
    method: Literal["composite"]
    methodVersion: Literal["chart.composite.kerykeion-5.12.v2"]
    executionProfile: ChartExecutionProfile
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    partnerInputSnapshot: NatalInputSnapshot

    @model_validator(mode="after")
    def validate_provider_latitudes(self):
        _validate_provider_latitude(self.settings, self.inputSnapshot.latitude)
        _validate_provider_latitude(self.settings, self.partnerInputSnapshot.latitude)
        return self


class SolarReturnLocation(BaseModel):
    timezone: str
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        _validate_timezone(value)
        return value


class SolarReturnRequestSnapshot(BaseModel):
    year: int = Field(ge=1900, le=2100)
    returnType: Literal["solar"]
    location: SolarReturnLocation


class SolarReturnSnapshot(SolarReturnRequestSnapshot):
    resolvedAt: str


class SolarReturnRequest(BaseModel):
    schemaVersion: Literal["chart-request.v2"]
    method: Literal["solar_return"]
    methodVersion: Literal["chart.solar-return.kerykeion-5.12.v2"]
    executionProfile: ChartExecutionProfile
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    solarReturnSnapshot: SolarReturnRequestSnapshot

    @model_validator(mode="after")
    def validate_solar_return(self):
        _validate_provider_latitude(self.settings, self.inputSnapshot.latitude)
        _validate_provider_latitude(self.settings, self.solarReturnSnapshot.location.latitude)
        if self.solarReturnSnapshot.year < date.fromisoformat(self.inputSnapshot.birthDate).year:
            raise ValueError("CHART_SOLAR_RETURN_PRE_BIRTH")
        return self


class ProgressionRequestSnapshot(BaseModel):
    targetDate: str
    progressionType: Literal["secondary"]

    @field_validator("targetDate")
    @classmethod
    def validate_target_date(cls, value: str) -> str:
        _validate_calendar_date(value)
        return value


class ProgressionCalculationBasis(BaseModel):
    symbolicDate: str
    ageDays: int = Field(ge=0)
    dayForYearRatio: Literal[1]


class ChartProgressionCalculationBasis(BaseModel):
    symbolicInstant: str
    elapsedLifeDays: float = Field(ge=0, allow_inf_nan=False)
    elapsedYears: float = Field(ge=0, allow_inf_nan=False)
    yearLengthDays: Literal[365.24219]
    dayForYearRatio: Literal[1]

    @model_validator(mode="after")
    def validate_elapsed_years(self):
        if not self.elapsedLifeDays.is_integer():
            raise ValueError("CHART_PROGRESSION_BASIS_INCONSISTENT")
        expected_elapsed_years = self.elapsedLifeDays / self.yearLengthDays
        if abs(self.elapsedYears - expected_elapsed_years) > 0.000000000001:
            raise ValueError("CHART_PROGRESSION_BASIS_INCONSISTENT")
        return self


class ProgressionSnapshot(ProgressionRequestSnapshot):
    calculationBasis: ProgressionCalculationBasis


class ProgressionRequest(BaseModel):
    schemaVersion: Literal["chart-request.v2"]
    method: Literal["progression"]
    methodVersion: Literal["chart.progression.secondary-tropical-year.v2"]
    executionProfile: ChartExecutionProfile
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    progressionSnapshot: ProgressionRequestSnapshot

    @model_validator(mode="after")
    def validate_progression(self):
        _validate_provider_latitude(self.settings, self.inputSnapshot.latitude)
        if date.fromisoformat(self.progressionSnapshot.targetDate) < date.fromisoformat(
            self.inputSnapshot.birthDate
        ):
            raise ValueError("CHART_PROGRESSION_PRE_BIRTH")
        return self


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
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    dstOccurrence: Literal["first", "second"] | None = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        _validate_calendar_date(value)
        return value

    @field_validator("time")
    @classmethod
    def validate_time(cls, value: str) -> str:
        _validate_clock_time(value)
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        _validate_timezone(value)
        return value

    @model_validator(mode="after")
    def validate_civil_time(self):
        try:
            resolution = resolve_civil_time(
                self.date,
                self.time,
                self.timezone,
                self.dstOccurrence,
            )
        except CivilTimeError as error:
            raise ValueError(str(error)) from error
        self.dstOccurrence = resolution.occurrence
        return self


class HoraryRequest(BaseModel):
    schemaVersion: Literal["chart-request.v2"]
    method: Literal["horary"]
    methodVersion: Literal["chart.horary.kerykeion-5.12.v2"]
    executionProfile: ChartExecutionProfile
    settings: NatalSettings
    questionSnapshot: HoraryQuestionSnapshot

    @model_validator(mode="after")
    def validate_provider_latitude(self):
        _validate_provider_latitude(self.settings, self.questionSnapshot.latitude)
        return self


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
        _validate_ephemeris_date(self.start)
        _validate_ephemeris_date(self.end)
        if self.end < self.start:
            raise ValueError("Astro calendar range end cannot be before start")
        if self.end - self.start > timedelta(days=93):
            raise ValueError("Astro calendar range cannot exceed 93 days")
        return self


class AstroCalendarClientInputSnapshot(BaseModel):
    clientId: str = Field(min_length=1)
    displayName: str = Field(min_length=1, max_length=160)
    initials: str = Field(min_length=1, max_length=8)
    birthDate: date
    birthTime: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    birthTimePrecision: Literal["exact", "approximate", "unknown"]
    birthTimezone: str = Field(min_length=1, max_length=100)
    birthLatitude: float = Field(ge=-90, le=90)
    birthLongitude: float = Field(ge=-180, le=180)

    @field_validator("birthDate")
    @classmethod
    def validate_birth_date(cls, value: date) -> date:
        _validate_ephemeris_date(value)
        return value


class AstroCalendarRequest(BaseModel):
    start: date
    end: date
    timeZone: str = Field(min_length=1, max_length=100)
    scope: Literal["all", "global", "client"] = "all"
    clientIds: list[str] = Field(default_factory=list, max_length=500)
    clients: list[AstroCalendarClientInputSnapshot] = Field(default_factory=list, max_length=500)
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


class LegacyProviderMetadata(BaseModel):
    name: Literal["kerykeion"]
    version: str
    ephemeris: str


class ProviderMetadata(BaseModel):
    name: Literal["kerykeion"]
    version: str
    ephemeris: Literal["swiss-ephemeris", "moshier"]
    pyswissephVersion: str
    ephemerisFlags: list[Literal["FLG_MOSEPH", "FLG_SWIEPH", "FLG_SPEED"]]
    ephemerisDataRevision: str | None = Field(pattern=r"^sha256:[0-9a-f]{64}$")

    @model_validator(mode="after")
    def validate_metadata(self):
        if set(self.ephemerisFlags) != EPHEMERIS_FLAGS_BY_BACKEND[
            self.ephemeris
        ] or len(self.ephemerisFlags) != 2:
            raise ValueError("CHART_EPHEMERIS_FLAGS_INVALID")
        if self.ephemeris == "swiss-ephemeris" and not self.ephemerisDataRevision:
            raise ValueError("CHART_EPHEMERIS_DATA_REVISION_REQUIRED")
        if self.ephemeris == "moshier" and self.ephemerisDataRevision is not None:
            raise ValueError("CHART_EPHEMERIS_DATA_REVISION_FORBIDDEN")
        return self


class ProviderReadinessResponse(HealthResponse):
    status: Literal["ready"]
    provider: ProviderMetadata
    capabilities: list[
        Literal[
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
    ]

    @model_validator(mode="after")
    def validate_capabilities(self):
        if (
            set(self.capabilities) != CHART_ENGINE_CAPABILITIES
            or len(self.capabilities) != len(CHART_ENGINE_CAPABILITIES)
        ):
            raise ValueError("CHART_ENGINE_CAPABILITIES_INVALID")
        return self


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
    provider: LegacyProviderMetadata | None


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
    schemaVersion: Literal["chart-result.v2"]
    method: Literal["natal"]
    methodVersion: Literal["chart.natal.kerykeion-5.12.v2"]
    provider: ProviderMetadata
    reproducibilityFingerprint: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    result: ChartRenderResult


class StoredChartAstrocartographyCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v2"]
    method: Literal["astrocartography"]
    methodVersion: Literal["chart.astrocartography.swisseph.v2"]
    provider: ProviderMetadata
    reproducibilityFingerprint: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    result: ChartAstrocartographyRenderResult


class StoredChartTransitCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v2"]
    method: Literal["transit"]
    methodVersion: Literal["chart.transit.kerykeion-5.12.v2"]
    provider: ProviderMetadata
    reproducibilityFingerprint: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    transitSnapshot: TransitSnapshot
    result: ChartTransitRenderResult


class StoredChartSynastryCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v2"]
    method: Literal["synastry"]
    methodVersion: Literal["chart.synastry.kerykeion-5.12.v2"]
    provider: ProviderMetadata
    reproducibilityFingerprint: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    partnerInputSnapshot: NatalInputSnapshot
    result: ChartSynastryRenderResult


class StoredChartCompositeCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v2"]
    method: Literal["composite"]
    methodVersion: Literal["chart.composite.kerykeion-5.12.v2"]
    provider: ProviderMetadata
    reproducibilityFingerprint: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    partnerInputSnapshot: NatalInputSnapshot
    result: ChartRenderResult


class StoredChartSolarReturnCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v2"]
    method: Literal["solar_return"]
    methodVersion: Literal["chart.solar-return.kerykeion-5.12.v2"]
    provider: ProviderMetadata
    reproducibilityFingerprint: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    solarReturnSnapshot: SolarReturnSnapshot
    result: ChartSolarReturnRenderResult


class StoredChartProgressionCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v2"]
    method: Literal["progression"]
    methodVersion: Literal["chart.progression.secondary-tropical-year.v2"]
    provider: ProviderMetadata
    reproducibilityFingerprint: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    settings: NatalSettings
    inputSnapshot: NatalInputSnapshot
    progressionSnapshot: ProgressionSnapshot
    calculationBasis: ChartProgressionCalculationBasis
    result: ChartProgressionRenderResult

    @model_validator(mode="after")
    def validate_progression_basis(self):
        born = date.fromisoformat(self.inputSnapshot.birthDate)
        target = date.fromisoformat(self.progressionSnapshot.targetDate)
        expected_life_days = float((target - born).days)
        basis = self.calculationBasis
        legacy_basis = self.progressionSnapshot.calculationBasis
        if basis.elapsedLifeDays != expected_life_days:
            raise ValueError("CHART_PROGRESSION_BASIS_INCONSISTENT")

        try:
            provider_symbolic_instant = datetime.fromisoformat(
                basis.symbolicInstant.replace("Z", "+00:00")
            )
        except ValueError as error:
            raise ValueError("CHART_PROGRESSION_BASIS_INCONSISTENT") from error
        if provider_symbolic_instant.tzinfo is None:
            raise ValueError("CHART_PROGRESSION_BASIS_INCONSISTENT")
        provider_symbolic_instant = provider_symbolic_instant.astimezone(timezone.utc)
        resolved_birth = resolve_civil_time(
            self.inputSnapshot.birthDate,
            self.inputSnapshot.birthTime,
            self.inputSnapshot.timezone,
            self.inputSnapshot.dstOccurrence,
        )
        birth_instant = datetime.fromisoformat(resolved_birth.instant).astimezone(timezone.utc)
        expected_symbolic_instant = birth_instant + timedelta(days=basis.elapsedYears)
        if abs((provider_symbolic_instant - expected_symbolic_instant).total_seconds()) >= 1:
            raise ValueError("CHART_PROGRESSION_BASIS_INCONSISTENT")
        if (
            legacy_basis.symbolicDate != provider_symbolic_instant.date().isoformat()
            or legacy_basis.ageDays != int(basis.elapsedYears)
            or legacy_basis.dayForYearRatio != basis.dayForYearRatio
        ):
            raise ValueError("CHART_PROGRESSION_BASIS_INCONSISTENT")
        return self


class StoredChartHoraryCalculationPayload(BaseModel):
    schemaVersion: Literal["chart-result.v2"]
    method: Literal["horary"]
    methodVersion: Literal["chart.horary.kerykeion-5.12.v2"]
    provider: ProviderMetadata
    reproducibilityFingerprint: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    settings: NatalSettings
    questionSnapshot: HoraryQuestionSnapshot
    result: ChartRenderResult


class PlanetaryPositionsPayload(BaseModel):
    schemaVersion: Literal["chart-positions-result.v1"]
    method: Literal["planetary_positions"]
    provider: LegacyProviderMetadata
    settings: PlanetaryPositionsSettings
    inputSnapshot: NatalInputSnapshot
    positions: list[PlanetaryPosition]


def _validate_calendar_date(value: str) -> None:
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise ValueError("CHART_DATE_INVALID") from error
    if parsed.isoformat() != value:
        raise ValueError("CHART_DATE_INVALID")
    _validate_ephemeris_date(parsed)


def _validate_ephemeris_date(value: date) -> None:
    if value < EPHEMERIS_MIN_DATE or value > EPHEMERIS_MAX_DATE:
        raise ValueError("CHART_EPHEMERIS_DATE_UNSUPPORTED")


def _validate_clock_time(value: str) -> None:
    try:
        parsed = time.fromisoformat(value)
    except ValueError as error:
        raise ValueError("CHART_TIME_INVALID") from error
    if len(value) != 5 or parsed.second != 0 or parsed.microsecond != 0:
        raise ValueError("CHART_TIME_INVALID")


def _validate_timezone(value: str) -> None:
    try:
        ZoneInfo(value)
    except (ValueError, ZoneInfoNotFoundError) as error:
        raise ValueError("CHART_TIMEZONE_INVALID") from error


def _validate_provider_latitude(settings: NatalSettings, latitude: float) -> None:
    if settings.houseSystem == "placidus" and abs(latitude) > 66:
        raise ValueError("CHART_KERYKEION_PLACIDUS_LATITUDE_UNSUPPORTED")
