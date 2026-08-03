from os import getenv


def chart_engine_environment() -> str:
    return getenv("NODE_ENV", "development").strip()


def expected_ephemeris() -> str:
    value = getenv("CHART_ENGINE_EXPECTED_EPHEMERIS", "").strip()
    if chart_engine_environment() == "production" and not value:
        raise ValueError("CHART_ENGINE_EXPECTED_EPHEMERIS_REQUIRED")
    resolved = value or "moshier"
    if resolved not in {"moshier", "swiss-ephemeris"}:
        raise ValueError("CHART_ENGINE_EXPECTED_EPHEMERIS_UNSUPPORTED")
    return resolved


def expected_ephemeris_flags() -> tuple[str, ...]:
    value = getenv("CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS", "").strip()
    if not value:
        return (expected_ephemeris(), "speed")
    flags = tuple(part.strip() for part in value.split(",") if part.strip())
    if len(set(flags)) != len(flags) or not flags:
        raise ValueError("CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS_INVALID")
    return flags


def expected_ephemeris_data_revision() -> str | None:
    value = getenv("CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION", "").strip() or None
    if expected_ephemeris() == "swiss-ephemeris" and value is None:
        raise ValueError("CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION_REQUIRED")
    if expected_ephemeris() == "moshier" and value is not None:
        raise ValueError("CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION_FORBIDDEN")
    return value


def provider_readiness_timeout_seconds() -> float:
    value = float(getenv("CHART_ENGINE_READINESS_TIMEOUT_SECONDS", "5"))
    if value <= 0 or value > 60:
        raise ValueError("CHART_ENGINE_READINESS_TIMEOUT_SECONDS_INVALID")
    return value


def chart_engine_host() -> str:
    return getenv("CHART_ENGINE_HOST", "0.0.0.0")


def chart_engine_port() -> int:
    return int(getenv("CHART_ENGINE_PORT", "8012"))


def chart_engine_workers() -> int:
    return int(getenv("CHART_ENGINE_WORKERS", "2"))
