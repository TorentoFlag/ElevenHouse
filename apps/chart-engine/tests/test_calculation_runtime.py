import os
import signal
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import active_children, get_context
from pathlib import Path
from time import monotonic, sleep

import pytest

from chart_engine.provider_runtime import (
    ProviderCalculationCapacityError,
    ProviderCalculationShutdownError,
    ProviderCalculationTimeoutError,
    ProviderCalculationUnavailableError,
    ProviderRuntime,
)
from chart_engine.schemas import ProviderMetadata


MOSHIER_METADATA = {
    "name": "kerykeion",
    "version": "5.12.9",
    "ephemeris": "moshier",
    "pyswissephVersion": "2.10.3.2",
    "ephemerisFlags": ["FLG_MOSEPH", "FLG_SPEED"],
    "ephemerisDataRevision": None,
}


def safe_metadata() -> dict:
    return dict(MOSHIER_METADATA)


def echo_calculation(
    operation: str,
    request: object,
    metadata: ProviderMetadata,
) -> dict:
    return {
        "operation": operation,
        "request": request,
        "provider": metadata.name,
    }


def selective_calculation(
    operation: str,
    request: object,
    metadata: ProviderMetadata,
) -> object:
    if isinstance(request, dict) and request.get("mode") in {"hang", "hang_resistant"}:
        if request.get("mode") == "hang_resistant":
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
        marker = Path(str(request["marker"]))
        marker.write_text("started", encoding="utf-8")
        sleep(30)
    return echo_calculation(operation, request, metadata)


def sigterm_resistant_calculation(
    _operation: str,
    request: object,
    _metadata: ProviderMetadata,
) -> None:
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    Path(str(request)).write_text("started", encoding="utf-8")
    sleep(30)


def crashing_calculation(
    _operation: str,
    _request: object,
    _metadata: ProviderMetadata,
) -> None:
    os._exit(23)


def sensitive_failure_calculation(
    _operation: str,
    request: object,
    _metadata: ProviderMetadata,
) -> None:
    raise RuntimeError(str(request))


class TransportStallResult:
    def __init__(self, marker: str) -> None:
        self.marker = marker

    def __reduce__(self):
        Path(self.marker).write_text("serializing", encoding="utf-8")
        sleep(30)
        return (str, ("never-published",))


def transport_stall_calculation(
    _operation: str,
    request: object,
    _metadata: ProviderMetadata,
) -> TransportStallResult:
    return TransportStallResult(str(request))


def tracked_calculation(
    _operation: str,
    request: object,
    _metadata: ProviderMetadata,
) -> str:
    active, maximum, counter_lock = request
    with counter_lock:
        active.value += 1
        maximum.value = max(maximum.value, active.value)
    sleep(0.1)
    with counter_lock:
        active.value -= 1
    return "ok"


def _spawn_runtime(**overrides) -> ProviderRuntime:
    inputs = {
        "metadata_detector": safe_metadata,
        "calculation_runner": echo_calculation,
        "calculation_timeout_seconds": 5,
        "calculation_concurrency": 1,
        "process_context": get_context("spawn"),
    }
    inputs.update(overrides)
    return ProviderRuntime(**inputs)


def _wait_for_marker(path: Path, *, timeout_seconds: float = 2) -> None:
    deadline = monotonic() + timeout_seconds
    while monotonic() < deadline:
        if path.exists():
            return
        sleep(0.01)
    raise AssertionError(f"calculation child did not create marker: {path.name}")


def test_calculation_runs_in_a_spawned_process_and_returns_typed_result() -> None:
    runtime = ProviderRuntime(
        metadata_detector=safe_metadata,
        calculation_runner=echo_calculation,
        calculation_timeout_seconds=5,
        calculation_concurrency=1,
    )

    result = runtime.calculate("natal", {"request": "safe"})

    assert result == {
        "operation": "natal",
        "request": {"request": "safe"},
        "provider": "kerykeion",
    }
    assert runtime.active_calculation_count == 0


def test_hung_calculation_is_killed_and_the_next_request_succeeds(tmp_path) -> None:
    children_before = {process.pid for process in active_children()}
    marker = tmp_path / "hung-child-started"
    runtime = _spawn_runtime(
        calculation_runner=selective_calculation,
        calculation_timeout_seconds=2,
    )

    with pytest.raises(
        ProviderCalculationTimeoutError,
        match="^CHART_PROVIDER_CALCULATION_TIMEOUT$",
    ):
        runtime.calculate("natal", {"mode": "hang", "marker": str(marker)})

    assert marker.read_text(encoding="utf-8") == "started"
    assert runtime.calculate("natal", {"mode": "success"})["provider"] == "kerykeion"
    assert runtime.active_calculation_count == 0
    assert {process.pid for process in active_children()} <= children_before


def test_timeout_escalates_from_terminate_to_kill_without_a_zombie(tmp_path) -> None:
    children_before = {process.pid for process in active_children()}
    marker = tmp_path / "sigterm-resistant-child-started"
    runtime = _spawn_runtime(
        calculation_runner=sigterm_resistant_calculation,
        calculation_timeout_seconds=2,
    )
    started_at = monotonic()

    with pytest.raises(ProviderCalculationTimeoutError):
        runtime.calculate("natal", str(marker))

    assert marker.read_text(encoding="utf-8") == "started"
    assert monotonic() - started_at < 2
    assert runtime.active_calculation_count == 0
    assert {process.pid for process in active_children()} <= children_before


def test_timeout_reaps_a_child_stalled_while_serializing_the_result(tmp_path) -> None:
    children_before = {process.pid for process in active_children()}
    marker = tmp_path / "transport-stall"
    runtime = _spawn_runtime(
        calculation_runner=transport_stall_calculation,
        calculation_timeout_seconds=2,
    )

    with pytest.raises(ProviderCalculationTimeoutError):
        runtime.calculate("natal", str(marker))

    assert marker.read_text(encoding="utf-8") == "serializing"
    assert runtime.active_calculation_count == 0
    assert {process.pid for process in active_children()} <= children_before


def test_unreaped_child_keeps_the_capacity_token_fail_closed(monkeypatch, tmp_path) -> None:
    import chart_engine.provider_runtime as runtime_module

    marker = tmp_path / "unreaped-child"
    runtime = _spawn_runtime(
        calculation_runner=selective_calculation,
        calculation_timeout_seconds=2,
    )
    original_cancel = runtime_module._cancel_child_process

    def refuse_cancellation(*_args, **_kwargs) -> None:
        raise ProviderCalculationUnavailableError(
            "CHART_PROVIDER_CALCULATION_CANCELLATION_FAILED"
        )

    monkeypatch.setattr(runtime_module, "_cancel_child_process", refuse_cancellation)
    with pytest.raises(
        ProviderCalculationUnavailableError,
        match="^CHART_PROVIDER_CALCULATION_CANCELLATION_FAILED$",
    ):
        runtime.calculate("natal", {"mode": "hang", "marker": str(marker)})

    assert marker.read_text(encoding="utf-8") == "started"
    assert runtime.active_calculation_count == 1
    with pytest.raises(ProviderCalculationCapacityError):
        runtime.calculate("natal", {"mode": "success"})

    monkeypatch.setattr(runtime_module, "_cancel_child_process", original_cancel)
    runtime.shutdown()
    assert runtime.active_calculation_count == 0


def test_crashed_child_returns_only_a_safe_typed_failure_and_is_reaped() -> None:
    children_before = {process.pid for process in active_children()}
    runtime = _spawn_runtime(calculation_runner=crashing_calculation)

    with pytest.raises(
        ProviderCalculationUnavailableError,
        match="^CHART_PROVIDER_CALCULATION_CRASHED$",
    ):
        runtime.calculate("natal", {"private": "birth-input"})

    assert runtime.active_calculation_count == 0
    assert {process.pid for process in active_children()} <= children_before


def test_child_exception_does_not_cross_the_process_boundary() -> None:
    sensitive = "PRIVATE_BIRTH_INPUT_AND_PROVIDER_DIAGNOSTIC"
    runtime = _spawn_runtime(calculation_runner=sensitive_failure_calculation)

    with pytest.raises(
        ProviderCalculationUnavailableError,
        match="^CHART_PROVIDER_CALCULATION_FAILED$",
    ) as raised:
        runtime.calculate("horary", sensitive)

    assert sensitive not in str(raised.value)


def test_hard_concurrency_cap_prevents_provider_overlap() -> None:
    context = get_context("spawn")
    active = context.Value("i", 0)
    maximum = context.Value("i", 0)
    counter_lock = context.Lock()
    runtime = _spawn_runtime(
        calculation_runner=tracked_calculation,
        calculation_timeout_seconds=5,
    )

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(
                runtime.calculate,
                "natal",
                (active, maximum, counter_lock),
            )
            for _ in range(2)
        ]
        assert [future.result(timeout=2) for future in futures] == ["ok", "ok"]

    assert maximum.value == 1


def test_capacity_wait_uses_the_same_absolute_deadline(tmp_path) -> None:
    marker = tmp_path / "capacity-holder-started"
    runtime = _spawn_runtime(
        calculation_runner=selective_calculation,
        calculation_timeout_seconds=2,
    )

    with ThreadPoolExecutor(max_workers=1) as executor:
        holder = executor.submit(
            runtime.calculate,
            "natal",
            {"mode": "hang_resistant", "marker": str(marker)},
        )
        _wait_for_marker(marker)
        started_at = monotonic()
        with pytest.raises(
            ProviderCalculationCapacityError,
            match="^CHART_PROVIDER_CALCULATION_CAPACITY_TIMEOUT$",
        ):
            runtime.calculate("natal", {"mode": "queued"})
        assert monotonic() - started_at < 1
        with pytest.raises(ProviderCalculationTimeoutError):
            holder.result(timeout=1)


def test_shutdown_cancels_and_reaps_active_children_and_refuses_new_work(tmp_path) -> None:
    children_before = {process.pid for process in active_children()}
    marker = tmp_path / "shutdown-child-started"
    runtime = _spawn_runtime(
        calculation_runner=sigterm_resistant_calculation,
        calculation_timeout_seconds=10,
    )

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(runtime.calculate, "natal", str(marker))
        _wait_for_marker(marker)
        runtime.shutdown()
        with pytest.raises(
            ProviderCalculationShutdownError,
            match="^CHART_PROVIDER_CALCULATION_SHUTDOWN$",
        ):
            future.result(timeout=2)

    with pytest.raises(ProviderCalculationShutdownError):
        runtime.calculate("natal", {"mode": "after-shutdown"})
    assert runtime.active_calculation_count == 0
    assert {process.pid for process in active_children()} <= children_before
