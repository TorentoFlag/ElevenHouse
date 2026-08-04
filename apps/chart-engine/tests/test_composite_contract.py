import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from chart_engine.main import app
from chart_engine.schemas import StoredChartCompositeCalculationPayload
from test_request_validation import execution_profile


def _composite_payload():
    return {
        "schemaVersion": "chart-request.v2",
        "method": "composite",
        "methodVersion": "chart.composite.kerykeion-5.12.v2",
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
            "birthTimePrecision": "exact",
        },
        "partnerInputSnapshot": {
            "birthDate": "1992-08-11",
            "birthTime": "22:15",
            "timezone": "Europe/Moscow",
            "latitude": 55.7558,
            "longitude": 37.6173,
            "birthTimePrecision": "approximate",
        },
    }


def test_composite_returns_canonical_single_wheel_relationship_shape():
    client = TestClient(app)
    payload = _composite_payload()

    response = client.post("/v1/composite", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == "chart-result.v2"
    assert data["method"] == "composite"
    assert data["provider"]["name"] == "kerykeion"
    assert data["settings"] == payload["settings"]
    assert data["inputSnapshot"] == payload["inputSnapshot"]
    assert data["partnerInputSnapshot"] == payload["partnerInputSnapshot"]
    assert "relationshipSnapshot" not in data
    assert "ClientId" not in response.text
    assert "00000000-0000-4000-8000-000000000001" not in response.text
    with pytest.raises(ValidationError):
        StoredChartCompositeCalculationPayload.model_validate(
            {
                **data,
                "relationshipSnapshot": {
                    "primaryClientId": "00000000-0000-4000-8000-000000000001",
                    "partnerClientId": "00000000-0000-4000-8000-000000000002",
                },
            }
        )
    assert "primary" not in data["result"]
    assert "partner" not in data["result"]
    point_ids = {point["id"] for point in data["result"]["points"]}
    assert {"sun", "moon", "ascendant", "midheaven", "north_node", "south_node"}.issubset(
        point_ids
    )
    assert len(data["result"]["houses"]) == 12
    assert data["result"]["aspects"]
    assert data["result"]["distributions"]["elements"]
    assert data["result"]["warnings"] == [
        {
            "code": "PARTNER_BIRTH_TIME_APPROXIMATE",
            "message": "Composite calculated with approximate partner birth time.",
        }
    ]
    # Provenance: independent circular means of each participant's direct
    # PySwissEph 2.10.3.2 natal longitude, not CompositeSubjectFactory output.
    assert _point_longitude(data, "sun") == pytest.approx(125.956780305997, abs=0.000001)
    assert _point_longitude(data, "moon") == pytest.approx(341.135964590878, abs=0.000001)


def _point_longitude(payload: dict, point_id: str) -> float:
    return next(
        point["longitude"] for point in payload["result"]["points"] if point["id"] == point_id
    )
