from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from chart_engine.main import app
from test_natal_contract import _natal_payload


# Golden-fixture provenance (audited 2026-08-03): every literal below was
# derived outside the production adapter with PySwissEph 2.10.3.2 primitives:
# ZoneInfo-resolved UTC instant -> swe.julday -> swe.calc_ut with
# FLG_SWIEPH|FLG_SPEED. The runtime returned FLG_MOSEPH|FLG_SPEED, so these are
# Moshier fixtures and do not assert Swiss data-file or license authority.
NATAL_FIXTURES = {
    "rome_northern": {
        "input": {
            "birthDate": "1990-07-15",
            "birthTime": "10:30",
            "timezone": "Europe/Rome",
            "latitude": 41.9028,
            "longitude": 12.4964,
            "birthTimePrecision": "exact",
        },
        "sun": 112.607047591819,
        "moon": 21.212179975039,
    },
    "johannesburg_southern": {
        "input": {
            "birthDate": "1985-02-17",
            "birthTime": "06:45",
            "timezone": "Africa/Johannesburg",
            "latitude": -33.9249,
            "longitude": 18.4241,
            "birthTimePrecision": "exact",
        },
        "sun": 328.470451105643,
        "moon": 298.472482362236,
    },
    "berlin_fold_first": {
        "input": {
            "birthDate": "2024-10-27",
            "birthTime": "02:30",
            "timezone": "Europe/Berlin",
            "latitude": 52.52,
            "longitude": 13.405,
            "birthTimePrecision": "exact",
            "dstOccurrence": "first",
        },
        "sun": 214.080240034954,
        "moon": 154.351320286759,
    },
    "berlin_fold_second": {
        "input": {
            "birthDate": "2024-10-27",
            "birthTime": "02:30",
            "timezone": "Europe/Berlin",
            "latitude": 52.52,
            "longitude": 13.405,
            "birthTimePrecision": "exact",
            "dstOccurrence": "second",
        },
        "sun": 214.121819441818,
        "moon": 154.849459429974,
    },
}


@pytest.mark.parametrize("fixture_name", NATAL_FIXTURES)
def test_natal_numeric_fixtures_cover_hemispheres_and_dst_fold(fixture_name: str):
    client = TestClient(app)
    fixture = NATAL_FIXTURES[fixture_name]
    payload = deepcopy(_natal_payload())
    payload["inputSnapshot"] = fixture["input"]

    response = client.post("/v1/natal", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["provider"]["ephemeris"] == "moshier"
    assert _point_longitude(data, "sun") == pytest.approx(fixture["sun"], abs=0.000001)
    assert _point_longitude(data, "moon") == pytest.approx(fixture["moon"], abs=0.000001)


def test_dst_fold_occurrences_are_distinct_provider_instants():
    client = TestClient(app)
    results = []
    for fixture_name in ("berlin_fold_first", "berlin_fold_second"):
        payload = deepcopy(_natal_payload())
        payload["inputSnapshot"] = NATAL_FIXTURES[fixture_name]["input"]
        response = client.post("/v1/natal", json=payload)
        assert response.status_code == 200
        results.append(response.json())

    assert _point_longitude(results[0], "moon") != _point_longitude(results[1], "moon")
    assert results[0]["reproducibilityFingerprint"] != results[1]["reproducibilityFingerprint"]


@pytest.mark.parametrize(
    ("latitude", "ascendant", "midheaven", "second_house"),
    [
        (33.9249, 118.812658944095, 17.849702762454, 140.777382813557),
        (-33.9249, 89.547600857705, 17.849702762454, 125.193292506516),
    ],
)
def test_mirrored_latitudes_use_independent_house_geometry_fixtures(
    latitude: float,
    ascendant: float,
    midheaven: float,
    second_house: float,
):
    # Provenance: direct swe.houses_ex at 2026-03-20T12:00:00Z,
    # longitude 18.4241, Placidus. Same instant/longitude isolates latitude.
    payload = deepcopy(_natal_payload())
    payload["inputSnapshot"] = {
        "birthDate": "2026-03-20",
        "birthTime": "12:00",
        "timezone": "UTC",
        "latitude": latitude,
        "longitude": 18.4241,
        "birthTimePrecision": "exact",
    }

    response = TestClient(app).post("/v1/natal", json=payload)

    assert response.status_code == 200
    result = response.json()["result"]
    assert _point_longitude({"result": result}, "ascendant") == pytest.approx(
        ascendant,
        abs=0.000001,
    )
    assert _point_longitude({"result": result}, "midheaven") == pytest.approx(
        midheaven,
        abs=0.000001,
    )
    assert _house_longitude(result, 2) == pytest.approx(second_house, abs=0.000001)


def _point_longitude(payload: dict, point_id: str) -> float:
    return next(
        point["longitude"] for point in payload["result"]["points"] if point["id"] == point_id
    )


def _house_longitude(result: dict, house_number: int) -> float:
    return next(
        house["longitude"] for house in result["houses"] if house["number"] == house_number
    )
