import copy

import pytest
from fastapi.testclient import TestClient

from chart_engine.canonical_validation import (
    CanonicalValidationError,
    reproducibility_fingerprint_for_result,
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
