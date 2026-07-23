from fastapi.testclient import TestClient

from chart_engine.main import app


def _horary_payload():
    return {
        "schemaVersion": "chart-request.v1",
        "method": "horary",
        "settings": {
            "houseSystem": "regiomontanus",
            "nodeType": "true",
            "aspectPreset": "major",
            "orbMultiplier": 1,
        },
        "questionSnapshot": {
            "question": "Стоит ли принимать предложение?",
            "category": "career",
            "date": "2026-07-23",
            "time": "14:30",
            "timezone": "Europe/Moscow",
            "latitude": 55.7558,
            "longitude": 37.6173,
        },
    }


def test_horary_returns_canonical_single_wheel_shape():
    client = TestClient(app)
    payload = _horary_payload()

    response = client.post("/v1/horary", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["method"] == "horary"
    assert data["provider"]["name"] == "kerykeion"
    assert data["questionSnapshot"] == payload["questionSnapshot"]
    point_ids = {point["id"] for point in data["result"]["points"]}
    assert {"sun", "moon", "jupiter", "saturn", "north_node"}.issubset(point_ids)
    assert len(data["result"]["houses"]) == 12
