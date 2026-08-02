from fastapi.testclient import TestClient

from chart_engine.main import app
from test_request_validation import execution_profile


def _natal_payload():
    return {
        "schemaVersion": "chart-request.v2",
        "method": "natal",
        "methodVersion": "chart.natal.kerykeion-5.12.v2",
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
    }


def test_natal_returns_canonical_shape():
    client = TestClient(app)
    payload = _natal_payload()

    response = client.post("/v1/natal", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == "chart-result.v2"
    assert data["method"] == "natal"
    assert data["provider"]["name"] == "kerykeion"
    assert data["settings"] == payload["settings"]
    assert data["inputSnapshot"] == payload["inputSnapshot"]
    point_ids = {point["id"] for point in data["result"]["points"]}
    assert {
        "sun",
        "moon",
        "ascendant",
        "midheaven",
        "north_node",
        "south_node",
    }.issubset(point_ids)
    assert len(data["result"]["houses"]) == 12


def test_positions_returns_human_design_base_bodies():
    client = TestClient(app)
    payload = {
        "schemaVersion": "chart-positions-request.v1",
        "method": "planetary_positions",
        "settings": {"zodiac": "tropical", "nodeType": "true"},
        "inputSnapshot": _natal_payload()["inputSnapshot"],
    }

    response = client.post("/v1/positions", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == "chart-positions-result.v1"
    assert data["method"] == "planetary_positions"
    assert data["provider"]["name"] == "kerykeion"
    assert data["settings"] == payload["settings"]
    assert data["inputSnapshot"] == payload["inputSnapshot"]
    assert {position["id"] for position in data["positions"]} == {
        "sun",
        "moon",
        "north_node",
        "mercury",
        "venus",
        "mars",
        "jupiter",
        "saturn",
        "uranus",
        "neptune",
        "pluto",
    }
    assert all(0 <= position["longitude"] < 360 for position in data["positions"])
