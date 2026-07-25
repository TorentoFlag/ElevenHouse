import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from importlib.metadata import version
from math import ceil
from typing import Any

import swisseph as swe
from kerykeion import AspectsFactory, AstrologicalSubjectFactory, CompositeSubjectFactory
from kerykeion.chart_data_factory import ChartDataFactory
from kerykeion.planetary_return_factory import PlanetaryReturnFactory

from chart_engine.schemas import (
    AstrocartographyRequest,
    AstroCalendarDateRange,
    AstroCalendarEvent,
    AstroCalendarGenerationMetadata,
    AstroCalendarReadinessSummary,
    AstroCalendarRangeResponse,
    AstroCalendarRequest,
    AstroCalendarSummary,
    AstroCalendarWarning,
    ChartAstrocartographyLine,
    ChartAstrocartographyPathPoint,
    ChartAstrocartographyRenderResult,
    ChartAspect,
    ChartDistributions,
    ChartHouse,
    ChartPoint,
    ChartProgressionAspect,
    ChartProgressionRenderResult,
    ChartSolarReturnAspect,
    ChartSolarReturnRenderResult,
    ChartRenderResult,
    ChartSynastryAspect,
    ChartSynastryHouseOverlay,
    ChartSynastryRelationshipScore,
    ChartSynastryRelationshipScoreBreakdown,
    ChartSynastryRenderResult,
    ChartTransitAspect,
    ChartTransitRenderResult,
    ChartWarning,
    CompositeRequest,
    HoraryRequest,
    NatalRequest,
    PlanetaryPosition,
    PlanetaryPositionsPayload,
    PlanetaryPositionsRequest,
    ProgressionCalculationBasis,
    ProgressionRequest,
    ProgressionSnapshot,
    ProviderMetadata,
    SolarReturnRequest,
    SolarReturnSnapshot,
    StoredChartCalculationPayload,
    StoredChartAstrocartographyCalculationPayload,
    StoredChartCompositeCalculationPayload,
    StoredChartHoraryCalculationPayload,
    StoredChartProgressionCalculationPayload,
    StoredChartSolarReturnCalculationPayload,
    StoredChartSynastryCalculationPayload,
    StoredChartTransitCalculationPayload,
    SynastryRequest,
    TransitRequest,
)

HOUSE_SYSTEMS = {
    "placidus": "P",
    "koch": "K",
    "whole_sign": "W",
    "equal": "A",
    "regiomontanus": "R",
}

PLANET_ATTRIBUTES = {
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
}

ASTROCARTOGRAPHY_PLANETS = {
    "sun": ("Солнце", swe.SUN),
    "moon": ("Луна", swe.MOON),
    "mercury": ("Меркурий", swe.MERCURY),
    "venus": ("Венера", swe.VENUS),
    "mars": ("Марс", swe.MARS),
    "jupiter": ("Юпитер", swe.JUPITER),
    "saturn": ("Сатурн", swe.SATURN),
    "uranus": ("Уран", swe.URANUS),
    "neptune": ("Нептун", swe.NEPTUNE),
    "pluto": ("Плутон", swe.PLUTO),
}

ASTROCARTOGRAPHY_ANGLE_LABELS = {
    "mc": "MC",
    "ic": "IC",
    "asc": "Asc",
    "dsc": "Dsc",
}

ANGLE_ATTRIBUTES = {
    "ascendant": ("Ascendant", "ascendant"),
    "midheaven": ("Midheaven", "medium_coeli"),
}

NODE_ATTRIBUTES = {
    "true": {
        "north_node": ("True North Node", "true_north_lunar_node"),
        "south_node": ("True South Node", "true_south_lunar_node"),
    },
    "mean": {
        "north_node": ("Mean North Node", "mean_north_lunar_node"),
        "south_node": ("Mean South Node", "mean_south_lunar_node"),
    },
}

BASE_ACTIVE_POINTS = [
    "Sun",
    "Moon",
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
    "Pluto",
    "Ascendant",
    "Medium_Coeli",
]

NODE_ACTIVE_POINTS = {
    "true": ["True_North_Lunar_Node", "True_South_Lunar_Node"],
    "mean": ["Mean_North_Lunar_Node", "Mean_South_Lunar_Node"],
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

HOUSE_NAMES = {
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

SIGN_NAMES = {
    "Ari": "aries",
    "Tau": "taurus",
    "Gem": "gemini",
    "Can": "cancer",
    "Leo": "leo",
    "Vir": "virgo",
    "Lib": "libra",
    "Sco": "scorpio",
    "Sag": "sagittarius",
    "Cap": "capricorn",
    "Aqu": "aquarius",
    "Pis": "pisces",
}

ELEMENT_NAMES = {
    "Fire": "fire",
    "Earth": "earth",
    "Air": "air",
    "Water": "water",
}

MODALITY_NAMES = {
    "Cardinal": "cardinal",
    "Fixed": "fixed",
    "Mutable": "mutable",
}

POLARITY_BY_ELEMENT = {
    "fire": "masculine",
    "air": "masculine",
    "earth": "feminine",
    "water": "feminine",
}

POINT_NAME_TO_ID = {
    "Sun": "sun",
    "Moon": "moon",
    "Mercury": "mercury",
    "Venus": "venus",
    "Mars": "mars",
    "Jupiter": "jupiter",
    "Saturn": "saturn",
    "Uranus": "uranus",
    "Neptune": "neptune",
    "Pluto": "pluto",
    "Ascendant": "ascendant",
    "Medium_Coeli": "midheaven",
    "True_North_Lunar_Node": "north_node",
    "Mean_North_Lunar_Node": "north_node",
    "True_South_Lunar_Node": "south_node",
    "Mean_South_Lunar_Node": "south_node",
}

MAJOR_ASPECTS = {"conjunction", "opposition", "square", "trine", "sextile"}
MINOR_ASPECTS = {"semi-sextile", "semi-square", "quincunx", "quintile"}
ASPECT_ORBS = {
    "conjunction": 10.0,
    "opposition": 10.0,
    "trine": 8.0,
    "sextile": 6.0,
    "square": 5.0,
    "semi-sextile": 2.0,
    "semi-square": 2.0,
    "quincunx": 3.0,
    "quintile": 1.0,
}

ASTRO_CALENDAR_GLOBAL_EVENT_TYPES = {
    "global.moon_phase",
    "global.eclipse",
    "global.ingress",
}

ASTRO_CALENDAR_INGRESS_POINTS = {
    "sun": ("Sun", swe.SUN),
    "moon": ("Moon", swe.MOON),
    "mercury": ("Mercury", swe.MERCURY),
    "venus": ("Venus", swe.VENUS),
    "mars": ("Mars", swe.MARS),
    "jupiter": ("Jupiter", swe.JUPITER),
    "saturn": ("Saturn", swe.SATURN),
    "uranus": ("Uranus", swe.URANUS),
    "neptune": ("Neptune", swe.NEPTUNE),
    "pluto": ("Pluto", swe.PLUTO),
}

ASTRO_CALENDAR_PHASES = {
    0.0: ("new_moon", "New Moon", "conjunction"),
    90.0: ("first_quarter", "First Quarter Moon", "square"),
    180.0: ("full_moon", "Full Moon", "opposition"),
    270.0: ("last_quarter", "Last Quarter Moon", "square"),
}

ASTRO_CALENDAR_SIGN_NAMES = [
    "aries",
    "taurus",
    "gemini",
    "cancer",
    "leo",
    "virgo",
    "libra",
    "scorpio",
    "sagittarius",
    "capricorn",
    "aquarius",
    "pisces",
]


def calculate_natal(request: NatalRequest) -> StoredChartCalculationPayload:
    active_points = _active_points(request.settings.nodeType)
    subject = _create_subject(
        name="subject",
        date=request.inputSnapshot.birthDate,
        time=request.inputSnapshot.birthTime,
        timezone=request.inputSnapshot.timezone,
        latitude=request.inputSnapshot.latitude,
        longitude=request.inputSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )

    result = _map_render_result(
        subject,
        request.settings.nodeType,
        request.settings.aspectPreset,
        request.settings.orbMultiplier,
        active_points,
        _map_warnings(request),
    )

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
        result=result,
    )


def calculate_astrocartography(
    request: AstrocartographyRequest,
) -> StoredChartAstrocartographyCalculationPayload:
    active_points = _active_points(request.settings.nodeType)
    subject = _create_subject(
        name="astrocartography",
        date=request.inputSnapshot.birthDate,
        time=request.inputSnapshot.birthTime,
        timezone=request.inputSnapshot.timezone,
        latitude=request.inputSnapshot.latitude,
        longitude=request.inputSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )
    warnings = [
        *_map_warnings(request),
        ChartWarning(
            code="ASTROCARTOGRAPHY_POLAR_REGIONS_OMITTED",
            message="Polar regions are omitted from ASC/DSC line sampling.",
        ),
    ]

    return StoredChartAstrocartographyCalculationPayload(
        schemaVersion="chart-result.v1",
        method="astrocartography",
        provider=ProviderMetadata(
            name="kerykeion",
            version=version("kerykeion"),
            ephemeris="swiss-ephemeris",
        ),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        result=ChartAstrocartographyRenderResult(
            lines=_astrocartography_lines(
                julian_day=float(subject.julian_day),
                house_system=request.settings.houseSystem,
            ),
            warnings=warnings,
        ),
    )


def calculate_astro_calendar_range(request: AstroCalendarRequest) -> AstroCalendarRangeResponse:
    requested_types = set(request.eventTypes)
    unsupported_types = sorted(requested_types - ASTRO_CALENDAR_GLOBAL_EVENT_TYPES)
    warnings = [_unsupported_astro_calendar_event_warning(event_type) for event_type in unsupported_types]
    start_jd = _julian_day_for_date(request.start)
    end_exclusive_jd = _julian_day_for_date(request.end + timedelta(days=1))
    events: list[AstroCalendarEvent] = []

    if "global.moon_phase" in requested_types:
        events.extend(_moon_phase_events(start_jd, end_exclusive_jd))
    if "global.eclipse" in requested_types:
        events.extend(_eclipse_events(start_jd, end_exclusive_jd))
    if "global.ingress" in requested_types:
        events.extend(_ingress_events(start_jd, end_exclusive_jd))

    events.sort(key=lambda event: (event.startsAt, event.id))
    dictionary_codes = sorted({code for event in events for code in event.dictionaryCodes})
    by_type = {event_type: 0 for event_type in request.eventTypes}
    by_tone: dict[str, int] = {}
    for event in events:
        by_type[event.type] = by_type.get(event.type, 0) + 1
        by_tone[event.tone] = by_tone.get(event.tone, 0) + 1

    return AstroCalendarRangeResponse(
        schemaVersion="astro-calendar-range.v1",
        timeZone=request.timeZone,
        range=AstroCalendarDateRange(start=request.start, end=request.end),
        generation=AstroCalendarGenerationMetadata(
            status="ready",
            generationId=None,
            fingerprint=_astro_calendar_fingerprint(request),
            generatedAt=_utc_now_string(),
            provider=ProviderMetadata(
                name="kerykeion",
                version=version("kerykeion"),
                ephemeris="swiss-ephemeris",
            ),
        ),
        events=events,
        readiness=AstroCalendarReadinessSummary(
            clientsTotal=0,
            clientsReady=0,
            clientsWithMissingBirthData=0,
            clientsWithUnknownBirthTime=0,
            clientsWithApproximateBirthTime=0,
        ),
        summary=AstroCalendarSummary(
            eventCount=len(events),
            globalEventCount=len(events),
            clientEventCount=0,
            byType=by_type,
            byTone=by_tone,
        ),
        dictionaryCodes=dictionary_codes,
        warnings=warnings,
    )


def calculate_transit(request: TransitRequest) -> StoredChartTransitCalculationPayload:
    active_points = _active_points(request.settings.nodeType)
    natal_subject = _create_subject(
        name="natal",
        date=request.inputSnapshot.birthDate,
        time=request.inputSnapshot.birthTime,
        timezone=request.inputSnapshot.timezone,
        latitude=request.inputSnapshot.latitude,
        longitude=request.inputSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )
    transit_subject = _create_subject(
        name="transit",
        date=request.transitSnapshot.date,
        time=request.transitSnapshot.time,
        timezone=request.transitSnapshot.timezone,
        latitude=request.transitSnapshot.latitude,
        longitude=request.transitSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )
    allowed_aspects = (
        MAJOR_ASPECTS
        if request.settings.aspectPreset == "major"
        else MAJOR_ASPECTS | MINOR_ASPECTS
    )
    active_aspects = _active_aspects(allowed_aspects, request.settings.orbMultiplier)
    transit_data = ChartDataFactory.create_transit_chart_data(
        natal_subject,
        transit_subject,
        active_points=active_points,
        active_aspects=active_aspects,
    )
    warnings = _map_warnings(request)

    return StoredChartTransitCalculationPayload(
        schemaVersion="chart-result.v1",
        method="transit",
        provider=ProviderMetadata(
            name="kerykeion",
            version=version("kerykeion"),
            ephemeris="swiss-ephemeris",
        ),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        transitSnapshot=request.transitSnapshot,
        result=ChartTransitRenderResult(
            natal=_map_render_result(
                natal_subject,
                request.settings.nodeType,
                request.settings.aspectPreset,
                request.settings.orbMultiplier,
                active_points,
                warnings,
            ),
            transit=_map_render_result(
                transit_subject,
                request.settings.nodeType,
                request.settings.aspectPreset,
                request.settings.orbMultiplier,
                active_points,
                [],
            ),
            aspectsToNatal=_map_transit_aspects(
                transit_data.aspects,
                allowed_aspects,
                request.settings.orbMultiplier,
            ),
            warnings=warnings,
        ),
    )


def calculate_synastry(request: SynastryRequest) -> StoredChartSynastryCalculationPayload:
    active_points = _active_points(request.settings.nodeType)
    primary_subject = _create_subject(
        name="primary",
        date=request.inputSnapshot.birthDate,
        time=request.inputSnapshot.birthTime,
        timezone=request.inputSnapshot.timezone,
        latitude=request.inputSnapshot.latitude,
        longitude=request.inputSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )
    partner_subject = _create_subject(
        name="partner",
        date=request.partnerInputSnapshot.birthDate,
        time=request.partnerInputSnapshot.birthTime,
        timezone=request.partnerInputSnapshot.timezone,
        latitude=request.partnerInputSnapshot.latitude,
        longitude=request.partnerInputSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )
    allowed_aspects = (
        MAJOR_ASPECTS
        if request.settings.aspectPreset == "major"
        else MAJOR_ASPECTS | MINOR_ASPECTS
    )
    active_aspects = _active_aspects(allowed_aspects, request.settings.orbMultiplier)
    synastry_data = ChartDataFactory.create_synastry_chart_data(
        primary_subject,
        partner_subject,
        active_points=active_points,
        active_aspects=active_aspects,
        include_house_comparison=True,
        include_relationship_score=True,
    )
    warnings = _map_warnings(request)

    return StoredChartSynastryCalculationPayload(
        schemaVersion="chart-result.v1",
        method="synastry",
        provider=ProviderMetadata(
            name="kerykeion",
            version=version("kerykeion"),
            ephemeris="swiss-ephemeris",
        ),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        partnerInputSnapshot=request.partnerInputSnapshot,
        relationshipSnapshot=request.relationshipSnapshot,
        result=ChartSynastryRenderResult(
            primary=_map_render_result(
                primary_subject,
                request.settings.nodeType,
                request.settings.aspectPreset,
                request.settings.orbMultiplier,
                active_points,
                warnings,
            ),
            partner=_map_render_result(
                partner_subject,
                request.settings.nodeType,
                request.settings.aspectPreset,
                request.settings.orbMultiplier,
                active_points,
                [],
            ),
            aspectsBetween=_map_synastry_aspects(
                synastry_data.aspects,
                allowed_aspects,
                request.settings.orbMultiplier,
            ),
            houseOverlays=_map_house_overlays(synastry_data.house_comparison),
            relationshipScore=_map_relationship_score(synastry_data.relationship_score),
            warnings=warnings,
        ),
    )


def calculate_composite(request: CompositeRequest) -> StoredChartCompositeCalculationPayload:
    active_points = _active_points(request.settings.nodeType)
    primary_subject = _create_subject(
        name="primary",
        date=request.inputSnapshot.birthDate,
        time=request.inputSnapshot.birthTime,
        timezone=request.inputSnapshot.timezone,
        latitude=request.inputSnapshot.latitude,
        longitude=request.inputSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )
    partner_subject = _create_subject(
        name="partner",
        date=request.partnerInputSnapshot.birthDate,
        time=request.partnerInputSnapshot.birthTime,
        timezone=request.partnerInputSnapshot.timezone,
        latitude=request.partnerInputSnapshot.latitude,
        longitude=request.partnerInputSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )
    composite_subject = CompositeSubjectFactory(
        primary_subject,
        partner_subject,
        chart_name="composite",
    ).get_midpoint_composite_subject_model()
    warnings = _map_warnings(request)

    return StoredChartCompositeCalculationPayload(
        schemaVersion="chart-result.v1",
        method="composite",
        provider=ProviderMetadata(
            name="kerykeion",
            version=version("kerykeion"),
            ephemeris="swiss-ephemeris",
        ),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        partnerInputSnapshot=request.partnerInputSnapshot,
        relationshipSnapshot=request.relationshipSnapshot,
        result=_map_render_result(
            composite_subject,
            request.settings.nodeType,
            request.settings.aspectPreset,
            request.settings.orbMultiplier,
            active_points,
            warnings,
        ),
    )


def calculate_solar_return(
    request: SolarReturnRequest,
) -> StoredChartSolarReturnCalculationPayload:
    active_points = _active_points(request.settings.nodeType)
    natal_subject = _create_subject(
        name="natal",
        date=request.inputSnapshot.birthDate,
        time=request.inputSnapshot.birthTime,
        timezone=request.inputSnapshot.timezone,
        latitude=request.inputSnapshot.latitude,
        longitude=request.inputSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )
    return_factory = PlanetaryReturnFactory(
        natal_subject,
        lng=request.solarReturnSnapshot.location.longitude,
        lat=request.solarReturnSnapshot.location.latitude,
        tz_str=request.solarReturnSnapshot.location.timezone,
        online=False,
    )
    solar_return_subject = return_factory.next_return_from_date(
        request.solarReturnSnapshot.year,
        1,
        1,
        return_type="Solar",
    )
    allowed_aspects = (
        MAJOR_ASPECTS
        if request.settings.aspectPreset == "major"
        else MAJOR_ASPECTS | MINOR_ASPECTS
    )
    active_aspects = _active_aspects(allowed_aspects, request.settings.orbMultiplier)
    return_data = ChartDataFactory.create_return_chart_data(
        natal_subject,
        solar_return_subject,
        active_points=active_points,
        active_aspects=active_aspects,
    )
    warnings = _map_warnings(request)

    return StoredChartSolarReturnCalculationPayload(
        schemaVersion="chart-result.v1",
        method="solar_return",
        provider=ProviderMetadata(
            name="kerykeion",
            version=version("kerykeion"),
            ephemeris="swiss-ephemeris",
        ),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        solarReturnSnapshot=SolarReturnSnapshot(
            year=request.solarReturnSnapshot.year,
            returnType="solar",
            location=request.solarReturnSnapshot.location,
            resolvedAt=_utc_datetime_string(solar_return_subject.iso_formatted_utc_datetime),
        ),
        result=ChartSolarReturnRenderResult(
            natal=_map_render_result(
                natal_subject,
                request.settings.nodeType,
                request.settings.aspectPreset,
                request.settings.orbMultiplier,
                active_points,
                warnings,
            ),
            solarReturn=_map_render_result(
                solar_return_subject,
                request.settings.nodeType,
                request.settings.aspectPreset,
                request.settings.orbMultiplier,
                active_points,
                [],
            ),
            aspectsToNatal=_map_solar_return_aspects(
                return_data.aspects,
                allowed_aspects,
                request.settings.orbMultiplier,
            ),
            warnings=warnings,
        ),
    )


def calculate_progression(request: ProgressionRequest) -> StoredChartProgressionCalculationPayload:
    active_points = _active_points(request.settings.nodeType)
    natal_subject = _create_subject(
        name="natal",
        date=request.inputSnapshot.birthDate,
        time=request.inputSnapshot.birthTime,
        timezone=request.inputSnapshot.timezone,
        latitude=request.inputSnapshot.latitude,
        longitude=request.inputSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )
    calculation_basis = _progression_basis(
        request.inputSnapshot.birthDate,
        request.progressionSnapshot.targetDate,
    )
    progressed_subject = _create_subject(
        name="progressed",
        date=calculation_basis.symbolicDate,
        time=request.inputSnapshot.birthTime,
        timezone=request.inputSnapshot.timezone,
        latitude=request.inputSnapshot.latitude,
        longitude=request.inputSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )
    allowed_aspects = (
        MAJOR_ASPECTS
        if request.settings.aspectPreset == "major"
        else MAJOR_ASPECTS | MINOR_ASPECTS
    )
    active_aspects = _active_aspects(allowed_aspects, request.settings.orbMultiplier)
    progression_data = ChartDataFactory.create_transit_chart_data(
        natal_subject,
        progressed_subject,
        active_points=active_points,
        active_aspects=active_aspects,
    )
    warnings = _map_warnings(request)

    return StoredChartProgressionCalculationPayload(
        schemaVersion="chart-result.v1",
        method="progression",
        provider=ProviderMetadata(
            name="kerykeion",
            version=version("kerykeion"),
            ephemeris="swiss-ephemeris",
        ),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        progressionSnapshot=ProgressionSnapshot(
            targetDate=request.progressionSnapshot.targetDate,
            progressionType="secondary",
            calculationBasis=calculation_basis,
        ),
        result=ChartProgressionRenderResult(
            natal=_map_render_result(
                natal_subject,
                request.settings.nodeType,
                request.settings.aspectPreset,
                request.settings.orbMultiplier,
                active_points,
                warnings,
            ),
            progressed=_map_render_result(
                progressed_subject,
                request.settings.nodeType,
                request.settings.aspectPreset,
                request.settings.orbMultiplier,
                active_points,
                [],
            ),
            aspectsToNatal=_map_progression_aspects(
                progression_data.aspects,
                allowed_aspects,
                request.settings.orbMultiplier,
            ),
            warnings=warnings,
        ),
    )


def calculate_horary(request: HoraryRequest) -> StoredChartHoraryCalculationPayload:
    active_points = _active_points(request.settings.nodeType)
    subject = _create_subject(
        name="horary",
        date=request.questionSnapshot.date,
        time=request.questionSnapshot.time,
        timezone=request.questionSnapshot.timezone,
        latitude=request.questionSnapshot.latitude,
        longitude=request.questionSnapshot.longitude,
        house_system=request.settings.houseSystem,
        active_points=active_points,
    )

    return StoredChartHoraryCalculationPayload(
        schemaVersion="chart-result.v1",
        method="horary",
        provider=ProviderMetadata(
            name="kerykeion",
            version=version("kerykeion"),
            ephemeris="swiss-ephemeris",
        ),
        settings=request.settings,
        questionSnapshot=request.questionSnapshot,
        result=_map_render_result(
            subject,
            request.settings.nodeType,
            request.settings.aspectPreset,
            request.settings.orbMultiplier,
            active_points,
            [],
        ),
    )


def calculate_planetary_positions(request: PlanetaryPositionsRequest) -> PlanetaryPositionsPayload:
    year, month, day = [int(part) for part in request.inputSnapshot.birthDate.split("-")]
    hour, minute = [int(part) for part in request.inputSnapshot.birthTime.split(":")]
    active_points = _active_points(request.settings.nodeType)

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
        houses_system_identifier="P",
        active_points=active_points,
        suppress_geonames_warning=True,
    )

    node_fields = {"north_node": NODE_ATTRIBUTES[request.settings.nodeType]["north_node"]}
    point_fields = PLANET_ATTRIBUTES | node_fields
    positions = [
        _map_planetary_position(point_id, getattr(subject, attr))
        for point_id, (_, attr) in point_fields.items()
    ]

    return PlanetaryPositionsPayload(
        schemaVersion="chart-positions-result.v1",
        method="planetary_positions",
        provider=ProviderMetadata(
            name="kerykeion",
            version=version("kerykeion"),
            ephemeris="swiss-ephemeris",
        ),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        positions=positions,
    )


def _moon_phase_events(start_jd: float, end_exclusive_jd: float) -> list[AstroCalendarEvent]:
    events: list[AstroCalendarEvent] = []
    step_days = 0.25
    previous_jd = start_jd
    previous_phase = _moon_phase_angle(previous_jd)
    previous_unwrapped = previous_phase
    current_jd = start_jd + step_days

    while current_jd <= end_exclusive_jd + step_days:
        phase = _moon_phase_angle(current_jd)
        current_unwrapped = phase
        while current_unwrapped < previous_unwrapped:
            current_unwrapped += 360.0

        for target, (phase_id, title, aspect) in ASTRO_CALENDAR_PHASES.items():
            target_unwrapped = target
            while target_unwrapped < previous_unwrapped:
                target_unwrapped += 360.0
            if previous_unwrapped < target_unwrapped <= current_unwrapped:
                event_jd = _refine_phase_jd(previous_jd, current_jd, target_unwrapped)
                if start_jd <= event_jd < end_exclusive_jd:
                    sign = _planet_sign(swe.MOON, event_jd)
                    starts_at = _jd_to_utc_datetime_string(event_jd)
                    events.append(
                        AstroCalendarEvent(
                            id=f"global-moon-phase-{phase_id}-{starts_at[:10]}",
                            source="global",
                            type="global.moon_phase",
                            startsAt=starts_at,
                            endsAt=None,
                            timePrecision="exact",
                            title=title,
                            subtitle=sign,
                            description=None,
                            tone="neutral" if phase_id in {"new_moon", "full_moon"} else "supportive",
                            points=["Moon"],
                            aspect=aspect,
                            sign=sign,
                            clientRefs=[],
                            chartLink=None,
                            dictionaryCodes=[f"astro_calendar.global.moon_phase.{phase_id}.{sign}"],
                            warnings=[],
                        )
                    )

        previous_jd = current_jd
        previous_unwrapped = current_unwrapped
        current_jd += step_days

    return events


def _ingress_events(start_jd: float, end_exclusive_jd: float) -> list[AstroCalendarEvent]:
    events: list[AstroCalendarEvent] = []
    step_days = 0.25

    for point_id, (label, planet) in ASTRO_CALENDAR_INGRESS_POINTS.items():
        previous_jd = start_jd
        previous_sign = _planet_sign(planet, previous_jd)
        current_jd = start_jd + step_days

        while current_jd <= end_exclusive_jd + step_days:
            current_sign = _planet_sign(planet, current_jd)
            if current_sign != previous_sign:
                event_jd = _refine_ingress_jd(
                    previous_jd,
                    current_jd,
                    planet,
                    current_sign,
                )
                if start_jd <= event_jd < end_exclusive_jd:
                    starts_at = _jd_to_utc_datetime_string(event_jd)
                    events.append(
                        AstroCalendarEvent(
                            id=f"global-ingress-{point_id}-{current_sign}-{starts_at[:10]}",
                            source="global",
                            type="global.ingress",
                            startsAt=starts_at,
                            endsAt=None,
                            timePrecision="exact",
                            title=f"{label} enters {current_sign}",
                            subtitle=current_sign,
                            description=None,
                            tone="opportunity",
                            points=[label],
                            aspect=None,
                            sign=current_sign,
                            clientRefs=[],
                            chartLink=None,
                            dictionaryCodes=[
                                f"astro_calendar.global.ingress.{point_id}.{current_sign}"
                            ],
                            warnings=[],
                        )
                    )
                previous_sign = current_sign

            previous_jd = current_jd
            current_jd += step_days

    return events


def _eclipse_events(start_jd: float, end_exclusive_jd: float) -> list[AstroCalendarEvent]:
    events: list[AstroCalendarEvent] = []
    events.extend(_solar_eclipse_events(start_jd, end_exclusive_jd))
    events.extend(_lunar_eclipse_events(start_jd, end_exclusive_jd))
    return events


def _solar_eclipse_events(start_jd: float, end_exclusive_jd: float) -> list[AstroCalendarEvent]:
    events: list[AstroCalendarEvent] = []
    search_jd = start_jd - 1.0

    while search_jd < end_exclusive_jd:
        retflag, times = swe.sol_eclipse_when_glob(search_jd, swe.FLG_SWIEPH, 0, False)
        maximum_jd = times[0]
        if maximum_jd >= end_exclusive_jd:
            break
        if maximum_jd >= start_jd:
            starts_at = _jd_to_utc_datetime_string(maximum_jd)
            sign = _planet_sign(swe.SUN, maximum_jd)
            eclipse_kind = _solar_eclipse_kind(retflag)
            events.append(
                AstroCalendarEvent(
                    id=f"global-eclipse-solar-{eclipse_kind}-{starts_at[:10]}",
                    source="global",
                    type="global.eclipse",
                    startsAt=starts_at,
                    endsAt=None,
                    timePrecision="hour",
                    title=f"Solar eclipse ({eclipse_kind})",
                    subtitle=sign,
                    description=None,
                    tone="intense",
                    points=["Sun", "Moon"],
                    aspect="conjunction",
                    sign=sign,
                    clientRefs=[],
                    chartLink=None,
                    dictionaryCodes=[
                        f"astro_calendar.global.eclipse.solar.{eclipse_kind}.{sign}"
                    ],
                    warnings=[],
                )
            )
        search_jd = maximum_jd + 1.0

    return events


def _lunar_eclipse_events(start_jd: float, end_exclusive_jd: float) -> list[AstroCalendarEvent]:
    events: list[AstroCalendarEvent] = []
    search_jd = start_jd - 1.0

    while search_jd < end_exclusive_jd:
        retflag, times = swe.lun_eclipse_when(search_jd, swe.FLG_SWIEPH, 0, False)
        maximum_jd = times[0]
        if maximum_jd >= end_exclusive_jd:
            break
        if maximum_jd >= start_jd:
            starts_at = _jd_to_utc_datetime_string(maximum_jd)
            sign = _planet_sign(swe.MOON, maximum_jd)
            eclipse_kind = _lunar_eclipse_kind(retflag)
            events.append(
                AstroCalendarEvent(
                    id=f"global-eclipse-lunar-{eclipse_kind}-{starts_at[:10]}",
                    source="global",
                    type="global.eclipse",
                    startsAt=starts_at,
                    endsAt=None,
                    timePrecision="hour",
                    title=f"Lunar eclipse ({eclipse_kind})",
                    subtitle=sign,
                    description=None,
                    tone="intense",
                    points=["Sun", "Moon"],
                    aspect="opposition",
                    sign=sign,
                    clientRefs=[],
                    chartLink=None,
                    dictionaryCodes=[
                        f"astro_calendar.global.eclipse.lunar.{eclipse_kind}.{sign}"
                    ],
                    warnings=[],
                )
            )
        search_jd = maximum_jd + 1.0

    return events


def _unsupported_astro_calendar_event_warning(event_type: str) -> AstroCalendarWarning:
    return AstroCalendarWarning(
        code="PROVIDER_PRECISION_LIMITED",
        severity="warning",
        message=f"Chart engine does not generate {event_type} without owner-scoped CRM data.",
        clientId=None,
        eventId=None,
        dictionaryCode=None,
        action=None,
    )


def _astro_calendar_fingerprint(request: AstroCalendarRequest) -> str:
    payload = {
        "start": request.start.isoformat(),
        "end": request.end.isoformat(),
        "timeZone": request.timeZone,
        "settings": request.settings.model_dump(mode="json"),
        "eventTypes": sorted(request.eventTypes),
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
    return f"astro-calendar:{digest[:48]}"


def _julian_day_for_date(value: date) -> float:
    return swe.julday(value.year, value.month, value.day, 0.0, swe.GREG_CAL)


def _planet_longitude(planet: int, julian_day: float) -> float:
    values, _ = swe.calc_ut(julian_day, planet, swe.FLG_SWIEPH | swe.FLG_SPEED)
    return float(values[0]) % 360.0


def _planet_sign(planet: int, julian_day: float) -> str:
    return ASTRO_CALENDAR_SIGN_NAMES[int(_planet_longitude(planet, julian_day) // 30) % 12]


def _moon_phase_angle(julian_day: float) -> float:
    moon = _planet_longitude(swe.MOON, julian_day)
    sun = _planet_longitude(swe.SUN, julian_day)
    return (moon - sun) % 360.0


def _refine_phase_jd(left_jd: float, right_jd: float, target_unwrapped: float) -> float:
    left_phase = _moon_phase_angle(left_jd)
    while left_phase > target_unwrapped:
        left_phase -= 360.0
    while left_phase + 360.0 <= target_unwrapped:
        left_phase += 360.0

    for _ in range(40):
        mid_jd = (left_jd + right_jd) / 2
        mid_phase = _moon_phase_angle(mid_jd)
        while mid_phase < left_phase:
            mid_phase += 360.0
        if mid_phase < target_unwrapped:
            left_jd = mid_jd
            left_phase = mid_phase
        else:
            right_jd = mid_jd

    return (left_jd + right_jd) / 2


def _refine_ingress_jd(left_jd: float, right_jd: float, planet: int, target_sign: str) -> float:
    for _ in range(40):
        mid_jd = (left_jd + right_jd) / 2
        if _planet_sign(planet, mid_jd) == target_sign:
            right_jd = mid_jd
        else:
            left_jd = mid_jd

    return (left_jd + right_jd) / 2


def _solar_eclipse_kind(retflag: int) -> str:
    if retflag & swe.ECL_TOTAL:
        return "total"
    if retflag & swe.ECL_ANNULAR:
        return "annular"
    if retflag & swe.ECL_ANNULAR_TOTAL:
        return "hybrid"
    if retflag & swe.ECL_PARTIAL:
        return "partial"
    return "solar"


def _lunar_eclipse_kind(retflag: int) -> str:
    if retflag & swe.ECL_TOTAL:
        return "total"
    if retflag & swe.ECL_PARTIAL:
        return "partial"
    if retflag & swe.ECL_PENUMBRAL:
        return "penumbral"
    return "lunar"


def _jd_to_utc_datetime_string(julian_day: float) -> str:
    year, month, day, hour_value = swe.revjul(julian_day, swe.GREG_CAL)
    resolved = datetime(year, month, day, tzinfo=timezone.utc) + timedelta(
        seconds=round(hour_value * 3_600, 3)
    )
    return resolved.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _utc_now_string() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _astrocartography_lines(julian_day: float, house_system: str) -> list[ChartAstrocartographyLine]:
    lines: list[ChartAstrocartographyLine] = []
    greenwich_sidereal_degrees = float(swe.sidtime(julian_day)) * 15.0
    house_system_identifier = HOUSE_SYSTEMS[house_system].encode("ascii")

    for point_id, (point_label, body_id) in ASTROCARTOGRAPHY_PLANETS.items():
        ecliptic_longitude = float(swe.calc_ut(julian_day, body_id, swe.FLG_SWIEPH)[0][0])
        right_ascension = float(
            swe.calc_ut(julian_day, body_id, swe.FLG_SWIEPH | swe.FLG_EQUATORIAL)[0][0]
        )
        mc_longitude = _normalize_longitude(right_ascension - greenwich_sidereal_degrees)
        ic_longitude = _normalize_longitude(mc_longitude + 180.0)

        lines.append(
            _astrocartography_line(
                point_id=point_id,
                point_label=point_label,
                angle="mc",
                path=[
                    ChartAstrocartographyPathPoint(latitude=-66.0, longitude=mc_longitude),
                    ChartAstrocartographyPathPoint(latitude=66.0, longitude=mc_longitude),
                ],
            )
        )
        lines.append(
            _astrocartography_line(
                point_id=point_id,
                point_label=point_label,
                angle="ic",
                path=[
                    ChartAstrocartographyPathPoint(latitude=-66.0, longitude=ic_longitude),
                    ChartAstrocartographyPathPoint(latitude=66.0, longitude=ic_longitude),
                ],
            )
        )
        lines.append(
            _astrocartography_line(
                point_id=point_id,
                point_label=point_label,
                angle="asc",
                path=_sample_ascendant_descendant_line(
                    julian_day,
                    ecliptic_longitude,
                    "asc",
                    house_system_identifier,
                ),
            )
        )
        lines.append(
            _astrocartography_line(
                point_id=point_id,
                point_label=point_label,
                angle="dsc",
                path=_sample_ascendant_descendant_line(
                    julian_day,
                    ecliptic_longitude,
                    "dsc",
                    house_system_identifier,
                ),
            )
        )

    return lines


def _astrocartography_line(
    *,
    point_id: str,
    point_label: str,
    angle: str,
    path: list[ChartAstrocartographyPathPoint],
) -> ChartAstrocartographyLine:
    return ChartAstrocartographyLine(
        id=f"{point_id}_{angle}",
        point=point_id,
        angle=angle,
        label=f"{point_label} {ASTROCARTOGRAPHY_ANGLE_LABELS[angle]}",
        path=path,
    )


def _sample_ascendant_descendant_line(
    julian_day: float,
    ecliptic_longitude: float,
    angle: str,
    house_system_identifier: bytes,
) -> list[ChartAstrocartographyPathPoint]:
    path: list[ChartAstrocartographyPathPoint] = []
    for longitude in [float(value) for value in range(-180, 181, 5)]:
        latitude = _solve_angular_latitude(
            julian_day,
            ecliptic_longitude,
            angle,
            longitude,
            house_system_identifier,
        )
        if latitude is not None:
            path.append(
                ChartAstrocartographyPathPoint(
                    latitude=latitude,
                    longitude=_normalize_longitude(longitude),
                )
            )
    if len(path) >= 2:
        return path

    # Keep the payload observable instead of silently omitting a required line.
    fallback_longitude = _normalize_longitude(ecliptic_longitude)
    return [
        ChartAstrocartographyPathPoint(latitude=-1.0, longitude=fallback_longitude),
        ChartAstrocartographyPathPoint(latitude=1.0, longitude=fallback_longitude),
    ]


def _solve_angular_latitude(
    julian_day: float,
    ecliptic_longitude: float,
    angle: str,
    longitude: float,
    house_system_identifier: bytes,
) -> float | None:
    previous_latitude = -66.0
    previous_difference = _angle_difference(
        _local_angle_longitude(julian_day, previous_latitude, longitude, angle, house_system_identifier),
        ecliptic_longitude,
    )

    for latitude in [float(value) for value in range(-63, 67, 3)]:
        current_difference = _angle_difference(
            _local_angle_longitude(julian_day, latitude, longitude, angle, house_system_identifier),
            ecliptic_longitude,
        )
        if abs(current_difference) < 0.000001:
            return latitude
        if previous_difference == 0 or (previous_difference < 0 < current_difference) or (
            previous_difference > 0 > current_difference
        ):
            return _bisect_angular_latitude(
                julian_day,
                ecliptic_longitude,
                angle,
                longitude,
                previous_latitude,
                latitude,
                house_system_identifier,
            )
        previous_latitude = latitude
        previous_difference = current_difference
    return None


def _bisect_angular_latitude(
    julian_day: float,
    ecliptic_longitude: float,
    angle: str,
    longitude: float,
    low: float,
    high: float,
    house_system_identifier: bytes,
) -> float:
    low_difference = _angle_difference(
        _local_angle_longitude(julian_day, low, longitude, angle, house_system_identifier),
        ecliptic_longitude,
    )
    for _ in range(24):
        midpoint = (low + high) / 2.0
        midpoint_difference = _angle_difference(
            _local_angle_longitude(julian_day, midpoint, longitude, angle, house_system_identifier),
            ecliptic_longitude,
        )
        if abs(midpoint_difference) < 0.000001:
            return round(midpoint, 6)
        if (low_difference < 0 < midpoint_difference) or (low_difference > 0 > midpoint_difference):
            high = midpoint
        else:
            low = midpoint
            low_difference = midpoint_difference
    return round((low + high) / 2.0, 6)


def _local_angle_longitude(
    julian_day: float,
    latitude: float,
    longitude: float,
    angle: str,
    house_system_identifier: bytes,
) -> float:
    _, ascmc = swe.houses_ex(julian_day, latitude, longitude, house_system_identifier)
    ascendant = float(ascmc[0])
    if angle == "asc":
        return ascendant
    return _normalize_degrees(ascendant + 180.0)


def _angle_difference(value: float, target: float) -> float:
    return ((value - target + 180.0) % 360.0) - 180.0


def _normalize_degrees(value: float) -> float:
    return value % 360.0


def _normalize_longitude(value: float) -> float:
    normalized = ((value + 180.0) % 360.0) - 180.0
    if normalized == -180.0:
        return 180.0
    return round(normalized, 6)


def _map_point(point_id: str, label: str, model: Any) -> ChartPoint:
    return ChartPoint(
        id=point_id,
        label=label,
        longitude=float(model.abs_pos),
        sign=_map_sign(model.sign),
        signDegree=float(model.position),
        house=_house_number(model.house),
        retrograde=model.retrograde,
    )


def _create_subject(
    *,
    name: str,
    date: str,
    time: str,
    timezone: str,
    latitude: float,
    longitude: float,
    house_system: str,
    active_points: list[str],
) -> Any:
    year, month, day = [int(part) for part in date.split("-")]
    hour, minute = [int(part) for part in time.split(":")]
    return AstrologicalSubjectFactory.from_birth_data(
        name=name,
        year=year,
        month=month,
        day=day,
        hour=hour,
        minute=minute,
        lng=longitude,
        lat=latitude,
        tz_str=timezone,
        online=False,
        zodiac_type="Tropical",
        houses_system_identifier=HOUSE_SYSTEMS[house_system],
        active_points=active_points,
        suppress_geonames_warning=True,
    )


def _map_render_result(
    subject: Any,
    node_type: str,
    aspect_preset: str,
    orb_multiplier: float,
    active_points: list[str],
    warnings: list[ChartWarning],
) -> ChartRenderResult:
    point_fields = PLANET_ATTRIBUTES | ANGLE_ATTRIBUTES | NODE_ATTRIBUTES[node_type]
    points = [
        _map_point(point_id, label, getattr(subject, attr))
        for point_id, (label, attr) in point_fields.items()
    ]
    houses = [_map_house(index + 1, getattr(subject, attr)) for index, attr in enumerate(HOUSE_ATTRIBUTES)]

    return ChartRenderResult(
        points=points,
        houses=houses,
        aspects=_map_aspects(subject, aspect_preset, orb_multiplier, active_points),
        distributions=_map_distributions(subject),
        warnings=warnings,
    )


def _map_planetary_position(point_id: str, model: Any) -> PlanetaryPosition:
    return PlanetaryPosition(
        id=point_id,
        longitude=float(model.abs_pos),
        retrograde=model.retrograde,
    )


def _map_house(number: int, model: Any) -> ChartHouse:
    return ChartHouse(
        number=number,
        longitude=float(model.abs_pos),
        sign=_map_sign(model.sign),
        signDegree=float(model.position),
    )


def _active_points(node_type: str) -> list[str]:
    return [*BASE_ACTIVE_POINTS, *NODE_ACTIVE_POINTS[node_type]]


def _map_aspects(
    subject: Any,
    aspect_preset: str,
    orb_multiplier: float,
    active_points: list[str],
) -> list[ChartAspect]:
    allowed_aspects = MAJOR_ASPECTS if aspect_preset == "major" else MAJOR_ASPECTS | MINOR_ASPECTS
    aspect_model = AspectsFactory.single_chart_aspects(
        subject,
        active_points=active_points,
        active_aspects=_active_aspects(allowed_aspects, orb_multiplier),
    )
    aspects = []
    seen_aspects = set()

    for aspect in aspect_model.aspects:
        point_a = POINT_NAME_TO_ID.get(aspect.p1_name)
        point_b = POINT_NAME_TO_ID.get(aspect.p2_name)
        if point_a is None or point_b is None or aspect.aspect not in allowed_aspects:
            continue
        orb_limit = _orb_limit(aspect.aspect, orb_multiplier)
        if float(aspect.orbit) > orb_limit:
            continue
        if point_a == point_b:
            continue
        aspect_key = (*sorted([point_a, point_b]), aspect.aspect)
        if aspect_key in seen_aspects:
            continue
        seen_aspects.add(aspect_key)
        aspects.append(
            ChartAspect(
                pointA=point_a,
                pointB=point_b,
                type=aspect.aspect,
                angle=float(aspect.aspect_degrees),
                orb=float(aspect.orbit),
                applying=_is_applying(aspect.aspect_movement),
                strength=_aspect_strength(float(aspect.orbit), orb_limit),
            )
        )

    return aspects


def _map_transit_aspects(
    source_aspects: list[Any],
    allowed_aspects: set[str],
    orb_multiplier: float,
) -> list[ChartTransitAspect]:
    aspects = []
    seen_aspects = set()

    for aspect in source_aspects:
        if aspect.aspect not in allowed_aspects:
            continue
        point_a = POINT_NAME_TO_ID.get(aspect.p1_name)
        point_b = POINT_NAME_TO_ID.get(aspect.p2_name)
        if point_a is None or point_b is None:
            continue
        if aspect.p1_owner == "transit" and aspect.p2_owner == "natal":
            transit_point, natal_point = point_a, point_b
        elif aspect.p1_owner == "natal" and aspect.p2_owner == "transit":
            transit_point, natal_point = point_b, point_a
        else:
            continue
        orb_limit = _orb_limit(aspect.aspect, orb_multiplier)
        if float(aspect.orbit) > orb_limit:
            continue
        aspect_key = (transit_point, natal_point, aspect.aspect)
        if aspect_key in seen_aspects:
            continue
        seen_aspects.add(aspect_key)
        aspects.append(
            ChartTransitAspect(
                transitPoint=transit_point,
                natalPoint=natal_point,
                type=aspect.aspect,
                angle=float(aspect.aspect_degrees),
                orb=float(aspect.orbit),
                applying=_is_applying(aspect.aspect_movement),
                strength=_aspect_strength(float(aspect.orbit), orb_limit),
            )
        )

    return aspects


def _map_synastry_aspects(
    source_aspects: list[Any],
    allowed_aspects: set[str],
    orb_multiplier: float,
) -> list[ChartSynastryAspect]:
    aspects = []
    seen_aspects = set()

    for aspect in source_aspects:
        if aspect.aspect not in allowed_aspects:
            continue
        point_a = POINT_NAME_TO_ID.get(aspect.p1_name)
        point_b = POINT_NAME_TO_ID.get(aspect.p2_name)
        if point_a is None or point_b is None:
            continue
        if aspect.p1_owner == "primary" and aspect.p2_owner == "partner":
            primary_point, partner_point = point_a, point_b
        elif aspect.p1_owner == "partner" and aspect.p2_owner == "primary":
            primary_point, partner_point = point_b, point_a
        else:
            continue
        orb_limit = _orb_limit(aspect.aspect, orb_multiplier)
        if float(aspect.orbit) > orb_limit:
            continue
        aspect_key = (primary_point, partner_point, aspect.aspect)
        if aspect_key in seen_aspects:
            continue
        seen_aspects.add(aspect_key)
        aspects.append(
            ChartSynastryAspect(
                primaryPoint=primary_point,
                partnerPoint=partner_point,
                type=aspect.aspect,
                angle=float(aspect.aspect_degrees),
                orb=float(aspect.orbit),
                applying=_is_applying(aspect.aspect_movement),
                strength=_aspect_strength(float(aspect.orbit), orb_limit),
            )
        )

    return aspects


def _map_solar_return_aspects(
    source_aspects: list[Any],
    allowed_aspects: set[str],
    orb_multiplier: float,
) -> list[ChartSolarReturnAspect]:
    aspects = []
    seen_aspects = set()

    for aspect in source_aspects:
        if aspect.aspect not in allowed_aspects:
            continue
        point_a = POINT_NAME_TO_ID.get(aspect.p1_name)
        point_b = POINT_NAME_TO_ID.get(aspect.p2_name)
        if point_a is None or point_b is None:
            continue
        if aspect.p1_owner == "natal" and aspect.p2_owner != "natal":
            solar_return_point, natal_point = point_b, point_a
        elif aspect.p2_owner == "natal" and aspect.p1_owner != "natal":
            solar_return_point, natal_point = point_a, point_b
        else:
            continue
        orb_limit = _orb_limit(aspect.aspect, orb_multiplier)
        if float(aspect.orbit) > orb_limit:
            continue
        aspect_key = (solar_return_point, natal_point, aspect.aspect)
        if aspect_key in seen_aspects:
            continue
        seen_aspects.add(aspect_key)
        aspects.append(
            ChartSolarReturnAspect(
                solarReturnPoint=solar_return_point,
                natalPoint=natal_point,
                type=aspect.aspect,
                angle=float(aspect.aspect_degrees),
                orb=float(aspect.orbit),
                applying=_is_applying(aspect.aspect_movement),
                strength=_aspect_strength(float(aspect.orbit), orb_limit),
            )
        )

    return aspects


def _map_progression_aspects(
    source_aspects: list[Any],
    allowed_aspects: set[str],
    orb_multiplier: float,
) -> list[ChartProgressionAspect]:
    aspects = []
    seen_aspects = set()

    for aspect in source_aspects:
        if aspect.aspect not in allowed_aspects:
            continue
        point_a = POINT_NAME_TO_ID.get(aspect.p1_name)
        point_b = POINT_NAME_TO_ID.get(aspect.p2_name)
        if point_a is None or point_b is None:
            continue
        if aspect.p1_owner == "progressed" and aspect.p2_owner == "natal":
            progressed_point, natal_point = point_a, point_b
        elif aspect.p1_owner == "natal" and aspect.p2_owner == "progressed":
            progressed_point, natal_point = point_b, point_a
        else:
            continue
        orb_limit = _orb_limit(aspect.aspect, orb_multiplier)
        if float(aspect.orbit) > orb_limit:
            continue
        aspect_key = (progressed_point, natal_point, aspect.aspect)
        if aspect_key in seen_aspects:
            continue
        seen_aspects.add(aspect_key)
        aspects.append(
            ChartProgressionAspect(
                progressedPoint=progressed_point,
                natalPoint=natal_point,
                type=aspect.aspect,
                angle=float(aspect.aspect_degrees),
                orb=float(aspect.orbit),
                applying=_is_applying(aspect.aspect_movement),
                strength=_aspect_strength(float(aspect.orbit), orb_limit),
            )
        )

    return aspects


def _map_house_overlays(comparison: Any) -> list[ChartSynastryHouseOverlay]:
    overlays = []
    for item in comparison.first_points_in_second_houses:
        overlay = _map_house_overlay(item)
        if overlay is not None:
            overlays.append(overlay)
    for item in comparison.second_points_in_first_houses:
        overlay = _map_house_overlay(item)
        if overlay is not None:
            overlays.append(overlay)
    for item in comparison.first_cusps_in_second_houses:
        overlay = _map_house_overlay(item)
        if overlay is not None:
            overlays.append(overlay)
    for item in comparison.second_cusps_in_first_houses:
        overlay = _map_house_overlay(item)
        if overlay is not None:
            overlays.append(overlay)
    return overlays


def _map_house_overlay(item: Any) -> ChartSynastryHouseOverlay | None:
    owner = str(item.point_owner_name)
    projected_owner = str(item.projected_house_owner_name)
    if owner not in {"primary", "partner"} or projected_owner not in {"primary", "partner"}:
        return None
    if owner == projected_owner:
        return None
    point_id = _point_or_house_id(str(item.point_name))
    if point_id is None:
        return None
    return ChartSynastryHouseOverlay(
        owner=owner,
        point=point_id,
        projectedHouseOwner=projected_owner,
        projectedHouse=int(item.projected_house_number),
    )


def _map_relationship_score(score: Any) -> ChartSynastryRelationshipScore | None:
    if score is None:
        return None
    return ChartSynastryRelationshipScore(
        value=float(score.score_value),
        label=_score_label(str(score.score_description)),
        breakdown=[
            ChartSynastryRelationshipScoreBreakdown(
                code=str(item.rule),
                points=float(item.points),
            )
            for item in score.score_breakdown
        ],
    )


def _active_aspects(allowed_aspects: set[str], orb_multiplier: float) -> list[dict[str, float | str]]:
    return [
        {"name": name, "orb": ceil(_orb_limit(name, orb_multiplier))}
        for name in sorted(allowed_aspects)
        if name in ASPECT_ORBS
    ]


def _map_distributions(subject: Any) -> ChartDistributions:
    elements = {"fire": 0, "earth": 0, "air": 0, "water": 0}
    modalities = {"cardinal": 0, "fixed": 0, "mutable": 0}
    polarity = {"masculine": 0, "feminine": 0}

    for _, attr in PLANET_ATTRIBUTES.values():
        point = getattr(subject, attr)
        element = ELEMENT_NAMES[str(point.element)]
        modality = MODALITY_NAMES[str(point.quality)]
        elements[element] += 1
        modalities[modality] += 1
        polarity[POLARITY_BY_ELEMENT[element]] += 1

    return ChartDistributions(elements=elements, modalities=modalities, polarity=polarity)


def _map_warnings(
    request: NatalRequest | AstrocartographyRequest | TransitRequest | SynastryRequest | CompositeRequest | SolarReturnRequest,
) -> list[ChartWarning]:
    warnings = []
    if request.inputSnapshot.birthTimePrecision == "approximate":
        warnings.append(
            ChartWarning(
                code="BIRTH_TIME_APPROXIMATE",
                message="Chart calculated with approximate birth time.",
            )
        )
    if isinstance(request, SynastryRequest) and request.partnerInputSnapshot.birthTimePrecision == "approximate":
        warnings.append(
            ChartWarning(
                code="PARTNER_BIRTH_TIME_APPROXIMATE",
                message="Partner chart calculated with approximate birth time.",
            )
        )
    if isinstance(request, CompositeRequest) and request.partnerInputSnapshot.birthTimePrecision == "approximate":
        warnings.append(
            ChartWarning(
                code="PARTNER_BIRTH_TIME_APPROXIMATE",
                message="Composite calculated with approximate partner birth time.",
            )
        )
    return warnings


def _map_sign(value: str) -> str:
    return SIGN_NAMES.get(str(value), str(value).lower())


def _house_number(value: object) -> int | None:
    if value is None:
        return None
    return HOUSE_NAMES.get(str(value))


def _point_or_house_id(value: str) -> str | None:
    point_id = POINT_NAME_TO_ID.get(value)
    if point_id is not None:
        return point_id
    house_number = HOUSE_NAMES.get(value)
    if house_number is not None:
        return f"house_{house_number}"
    return None


def _score_label(value: str) -> str:
    return value.strip().lower().replace(" ", "_")


def _is_applying(value: str) -> bool | None:
    if value == "Applying":
        return True
    if value == "Separating":
        return False
    return None


def _orb_limit(aspect_name: str, orb_multiplier: float) -> float:
    return ASPECT_ORBS[aspect_name] * orb_multiplier


def _aspect_strength(orb: float, orb_limit: float) -> float:
    if orb_limit <= 0:
        return 0.0
    return max(0.0, min(1.0, 1.0 - (orb / orb_limit)))


def _utc_datetime_string(value: str) -> str:
    if value.endswith("+00:00"):
        return f"{value[:-6]}Z"
    return value


def _progression_basis(birth_date: str, target_date: str) -> ProgressionCalculationBasis:
    born = date.fromisoformat(birth_date)
    target = date.fromisoformat(target_date)
    years = target.year - born.year
    if (target.month, target.day) < (born.month, born.day):
        years -= 1
    age_days = max(0, years)
    symbolic_date = born + timedelta(days=age_days)
    return ProgressionCalculationBasis(
        symbolicDate=symbolic_date.isoformat(),
        ageDays=age_days,
        dayForYearRatio=1,
    )
