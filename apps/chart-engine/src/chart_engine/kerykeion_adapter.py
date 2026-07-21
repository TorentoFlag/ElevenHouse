from importlib.metadata import version
from math import ceil
from typing import Any

from kerykeion import AspectsFactory, AstrologicalSubjectFactory

from chart_engine.schemas import (
    ChartAspect,
    ChartDistributions,
    ChartHouse,
    ChartPoint,
    ChartRenderResult,
    ChartWarning,
    NatalRequest,
    ProviderMetadata,
    StoredChartCalculationPayload,
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


def calculate_natal(request: NatalRequest) -> StoredChartCalculationPayload:
    year, month, day = [int(part) for part in request.inputSnapshot.birthDate.split("-")]
    hour, minute = [int(part) for part in request.inputSnapshot.birthTime.split(":")]
    house_system = HOUSE_SYSTEMS[request.settings.houseSystem]

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
        houses_system_identifier=house_system,
        active_points=active_points,
        suppress_geonames_warning=True,
    )

    point_fields = PLANET_ATTRIBUTES | ANGLE_ATTRIBUTES | NODE_ATTRIBUTES[request.settings.nodeType]
    points = [_map_point(point_id, label, getattr(subject, attr)) for point_id, (label, attr) in point_fields.items()]
    houses = [_map_house(index + 1, getattr(subject, attr)) for index, attr in enumerate(HOUSE_ATTRIBUTES)]

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
        result=ChartRenderResult(
            points=points,
            houses=houses,
            aspects=_map_aspects(
                subject,
                request.settings.aspectPreset,
                request.settings.orbMultiplier,
                active_points,
            ),
            distributions=_map_distributions(subject),
            warnings=_map_warnings(request),
        ),
    )


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


def _map_warnings(request: NatalRequest) -> list[ChartWarning]:
    warnings = []
    if request.inputSnapshot.birthTimePrecision == "approximate":
        warnings.append(
            ChartWarning(
                code="BIRTH_TIME_APPROXIMATE",
                message="Chart calculated with approximate birth time.",
            )
        )
    return warnings


def _map_sign(value: str) -> str:
    return SIGN_NAMES.get(str(value), str(value).lower())


def _house_number(value: object) -> int | None:
    if value is None:
        return None
    return HOUSE_NAMES.get(str(value))


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
