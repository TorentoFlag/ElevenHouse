import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import chart_engine.main as chart_engine_main
from chart_engine.main import app
from chart_engine.provider_runtime import (
    ProviderCalculationCapacityError,
    ProviderCalculationShutdownError,
    ProviderCalculationTimeoutError,
    ProviderCalculationUnavailableError,
    ProviderReadinessError,
    ProviderReadinessUnavailableError,
)
from test_request_validation import request_payload


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


def test_ready_distinguishes_temporary_unavailability_from_configuration(monkeypatch):
    client = TestClient(app)

    monkeypatch.setattr(
        chart_engine_main.provider_runtime,
        "ready",
        lambda: (_ for _ in ()).throw(
            ProviderReadinessUnavailableError("PROVIDER_READINESS_TIMEOUT")
        ),
    )
    unavailable = client.get("/ready")

    monkeypatch.setattr(
        chart_engine_main.provider_runtime,
        "ready",
        lambda: (_ for _ in ()).throw(
            ProviderReadinessError("EPHEMERIS_BACKEND_MISMATCH")
        ),
    )
    misconfigured = client.get("/ready")

    assert unavailable.status_code == 503
    assert unavailable.json() == {"detail": "PROVIDER_READINESS_TIMEOUT"}
    assert misconfigured.status_code == 409
    assert misconfigured.json() == {"detail": "EPHEMERIS_BACKEND_MISMATCH"}


@pytest.mark.parametrize(
    ("error", "status_code"),
    [
        (ProviderCalculationTimeoutError("CHART_PROVIDER_CALCULATION_TIMEOUT"), 504),
        (
            ProviderCalculationCapacityError(
                "CHART_PROVIDER_CALCULATION_CAPACITY_TIMEOUT"
            ),
            503,
        ),
        (ProviderCalculationShutdownError("CHART_PROVIDER_CALCULATION_SHUTDOWN"), 503),
        (ProviderCalculationUnavailableError("CHART_PROVIDER_CALCULATION_CRASHED"), 503),
        (ProviderReadinessError("EPHEMERIS_BACKEND_MISMATCH"), 409),
    ],
)
def test_calculation_failures_have_safe_typed_http_responses(
    monkeypatch,
    error: RuntimeError,
    status_code: int,
) -> None:
    monkeypatch.setattr(
        chart_engine_main.provider_runtime,
        "calculate",
        lambda *_args: (_ for _ in ()).throw(error),
    )

    response = TestClient(app, raise_server_exceptions=False).post(
        "/v1/natal",
        json=request_payload("natal"),
    )

    assert response.status_code == status_code
    assert response.json() == {"detail": str(error)}
