from fastapi.testclient import TestClient

from chart_engine.main import app


def _synastry_payload():
    return {
        "schemaVersion": "chart-request.v1",
        "method": "synastry",
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


def test_synastry_returns_canonical_dual_wheel_shape():
    client = TestClient(app)
    payload = _synastry_payload()

    response = client.post("/v1/synastry", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == "chart-result.v1"
    assert data["method"] == "synastry"
    assert data["provider"]["name"] == "kerykeion"
    assert data["settings"] == payload["settings"]
    assert data["inputSnapshot"] == payload["inputSnapshot"]
    assert data["partnerInputSnapshot"] == payload["partnerInputSnapshot"]
    assert data["relationshipSnapshot"] == payload["relationshipSnapshot"]
    primary_point_ids = {point["id"] for point in data["result"]["primary"]["points"]}
    partner_point_ids = {point["id"] for point in data["result"]["partner"]["points"]}
    assert {"sun", "moon", "ascendant", "midheaven", "north_node", "south_node"}.issubset(
        primary_point_ids
    )
    assert {"sun", "moon", "venus", "mars", "north_node", "south_node"}.issubset(
        partner_point_ids
    )
    assert len(data["result"]["primary"]["houses"]) == 12
    assert len(data["result"]["partner"]["houses"]) == 12
    assert data["result"]["aspectsBetween"]
    assert all(
        "primaryPoint" in aspect and "partnerPoint" in aspect
        for aspect in data["result"]["aspectsBetween"]
    )
    assert data["result"]["houseOverlays"]
    assert all(
        overlay["owner"] != overlay["projectedHouseOwner"]
        for overlay in data["result"]["houseOverlays"]
    )
    assert data["result"]["relationshipScore"]["value"] >= 0
    assert data["result"]["warnings"] == [
        {
            "code": "PARTNER_BIRTH_TIME_APPROXIMATE",
            "message": "Partner chart calculated with approximate birth time.",
        }
    ]
