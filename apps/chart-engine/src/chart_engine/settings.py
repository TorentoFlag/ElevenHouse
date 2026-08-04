from dataclasses import dataclass
from math import isfinite
from os import getenv
from pathlib import Path


MAX_PROVIDER_CALCULATION_TIMEOUT_SECONDS = 24 * 60 * 60
MAX_PROVIDER_CALCULATION_CONCURRENCY = 32
MINIMUM_WORKER_RESPONSE_MARGIN_MS = 5_000


@dataclass(frozen=True)
class ProviderCalculationSettings:
    timeout_seconds: float
    concurrency: int
    worker_timeout_ms: int | None


def chart_engine_environment() -> str:
    return getenv("NODE_ENV", "development").strip()


def expected_ephemeris() -> str:
    value = getenv("CHART_ENGINE_EXPECTED_EPHEMERIS", "").strip()
    if chart_engine_environment() == "production" and not value:
        raise ValueError("CHART_ENGINE_EXPECTED_EPHEMERIS_REQUIRED")
    resolved = value or "moshier"
    if resolved not in {"moshier", "swiss-ephemeris"}:
        raise ValueError("CHART_ENGINE_EXPECTED_EPHEMERIS_UNSUPPORTED")
    if chart_engine_environment() == "production" and resolved == "moshier":
        raise ValueError("CHART_ENGINE_MOSHIER_FORBIDDEN_IN_PRODUCTION")
    return resolved


def expected_ephemeris_flags() -> tuple[str, ...]:
    expected = {
        "moshier": {"FLG_MOSEPH", "FLG_SPEED"},
        "swiss-ephemeris": {"FLG_SWIEPH", "FLG_SPEED"},
    }[expected_ephemeris()]
    value = getenv("CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS", "").strip()
    if not value:
        return tuple(sorted(expected))
    flags = tuple(part.strip() for part in value.split(",") if part.strip())
    if set(flags) != expected or len(flags) != len(expected):
        raise ValueError("CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS_INVALID")
    return flags


def expected_ephemeris_data_revision() -> str | None:
    value = getenv("CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION", "").strip() or None
    if expected_ephemeris() == "swiss-ephemeris" and value is None:
        raise ValueError("CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION_REQUIRED")
    if expected_ephemeris() == "moshier" and value is not None:
        raise ValueError("CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION_FORBIDDEN")
    return value


def ephemeris_data_directory() -> Path | None:
    value = getenv("CHART_ENGINE_EPHEMERIS_DATA_DIR", "").strip()
    backend = expected_ephemeris()
    if backend == "swiss-ephemeris" and not value:
        raise ValueError("CHART_ENGINE_EPHEMERIS_DATA_DIR_REQUIRED")
    if backend == "moshier" and value:
        raise ValueError("CHART_ENGINE_EPHEMERIS_DATA_DIR_FORBIDDEN")
    if not value:
        return None
    path = Path(value)
    if not path.is_absolute():
        raise ValueError("CHART_ENGINE_EPHEMERIS_DATA_DIR_MUST_BE_ABSOLUTE")
    return path


def provider_readiness_timeout_seconds() -> float:
    value = float(getenv("CHART_ENGINE_READINESS_TIMEOUT_SECONDS", "5"))
    if value <= 0 or value > 60:
        raise ValueError("CHART_ENGINE_READINESS_TIMEOUT_SECONDS_INVALID")
    return value


def provider_calculation_settings() -> ProviderCalculationSettings:
    production = chart_engine_environment() == "production"
    timeout_raw = getenv("CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS", "").strip()
    concurrency_raw = getenv("CHART_ENGINE_CALCULATION_CONCURRENCY", "").strip()
    worker_timeout_raw = getenv("CHART_WORKER_CALCULATION_TIMEOUT_MS", "").strip()

    if production and not timeout_raw:
        raise ValueError("CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS_REQUIRED")
    if production and not concurrency_raw:
        raise ValueError("CHART_ENGINE_CALCULATION_CONCURRENCY_REQUIRED")
    if production and not worker_timeout_raw:
        raise ValueError("CHART_WORKER_CALCULATION_TIMEOUT_MS_REQUIRED")

    timeout_seconds = _bounded_float(
        timeout_raw or "110",
        maximum=MAX_PROVIDER_CALCULATION_TIMEOUT_SECONDS,
        error_code="CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS_INVALID",
    )
    concurrency = _bounded_integer(
        concurrency_raw or "1",
        maximum=MAX_PROVIDER_CALCULATION_CONCURRENCY,
        error_code="CHART_ENGINE_CALCULATION_CONCURRENCY_INVALID",
    )
    worker_timeout_ms = (
        _bounded_integer(
            worker_timeout_raw,
            maximum=MAX_PROVIDER_CALCULATION_TIMEOUT_SECONDS * 1_000,
            error_code="CHART_WORKER_CALCULATION_TIMEOUT_MS_INVALID",
        )
        if worker_timeout_raw
        else None
    )
    if (
        worker_timeout_ms is not None
        and timeout_seconds * 1_000 + MINIMUM_WORKER_RESPONSE_MARGIN_MS > worker_timeout_ms
    ):
        raise ValueError("CHART_ENGINE_CALCULATION_TIMEOUT_MARGIN_INVALID")
    return ProviderCalculationSettings(
        timeout_seconds=timeout_seconds,
        concurrency=concurrency,
        worker_timeout_ms=worker_timeout_ms,
    )


def _bounded_float(value: str, *, maximum: float, error_code: str) -> float:
    try:
        resolved = float(value)
    except ValueError as error:
        raise ValueError(error_code) from error
    if not isfinite(resolved) or resolved <= 0 or resolved > maximum:
        raise ValueError(error_code)
    return resolved


def _bounded_integer(value: str, *, maximum: int, error_code: str) -> int:
    try:
        resolved = int(value)
    except ValueError as error:
        raise ValueError(error_code) from error
    if resolved <= 0 or resolved > maximum:
        raise ValueError(error_code)
    return resolved


def chart_engine_host() -> str:
    return getenv("CHART_ENGINE_HOST", "0.0.0.0")


def chart_engine_port() -> int:
    return int(getenv("CHART_ENGINE_PORT", "8012"))


def chart_engine_workers() -> int:
    return int(getenv("CHART_ENGINE_WORKERS", "2"))
