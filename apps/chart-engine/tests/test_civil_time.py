from fastapi.testclient import TestClient
import pytest

from chart_engine.civil_time import inspect_civil_time, resolve_civil_time
from chart_engine.main import app
from test_request_validation import request_payload


def test_inspects_berlin_fold_as_two_ordered_instants() -> None:
    resolution = inspect_civil_time("2024-10-27", "02:30", "Europe/Berlin")

    assert resolution.kind == "ambiguous"
    assert resolution.first_instant == "2024-10-27T00:30:00+00:00"
    assert resolution.second_instant == "2024-10-27T01:30:00+00:00"


def test_resolves_first_and_second_fold_occurrences_distinctly() -> None:
    first = resolve_civil_time("2024-10-27", "02:30", "Europe/Berlin", "first")
    second = resolve_civil_time("2024-10-27", "02:30", "Europe/Berlin", "second")

    assert first.instant == "2024-10-27T00:30:00+00:00"
    assert second.instant == "2024-10-27T01:30:00+00:00"


def test_fold_requests_produce_distinct_valid_results() -> None:
    client = TestClient(app)
    first = request_payload("natal")
    second = request_payload("natal")
    for payload, occurrence in ((first, "first"), (second, "second")):
        payload["inputSnapshot"].update(
            birthDate="2024-10-27",
            birthTime="02:30",
            timezone="Europe/Berlin",
            dstOccurrence=occurrence,
        )

    first_response = client.post("/v1/natal", json=first)
    second_response = client.post("/v1/natal", json=second)

    assert first_response.status_code == 200, first_response.text
    assert second_response.status_code == 200, second_response.text
    first_sun = next(point for point in first_response.json()["result"]["points"] if point["id"] == "sun")
    second_sun = next(point for point in second_response.json()["result"]["points"] if point["id"] == "sun")
    assert first_sun["longitude"] != second_sun["longitude"]
    assert first_response.json()["reproducibilityFingerprint"] != second_response.json()[
        "reproducibilityFingerprint"
    ]


def test_fold_requires_an_occurrence() -> None:
    client = TestClient(app)
    payload = request_payload("natal")
    payload["inputSnapshot"].update(
        birthDate="2024-10-27",
        birthTime="02:30",
        timezone="Europe/Berlin",
    )

    response = client.post("/v1/natal", json=payload)

    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "value_error"


def test_spring_gap_returns_typed_422_instead_of_500() -> None:
    client = TestClient(app, raise_server_exceptions=False)
    payload = request_payload("natal")
    payload["inputSnapshot"].update(
        birthDate="2024-03-31",
        birthTime="02:30",
        timezone="Europe/Berlin",
    )

    response = client.post("/v1/natal", json=payload)

    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "value_error"


@pytest.mark.parametrize(
    ("method", "route", "snapshot_key"),
    [
        ("transit", "/v1/transits", "transitSnapshot"),
        ("horary", "/v1/horary", "questionSnapshot"),
    ],
)
def test_transit_and_horary_fold_require_an_explicit_occurrence(
    method: str,
    route: str,
    snapshot_key: str,
) -> None:
    client = TestClient(app)
    payload = request_payload(method)
    payload[snapshot_key].update(
        date="2024-10-27",
        time="02:30",
        timezone="Europe/Berlin",
    )

    response = client.post(route, json=payload)

    assert response.status_code == 422
    assert any(
        "CHART_CIVIL_TIME_OCCURRENCE_REQUIRED" in issue["msg"]
        for issue in response.json()["detail"]
    )


@pytest.mark.parametrize(
    ("method", "route", "snapshot_key", "result_path"),
    [
        ("transit", "/v1/transits", "transitSnapshot", ("result", "transit", "points")),
        ("horary", "/v1/horary", "questionSnapshot", ("result", "points")),
    ],
)
def test_transit_and_horary_fold_occurrences_produce_distinct_persisted_results(
    method: str,
    route: str,
    snapshot_key: str,
    result_path: tuple[str, ...],
) -> None:
    client = TestClient(app)
    responses = []
    for occurrence in ("first", "second"):
        payload = request_payload(method)
        payload[snapshot_key].update(
            date="2024-10-27",
            time="02:30",
            timezone="Europe/Berlin",
            dstOccurrence=occurrence,
        )
        response = client.post(route, json=payload)
        assert response.status_code == 200, response.text
        responses.append(response.json())

    first, second = responses
    assert first[snapshot_key]["dstOccurrence"] == "first"
    assert second[snapshot_key]["dstOccurrence"] == "second"
    assert first["reproducibilityFingerprint"] != second["reproducibilityFingerprint"]

    first_points = first
    second_points = second
    for key in result_path:
        first_points = first_points[key]
        second_points = second_points[key]
    first_sun = next(point for point in first_points if point["id"] == "sun")
    second_sun = next(point for point in second_points if point["id"] == "sun")
    assert first_sun["longitude"] != second_sun["longitude"]


@pytest.mark.parametrize(
    ("method", "route", "snapshot_key"),
    [
        ("transit", "/v1/transits", "transitSnapshot"),
        ("horary", "/v1/horary", "questionSnapshot"),
    ],
)
def test_transit_and_horary_spring_gap_rejects_even_with_an_occurrence(
    method: str,
    route: str,
    snapshot_key: str,
) -> None:
    client = TestClient(app, raise_server_exceptions=False)
    payload = request_payload(method)
    payload[snapshot_key].update(
        date="2024-03-31",
        time="02:30",
        timezone="Europe/Berlin",
        dstOccurrence="first",
    )

    response = client.post(route, json=payload)

    assert response.status_code == 422
    assert any(
        "CHART_CIVIL_TIME_NONEXISTENT" in issue["msg"] for issue in response.json()["detail"]
    )


@pytest.mark.parametrize(
    ("method", "route", "snapshot_key"),
    [
        ("transit", "/v1/transits", "transitSnapshot"),
        ("horary", "/v1/horary", "questionSnapshot"),
    ],
)
def test_irrelevant_transit_and_horary_occurrence_is_normalized_out(
    method: str,
    route: str,
    snapshot_key: str,
) -> None:
    client = TestClient(app)
    payload = request_payload(method)
    payload[snapshot_key]["dstOccurrence"] = "second"

    response = client.post(route, json=payload)

    assert response.status_code == 200, response.text
    assert "dstOccurrence" not in response.json()[snapshot_key]
