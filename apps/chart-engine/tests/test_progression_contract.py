from fastapi.testclient import TestClient

from chart_engine.main import app
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
