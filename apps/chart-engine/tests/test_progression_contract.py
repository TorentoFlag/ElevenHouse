import copy
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from chart_engine.canonical_validation import reproducibility_fingerprint_for_result
from chart_engine.main import app
from chart_engine.schemas import (
    ChartProgressionCalculationBasis,
    StoredChartProgressionCalculationPayload,
)
from test_request_validation import execution_profile


def _progression_payload():
    return {
        "schemaVersion": "chart-request.v2",
        "method": "progression",
        "methodVersion": "chart.progression.secondary-tropical-year.v2",
        "executionProfile": execution_profile(),
        "settings": {
            "houseSystem": "placidus",
            "nodeType": "true",
            "aspectPreset": "major",
            "orbMultiplier": 1,
        },
        "inputSnapshot": {
            "birthDate": "1990-07-15",
            "birthTime": "10:30",
            "timezone": "Europe/Rome",
            "latitude": 41.9028,
            "longitude": 12.4964,
            "birthTimePrecision": "exact",
        },
        "progressionSnapshot": {
            "targetDate": "2026-07-23",
            "progressionType": "secondary",
        },
    }


def test_progression_returns_canonical_dual_wheel_shape():
    client = TestClient(app)
    payload = _progression_payload()

    response = client.post("/v1/progressions", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["method"] == "progression"
    assert data["provider"]["name"] == "kerykeion"
    assert data["inputSnapshot"] == payload["inputSnapshot"]
    assert data["progressionSnapshot"]["targetDate"] == "2026-07-23"
    assert data["progressionSnapshot"]["progressionType"] == "secondary"
    assert data["progressionSnapshot"]["calculationBasis"]["symbolicDate"]
    assert data["progressionSnapshot"]["calculationBasis"]["dayForYearRatio"] == 1
    natal_point_ids = {point["id"] for point in data["result"]["natal"]["points"]}
    progressed_point_ids = {point["id"] for point in data["result"]["progressed"]["points"]}
    assert {"sun", "moon", "jupiter", "saturn", "north_node"}.issubset(natal_point_ids)
    assert {"sun", "moon", "jupiter", "saturn", "north_node"}.issubset(progressed_point_ids)
    assert len(data["result"]["natal"]["houses"]) == 12
    assert len(data["result"]["progressed"]["houses"]) == 12
    assert all(
        "progressedPoint" in aspect and "natalPoint" in aspect
        for aspect in data["result"]["aspectsToNatal"]
    )
    parsed = StoredChartProgressionCalculationPayload.model_validate(data)
    assert data["reproducibilityFingerprint"] == reproducibility_fingerprint_for_result(data)
    assert data["reproducibilityFingerprint"] == reproducibility_fingerprint_for_result(parsed)
    raw_symbolic_instant = datetime(1990, 7, 15, 8, 30, tzinfo=timezone.utc) + timedelta(
        days=data["calculationBasis"]["elapsedYears"]
    )
    provider_symbolic_instant = datetime.fromisoformat(
        data["calculationBasis"]["symbolicInstant"].replace("Z", "+00:00")
    )
    assert 0 <= (raw_symbolic_instant - provider_symbolic_instant).total_seconds() < 1


def test_progression_uses_continuous_tropical_year_numeric_fixtures():
    client = TestClient(app)
    # Provenance: independently derived with PySwissEph 2.10.3.2
    # swe.julday/calc_ut (returned Moshier + speed flags) from the resolved
    # 1990-07-15T08:30:00Z birth instant. The production progression helper is
    # deliberately not used to derive these literals.
    fixtures = {
        "2026-07-15": {
            "symbolicInstant": "1990-08-20T08:31:06Z",
            "elapsedLifeDays": 13149.0,
            "elapsedYears": 36.00076979058745,
            "moon": 144.907231165116,
            "mercury": 172.357756707311,
        },
        "2026-07-23": {
            "symbolicInstant": "1990-08-20T09:02:38Z",
            "elapsedLifeDays": 13157.0,
            "elapsedYears": 36.02267306523378,
            "moon": 145.204643018515,
            "mercury": 172.367463192164,
        },
        "2026-12-31": {
            "symbolicInstant": "1990-08-20T19:37:24Z",
            "elapsedLifeDays": 13318.0,
            "elapsedYears": 36.46347646749134,
            "moon": 151.164598952631,
            "mercury": 172.555219319654,
        },
    }
    symbolic_instants = []
    moon_longitudes = []
    mercury_longitudes = []
    fingerprints = []

    for target_date, expected in fixtures.items():
        payload = _progression_payload()
        payload["progressionSnapshot"]["targetDate"] = target_date

        response = client.post("/v1/progressions", json=payload)

        assert response.status_code == 200
        data = response.json()
        basis = data["calculationBasis"]
        assert basis == {
            "symbolicInstant": expected["symbolicInstant"],
            "elapsedLifeDays": expected["elapsedLifeDays"],
            "elapsedYears": expected["elapsedYears"],
            "yearLengthDays": 365.24219,
            "dayForYearRatio": 1,
        }
        moon_longitude = _point_longitude(data, "moon")
        mercury_longitude = _point_longitude(data, "mercury")
        assert moon_longitude == pytest.approx(expected["moon"], abs=0.000001)
        assert mercury_longitude == pytest.approx(expected["mercury"], abs=0.000001)
        symbolic_instants.append(
            datetime.fromisoformat(basis["symbolicInstant"].replace("Z", "+00:00"))
        )
        moon_longitudes.append(moon_longitude)
        mercury_longitudes.append(mercury_longitude)
        fingerprints.append(data["reproducibilityFingerprint"])

    assert symbolic_instants == sorted(symbolic_instants)
    assert len(set(moon_longitudes)) == len(fixtures)
    assert len(set(mercury_longitudes)) == len(fixtures)
    assert len(set(fingerprints)) == len(fixtures)


def test_progression_rejects_target_before_birth():
    client = TestClient(app)
    payload = _progression_payload()
    payload["progressionSnapshot"]["targetDate"] = "1989-07-15"

    response = client.post("/v1/progressions", json=payload)

    assert response.status_code == 422
    assert "CHART_PROGRESSION_PRE_BIRTH" in response.text


def test_progression_basis_rejects_inconsistent_elapsed_years():
    with pytest.raises(ValidationError, match="CHART_PROGRESSION_BASIS_INCONSISTENT"):
        ChartProgressionCalculationBasis(
            symbolicInstant="1990-08-20T09:02:38Z",
            elapsedLifeDays=13157,
            elapsedYears=36,
            yearLengthDays=365.24219,
            dayForYearRatio=1,
        )


@pytest.mark.parametrize(
    "mutation",
    [
        lambda payload: payload["calculationBasis"].update(
            elapsedLifeDays=13157.5,
            elapsedYears=13157.5 / 365.24219,
        ),
        lambda payload: payload["progressionSnapshot"].update(targetDate="2026-07-24"),
        lambda payload: payload["progressionSnapshot"]["calculationBasis"].update(
            symbolicDate="1990-08-21"
        ),
        lambda payload: payload["progressionSnapshot"]["calculationBasis"].update(ageDays=35),
        lambda payload: payload["calculationBasis"].update(
            symbolicInstant="1990-08-20T09:02:37Z"
        ),
    ],
)
def test_progression_result_rejects_cross_field_basis_drift(mutation):
    response = TestClient(app).post("/v1/progressions", json=_progression_payload())
    assert response.status_code == 200
    payload = copy.deepcopy(response.json())
    mutation(payload)

    with pytest.raises(ValidationError, match="CHART_PROGRESSION_BASIS_INCONSISTENT"):
        StoredChartProgressionCalculationPayload.model_validate(payload)


def _point_longitude(payload: dict, point_id: str) -> float:
    return next(
        point["longitude"]
        for point in payload["result"]["progressed"]["points"]
        if point["id"] == point_id
    )
