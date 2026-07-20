from fastapi.testclient import TestClient

from chart_engine.main import app


def test_live_returns_service_status():
    client = TestClient(app)

    response = client.get("/live")

    assert response.status_code == 200
    assert response.json()["service"] == "chart-engine"
    assert response.json()["status"] == "live"


def test_ready_returns_service_status():
    client = TestClient(app)

    response = client.get("/ready")

    assert response.status_code == 200
    assert response.json()["service"] == "chart-engine"
    assert response.json()["status"] == "ready"
