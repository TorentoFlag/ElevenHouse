import pytest
from fastapi.testclient import TestClient

from chart_engine.main import app
from test_request_validation import execution_profile


def _horary_payload():
    return {
        "schemaVersion": "chart-request.v2",
        "method": "horary",
        "methodVersion": "chart.horary.kerykeion-5.12.v2",
        "executionProfile": execution_profile(),
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
    assert "inputSnapshot" not in data
    # Provenance: direct PySwissEph 2.10.3.2 calc_ut at the independently
    # resolved 2026-07-23T11:30:00Z question instant.
    assert _point_longitude(data, "sun") == pytest.approx(120.647749350151, abs=0.000001)
    assert _point_longitude(data, "moon") == pytest.approx(233.222229021379, abs=0.000001)


def test_horary_positions_depend_on_question_instant_not_question_text():
    client = TestClient(app)
    first = _horary_payload()
    second = _horary_payload()
    second["questionSnapshot"]["question"] = "Будет ли встреча?"
    second["questionSnapshot"]["category"] = "relationship"

    first_response = client.post("/v1/horary", json=first)
    second_response = client.post("/v1/horary", json=second)

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.json()["questionSnapshot"] == second["questionSnapshot"]
    assert second_response.json()["result"]["points"] == first_response.json()["result"]["points"]


def _point_longitude(payload: dict, point_id: str) -> float:
    return next(
        point["longitude"] for point in payload["result"]["points"] if point["id"] == point_id
    )
