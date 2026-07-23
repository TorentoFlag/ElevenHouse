from fastapi.testclient import TestClient

from chart_engine.main import app


def _composite_payload():
    return {
        "schemaVersion": "chart-request.v1",
        "method": "composite",
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
        "relationshipSnapshot": {
            "primaryClientId": "00000000-0000-4000-8000-000000000001",
            "partnerClientId": "00000000-0000-4000-8000-000000000002",
        },
    }


def test_composite_returns_canonical_single_wheel_relationship_shape():
    client = TestClient(app)
    payload = _composite_payload()

    response = client.post("/v1/composite", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == "chart-result.v1"
    assert data["method"] == "composite"
    assert data["provider"]["name"] == "kerykeion"
    assert data["settings"] == payload["settings"]
    assert data["inputSnapshot"] == payload["inputSnapshot"]
    assert data["partnerInputSnapshot"] == payload["partnerInputSnapshot"]
    assert data["relationshipSnapshot"] == payload["relationshipSnapshot"]
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
