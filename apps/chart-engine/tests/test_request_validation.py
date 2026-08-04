import json

import pytest
from fastapi.testclient import TestClient

from chart_engine.main import app


METHOD_VERSIONS = {
    "natal": "chart.natal.kerykeion-5.12.v2",
    "astrocartography": "chart.astrocartography.swisseph.v2",
    "transit": "chart.transit.kerykeion-5.12.v2",
    "synastry": "chart.synastry.kerykeion-5.12.v2",
    "composite": "chart.composite.kerykeion-5.12.v2",
    "solar_return": "chart.solar-return.kerykeion-5.12.v2",
    "progression": "chart.progression.secondary-tropical-year.v2",
    "horary": "chart.horary.kerykeion-5.12.v2",
}


def execution_profile() -> dict:
    return {
        "provider": "kerykeion",
        "kerykeionVersion": "5.12.9",
        "pyswissephVersion": "2.10.3.2",
        "expectedEphemeris": "moshier",
        "expectedEphemerisFlags": ["FLG_MOSEPH", "FLG_SPEED"],
        "expectedEphemerisDataRevision": None,
    }


def settings() -> dict:
    return {
        "zodiac": "tropical",
        "houseSystem": "placidus",
        "nodeType": "true",
        "aspectPreset": "major",
        "orbMultiplier": 1.0,
    }


def birth_snapshot(**overrides) -> dict:
    value = {
        "birthDate": "1990-07-15",
        "birthTime": "10:30",
        "timezone": "Europe/Berlin",
        "latitude": 52.52,
        "longitude": 13.405,
        "birthTimePrecision": "exact",
    }
    value.update(overrides)
    return value


def request_payload(method: str) -> dict:
    payload = {
        "schemaVersion": "chart-request.v2",
        "method": method,
        "methodVersion": METHOD_VERSIONS[method],
        "executionProfile": execution_profile(),
        "settings": settings(),
    }
    if method == "horary":
        payload["questionSnapshot"] = {
            "question": "Will the contract be signed?",
            "category": "career",
            "date": "2026-08-03",
            "time": "12:00",
            "timezone": "Europe/Berlin",
            "latitude": 52.52,
            "longitude": 13.405,
        }
        return payload

    payload["inputSnapshot"] = birth_snapshot()
    if method == "transit":
        payload["transitSnapshot"] = {
            "date": "2026-08-03",
            "time": "12:00",
            "timezone": "Europe/Berlin",
            "latitude": 52.52,
            "longitude": 13.405,
        }
    elif method in {"synastry", "composite"}:
        payload["partnerInputSnapshot"] = birth_snapshot(
            birthDate="1992-04-03", birthTime="08:15"
        )
    elif method == "solar_return":
        payload["solarReturnSnapshot"] = {
            "year": 2026,
            "returnType": "solar",
            "location": {
                "timezone": "Europe/Berlin",
                "latitude": 52.52,
                "longitude": 13.405,
            },
        }
    elif method == "progression":
        payload["progressionSnapshot"] = {
            "targetDate": "2026-08-03",
            "progressionType": "secondary",
        }
    return payload


def assert_typed_422(response) -> None:
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, list)
    assert detail
    assert all(isinstance(issue.get("type"), str) for issue in detail)


def test_rejects_unknown_top_level_and_nested_fields() -> None:
    client = TestClient(app)
    top_level = request_payload("natal")
    top_level["unexpected"] = True
    nested = request_payload("natal")
    nested["inputSnapshot"]["unexpected"] = True

    top_response = client.post("/v1/natal", json=top_level)
    nested_response = client.post("/v1/natal", json=nested)

    assert_typed_422(top_response)
    assert_typed_422(nested_response)
    assert any(issue["type"] == "extra_forbidden" for issue in top_response.json()["detail"])
    assert any(issue["type"] == "extra_forbidden" for issue in nested_response.json()["detail"])


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("birthDate", "2024-02-30"),
        ("birthTime", "24:00"),
        ("timezone", "Not/AZone"),
    ],
)
def test_rejects_invalid_civil_fields(field: str, value: str) -> None:
    client = TestClient(app)
    payload = request_payload("natal")
    payload["inputSnapshot"][field] = value

    assert_typed_422(client.post("/v1/natal", json=payload))


@pytest.mark.parametrize("birth_date", ["1799-12-31", "2400-01-01"])
def test_rejects_birth_dates_outside_packaged_ephemeris_range(birth_date: str) -> None:
    client = TestClient(app)
    payload = request_payload("natal")
    payload["inputSnapshot"]["birthDate"] = birth_date

    response = client.post("/v1/natal", json=payload)

    assert_typed_422(response)
    assert any("CHART_EPHEMERIS_DATE_UNSUPPORTED" in issue["msg"] for issue in response.json()["detail"])


@pytest.mark.parametrize(
    ("method", "route", "date_field"),
    [
        ("transit", "/v1/transits", ("transitSnapshot", "date")),
        ("progression", "/v1/progressions", ("progressionSnapshot", "targetDate")),
        ("horary", "/v1/horary", ("questionSnapshot", "date")),
    ],
)
def test_rejects_target_dates_outside_packaged_ephemeris_range(
    method: str,
    route: str,
    date_field: tuple[str, str],
) -> None:
    client = TestClient(app)
    payload = request_payload(method)
    parent, field = date_field
    payload[parent][field] = "2400-01-01"

    response = client.post(route, json=payload)

    assert_typed_422(response)
    assert any("CHART_EPHEMERIS_DATE_UNSUPPORTED" in issue["msg"] for issue in response.json()["detail"])


@pytest.mark.parametrize("coordinate", [float("nan"), float("inf"), float("-inf")])
def test_rejects_non_finite_coordinates(coordinate: float) -> None:
    client = TestClient(app)
    payload = request_payload("natal")
    payload["inputSnapshot"]["latitude"] = coordinate

    response = client.post(
        "/v1/natal",
        content=json.dumps(payload),
        headers={"content-type": "application/json"},
    )

    assert_typed_422(response)


@pytest.mark.parametrize(
    ("method", "route"),
    [("synastry", "/v1/synastry"), ("composite", "/v1/composite")],
)
def test_rejects_relationship_identity_as_unknown_provider_input(
    method: str, route: str
) -> None:
    client = TestClient(app)
    payload = request_payload(method)
    payload["relationshipSnapshot"] = {
        "primaryClientId": "11111111-1111-4111-8111-111111111111",
        "partnerClientId": "22222222-2222-4222-8222-222222222222",
    }

    response = client.post(route, json=payload)

    assert_typed_422(response)
    assert any(
        issue["type"] == "extra_forbidden"
        and issue["loc"][-1] == "relationshipSnapshot"
        for issue in response.json()["detail"]
    )


@pytest.mark.parametrize(
    ("method", "route", "mutate"),
    [
        (
            "progression",
            "/v1/progressions",
            lambda payload: payload["progressionSnapshot"].update(targetDate="1989-01-01"),
        ),
        (
            "solar_return",
            "/v1/solar-return",
            lambda payload: payload["solarReturnSnapshot"].update(year=1989),
        ),
    ],
)
def test_rejects_pre_birth_calculations(method: str, route: str, mutate) -> None:
    client = TestClient(app)
    payload = request_payload(method)
    mutate(payload)

    assert_typed_422(client.post(route, json=payload))


@pytest.mark.parametrize("latitude", [-66.000001, 66.000001])
def test_rejects_placidus_latitude_beyond_provider_boundary(latitude: float) -> None:
    client = TestClient(app)
    payload = request_payload("natal")
    payload["inputSnapshot"]["latitude"] = latitude

    assert_typed_422(client.post("/v1/natal", json=payload))


@pytest.mark.parametrize("latitude", [-66.0, 66.0])
def test_accepts_exact_placidus_latitude_boundary(latitude: float) -> None:
    client = TestClient(app)
    payload = request_payload("natal")
    payload["inputSnapshot"]["latitude"] = latitude

    response = client.post("/v1/natal", json=payload)

    assert response.status_code == 200, response.text


def test_model_level_validation_response_does_not_echo_sensitive_input_or_context() -> None:
    client = TestClient(app)
    sensitive_marker = "PRIVATE-QUESTION-DO-NOT-ECHO"
    payload = request_payload("horary")
    payload["questionSnapshot"]["question"] = sensitive_marker
    payload["questionSnapshot"]["latitude"] = 70.0

    response = client.post("/v1/horary", json=payload)

    assert_typed_422(response)
    assert sensitive_marker not in response.text
    for issue in response.json()["detail"]:
        assert set(issue) == {"type", "loc", "msg"}
        assert "input" not in issue
        assert "ctx" not in issue
