import copy

import pytest
from fastapi.testclient import TestClient

from chart_engine.canonical_validation import (
    CanonicalValidationError,
    build_reproducibility_fingerprint,
    reproducibility_fingerprint_for_result,
    validate_calculation_result,
    validate_chart_render_result,
)
from chart_engine.main import app
from chart_engine.schemas import StoredChartCalculationPayload
from test_request_validation import request_payload


CALCULATION_ROUTES = {
    "natal": "/v1/natal",
    "astrocartography": "/v1/astrocartography",
    "transit": "/v1/transits",
    "synastry": "/v1/synastry",
    "composite": "/v1/composite",
    "solar_return": "/v1/solar-return",
    "progression": "/v1/progressions",
    "horary": "/v1/horary",
}


@pytest.mark.parametrize(("method", "route"), CALCULATION_ROUTES.items())
def test_every_calculation_route_rejects_chart_request_v1(method: str, route: str) -> None:
    client = TestClient(app)
    payload = request_payload(method)
    payload["schemaVersion"] = "chart-request.v1"

    response = client.post(route, json=payload)

    assert response.status_code == 422
    assert any(issue["loc"][-1] == "schemaVersion" for issue in response.json()["detail"])


def test_natal_result_is_v2_with_verified_actual_metadata_fingerprint() -> None:
    client = TestClient(app)

    response = client.post("/v1/natal", json=request_payload("natal"))

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["schemaVersion"] == "chart-result.v2"
    assert payload["methodVersion"] == "chart.natal.kerykeion-5.12.v2"
    assert payload["provider"] == {
        "name": "kerykeion",
        "version": "5.12.9",
        "ephemeris": "moshier",
        "pyswissephVersion": "2.10.3.2",
        "ephemerisFlags": ["moshier", "speed"],
        "ephemerisDataRevision": None,
    }
    assert payload["reproducibilityFingerprint"] == reproducibility_fingerprint_for_result(
        payload
    )
    parsed_payload = StoredChartCalculationPayload.model_validate(payload)
    assert payload["reproducibilityFingerprint"] == reproducibility_fingerprint_for_result(
        parsed_payload
    )


def test_chart_fingerprint_uses_ecmascript_number_serialization_vector() -> None:
    assert build_reproducibility_fingerprint(
        method="natal",
        method_version="chart.natal.kerykeion-5.12.v2",
        provider={
            "name": "kerykeion",
            "version": "5.12.9",
            "ephemeris": "moshier",
            "pyswissephVersion": "2.10.3.2",
            "ephemerisFlags": ["moshier", "speed"],
            "ephemerisDataRevision": None,
        },
        settings={},
        input_snapshot={"numbers": [-0.0, 1e-7, 1e-6, 1e21, 1e20]},
    ) == "sha256:9abc50e10859afdbbc124daadcaa2b291bf0cbb451d89f1cdabe01794033c076"


def test_small_coordinate_python_result_matches_typescript_fingerprint_vector() -> None:
    request = request_payload("natal")
    request["inputSnapshot"]["latitude"] = 1e-7
    request["inputSnapshot"]["longitude"] = -0.0

    response = TestClient(app).post("/v1/natal", json=request)

    assert response.status_code == 200
    assert response.json()["reproducibilityFingerprint"] == (
        "sha256:633a49a4add9689ec0365a8bd6f4f5eb213bf2a126c7cdf088ad56f326af47ba"
    )


def canonical_render_result() -> dict:
    point_ids = [
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
    ]
    return {
        "points": [
            {
                "id": point_id,
                "label": point_id,
                "longitude": float(index),
                "sign": "aries",
                "signDegree": float(index),
            }
            for index, point_id in enumerate(point_ids)
        ],
        "houses": [
            {
                "number": number,
                "longitude": float(number),
                "sign": "aries",
                "signDegree": float(number),
            }
            for number in range(1, 13)
        ],
        "aspects": [
            {
                "pointA": "sun",
                "pointB": "moon",
                "type": "trine",
                "angle": 120.0,
                "orb": 0.5,
            }
        ],
        "distributions": {
            "elements": {"fire": 3, "earth": 3, "air": 2, "water": 2},
            "modalities": {"cardinal": 4, "fixed": 3, "mutable": 3},
            "polarity": {"masculine": 5, "feminine": 5},
        },
        "warnings": [],
    }


@pytest.mark.parametrize("mutation", ["duplicate", "self", "unknown"])
def test_canonical_validation_rejects_invalid_aspect_relations(mutation: str) -> None:
    result = canonical_render_result()
    if mutation == "duplicate":
        result["aspects"].append(copy.deepcopy(result["aspects"][0]))
    elif mutation == "self":
        result["aspects"][0]["pointB"] = "sun"
    else:
        result["aspects"][0]["pointB"] = "unknown"

    with pytest.raises(CanonicalValidationError):
        validate_chart_render_result(result)


def test_canonical_validation_rejects_same_point_pair_with_different_type() -> None:
    result = canonical_render_result()
    duplicate_pair = copy.deepcopy(result["aspects"][0])
    duplicate_pair["type"] = "square"
    result["aspects"].append(duplicate_pair)

    with pytest.raises(CanonicalValidationError, match="DUPLICATE"):
        validate_chart_render_result(result)


@pytest.mark.parametrize(
    ("dimension", "counts"),
    [
        ("elements", {"fire": 10}),
        ("modalities", {"cardinal": 10, "fixed": 0, "mutable": 0, "extra": 0}),
        ("polarity", {"masculine": 11, "feminine": -1}),
        ("elements", {"fire": 2.1, "earth": 2.1, "air": 3.1, "water": 3.1}),
        ("polarity", {"masculine": True, "feminine": 9}),
    ],
)
def test_canonical_validation_requires_exact_non_negative_integer_distributions(
    dimension: str,
    counts: dict,
) -> None:
    result = canonical_render_result()
    result["distributions"][dimension] = counts

    with pytest.raises(CanonicalValidationError):
        validate_chart_render_result(result)


def _cross_wheel_payload(method: str) -> dict:
    natal = canonical_render_result()
    secondary = canonical_render_result()
    if method == "transit":
        return {
            "method": method,
            "result": {
                "natal": natal,
                "transit": secondary,
                "aspectsToNatal": [
                    {
                        "transitPoint": "sun",
                        "natalPoint": "moon",
                        "type": "trine",
                    }
                ],
            },
        }
    if method == "solar_return":
        return {
            "method": method,
            "result": {
                "natal": natal,
                "solarReturn": secondary,
                "aspectsToNatal": [
                    {
                        "solarReturnPoint": "sun",
                        "natalPoint": "moon",
                        "type": "trine",
                    }
                ],
            },
        }
    if method == "progression":
        return {
            "method": method,
            "result": {
                "natal": natal,
                "progressed": secondary,
                "aspectsToNatal": [
                    {
                        "progressedPoint": "sun",
                        "natalPoint": "moon",
                        "type": "trine",
                    }
                ],
            },
        }
    return {
        "method": "synastry",
        "result": {
            "primary": natal,
            "partner": secondary,
            "aspectsBetween": [
                {
                    "primaryPoint": "sun",
                    "partnerPoint": "moon",
                    "type": "trine",
                }
            ],
            "houseOverlays": [
                {
                    "owner": "primary",
                    "point": "sun",
                    "projectedHouseOwner": "partner",
                    "projectedHouse": 3,
                }
            ],
        },
    }


@pytest.mark.parametrize(
    ("method", "left_field"),
    [
        ("transit", "transitPoint"),
        ("solar_return", "solarReturnPoint"),
        ("progression", "progressedPoint"),
        ("synastry", "primaryPoint"),
    ],
)
def test_cross_wheel_validation_rejects_unknown_references(
    method: str,
    left_field: str,
) -> None:
    payload = _cross_wheel_payload(method)
    aspect_field = "aspectsBetween" if method == "synastry" else "aspectsToNatal"
    payload["result"][aspect_field][0][left_field] = "unknown"

    with pytest.raises(CanonicalValidationError, match="UNKNOWN_REFERENCE"):
        validate_calculation_result(payload)


@pytest.mark.parametrize("method", ["transit", "solar_return", "progression", "synastry"])
def test_cross_wheel_validation_rejects_duplicate_relations(method: str) -> None:
    payload = _cross_wheel_payload(method)
    aspect_field = "aspectsBetween" if method == "synastry" else "aspectsToNatal"
    duplicate_pair = copy.deepcopy(payload["result"][aspect_field][0])
    duplicate_pair["type"] = "opposition"
    payload["result"][aspect_field].append(duplicate_pair)

    with pytest.raises(CanonicalValidationError, match="DUPLICATE"):
        validate_calculation_result(payload)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda overlay: overlay.update(projectedHouseOwner="primary"),
        lambda overlay: overlay.update(point="unknown"),
    ],
)
def test_synastry_overlay_rejects_same_owner_and_unknown_point(mutation) -> None:
    payload = _cross_wheel_payload("synastry")
    mutation(payload["result"]["houseOverlays"][0])

    with pytest.raises(CanonicalValidationError):
        validate_calculation_result(payload)


def test_synastry_overlay_rejects_duplicate_projection() -> None:
    payload = _cross_wheel_payload("synastry")
    payload["result"]["houseOverlays"].append(
        copy.deepcopy(payload["result"]["houseOverlays"][0])
    )

    with pytest.raises(CanonicalValidationError, match="DUPLICATE"):
        validate_calculation_result(payload)


def test_synastry_overlay_rejects_conflicting_projected_houses() -> None:
    payload = _cross_wheel_payload("synastry")
    conflicting_projection = copy.deepcopy(payload["result"]["houseOverlays"][0])
    conflicting_projection["projectedHouse"] = 4
    payload["result"]["houseOverlays"].append(conflicting_projection)

    with pytest.raises(CanonicalValidationError, match="DUPLICATE"):
        validate_calculation_result(payload)
