import hashlib
import json
import math
from collections.abc import Mapping, Sequence
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

    seen_aspects: set[tuple[str, str, str]] = set()
    for aspect_value in _sequence(result.get("aspects")):
        aspect = _mapping(aspect_value)
        point_a = str(aspect.get("pointA"))
        point_b = str(aspect.get("pointB"))
        aspect_type = str(aspect.get("type"))
        if point_a not in point_ids or point_b not in point_ids:
            raise CanonicalValidationError("CHART_ASPECT_UNKNOWN_REFERENCE")
        if point_a == point_b:
            raise CanonicalValidationError("CHART_ASPECT_SELF_REFERENCE")
        pair = tuple(sorted((point_a, point_b)))
        key = (pair[0], pair[1], aspect_type)
        if key in seen_aspects:
            raise CanonicalValidationError("CHART_ASPECT_DUPLICATE")
        seen_aspects.add(key)

    distributions = _mapping(result.get("distributions"))
    for dimension in ("elements", "modalities", "polarity"):
        counts = _mapping(distributions.get(dimension))
        if sum(int(count) for count in counts.values()) != 10:
            raise CanonicalValidationError("CHART_DISTRIBUTION_TOTAL_INVALID")


def validate_calculation_result(payload: Any) -> None:
    value = _mapping(payload)
    method = value.get("method")
    result = _mapping(value.get("result"))
    if method in {"natal", "composite", "horary"}:
        validate_chart_render_result(result)
    elif method == "transit":
        validate_chart_render_result(result.get("natal"))
        validate_chart_render_result(result.get("transit"))
    elif method == "synastry":
        validate_chart_render_result(result.get("primary"))
        validate_chart_render_result(result.get("partner"))
    elif method == "solar_return":
        validate_chart_render_result(result.get("natal"))
        validate_chart_render_result(result.get("solarReturn"))
    elif method == "progression":
        validate_chart_render_result(result.get("natal"))
        validate_chart_render_result(result.get("progressed"))


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
            "relationshipSnapshot": value["relationshipSnapshot"],
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
        if not math.isfinite(value):
            raise CanonicalValidationError("CHART_CANONICAL_NUMBER_NON_FINITE")
        if value.is_integer():
            return str(int(value))
        return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    if isinstance(value, list):
        return f"[{','.join(_stable_json(item) for item in value)}]"
    if isinstance(value, Mapping):
        fields = (
            f"{json.dumps(str(key), ensure_ascii=False)}:{_stable_json(value[key])}"
            for key in sorted(value)
        )
        return f"{{{','.join(fields)}}}"
    raise CanonicalValidationError("CHART_CANONICAL_VALUE_UNSUPPORTED")
