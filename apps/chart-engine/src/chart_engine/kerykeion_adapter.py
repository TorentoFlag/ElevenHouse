import hashlib
import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from math import ceil
from typing import Any
from zoneinfo import ZoneInfo

import swisseph as swe
from kerykeion import AspectsFactory, AstrologicalSubjectFactory, CompositeSubjectFactory
from kerykeion.chart_data_factory import ChartDataFactory
from kerykeion.ephemeris_data_factory import EphemerisDataFactory
from kerykeion.planetary_return_factory import PlanetaryReturnFactory
from kerykeion.transits_time_range_factory import TransitsTimeRangeFactory

from chart_engine.canonical_validation import (
    build_reproducibility_fingerprint,
    fingerprint_input_for_request,
    validate_calculation_result,
)
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
    ChartProgressionCalculationBasis,
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
    LegacyProviderMetadata,
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
ASTRO_CALENDAR_CLIENT_DATE_EVENT_TYPES = {
    "client.birthday",
    "client.solar_window",
}
ASTRO_CALENDAR_TRANSIT_EVENT_TYPES = {
    "client.transit_aspect",
}
ASTRO_CALENDAR_TRANSIT_POINTS = {
    "sun",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "north_node",
}
ASTRO_CALENDAR_TRANSIT_ORB_LIMIT = 1.0
ASTRO_CALENDAR_MAX_TRANSIT_EVENTS_PER_CLIENT = 80

ASTRO_CALENDAR_POINT_LABELS_RU = {
    "sun": "Солнце",
    "moon": "Луна",
    "mercury": "Меркурий",
    "venus": "Венера",
    "mars": "Марс",
    "jupiter": "Юпитер",
    "saturn": "Сатурн",
    "uranus": "Уран",
    "neptune": "Нептун",
    "pluto": "Плутон",
    "north_node": "Северный узел",
    "south_node": "Южный узел",
    "ascendant": "Asc",
    "midheaven": "MC",
}

ASTRO_CALENDAR_ASPECT_LABELS_RU = {
    "conjunction": "соединение",
    "opposition": "оппозиция",
    "trine": "трин",
    "sextile": "секстиль",
    "square": "квадрат",
    "semi-sextile": "полусекстиль",
    "semi-square": "полуквадрат",
    "quincunx": "квинконс",
    "quintile": "квинтиль",
}

ASTRO_CALENDAR_SIGN_LABELS_RU = {
    "aries": "Овен",
    "taurus": "Телец",
    "gemini": "Близнецы",
    "cancer": "Рак",
    "leo": "Лев",
    "virgo": "Дева",
    "libra": "Весы",
    "scorpio": "Скорпион",
    "sagittarius": "Стрелец",
    "capricorn": "Козерог",
    "aquarius": "Водолей",
    "pisces": "Рыбы",
}

ASTRO_CALENDAR_ECLIPSE_KIND_LABELS_RU = {
    "total": "полное",
    "annular": "кольцеобразное",
    "partial": "частное",
    "hybrid": "гибридное",
    "penumbral": "полутеневое",
    "unknown": "неуточнённое",
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
    0.0: ("new_moon", "Новолуние", "conjunction"),
    90.0: ("first_quarter", "Первая четверть Луны", "square"),
    180.0: ("full_moon", "Полнолуние", "opposition"),
    270.0: ("last_quarter", "Последняя четверть Луны", "square"),
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


def calculate_natal(
    request: NatalRequest,
    provider: ProviderMetadata,
) -> StoredChartCalculationPayload:
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
        dst_occurrence=request.inputSnapshot.dstOccurrence,
    )

    result = _map_render_result(
        subject,
        request.settings.nodeType,
        request.settings.aspectPreset,
        request.settings.orbMultiplier,
        active_points,
        _map_warnings(request),
    )

    return _validated_payload(StoredChartCalculationPayload(
        schemaVersion="chart-result.v2",
        method="natal",
        methodVersion=request.methodVersion,
        provider=provider,
        reproducibilityFingerprint=_result_fingerprint(request, provider),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        result=result,
    ))


def calculate_astrocartography(
    request: AstrocartographyRequest,
    provider: ProviderMetadata,
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
        dst_occurrence=request.inputSnapshot.dstOccurrence,
    )
    warnings = [
        *_map_warnings(request),
        ChartWarning(
            code="ASTROCARTOGRAPHY_POLAR_REGIONS_OMITTED",
            message="Polar regions are omitted from ASC/DSC line sampling.",
        ),
    ]

    return _validated_payload(StoredChartAstrocartographyCalculationPayload(
        schemaVersion="chart-result.v2",
        method="astrocartography",
        methodVersion=request.methodVersion,
        provider=provider,
        reproducibilityFingerprint=_result_fingerprint(request, provider),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        result=ChartAstrocartographyRenderResult(
            lines=_astrocartography_lines(
                julian_day=float(subject.julian_day),
                house_system=request.settings.houseSystem,
            ),
            warnings=warnings,
        ),
    ))


def calculate_astro_calendar_range(
    request: AstroCalendarRequest,
    provider: ProviderMetadata,
) -> AstroCalendarRangeResponse:
    requested_types = set(request.eventTypes)
    supported_types = (
        ASTRO_CALENDAR_GLOBAL_EVENT_TYPES
        | ASTRO_CALENDAR_CLIENT_DATE_EVENT_TYPES
        | ASTRO_CALENDAR_TRANSIT_EVENT_TYPES
    )
    unsupported_types = sorted(requested_types - supported_types)
    warnings = [
        _unsupported_astro_calendar_event_warning(event_type) for event_type in unsupported_types
    ]
    start_jd = _julian_day_for_date(request.start)
    end_exclusive_jd = _julian_day_for_date(request.end + timedelta(days=1))
    events: list[AstroCalendarEvent] = []

    if "global.moon_phase" in requested_types:
        events.extend(_moon_phase_events(start_jd, end_exclusive_jd))
    if "global.eclipse" in requested_types:
        events.extend(_eclipse_events(start_jd, end_exclusive_jd))
    if "global.ingress" in requested_types:
        events.extend(_ingress_events(start_jd, end_exclusive_jd))
    if requested_types & ASTRO_CALENDAR_CLIENT_DATE_EVENT_TYPES:
        events.extend(_client_date_events(request))
    if "client.transit_aspect" in requested_types:
        events.extend(_client_transit_aspect_events(request))

    events.sort(key=lambda event: (event.startsAt, event.id))
    dictionary_codes = sorted({code for event in events for code in event.dictionaryCodes})
    by_type = {event_type: 0 for event_type in request.eventTypes}
    by_tone: dict[str, int] = {}
    global_event_count = 0
    client_event_count = 0
    for event in events:
        by_type[event.type] = by_type.get(event.type, 0) + 1
        by_tone[event.tone] = by_tone.get(event.tone, 0) + 1
        if event.source == "client":
            client_event_count += 1
        else:
            global_event_count += 1

    return AstroCalendarRangeResponse(
        schemaVersion="astro-calendar-range.v1",
        timeZone=request.timeZone,
        range=AstroCalendarDateRange(start=request.start, end=request.end),
        generation=AstroCalendarGenerationMetadata(
            status="ready",
            generationId=None,
            fingerprint=_astro_calendar_fingerprint(request),
            generatedAt=_utc_now_string(),
            provider=_legacy_provider(provider),
        ),
        events=events,
        readiness=_astro_calendar_readiness(request),
        summary=AstroCalendarSummary(
            eventCount=len(events),
            globalEventCount=global_event_count,
            clientEventCount=client_event_count,
            byType=by_type,
            byTone=by_tone,
        ),
        dictionaryCodes=dictionary_codes,
        warnings=warnings,
    )


def calculate_transit(
    request: TransitRequest,
    provider: ProviderMetadata,
) -> StoredChartTransitCalculationPayload:
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
        dst_occurrence=request.inputSnapshot.dstOccurrence,
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
        dst_occurrence=None,
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

    return _validated_payload(StoredChartTransitCalculationPayload(
        schemaVersion="chart-result.v2",
        method="transit",
        methodVersion=request.methodVersion,
        provider=provider,
        reproducibilityFingerprint=_result_fingerprint(request, provider),
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
    ))


def calculate_synastry(
    request: SynastryRequest,
    provider: ProviderMetadata,
) -> StoredChartSynastryCalculationPayload:
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
        dst_occurrence=request.inputSnapshot.dstOccurrence,
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
        dst_occurrence=request.partnerInputSnapshot.dstOccurrence,
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

    return _validated_payload(StoredChartSynastryCalculationPayload(
        schemaVersion="chart-result.v2",
        method="synastry",
        methodVersion=request.methodVersion,
        provider=provider,
        reproducibilityFingerprint=_result_fingerprint(request, provider),
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
    ))


def calculate_composite(
    request: CompositeRequest,
    provider: ProviderMetadata,
) -> StoredChartCompositeCalculationPayload:
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
        dst_occurrence=request.inputSnapshot.dstOccurrence,
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
        dst_occurrence=request.partnerInputSnapshot.dstOccurrence,
    )
    composite_subject = CompositeSubjectFactory(
        primary_subject,
        partner_subject,
        chart_name="composite",
    ).get_midpoint_composite_subject_model()
    warnings = _map_warnings(request)

    return _validated_payload(StoredChartCompositeCalculationPayload(
        schemaVersion="chart-result.v2",
        method="composite",
        methodVersion=request.methodVersion,
        provider=provider,
        reproducibilityFingerprint=_result_fingerprint(request, provider),
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
    ))


def calculate_solar_return(
    request: SolarReturnRequest,
    provider: ProviderMetadata,
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
        dst_occurrence=request.inputSnapshot.dstOccurrence,
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
    solar_return_snapshot = SolarReturnSnapshot(
        year=request.solarReturnSnapshot.year,
        returnType="solar",
        location=request.solarReturnSnapshot.location,
        resolvedAt=_utc_datetime_string(solar_return_subject.iso_formatted_utc_datetime),
    )

    return _validated_payload(StoredChartSolarReturnCalculationPayload(
        schemaVersion="chart-result.v2",
        method="solar_return",
        methodVersion=request.methodVersion,
        provider=provider,
        reproducibilityFingerprint=_result_fingerprint(
            request,
            provider,
            result_input_snapshot={
                "inputSnapshot": request.inputSnapshot,
                "solarReturnSnapshot": solar_return_snapshot,
            },
        ),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        solarReturnSnapshot=solar_return_snapshot,
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
    ))


def calculate_progression(
    request: ProgressionRequest,
    provider: ProviderMetadata,
) -> StoredChartProgressionCalculationPayload:
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
        dst_occurrence=request.inputSnapshot.dstOccurrence,
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
        dst_occurrence=None,
    )
    reproducibility_basis = _progression_reproducibility_basis(request, progressed_subject)
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

    return _validated_payload(StoredChartProgressionCalculationPayload(
        schemaVersion="chart-result.v2",
        method="progression",
        methodVersion=request.methodVersion,
        provider=provider,
        reproducibilityFingerprint=_result_fingerprint(
            request,
            provider,
            calculation_basis=reproducibility_basis,
        ),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        progressionSnapshot=ProgressionSnapshot(
            targetDate=request.progressionSnapshot.targetDate,
            progressionType="secondary",
            calculationBasis=calculation_basis,
        ),
        calculationBasis=reproducibility_basis,
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
    ))


def calculate_horary(
    request: HoraryRequest,
    provider: ProviderMetadata,
) -> StoredChartHoraryCalculationPayload:
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
        dst_occurrence=None,
    )

    return _validated_payload(StoredChartHoraryCalculationPayload(
        schemaVersion="chart-result.v2",
        method="horary",
        methodVersion=request.methodVersion,
        provider=provider,
        reproducibilityFingerprint=_result_fingerprint(request, provider),
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
    ))


def calculate_planetary_positions(
    request: PlanetaryPositionsRequest,
    provider: ProviderMetadata,
) -> PlanetaryPositionsPayload:
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
        is_dst=_dst_occurrence_value(request.inputSnapshot.dstOccurrence),
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
        provider=_legacy_provider(provider),
        settings=request.settings,
        inputSnapshot=request.inputSnapshot,
        positions=positions,
    )


def _client_date_events(request: AstroCalendarRequest) -> list[AstroCalendarEvent]:
    events: list[AstroCalendarEvent] = []
    requested_types = set(request.eventTypes)

    for client in request.clients:
        natal_sun_sign = _client_natal_sun_sign(client)
        for year in range(request.start.year, request.end.year + 1):
            birthday = _birthday_for_year(client.birthDate, year)
            if "client.birthday" in requested_types and request.start <= birthday <= request.end:
                events.append(
                    AstroCalendarEvent(
                        id=f"client-birthday-{client.clientId}-{year}",
                        source="client",
                        type="client.birthday",
                        startsAt=_day_start_utc_string(birthday),
                        endsAt=_day_end_utc_string(birthday),
                        timePrecision="day",
                        title="День рождения",
                        subtitle=client.displayName,
                        description=None,
                        tone="supportive",
                        points=["Sun"],
                        aspect=None,
                        sign=natal_sun_sign,
                        clientRefs=[_astro_calendar_client_ref(client)],
                        chartLink={
                            "mode": "solar_return",
                            "clientId": client.clientId,
                            "date": birthday,
                        },
                        dictionaryCodes=["astro_calendar.client.birthday"],
                        warnings=[],
                    )
                )

            solar_window_start = birthday - timedelta(days=7)
            solar_window_end = birthday + timedelta(days=7)
            if (
                "client.solar_window" in requested_types
                and solar_window_start <= request.end
                and solar_window_end >= request.start
            ):
                events.append(
                    AstroCalendarEvent(
                        id=f"client-solar-window-{client.clientId}-{year}",
                        source="client",
                        type="client.solar_window",
                        startsAt=_day_start_utc_string(solar_window_start),
                        endsAt=_day_end_utc_string(solar_window_end),
                        timePrecision="day",
                        title="Солярное окно",
                        subtitle=client.displayName,
                        description=None,
                        tone="opportunity",
                        points=["Sun"],
                        aspect=None,
                        sign=natal_sun_sign,
                        clientRefs=[_astro_calendar_client_ref(client)],
                        chartLink={
                            "mode": "solar_return",
                            "clientId": client.clientId,
                            "date": birthday,
                        },
                        dictionaryCodes=["astro_calendar.client.solar_window"],
                        warnings=[],
                    )
                )

    return events


def _birthday_for_year(birth_date: date, year: int) -> date:
    try:
        return birth_date.replace(year=year)
    except ValueError:
        return date(year, 2, 28)


def _astro_calendar_client_ref(client: Any) -> dict[str, str]:
    return {
        "clientId": client.clientId,
        "displayName": client.displayName,
        "initials": client.initials,
    }


def _client_natal_sun_sign(client: Any) -> str:
    hour = 12
    minute = 0
    if client.birthTime is not None:
        parts = client.birthTime.split(":")
        hour = int(parts[0])
        minute = int(parts[1])

    local_datetime = datetime(
        client.birthDate.year,
        client.birthDate.month,
        client.birthDate.day,
        hour,
        minute,
        tzinfo=ZoneInfo(client.birthTimezone),
    )
    utc_datetime = local_datetime.astimezone(timezone.utc)
    julian_day = swe.julday(
        utc_datetime.year,
        utc_datetime.month,
        utc_datetime.day,
        utc_datetime.hour + utc_datetime.minute / 60.0 + utc_datetime.second / 3600.0,
        swe.GREG_CAL,
    )
    return _planet_sign(swe.SUN, julian_day)


def _day_start_utc_string(value: date) -> str:
    return f"{value.isoformat()}T00:00:00.000Z"


def _day_end_utc_string(value: date) -> str:
    return f"{value.isoformat()}T23:59:59.000Z"


def _astro_calendar_readiness(request: AstroCalendarRequest) -> AstroCalendarReadinessSummary:
    clients_with_unknown_birth_time = sum(
        1 for client in request.clients if client.birthTime is None
    )
    clients_with_approximate_birth_time = sum(
        1 for client in request.clients if client.birthTimePrecision == "approximate"
    )
    clients_ready = sum(
        1
        for client in request.clients
        if client.birthTime is not None and client.birthTimePrecision != "unknown"
    )

    return AstroCalendarReadinessSummary(
        clientsTotal=len(request.clients),
        clientsReady=clients_ready,
        clientsWithMissingBirthData=0,
        clientsWithUnknownBirthTime=clients_with_unknown_birth_time,
        clientsWithApproximateBirthTime=clients_with_approximate_birth_time,
    )


def _client_transit_aspect_events(request: AstroCalendarRequest) -> list[AstroCalendarEvent]:
    events: list[AstroCalendarEvent] = []
    active_points = _active_points(request.settings.nodeType)
    allowed_aspects = (
        MAJOR_ASPECTS
        if request.settings.aspectPreset == "major"
        else MAJOR_ASPECTS | MINOR_ASPECTS
    )
    active_aspects = _active_aspects(allowed_aspects, request.settings.orbMultiplier)
    start_datetime = datetime(request.start.year, request.start.month, request.start.day, 12, 0)
    end_datetime = datetime(request.end.year, request.end.month, request.end.day, 12, 0)

    for client in request.clients:
        if client.birthTime is None or client.birthTimePrecision == "unknown":
            continue

        natal_subject = _create_subject(
            name=client.displayName,
            date=client.birthDate.isoformat(),
            time=client.birthTime,
            timezone=client.birthTimezone,
            latitude=client.birthLatitude,
            longitude=client.birthLongitude,
            house_system=request.settings.houseSystem,
            active_points=active_points,
            dst_occurrence=None,
        )
        ephemeris_points = EphemerisDataFactory(
            start_datetime,
            end_datetime,
            step_type="days",
            step=1,
            lat=client.birthLatitude,
            lng=client.birthLongitude,
            tz_str=request.timeZone,
            zodiac_type="Tropical",
            houses_system_identifier=HOUSE_SYSTEMS[request.settings.houseSystem],
            max_days=94,
        ).get_ephemeris_data_as_astrological_subjects()
        transit_range = TransitsTimeRangeFactory(
            natal_subject,
            ephemeris_points,
            active_points=active_points,
            active_aspects=active_aspects,
        ).get_transit_moments()

        windows = _group_astro_calendar_transit_windows(transit_range.transits)
        for window in windows[:ASTRO_CALENDAR_MAX_TRANSIT_EVENTS_PER_CLIENT]:
            events.append(_transit_window_event(client, window))

    return events


def _group_astro_calendar_transit_windows(transit_moments: list[Any]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)

    for moment in transit_moments:
        moment_datetime = _parse_kerykeion_utc_datetime(moment.date)
        for aspect in moment.aspects:
            transit_point = POINT_NAME_TO_ID.get(aspect.p1_name)
            natal_point = POINT_NAME_TO_ID.get(aspect.p2_name)
            if transit_point is None or natal_point is None:
                continue
            if aspect.p1_owner not in {"Now", "transit"} or aspect.p2_owner in {"Now", "transit"}:
                continue
            if transit_point not in ASTRO_CALENDAR_TRANSIT_POINTS:
                continue
            if float(aspect.orbit) > ASTRO_CALENDAR_TRANSIT_ORB_LIMIT:
                continue

            grouped[(transit_point, aspect.aspect, natal_point)].append(
                {
                    "date": moment_datetime.date(),
                    "startsAt": _datetime_to_utc_string(moment_datetime),
                    "transitPoint": transit_point,
                    "natalPoint": natal_point,
                    "aspect": aspect.aspect,
                    "angle": float(aspect.aspect_degrees),
                    "orb": float(aspect.orbit),
                    "applying": _is_applying(aspect.aspect_movement),
                    "sign": _sign_for_longitude(float(aspect.p1_abs_pos)),
                }
            )

    windows: list[dict[str, Any]] = []
    for hits in grouped.values():
        sorted_hits = sorted(hits, key=lambda hit: (hit["date"], hit["orb"]))
        current: list[dict[str, Any]] = []
        previous_date: date | None = None
        for hit in sorted_hits:
            if previous_date is not None and (hit["date"] - previous_date).days > 1:
                windows.append(_summarize_transit_window(current))
                current = []
            current.append(hit)
            previous_date = hit["date"]
        if current:
            windows.append(_summarize_transit_window(current))

    return sorted(
        windows,
        key=lambda window: (
            window["startDate"],
            window["orb"],
            window["transitPoint"],
            window["aspect"],
            window["natalPoint"],
        ),
    )


def _summarize_transit_window(hits: list[dict[str, Any]]) -> dict[str, Any]:
    strongest = min(hits, key=lambda hit: (hit["orb"], hit["date"]))
    return {
        **strongest,
        "startDate": hits[0]["date"],
        "endDate": hits[-1]["date"],
        "startsAt": _day_start_utc_string(hits[0]["date"]),
        "endsAt": _day_end_utc_string(hits[-1]["date"]),
    }


def _transit_window_event(client: Any, window: dict[str, Any]) -> AstroCalendarEvent:
    transit_point = window["transitPoint"]
    natal_point = window["natalPoint"]
    aspect = window["aspect"]
    dictionary_code = f"astro_calendar.client.transit.{transit_point}.{aspect}.{natal_point}"
    event_id = (
        f"client-transit-{client.clientId}-{window['startDate'].isoformat()}-"
        f"{transit_point}-{aspect}-{natal_point}"
    )
    transit_label = ASTRO_CALENDAR_POINT_LABELS_RU.get(transit_point, transit_point)
    natal_label = ASTRO_CALENDAR_POINT_LABELS_RU.get(natal_point, natal_point)
    aspect_label = ASTRO_CALENDAR_ASPECT_LABELS_RU.get(aspect, aspect)

    return AstroCalendarEvent(
        id=event_id,
        source="client",
        type="client.transit_aspect",
        startsAt=window["startsAt"],
        endsAt=window["endsAt"],
        timePrecision="day",
        title=f"{transit_label}: {aspect_label} к {natal_label}",
        subtitle=client.displayName,
        description=f"Орб {window['orb']:.2f}°",
        tone=_transit_aspect_tone(aspect),
        points=[transit_label, natal_label],
        aspect=aspect,
        sign=window["sign"],
        clientRefs=[_astro_calendar_client_ref(client)],
        chartLink={
            "mode": "transit",
            "clientId": client.clientId,
            "date": window["startDate"],
        },
        dictionaryCodes=[dictionary_code],
        warnings=[],
    )


def _transit_aspect_tone(aspect: str) -> str:
    if aspect in {"square", "opposition", "semi-square"}:
        return "intense"
    if aspect in {"trine", "sextile", "quintile"}:
        return "supportive"
    return "neutral"


def _sign_label_ru(sign: str) -> str:
    return ASTRO_CALENDAR_SIGN_LABELS_RU.get(sign, sign)


def _eclipse_kind_label_ru(kind: str) -> str:
    return ASTRO_CALENDAR_ECLIPSE_KIND_LABELS_RU.get(kind, kind)


def _parse_kerykeion_utc_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    resolved = datetime.fromisoformat(normalized)
    if resolved.tzinfo is None:
        resolved = resolved.replace(tzinfo=timezone.utc)
    return resolved.astimezone(timezone.utc)


def _datetime_to_utc_string(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _sign_for_longitude(longitude: float) -> str:
    return ASTRO_CALENDAR_SIGN_NAMES[int((longitude % 360.0) // 30) % 12]


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
                            subtitle=_sign_label_ru(sign),
                            description=None,
                            tone="neutral" if phase_id in {"new_moon", "full_moon"} else "supportive",
                            points=["Луна"],
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
        point_label = ASTRO_CALENDAR_POINT_LABELS_RU.get(point_id, label)

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
                            title=f"{point_label} входит в знак {_sign_label_ru(current_sign)}",
                            subtitle=_sign_label_ru(current_sign),
                            description=None,
                            tone="opportunity",
                            points=[point_label],
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
                    title=f"Солнечное затмение ({_eclipse_kind_label_ru(eclipse_kind)})",
                    subtitle=_sign_label_ru(sign),
                    description=None,
                    tone="intense",
                    points=["Солнце", "Луна"],
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
                    title=f"Лунное затмение ({_eclipse_kind_label_ru(eclipse_kind)})",
                    subtitle=_sign_label_ru(sign),
                    description=None,
                    tone="intense",
                    points=["Солнце", "Луна"],
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
    if event_type == "client.transit_aspect":
        message = "Chart engine does not generate client.transit_aspect range events yet."
    else:
        message = f"Chart engine does not generate {event_type} without owner-scoped CRM data."
    return AstroCalendarWarning(
        code="PROVIDER_PRECISION_LIMITED",
        severity="warning",
        message=message,
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
        "clientIds": sorted(request.clientIds),
        "clients": sorted(
            [client.model_dump(mode="json") for client in request.clients],
            key=lambda client: client["clientId"],
        ),
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
    dst_occurrence: str | None,
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
        is_dst=_dst_occurrence_value(dst_occurrence),
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


def _progression_reproducibility_basis(
    request: ProgressionRequest,
    progressed_subject: Any,
) -> ChartProgressionCalculationBasis:
    born = date.fromisoformat(request.inputSnapshot.birthDate)
    target = date.fromisoformat(request.progressionSnapshot.targetDate)
    elapsed_life_days = float((target - born).days)
    return ChartProgressionCalculationBasis(
        symbolicInstant=_utc_datetime_string(progressed_subject.iso_formatted_utc_datetime),
        elapsedLifeDays=elapsed_life_days,
        elapsedYears=elapsed_life_days / 365.24219,
        yearLengthDays=365.24219,
        dayForYearRatio=1,
    )


def _dst_occurrence_value(value: str | None) -> bool | None:
    if value == "first":
        return True
    if value == "second":
        return False
    return None


def _legacy_provider(provider: ProviderMetadata) -> LegacyProviderMetadata:
    return LegacyProviderMetadata(
        name=provider.name,
        version=provider.version,
        ephemeris=provider.ephemeris,
    )


def _result_fingerprint(
    request: Any,
    provider: ProviderMetadata,
    *,
    calculation_basis: ChartProgressionCalculationBasis | None = None,
    result_input_snapshot: Any | None = None,
) -> str:
    return build_reproducibility_fingerprint(
        method=request.method,
        method_version=request.methodVersion,
        provider=provider,
        settings=request.settings,
        input_snapshot=(
            result_input_snapshot
            if result_input_snapshot is not None
            else fingerprint_input_for_request(request)
        ),
        calculation_basis=calculation_basis,
    )


def _validated_payload(payload: Any) -> Any:
    validate_calculation_result(payload)
    return payload
