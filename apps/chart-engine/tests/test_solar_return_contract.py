from fastapi.testclient import TestClient

from chart_engine.canonical_validation import reproducibility_fingerprint_for_result
from chart_engine.main import app
from chart_engine.schemas import StoredChartSolarReturnCalculationPayload
from test_request_validation import execution_profile


def _solar_return_payload():
    return {
        "schemaVersion": "chart-request.v2",
        "method": "solar_return",
        "methodVersion": "chart.solar-return.kerykeion-5.12.v2",
        "executionProfile": execution_profile(),
        "settings": {
            "zodiac": "tropical",
            "houseSystem": "placidus",
            "nodeType": "true",
            "aspectPreset": "major",
            "orbMultiplier": 1.0,
        },
        "inputSnapshot": {
            "birthDate": "1990-07-15",
            "birthTime": "10:30",
            "timezone": "Europe/Rome",
            "latitude": 41.9028,
            "longitude": 12.4964,
            "birthTimePrecision": "approximate",
        },
        "solarReturnSnapshot": {
            "year": 2026,
            "returnType": "solar",
            "location": {
                "timezone": "Europe/Rome",
                "latitude": 41.9028,
                "longitude": 12.4964,
            },
        },
    }


def test_solar_return_returns_canonical_dual_wheel_shape():
    client = TestClient(app)
    payload = _solar_return_payload()

    response = client.post("/v1/solar-return", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == "chart-result.v2"
    assert data["method"] == "solar_return"
    assert data["provider"]["name"] == "kerykeion"
    assert data["settings"] == payload["settings"]
    assert data["inputSnapshot"] == payload["inputSnapshot"]
    assert data["solarReturnSnapshot"]["year"] == 2026
    assert data["solarReturnSnapshot"]["returnType"] == "solar"
    assert data["solarReturnSnapshot"]["location"] == payload["solarReturnSnapshot"]["location"]
    assert data["solarReturnSnapshot"]["resolvedAt"].endswith("Z")
    natal_point_ids = {point["id"] for point in data["result"]["natal"]["points"]}
    solar_point_ids = {point["id"] for point in data["result"]["solarReturn"]["points"]}
    assert {"sun", "moon", "ascendant", "midheaven", "north_node", "south_node"}.issubset(
        natal_point_ids
    )
    assert {"sun", "moon", "jupiter", "saturn", "north_node"}.issubset(solar_point_ids)
    assert len(data["result"]["natal"]["houses"]) == 12
    assert len(data["result"]["solarReturn"]["houses"]) == 12
    assert data["result"]["aspectsToNatal"]
    assert all(
        "solarReturnPoint" in aspect and "natalPoint" in aspect
        for aspect in data["result"]["aspectsToNatal"]
    )
    assert data["result"]["warnings"] == [
        {
            "code": "BIRTH_TIME_APPROXIMATE",
            "message": "Chart calculated with approximate birth time.",
        }
    ]
    parsed = StoredChartSolarReturnCalculationPayload.model_validate(data)
    assert data["reproducibilityFingerprint"] == reproducibility_fingerprint_for_result(data)
    assert data["reproducibilityFingerprint"] == reproducibility_fingerprint_for_result(parsed)
