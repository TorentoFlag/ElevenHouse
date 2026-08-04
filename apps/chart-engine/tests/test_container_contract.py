from pathlib import Path


REPOSITORY_ROOT = next(
    parent for parent in Path(__file__).parents if (parent / "packages/contracts").is_dir()
)


def test_chart_engine_container_uses_a_reproducible_runtime_contract() -> None:
    dockerfile = (
        REPOSITORY_ROOT / "deployment/docker/chart-engine.Dockerfile"
    ).read_text(encoding="utf-8")
    pyproject = (REPOSITORY_ROOT / "apps/chart-engine/pyproject.toml").read_text(
        encoding="utf-8"
    )
    lock = (REPOSITORY_ROOT / "apps/chart-engine/requirements.lock").read_text(
        encoding="utf-8"
    )
    build_lock = (
        REPOSITORY_ROOT / "apps/chart-engine/build-requirements.lock"
    ).read_text(encoding="utf-8")
    production_compose = (
        REPOSITORY_ROOT / "deployment/compose/compose.production.yml"
    ).read_text(encoding="utf-8")
    deploy_workflow = (REPOSITORY_ROOT / ".github/workflows/deploy.yml").read_text(
        encoding="utf-8"
    )
    ephemeris_preflight = (
        REPOSITORY_ROOT / "deployment/server/preflight-chart-ephemeris.sh"
    ).read_text(encoding="utf-8")
    provider_preflight = (
        REPOSITORY_ROOT / "deployment/server/preflight-production-providers.sh"
    ).read_text(encoding="utf-8")
    production_env_example = (
        REPOSITORY_ROOT / "deployment/env/.env.production.example"
    ).read_text(encoding="utf-8")

    assert dockerfile.startswith(
        "FROM python:3.12.13-slim-trixie@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de AS builder"
    )
    assert "apt-get install -y --no-install-recommends build-essential" in dockerfile
    runtime_stage = dockerfile.split(" AS runtime\n", maxsplit=1)[1]
    assert "apt-get" not in runtime_stage
    assert "COPY --from=builder /opt/chart-engine-venv /opt/chart-engine-venv" in runtime_stage
    assert "ENV PATH=\"/opt/chart-engine-venv/bin:${PATH}\"" in runtime_stage
    assert "--require-hashes" in dockerfile
    assert "ENV CHART_ENGINE_WORKERS=1" in dockerfile
    assert "USER chartengine" in dockerfile
    assert "build-requirements.lock" in dockerfile
    assert "--no-deps --no-build-isolation" in dockerfile
    assert 'ENV PYTHONTZPATH=""' in dockerfile
    assert "urllib.request.urlopen" in dockerfile
    chart_engine_service = production_compose.split("\n  chart-engine:\n", maxsplit=1)[1].split(
        "\n  notification-worker:\n", maxsplit=1
    )[0]
    chart_worker_service = production_compose.split("\n  chart-worker:\n", maxsplit=1)[1].split(
        "\n  chart-engine:\n", maxsplit=1
    )[0]
    astrologer_api_service = production_compose.split(
        "\n  astrologer-api:\n", maxsplit=1
    )[1].split("\n  admin-api:\n", maxsplit=1)[0]
    assert "curl" not in chart_engine_service
    assert "urllib.request.urlopen" in chart_engine_service
    assert "NODE_ENV: production" in chart_engine_service
    assert 'CHART_ENGINE_WORKERS: "1"' in chart_engine_service
    assert "stop_grace_period: 120s" in chart_engine_service
    assert "read_only: true" in chart_engine_service
    assert "no-new-privileges:true" in chart_engine_service
    assert "/tmp:rw,noexec,nosuid,size=64m" in chart_engine_service
    assert "path: ../env/.env.chart-engine.production" in chart_engine_service
    assert "format: raw" in chart_engine_service
    assert "../env/.env.production" not in chart_engine_service
    assert "path: ../env/.env.chart-worker.production" in chart_worker_service
    assert "format: raw" in chart_worker_service
    assert "../env/.env.production" not in chart_worker_service
    assert "- chart-provider" in astrologer_api_service
    assert "stop_grace_period: 135s" in chart_worker_service
    assert "- chart-provider" in chart_worker_service
    assert "- chart-provider" in chart_engine_service
    assert "chart-provider:" in production_compose
    assert "internal: true" in production_compose
    assert "CHART_ENGINE_EPHEMERIS_DATA_DIR: /run/elevenhouse/ephemeris" in chart_engine_service
    assert "../ephemeris:/run/elevenhouse/ephemeris:ro" in chart_engine_service
    for key in (
        "CHART_ENGINE_EXPECTED_EPHEMERIS",
        "CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS",
        "CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION",
    ):
        assert f"${{{key}" not in chart_engine_service
        assert f"${{{key}" not in astrologer_api_service
    for key in (
        "REDIS_URL",
        "CHART_ENGINE_BASE_URL",
        "CHART_WORKER_OUTBOX_RELAY_INTERVAL_MS",
        "CHART_WORKER_OUTBOX_RELAY_BATCH_SIZE",
        "CHART_WORKER_OUTBOX_LOCK_TIMEOUT_MS",
        "CHART_WORKER_BACKOFF_MS",
        "CHART_WORKER_JITTER",
        "CHART_WORKER_CONCURRENCY",
        "CHART_WORKER_LEASE_MS",
        "CHART_WORKER_STORAGE_OPERATION_TIMEOUT_MS",
        "CHART_WORKER_CALCULATION_TIMEOUT_MS",
        "CHART_WORKER_EXHAUSTED_SWEEP_INTERVAL_MS",
        "CHART_WORKER_EXHAUSTED_SWEEP_BATCH_SIZE",
        "CHART_WORKER_TELEMETRY_INTERVAL_MS",
        "ASTRO_CALENDAR_WORKER_ATTEMPTS",
    ):
        assert f"${{{key}" not in chart_worker_service
        assert key in ephemeris_preflight
    assert "CHART_RUNTIME_NODE_ENV_NOT_PRODUCTION" in ephemeris_preflight
    for key in (
        "CHART_ENGINE_CALCULATION_TIMEOUT_SECONDS",
        "CHART_ENGINE_CALCULATION_CONCURRENCY",
    ):
        assert key in ephemeris_preflight
        assert f"{key}=" in production_env_example
    assert "CHART_ENGINE_CALCULATION_TIMEOUT_MARGIN_INVALID" in ephemeris_preflight
    assert "Preflight licensed chart ephemeris" in deploy_workflow
    assert "preflight-chart-ephemeris.sh" in deploy_workflow
    assert "Preflight production providers" in deploy_workflow
    assert "preflight-production-providers.sh" in deploy_workflow
    assert "EPHEMERIS_DATA_ARTIFACTS_INCOMPLETE" in ephemeris_preflight
    assert "8d68647580a9952102ca50c975fc55d9e26f102aafcc090f853e172080118032" in (
        ephemeris_preflight
    )
    assert 'fail "${prefix}_GEOAPIFY_API_KEY_REQUIRED"' in provider_preflight
    assert "require_geoapify_provider PUBLIC_API" in provider_preflight
    assert "require_geoapify_provider ASTROLOGER_API" in provider_preflight

    for requirement in (
        '"fastapi==0.139.2"',
        '"uvicorn[standard]==0.51.0"',
        '"pydantic==2.13.4"',
        '"kerykeion==5.12.9"',
        '"pyswisseph==2.10.3.2"',
        '"tzdata==2026.3"',
    ):
        assert requirement in pyproject
    assert 'requires = ["setuptools==80.10.2"]' in pyproject
    assert "--generate-hashes" in lock
    assert "fastapi==0.139.2" in lock
    assert "tzdata==2026.3" in lock
    assert "--hash=sha256:" in lock
    assert "setuptools==80.10.2" in build_lock
    assert "--hash=sha256:95b30ddfb717250edb492926c92b5221f7ef3fbcc2b07579bcd4a27da21d0173" in build_lock
