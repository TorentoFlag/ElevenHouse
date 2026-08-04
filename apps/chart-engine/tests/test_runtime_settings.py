import pytest

from chart_engine.settings import provider_calculation_settings


def test_local_calculation_runtime_has_bounded_non_production_defaults(monkeypatch) -> None:
    monkeypatch.setenv("NODE_ENV", "development")
    monkeypatch.delenv("CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("CHART_ENGINE_CALCULATION_CONCURRENCY", raising=False)
    monkeypatch.delenv("CHART_WORKER_CALCULATION_TIMEOUT_MS", raising=False)

    settings = provider_calculation_settings()

    assert settings.timeout_seconds == 110
    assert settings.concurrency == 1


@pytest.mark.parametrize(
    ("missing", "error_code"),
    [
        (
            "CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS",
            "CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS_REQUIRED",
        ),
        (
            "CHART_ENGINE_CALCULATION_CONCURRENCY",
            "CHART_ENGINE_CALCULATION_CONCURRENCY_REQUIRED",
        ),
        (
            "CHART_WORKER_CALCULATION_TIMEOUT_MS",
            "CHART_WORKER_CALCULATION_TIMEOUT_MS_REQUIRED",
        ),
    ],
)
def test_production_calculation_runtime_requires_every_deadline_key(
    monkeypatch,
    missing: str,
    error_code: str,
) -> None:
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS", "110")
    monkeypatch.setenv("CHART_ENGINE_CALCULATION_CONCURRENCY", "1")
    monkeypatch.setenv("CHART_WORKER_CALCULATION_TIMEOUT_MS", "120000")
    monkeypatch.delenv(missing, raising=False)

    with pytest.raises(ValueError, match=f"^{error_code}$"):
        provider_calculation_settings()


@pytest.mark.parametrize("value", ["0", "-1", "nan", "inf", "86401", "invalid"])
def test_calculation_timeout_must_be_finite_positive_and_bounded(
    monkeypatch,
    value: str,
) -> None:
    monkeypatch.setenv("CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS", value)

    with pytest.raises(
        ValueError,
        match="^CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS_INVALID$",
    ):
        provider_calculation_settings()


@pytest.mark.parametrize("value", ["0", "-1", "1.5", "33", "invalid"])
def test_calculation_concurrency_is_a_small_positive_integer(monkeypatch, value: str) -> None:
    monkeypatch.setenv("CHART_ENGINE_CALCULATION_CONCURRENCY", value)

    with pytest.raises(
        ValueError,
        match="^CHART_ENGINE_CALCULATION_CONCURRENCY_INVALID$",
    ):
        provider_calculation_settings()


def test_production_server_deadline_preserves_margin_for_worker_http_completion(
    monkeypatch,
) -> None:
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS", "115.001")
    monkeypatch.setenv("CHART_ENGINE_CALCULATION_CONCURRENCY", "1")
    monkeypatch.setenv("CHART_WORKER_CALCULATION_TIMEOUT_MS", "120000")

    with pytest.raises(
        ValueError,
        match="^CHART_ENGINE_CALCULATION_TIMEOUT_MARGIN_INVALID$",
    ):
        provider_calculation_settings()


def test_production_server_deadline_accepts_at_least_five_seconds_of_margin(
    monkeypatch,
) -> None:
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS", "115")
    monkeypatch.setenv("CHART_ENGINE_CALCULATION_CONCURRENCY", "1")
    monkeypatch.setenv("CHART_WORKER_CALCULATION_TIMEOUT_MS", "120000")

    settings = provider_calculation_settings()

    assert settings.timeout_seconds == 115
    assert settings.worker_timeout_ms == 120000
