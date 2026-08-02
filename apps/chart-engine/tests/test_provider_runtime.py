from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock
from time import sleep

import pytest

from chart_engine.provider_runtime import ProviderReadinessError, ProviderRuntime


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
    sentinel_calls = 0

    def sentinel() -> None:
        nonlocal sentinel_calls
        sentinel_calls += 1

    runtime = ProviderRuntime(sentinel=sentinel)

    metadata = runtime.ready()

    assert sentinel_calls == 1
    assert metadata.model_dump() == {
        "name": "kerykeion",
        "version": "5.12.9",
        "ephemeris": "moshier",
        "pyswissephVersion": "2.10.3.2",
        "ephemerisFlags": ["moshier", "speed"],
        "ephemerisDataRevision": None,
    }


def test_readiness_fails_closed_on_provider_version_drift() -> None:
    runtime = ProviderRuntime(
        version_reader=lambda package: "5.12.8" if package == "kerykeion" else "2.10.3.2"
    )

    with pytest.raises(ProviderReadinessError, match="KERYKEION_VERSION_MISMATCH"):
        runtime.ready()
