from os import getenv


def chart_engine_host() -> str:
    return getenv("CHART_ENGINE_HOST", "0.0.0.0")


def chart_engine_port() -> int:
    return int(getenv("CHART_ENGINE_PORT", "8012"))


def chart_engine_workers() -> int:
    return int(getenv("CHART_ENGINE_WORKERS", "2"))
