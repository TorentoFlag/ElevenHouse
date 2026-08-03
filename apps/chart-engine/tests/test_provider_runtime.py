import json
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import active_children
from os import getenv
from pathlib import Path
from threading import Barrier, Event, Lock
from time import monotonic, sleep

import pytest
import swisseph as swe
from pydantic import ValidationError

from chart_engine.provider_runtime import ProviderReadinessError, ProviderRuntime
from chart_engine.schemas import ChartExecutionProfile, ProviderMetadata, ProviderReadinessResponse


MOSHIER_METADATA = {
    "name": "kerykeion",
    "version": "5.12.9",
    "ephemeris": "moshier",
    "pyswissephVersion": "2.10.3.2",
    "ephemerisFlags": ["FLG_MOSEPH", "FLG_SPEED"],
    "ephemerisDataRevision": None,
}


def successful_probe() -> dict:
    return dict(MOSHIER_METADATA)


def drifted_version_probe() -> dict:
    return {**MOSHIER_METADATA, "version": "5.12.8"}


def environment_selected_probe() -> dict:
    if getenv("TEST_CHART_PROBE_BACKEND") == "swiss-ephemeris":
        return {
            **MOSHIER_METADATA,
            "ephemeris": "swiss-ephemeris",
            "ephemerisFlags": ["FLG_SWIEPH", "FLG_SPEED"],
            "ephemerisDataRevision": "sha256:" + "a" * 64,
        }
    return successful_probe()


def swiss_revision_probe() -> dict:
    return {
        **MOSHIER_METADATA,
        "ephemeris": "swiss-ephemeris",
        "ephemerisFlags": ["FLG_SWIEPH", "FLG_SPEED"],
        "ephemerisDataRevision": "sha256:" + "b" * 64,
    }


def missing_speed_flag_probe() -> dict:
    return {**MOSHIER_METADATA, "ephemerisFlags": ["FLG_MOSEPH"]}


def reordered_flags_probe() -> dict:
    return {**MOSHIER_METADATA, "ephemerisFlags": ["FLG_SPEED", "FLG_MOSEPH"]}


def hanging_probe() -> dict:
    sleep(30)
    return successful_probe()


def test_shared_readiness_fixture_parses_in_python() -> None:
    repository_root = next(
        parent for parent in Path(__file__).parents if (parent / "packages/contracts").is_dir()
    )
    fixture = json.loads(
        (
            repository_root
            / "packages/contracts/test-fixtures/chart-engine-readiness.v2.json"
        ).read_text(encoding="utf-8")
    )

    assert ProviderReadinessResponse.model_validate(fixture).model_dump(mode="json") == fixture

    with pytest.raises(ValidationError):
        ProviderReadinessResponse.model_validate({**fixture, "status": "live"})

    capabilities = fixture["capabilities"]
    for invalid_capabilities in (
        capabilities[:-1],
        [*capabilities[:-1], capabilities[0]],
        [*capabilities, "future_method"],
    ):
        with pytest.raises(ValidationError):
            ProviderReadinessResponse.model_validate(
                {**fixture, "capabilities": invalid_capabilities}
            )


@pytest.mark.parametrize(
    "flags",
    [
        [],
        ["FLG_MOSEPH"],
        ["FLG_MOSEPH", "FLG_SPEED", "FLG_J2000"],
        ["FLG_MOSEPH", "FLG_SPEED", "FLG_SPEED"],
        ["moshier", "speed"],
        ["FLG_SWIEPH", "FLG_SPEED"],
    ],
)
def test_moshier_profile_rejects_non_canonical_flag_sets(flags: list[str]) -> None:
    with pytest.raises(ValidationError):
        ChartExecutionProfile.model_validate(
            {
                "provider": "kerykeion",
                "kerykeionVersion": "5.12.9",
                "pyswissephVersion": "2.10.3.2",
                "expectedEphemeris": "moshier",
                "expectedEphemerisFlags": flags,
                "expectedEphemerisDataRevision": None,
            }
        )


def test_readiness_compares_expected_flags_without_order_sensitivity(monkeypatch) -> None:
    monkeypatch.setenv("CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS", "FLG_SPEED,FLG_MOSEPH")
    runtime = ProviderRuntime(sentinel=reordered_flags_probe)

    assert set(runtime.ready().ephemerisFlags) == {"FLG_MOSEPH", "FLG_SPEED"}


def test_provider_operations_cannot_overlap_inside_a_process() -> None:
    runtime = ProviderRuntime()
    start = Barrier(3)
    state_lock = Lock()
    active = 0
    maximum_active = 0

    def operation() -> None:
        nonlocal active, maximum_active
        with state_lock:
            active += 1
            maximum_active = max(maximum_active, active)
        sleep(0.03)
        with state_lock:
            active -= 1

    def worker() -> None:
        start.wait()
        runtime.calculate(operation)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(worker) for _ in range(2)]
        start.wait()
        for future in futures:
            future.result()

    assert maximum_active == 1


def test_readiness_executes_sentinel_and_reports_actual_profile() -> None:
    runtime = ProviderRuntime(sentinel=successful_probe)

    metadata = runtime.ready()

    assert metadata.model_dump() == MOSHIER_METADATA


def test_readiness_fails_closed_on_provider_version_drift() -> None:
    runtime = ProviderRuntime(sentinel=drifted_version_probe)

    with pytest.raises(ProviderReadinessError, match="KERYKEION_VERSION_MISMATCH"):
        runtime.ready()


def test_readiness_fails_closed_on_actual_flag_drift() -> None:
    runtime = ProviderRuntime(sentinel=missing_speed_flag_probe)

    with pytest.raises(ProviderReadinessError, match="CHART_EPHEMERIS_FLAGS_INVALID"):
        runtime.ready()


def test_readiness_fails_closed_on_actual_data_revision_drift(monkeypatch) -> None:
    monkeypatch.setenv("CHART_ENGINE_EXPECTED_EPHEMERIS", "swiss-ephemeris")
    monkeypatch.setenv(
        "CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS",
        "FLG_SWIEPH,FLG_SPEED",
    )
    monkeypatch.setenv("CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION", "sha256:" + "a" * 64)
    runtime = ProviderRuntime(sentinel=swiss_revision_probe)

    with pytest.raises(ProviderReadinessError, match="EPHEMERIS_DATA_REVISION_MISMATCH"):
        runtime.ready()


def test_readiness_terminates_and_joins_a_hung_sentinel() -> None:
    children_before = {process.pid for process in active_children()}
    runtime = ProviderRuntime(sentinel=hanging_probe, readiness_timeout_seconds=0.1)
    started_at = monotonic()

    with pytest.raises(ProviderReadinessError, match="PROVIDER_READINESS_TIMEOUT"):
        runtime.ready()

    assert monotonic() - started_at < 2
    assert {process.pid for process in active_children()} <= children_before


def test_readiness_lock_contention_respects_the_same_deadline() -> None:
    runtime = ProviderRuntime(sentinel=successful_probe, readiness_timeout_seconds=0.1)
    operation_started = Event()
    release_operation = Event()

    def blocking_operation() -> None:
        operation_started.set()
        assert release_operation.wait(timeout=2)

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(lambda: runtime.calculate(blocking_operation))
        assert operation_started.wait(timeout=1)
        started_at = monotonic()
        with pytest.raises(ProviderReadinessError, match="PROVIDER_READINESS_TIMEOUT"):
            runtime.ready()
        assert monotonic() - started_at < 1
        release_operation.set()
        future.result(timeout=1)


def test_readiness_reprobes_actual_backend_instead_of_using_startup_cache(
    monkeypatch,
) -> None:
    monkeypatch.setenv("TEST_CHART_PROBE_BACKEND", "moshier")
    runtime = ProviderRuntime(sentinel=environment_selected_probe)
    assert runtime.ready().ephemeris == "moshier"

    monkeypatch.setenv("TEST_CHART_PROBE_BACKEND", "swiss-ephemeris")

    with pytest.raises(ProviderReadinessError, match="EPHEMERIS_BACKEND_MISMATCH"):
        runtime.ready()


def test_actual_swiss_backend_without_proven_data_artifacts_fails_closed(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("CHART_ENGINE_EXPECTED_EPHEMERIS", "swiss-ephemeris")
    monkeypatch.setenv(
        "CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS",
        "FLG_SWIEPH,FLG_SPEED",
    )
    monkeypatch.setenv("CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION", "sha256:" + "a" * 64)
    missing_path = tmp_path / "missing-provider-data"
    monkeypatch.setattr(
        "chart_engine.provider_runtime._provider_ephemeris_data_path",
        lambda: missing_path,
    )
    monkeypatch.setattr(
        "chart_engine.provider_runtime.swe.calc_ut",
        lambda *_args: ((0.0,) * 6, swe.FLG_SWIEPH | swe.FLG_SPEED),
    )
    runtime = ProviderRuntime(sentinel=successful_probe)

    with pytest.raises(ProviderReadinessError, match="EPHEMERIS_DATA_REVISION_UNPROVEN"):
        runtime.metadata()


def test_actual_swiss_revision_is_derived_from_configured_artifact_bytes(
    monkeypatch,
    tmp_path,
) -> None:
    (tmp_path / "semo_18.se1").write_bytes(b"moon-data")
    (tmp_path / "sepl_18.se1").write_bytes(b"planet-data")
    monkeypatch.setenv("CHART_ENGINE_EXPECTED_EPHEMERIS", "swiss-ephemeris")
    monkeypatch.setenv(
        "CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS",
        "FLG_SWIEPH,FLG_SPEED",
    )
    monkeypatch.setenv(
        "CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION",
        "sha256:" + "a" * 64,
    )
    monkeypatch.setattr(
        "chart_engine.provider_runtime._provider_ephemeris_data_path",
        lambda: tmp_path,
    )
    monkeypatch.setattr(
        "chart_engine.provider_runtime.swe.calc_ut",
        lambda *_args: ((0.0,) * 6, swe.FLG_SWIEPH | swe.FLG_SPEED),
    )
    runtime = ProviderRuntime(sentinel=successful_probe)

    assert runtime.metadata().ephemerisDataRevision == (
        "sha256:3b536b70415998f185dcf8f3644449cf2259812307217035b2fb7aa2be7aceb0"
    )


def test_actual_moshier_metadata_never_copies_expected_data_revision(monkeypatch) -> None:
    monkeypatch.setattr(
        "chart_engine.provider_runtime.swe.calc_ut",
        lambda *_args: ((0.0,) * 6, swe.FLG_MOSEPH | swe.FLG_SPEED),
    )
    runtime = ProviderRuntime(sentinel=successful_probe)

    assert runtime.metadata().ephemerisDataRevision is None


def test_swiss_metadata_without_actual_revision_is_rejected() -> None:
    with pytest.raises(ValidationError, match="CHART_EPHEMERIS_DATA_REVISION_REQUIRED"):
        ProviderMetadata.model_validate(
            {
                **MOSHIER_METADATA,
                "ephemeris": "swiss-ephemeris",
                "ephemerisFlags": ["FLG_SWIEPH", "FLG_SPEED"],
            }
        )
