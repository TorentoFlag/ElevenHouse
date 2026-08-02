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
    assert response.json() == {
        "service": "chart-engine",
        "status": "ready",
        "provider": {
            "name": "kerykeion",
            "version": "5.12.9",
            "ephemeris": "moshier",
            "pyswissephVersion": "2.10.3.2",
            "ephemerisFlags": ["moshier", "speed"],
            "ephemerisDataRevision": None,
        },
        "capabilities": [
            "natal",
            "astrocartography",
            "transit",
            "synastry",
            "composite",
            "solar_return",
            "progression",
            "horary",
            "planetary_positions",
            "astro_calendar",
        ],
    }
