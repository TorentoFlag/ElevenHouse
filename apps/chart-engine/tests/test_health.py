import json
from pathlib import Path

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
    repository_root = next(
        parent for parent in Path(__file__).parents if (parent / "packages/contracts").is_dir()
    )
    expected = json.loads(
        (
            repository_root
            / "packages/contracts/test-fixtures/chart-engine-readiness.v2.json"
        ).read_text(encoding="utf-8")
    )
    assert response.json() == expected
