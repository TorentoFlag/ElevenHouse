import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any


class CanonicalValidationError(ValueError):
    pass


REQUIRED_POINT_IDS = {
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
    "ascendant",
    "midheaven",
    "north_node",
    "south_node",
}

DISTRIBUTION_KEYS = {
    "elements": {"fire", "earth", "air", "water"},
    "modalities": {"cardinal", "fixed", "mutable"},
    "polarity": {"masculine", "feminine"},
}


def validate_chart_render_result(value: Any) -> None:
    result = _mapping(value)
    points = [_mapping(point) for point in _sequence(result.get("points"))]
    point_ids = [str(point.get("id")) for point in points]
    if len(set(point_ids)) != len(point_ids):
        raise CanonicalValidationError("CHART_POINTS_DUPLICATE")
    if not REQUIRED_POINT_IDS.issubset(point_ids):
        raise CanonicalValidationError("CHART_POINTS_REQUIRED_MISSING")

    houses = [_mapping(house) for house in _sequence(result.get("houses"))]
    house_numbers = [int(house.get("number")) for house in houses]
    if set(house_numbers) != set(range(1, 13)) or len(house_numbers) != 12:
        raise CanonicalValidationError("CHART_HOUSES_INVALID")

    seen_aspects: set[tuple[str, str]] = set()
    for aspect_value in _sequence(result.get("aspects")):
        aspect = _mapping(aspect_value)
        point_a = str(aspect.get("pointA"))
        point_b = str(aspect.get("pointB"))
        if point_a not in point_ids or point_b not in point_ids:
            raise CanonicalValidationError("CHART_ASPECT_UNKNOWN_REFERENCE")
        if point_a == point_b:
            raise CanonicalValidationError("CHART_ASPECT_SELF_REFERENCE")
        pair = tuple(sorted((point_a, point_b)))
        key = (pair[0], pair[1])
        if key in seen_aspects:
            raise CanonicalValidationError("CHART_ASPECT_DUPLICATE")
        seen_aspects.add(key)

    distributions = _mapping(result.get("distributions"))
    for dimension, required_keys in DISTRIBUTION_KEYS.items():
        counts = _mapping(distributions.get(dimension))
        if set(counts) != required_keys:
            raise CanonicalValidationError("CHART_DISTRIBUTION_KEYS_INVALID")
        if any(type(count) is not int or count < 0 for count in counts.values()):
            raise CanonicalValidationError("CHART_DISTRIBUTION_COUNT_INVALID")
        if sum(counts.values()) != 10:
            raise CanonicalValidationError("CHART_DISTRIBUTION_TOTAL_INVALID")


def validate_calculation_result(payload: Any) -> None:
    value = _mapping(payload)
    method = value.get("method")
    result = _mapping(value.get("result"))
    if method in {"natal", "composite", "horary"}:
        validate_chart_render_result(result)
    elif method == "transit":
        natal = _mapping(result.get("natal"))
        transit = _mapping(result.get("transit"))
        validate_chart_render_result(natal)
        validate_chart_render_result(transit)
        _validate_cross_aspects(
            result.get("aspectsToNatal"),
            left_field="transitPoint",
            right_field="natalPoint",
            left_ids=_point_ids(transit),
            right_ids=_point_ids(natal),
        )
    elif method == "synastry":
        primary = _mapping(result.get("primary"))
        partner = _mapping(result.get("partner"))
        validate_chart_render_result(primary)
        validate_chart_render_result(partner)
        _validate_cross_aspects(
            result.get("aspectsBetween"),
            left_field="primaryPoint",
            right_field="partnerPoint",
            left_ids=_point_ids(primary),
            right_ids=_point_ids(partner),
        )
        _validate_house_overlays(
            result.get("houseOverlays"),
            primary_ids=_overlay_ids(primary),
            partner_ids=_overlay_ids(partner),
        )
    elif method == "solar_return":
        natal = _mapping(result.get("natal"))
        solar_return = _mapping(result.get("solarReturn"))
        validate_chart_render_result(natal)
        validate_chart_render_result(solar_return)
        _validate_cross_aspects(
            result.get("aspectsToNatal"),
            left_field="solarReturnPoint",
            right_field="natalPoint",
            left_ids=_point_ids(solar_return),
            right_ids=_point_ids(natal),
        )
    elif method == "progression":
        natal = _mapping(result.get("natal"))
        progressed = _mapping(result.get("progressed"))
        validate_chart_render_result(natal)
        validate_chart_render_result(progressed)
        _validate_cross_aspects(
            result.get("aspectsToNatal"),
            left_field="progressedPoint",
            right_field="natalPoint",
            left_ids=_point_ids(progressed),
            right_ids=_point_ids(natal),
        )


def _point_ids(result: Mapping[str, Any]) -> set[str]:
    return {
        str(_mapping(point).get("id"))
        for point in _sequence(result.get("points"))
    }


def _overlay_ids(result: Mapping[str, Any]) -> set[str]:
    house_ids = {
        f"house_{int(_mapping(house).get('number'))}"
        for house in _sequence(result.get("houses"))
    }
    return _point_ids(result) | house_ids


def _validate_cross_aspects(
    value: Any,
    *,
    left_field: str,
    right_field: str,
    left_ids: set[str],
    right_ids: set[str],
) -> None:
    seen: set[tuple[str, str]] = set()
    for aspect_value in _sequence(value):
        aspect = _mapping(aspect_value)
        left_id = str(aspect.get(left_field))
        right_id = str(aspect.get(right_field))
        if left_id not in left_ids or right_id not in right_ids:
            raise CanonicalValidationError("CHART_CROSS_ASPECT_UNKNOWN_REFERENCE")
        key = (left_id, right_id)
        if key in seen:
            raise CanonicalValidationError("CHART_CROSS_ASPECT_DUPLICATE")
        seen.add(key)


def _validate_house_overlays(
    value: Any,
    *,
    primary_ids: set[str],
    partner_ids: set[str],
) -> None:
    ids_by_owner = {"primary": primary_ids, "partner": partner_ids}
    seen: set[tuple[str, str, str]] = set()
    for overlay_value in _sequence(value):
        overlay = _mapping(overlay_value)
        owner = str(overlay.get("owner"))
        projected_owner = str(overlay.get("projectedHouseOwner"))
        point = str(overlay.get("point"))
        projected_house = int(overlay.get("projectedHouse"))
        if owner not in ids_by_owner or projected_owner not in ids_by_owner:
            raise CanonicalValidationError("CHART_HOUSE_OVERLAY_OWNER_INVALID")
        if owner == projected_owner:
            raise CanonicalValidationError("CHART_HOUSE_OVERLAY_SELF_REFERENCE")
        if point not in ids_by_owner[owner] or projected_house not in range(1, 13):
            raise CanonicalValidationError("CHART_HOUSE_OVERLAY_UNKNOWN_REFERENCE")
        key = (owner, point, projected_owner)
        if key in seen:
            raise CanonicalValidationError("CHART_HOUSE_OVERLAY_DUPLICATE")
        seen.add(key)


def build_reproducibility_fingerprint(
    *,
    method: str,
    method_version: str,
    provider: Any,
    settings: Any,
    input_snapshot: Any,
    calculation_basis: Any = None,
) -> str:
    provider_value = (
        provider.model_dump(mode="json")
        if hasattr(provider, "model_dump")
        else dict(_mapping(provider))
    )
    provider_value["ephemerisFlags"] = sorted(provider_value["ephemerisFlags"])
    canonical = {
        "schemaVersion": "chart-result.v2",
        "method": method,
        "methodVersion": method_version,
        "provider": provider_value,
        "settings": _json_value(settings),
        "inputSnapshot": _json_value(input_snapshot),
        "calculationBasis": _json_value(calculation_basis),
    }
    digest = hashlib.sha256(_stable_json(canonical).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def reproducibility_fingerprint_for_result(payload: Any) -> str:
    value = _mapping(payload)
    method = str(value["method"])
    return build_reproducibility_fingerprint(
        method=method,
        method_version=str(value["methodVersion"]),
        provider=value["provider"],
        settings=value["settings"],
        input_snapshot=_fingerprint_input(value, method),
        calculation_basis=value.get("calculationBasis"),
    )


def fingerprint_input_for_request(request: Any) -> Any:
    return _fingerprint_input(_mapping(request), str(_mapping(request)["method"]))


def _fingerprint_input(value: Mapping[str, Any], method: str) -> Any:
    if method in {"natal", "astrocartography", "progression"}:
        return value["inputSnapshot"]
    if method == "transit":
        return {
            "inputSnapshot": value["inputSnapshot"],
            "transitSnapshot": value["transitSnapshot"],
        }
    if method in {"synastry", "composite"}:
        return {
            "inputSnapshot": value["inputSnapshot"],
            "partnerInputSnapshot": value["partnerInputSnapshot"],
        }
    if method == "solar_return":
        return {
            "inputSnapshot": value["inputSnapshot"],
            "solarReturnSnapshot": value["solarReturnSnapshot"],
        }
    if method == "horary":
        return value["questionSnapshot"]
    raise CanonicalValidationError("CHART_METHOD_UNSUPPORTED")


def _mapping(value: Any) -> Mapping[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if not isinstance(value, Mapping):
        raise CanonicalValidationError("CHART_CANONICAL_OBJECT_REQUIRED")
    return value


def _sequence(value: Any) -> Sequence[Any]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise CanonicalValidationError("CHART_CANONICAL_ARRAY_REQUIRED")
    return value


def _json_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise CanonicalValidationError("CHART_CANONICAL_NUMBER_NON_FINITE")
        return value
    if hasattr(value, "model_dump"):
        return _json_value(value.model_dump(mode="json"))
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return [_json_value(item) for item in value]
    raise CanonicalValidationError("CHART_CANONICAL_VALUE_UNSUPPORTED")


def _stable_json(value: Any) -> str:
    if value is None or isinstance(value, (bool, str)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return _ecmascript_number_json(value)
    if isinstance(value, list):
        return f"[{','.join(_stable_json(item) for item in value)}]"
    if isinstance(value, Mapping):
        fields = (
            f"{json.dumps(str(key), ensure_ascii=False)}:{_stable_json(value[key])}"
            for key in sorted(value)
        )
        return f"{{{','.join(fields)}}}"
    raise CanonicalValidationError("CHART_CANONICAL_VALUE_UNSUPPORTED")


def _ecmascript_number_json(value: float) -> str:
    if not math.isfinite(value):
        raise CanonicalValidationError("CHART_CANONICAL_NUMBER_NON_FINITE")
    if value == 0:
        return "0"

    source = repr(value).lower()
    absolute = abs(value)
    if 1e-6 <= absolute < 1e21:
        fixed = format(Decimal(source), "f")
        if "." in fixed:
            fixed = fixed.rstrip("0").rstrip(".")
        return fixed

    if "e" not in source:
        source = format(value, ".17e")
    coefficient, exponent_text = source.split("e")
    coefficient = coefficient.rstrip("0").rstrip(".")
    exponent = int(exponent_text)
    exponent_sign = "+" if exponent >= 0 else ""
    return f"{coefficient}e{exponent_sign}{exponent}"
