from fastapi.testclient import TestClient

from chart_engine.main import app


def _transit_payload():
    return {
        "schemaVersion": "chart-request.v1",
        "method": "transit",
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
        "transitSnapshot": {
            "date": "2026-07-22",
            "time": "14:30",
            "timezone": "Europe/Rome",
            "latitude": 41.9028,
            "longitude": 12.4964,
        },
    }


def test_transit_returns_canonical_dual_wheel_shape():
    client = TestClient(app)
    payload = _transit_payload()

    response = client.post("/v1/transits", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == "chart-result.v1"
    assert data["method"] == "transit"
    assert data["provider"]["name"] == "kerykeion"
    assert data["settings"] == payload["settings"]
    assert data["inputSnapshot"] == payload["inputSnapshot"]
    assert data["transitSnapshot"] == payload["transitSnapshot"]
    natal_point_ids = {point["id"] for point in data["result"]["natal"]["points"]}
    transit_point_ids = {point["id"] for point in data["result"]["transit"]["points"]}
    assert {"sun", "moon", "ascendant", "midheaven", "north_node", "south_node"}.issubset(
        natal_point_ids
    )
    assert {"sun", "moon", "jupiter", "saturn", "north_node"}.issubset(transit_point_ids)
    assert len(data["result"]["natal"]["houses"]) == 12
    assert len(data["result"]["transit"]["houses"]) == 12
    assert data["result"]["aspectsToNatal"]
    assert all("transitPoint" in aspect and "natalPoint" in aspect for aspect in data["result"]["aspectsToNatal"])
