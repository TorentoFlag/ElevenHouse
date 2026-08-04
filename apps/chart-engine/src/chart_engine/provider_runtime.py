import hashlib
import json
import logging
import os
import pickle
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from importlib.metadata import version
from multiprocessing import get_context
from multiprocessing.connection import Connection
from multiprocessing.context import BaseContext
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore, Event, Lock
from time import monotonic
from typing import Any, TypeVar

import swisseph as swe
import kerykeion

from chart_engine.schemas import NatalRequest, ProviderMetadata
from chart_engine.settings import (
    ephemeris_data_directory,
    expected_ephemeris,
    expected_ephemeris_data_revision,
    expected_ephemeris_flags,
    provider_calculation_settings,
    provider_readiness_timeout_seconds,
)


T = TypeVar("T")
Probe = Callable[[], ProviderMetadata | Mapping[str, Any]]
ProviderCalculation = Callable[[str, Any, ProviderMetadata], T]

KERYKEION_VERSION = "5.12.9"
PYSWISSEPH_VERSION = "2.10.3.2"
REQUIRED_SWISS_EPHEMERIS_ARTIFACTS = ("semo_18.se1", "sepl_18.se1")
PROVIDER_OPERATIONS = frozenset(
    {
        "natal",
        "astrocartography",
        "astro_calendar",
        "transit",
        "synastry",
        "composite",
        "solar_return",
        "progression",
        "horary",
        "positions",
    }
)
PROVIDER_LOGGER = logging.getLogger("chart_engine.provider")
PROCESS_TERMINATE_JOIN_SECONDS = 0.1
PROCESS_KILL_JOIN_SECONDS = 0.1
PROCESS_POLL_INTERVAL_SECONDS = 0.05
# A calculation deadline includes reaping a hostile child.  Reserve the bounded
# TERM/KILL window before the provider is allowed to execute.
PROCESS_CANCELLATION_RESERVE_SECONDS = 0.25
# A short bounded admission wait lets ordinary concurrent requests serialize,
# while saturation remains an observable 503 rather than an unbounded queue.
PROCESS_CAPACITY_WAIT_SECONDS = 0.75
SAFE_SENTINEL_FAILURE_CODES = frozenset(
    {
        "CHART_EPHEMERIS_DATA_REVISION_FORBIDDEN",
        "CHART_EPHEMERIS_DATA_REVISION_REQUIRED",
        "CHART_EPHEMERIS_FLAGS_INVALID",
        "EPHEMERIS_BACKEND_INCONSISTENT",
        "EPHEMERIS_BACKEND_UNPROVEN",
        "EPHEMERIS_DATA_ARTIFACTS_INCOMPLETE",
        "EPHEMERIS_DATA_REVISION_UNPROVEN",
        "EPHEMERIS_FLAGS_UNPROVEN",
        "EPHEMERIS_BACKEND_MISMATCH",
        "EPHEMERIS_DATA_REVISION_MISMATCH",
        "EPHEMERIS_FLAGS_MISMATCH",
        "KERYKEION_VERSION_MISMATCH",
        "PYSWISSEPH_VERSION_MISMATCH",
        "PROVIDER_SENTINEL_FINGERPRINT_MISMATCH",
    }
)


class ProviderReadinessError(RuntimeError):
    pass


class ProviderReadinessUnavailableError(ProviderReadinessError):
    pass


class ProviderCalculationError(RuntimeError):
    pass


class ProviderCalculationUnavailableError(ProviderCalculationError):
    pass


class ProviderCalculationTimeoutError(ProviderCalculationUnavailableError):
    pass


class ProviderCalculationCapacityError(ProviderCalculationUnavailableError):
    pass


class ProviderCalculationShutdownError(ProviderCalculationUnavailableError):
    pass


@dataclass
class _ChildProcessHandle:
    process: Any
    kind: str
    cancellation_lock: Any = field(default_factory=Lock)


@dataclass
class _CalculationReapState:
    unreaped_child: bool = False


class ProviderRuntime:
    def __init__(
        self,
        *,
        sentinel: Probe | None = None,
        readiness_timeout_seconds: float | None = None,
        metadata_detector: Probe | None = None,
        calculation_runner: ProviderCalculation[Any] | None = None,
        calculation_timeout_seconds: float | None = None,
        calculation_concurrency: int | None = None,
        process_context: BaseContext | None = None,
    ) -> None:
        self._sentinel = sentinel or provider_readiness_probe
        self._readiness_timeout_seconds = (
            readiness_timeout_seconds
            if readiness_timeout_seconds is not None
            else provider_readiness_timeout_seconds()
        )
        if self._readiness_timeout_seconds <= 0:
            raise ValueError("PROVIDER_READINESS_TIMEOUT_INVALID")
        calculation_settings = provider_calculation_settings()
        self._calculation_timeout_seconds = (
            calculation_timeout_seconds
            if calculation_timeout_seconds is not None
            else calculation_settings.timeout_seconds
        )
        self._calculation_concurrency = (
            calculation_concurrency
            if calculation_concurrency is not None
            else calculation_settings.concurrency
        )
        if self._calculation_timeout_seconds <= 0:
            raise ValueError("PROVIDER_CALCULATION_TIMEOUT_INVALID")
        if self._calculation_concurrency <= 0:
            raise ValueError("PROVIDER_CALCULATION_CONCURRENCY_INVALID")
        self._process_context = process_context or get_context("spawn")
        self._metadata_detector = metadata_detector or detect_actual_provider_metadata
        if calculation_runner is None:
            from chart_engine.calculation_dispatch import dispatch_provider_calculation

            calculation_runner = dispatch_provider_calculation
        self._calculation_runner = calculation_runner
        self._expected_ephemeris = expected_ephemeris()
        self._expected_flags = expected_ephemeris_flags()
        self._expected_data_revision = expected_ephemeris_data_revision()
        self._capacity = BoundedSemaphore(self._calculation_concurrency)
        self._shutdown_event = Event()
        self._state_lock = Lock()
        self._active_children: dict[int, _ChildProcessHandle] = {}

    @property
    def active_calculation_count(self) -> int:
        with self._state_lock:
            return sum(handle.kind == "calculation" for handle in self._active_children.values())

    def metadata(self) -> ProviderMetadata:
        if self._shutdown_event.is_set():
            raise ProviderCalculationShutdownError("CHART_PROVIDER_CALCULATION_SHUTDOWN")
        if not self._capacity.acquire(timeout=self._readiness_timeout_seconds):
            raise ProviderReadinessUnavailableError("PROVIDER_READINESS_TIMEOUT")
        try:
            return ProviderMetadata.model_validate(self._metadata_detector())
        finally:
            self._capacity.release()

    def ready(self) -> ProviderMetadata:
        started_at = monotonic()
        deadline = monotonic() + self._readiness_timeout_seconds
        metadata: ProviderMetadata | None = None
        acquired = False
        try:
            if self._shutdown_event.is_set():
                raise ProviderReadinessUnavailableError("PROVIDER_RUNTIME_SHUTDOWN")
            acquired = self._capacity.acquire(timeout=self._readiness_timeout_seconds)
            if not acquired:
                raise ProviderReadinessUnavailableError("PROVIDER_READINESS_TIMEOUT")
            remaining = deadline - monotonic()
            if remaining <= 0:
                raise ProviderReadinessUnavailableError("PROVIDER_READINESS_TIMEOUT")
            metadata = _run_bounded_probe(
                self._sentinel,
                deadline=deadline,
                process_context=self._process_context,
                start_child=self._start_child,
                finish_child=self._finish_child,
                shutdown_event=self._shutdown_event,
            )
            self._validate_profile(metadata)
            _log_provider_event(
                logging.INFO,
                {
                    "event": "chart_provider_readiness",
                    "result": "success",
                    "durationMs": _duration_ms(started_at),
                    **_safe_metadata_fields(metadata),
                },
            )
            return metadata
        except ProviderReadinessUnavailableError:
            _log_provider_event(
                logging.WARNING,
                {
                    "event": "chart_provider_readiness",
                    "result": "transient_failure",
                    "durationMs": _duration_ms(started_at),
                    "errorCode": "CHART_PROVIDER_READINESS_UNAVAILABLE",
                },
            )
            raise
        except ProviderReadinessError:
            _log_provider_event(
                logging.ERROR,
                {
                    "event": "chart_provider_readiness",
                    "result": "permanent_failure",
                    "durationMs": _duration_ms(started_at),
                    "errorCode": "CHART_PROVIDER_PROFILE_INVALID",
                },
            )
            raise
        except BaseException:
            _log_provider_event(
                logging.ERROR,
                {
                    "event": "chart_provider_readiness",
                    "result": "transient_failure",
                    "durationMs": _duration_ms(started_at),
                    "errorCode": "CHART_PROVIDER_READINESS_UNAVAILABLE",
                },
            )
            raise
        finally:
            if acquired:
                self._capacity.release()

    def calculate(self, operation_name: str, request: Any) -> T:
        if operation_name not in PROVIDER_OPERATIONS:
            raise ValueError("CHART_PROVIDER_OPERATION_INVALID")
        started_at = monotonic()
        deadline = started_at + self._calculation_timeout_seconds
        metadata: ProviderMetadata | None = None
        acquired = False
        reap_state = _CalculationReapState()
        try:
            if self._shutdown_event.is_set():
                raise ProviderCalculationShutdownError("CHART_PROVIDER_CALCULATION_SHUTDOWN")
            # Keep the in-process queue short. The caller owns idempotent retry,
            # while the engine retains enough of its deadline to reap a child.
            execution_deadline = deadline - PROCESS_CANCELLATION_RESERVE_SECONDS
            capacity_wait_seconds = min(
                PROCESS_CAPACITY_WAIT_SECONDS,
                max(0.0, execution_deadline - monotonic()),
            )
            acquired = self._capacity.acquire(timeout=capacity_wait_seconds)
            if not acquired:
                raise ProviderCalculationCapacityError(
                    "CHART_PROVIDER_CALCULATION_CAPACITY_TIMEOUT"
                )
            if execution_deadline <= monotonic():
                raise ProviderCalculationTimeoutError("CHART_PROVIDER_CALCULATION_TIMEOUT")
            metadata, result = _run_bounded_calculation(
                operation_name,
                request,
                deadline=execution_deadline,
                process_context=self._process_context,
                metadata_detector=self._metadata_detector,
                calculation_runner=self._calculation_runner,
                expected_ephemeris=self._expected_ephemeris,
                expected_flags=self._expected_flags,
                expected_data_revision=self._expected_data_revision,
                start_child=self._start_child,
                finish_child=self._finish_child,
                shutdown_event=self._shutdown_event,
                reap_state=reap_state,
            )
            _log_provider_event(
                logging.INFO,
                {
                    "event": "chart_provider_operation",
                    "operation": operation_name,
                    "result": "success",
                    "durationMs": _duration_ms(started_at),
                    **_safe_metadata_fields(metadata),
                },
            )
            return result
        except ProviderCalculationTimeoutError:
            self._log_calculation_failure(
                operation_name,
                started_at,
                error_code="CHART_PROVIDER_CALCULATION_TIMEOUT",
            )
            raise
        except ProviderCalculationCapacityError:
            self._log_calculation_failure(
                operation_name,
                started_at,
                error_code="CHART_PROVIDER_CALCULATION_CAPACITY_TIMEOUT",
            )
            raise
        except ProviderCalculationShutdownError:
            self._log_calculation_failure(
                operation_name,
                started_at,
                error_code="CHART_PROVIDER_CALCULATION_SHUTDOWN",
            )
            raise
        except ProviderReadinessError:
            _log_provider_event(
                logging.ERROR,
                {
                    "event": "chart_provider_operation",
                    "operation": operation_name,
                    "result": "permanent_failure",
                    "durationMs": _duration_ms(started_at),
                    "errorCode": "CHART_PROVIDER_PROFILE_INVALID",
                },
            )
            raise
        except ProviderCalculationUnavailableError as error:
            self._log_calculation_failure(
                operation_name,
                started_at,
                error_code=str(error),
            )
            raise
        except BaseException as error:
            self._log_calculation_failure(
                operation_name,
                started_at,
                error_code="CHART_PROVIDER_CALCULATION_FAILED",
            )
            raise ProviderCalculationUnavailableError(
                "CHART_PROVIDER_CALCULATION_FAILED"
            ) from error
        finally:
            if acquired and not reap_state.unreaped_child:
                self._capacity.release()

    def shutdown(self) -> None:
        with self._state_lock:
            self._shutdown_event.set()
            active = tuple(self._active_children.values())
        for handle in active:
            _cancel_child_process(
                handle,
                cancellation_error=lambda: ProviderCalculationUnavailableError(
                    "CHART_PROVIDER_CALCULATION_CANCELLATION_FAILED"
                ),
            )
            self._finish_child(handle)

    def _start_child(self, process: Any, *, kind: str) -> _ChildProcessHandle:
        with self._state_lock:
            if self._shutdown_event.is_set():
                raise ProviderCalculationShutdownError("CHART_PROVIDER_CALCULATION_SHUTDOWN")
            process.start()
            handle = _ChildProcessHandle(process=process, kind=kind)
            self._active_children[id(handle)] = handle
            return handle

    def _finish_child(self, handle: _ChildProcessHandle) -> bool:
        reaped = _close_child_process(handle)
        if reaped:
            with self._state_lock:
                self._active_children.pop(id(handle), None)
        return reaped

    def _log_calculation_failure(
        self,
        operation_name: str,
        started_at: float,
        *,
        error_code: str,
    ) -> None:
        _log_provider_event(
            logging.ERROR,
            {
                "event": "chart_provider_operation",
                "operation": operation_name,
                "result": "transient_failure",
                "durationMs": _duration_ms(started_at),
                "errorCode": error_code,
            },
        )

    def _validate_profile(self, metadata: ProviderMetadata) -> None:
        _validate_provider_profile(
            metadata,
            expected_ephemeris=self._expected_ephemeris,
            expected_flags=self._expected_flags,
            expected_data_revision=self._expected_data_revision,
        )


def detect_actual_provider_metadata() -> ProviderMetadata:
    data_path = _provider_ephemeris_data_path()
    swe.set_ephe_path(str(data_path))
    returned_flags_by_body = []
    for body in (swe.SUN, swe.MOON):
        _, returned_flags = swe.calc_ut(
            2451545.0,
            body,
            swe.FLG_SWIEPH | swe.FLG_SPEED,
        )
        returned_flags_by_body.append(returned_flags)
    backend_profiles = [_backend_profile(flags) for flags in returned_flags_by_body]
    if len(set(backend_profiles)) != 1:
        raise ProviderReadinessError("EPHEMERIS_BACKEND_INCONSISTENT")
    backend, backend_flag = backend_profiles[0]
    flags = [backend_flag, "FLG_SPEED"]
    revision = None
    if backend == "swiss-ephemeris":
        revision = _ephemeris_artifact_revision(data_path)
    return ProviderMetadata(
        name="kerykeion",
        version=version("kerykeion"),
        ephemeris=backend,
        pyswissephVersion=version("pyswisseph"),
        ephemerisFlags=flags,
        ephemerisDataRevision=revision,
    )


def _backend_profile(returned_flags: int) -> tuple[str, str]:
    backend_flags = returned_flags & (swe.FLG_MOSEPH | swe.FLG_SWIEPH)
    if backend_flags == swe.FLG_MOSEPH:
        backend = "moshier"
        backend_flag = "FLG_MOSEPH"
    elif backend_flags == swe.FLG_SWIEPH:
        backend = "swiss-ephemeris"
        backend_flag = "FLG_SWIEPH"
    else:
        raise ProviderReadinessError("EPHEMERIS_BACKEND_UNPROVEN")
    supported_flags = swe.FLG_MOSEPH | swe.FLG_SWIEPH | swe.FLG_SPEED
    if returned_flags & ~supported_flags or not returned_flags & swe.FLG_SPEED:
        raise ProviderReadinessError("EPHEMERIS_FLAGS_UNPROVEN")
    return backend, backend_flag


def _validate_provider_profile(
    metadata: ProviderMetadata,
    *,
    expected_ephemeris: str,
    expected_flags: tuple[str, ...],
    expected_data_revision: str | None,
) -> None:
    if metadata.version != KERYKEION_VERSION:
        raise ProviderReadinessError("KERYKEION_VERSION_MISMATCH")
    if metadata.pyswissephVersion != PYSWISSEPH_VERSION:
        raise ProviderReadinessError("PYSWISSEPH_VERSION_MISMATCH")
    if metadata.ephemeris != expected_ephemeris:
        raise ProviderReadinessError("EPHEMERIS_BACKEND_MISMATCH")
    if set(metadata.ephemerisFlags) != set(expected_flags):
        raise ProviderReadinessError("EPHEMERIS_FLAGS_MISMATCH")
    if metadata.ephemerisDataRevision != expected_data_revision:
        raise ProviderReadinessError("EPHEMERIS_DATA_REVISION_MISMATCH")


def provider_readiness_probe() -> ProviderMetadata:
    from chart_engine.canonical_validation import (
        reproducibility_fingerprint_for_result,
        validate_calculation_result,
    )
    from chart_engine.kerykeion_adapter import calculate_natal

    metadata = detect_actual_provider_metadata()
    request = NatalRequest(
        schemaVersion="chart-request.v2",
        method="natal",
        methodVersion="chart.natal.kerykeion-5.12.v2",
        executionProfile={
            "provider": "kerykeion",
            "kerykeionVersion": KERYKEION_VERSION,
            "pyswissephVersion": PYSWISSEPH_VERSION,
            "expectedEphemeris": metadata.ephemeris,
            "expectedEphemerisFlags": metadata.ephemerisFlags,
            "expectedEphemerisDataRevision": metadata.ephemerisDataRevision,
        },
        settings={
            "zodiac": "tropical",
            "houseSystem": "placidus",
            "nodeType": "true",
            "aspectPreset": "major",
            "orbMultiplier": 1.0,
        },
        inputSnapshot={
            "birthDate": "2000-01-01",
            "birthTime": "12:00",
            "timezone": "UTC",
            "latitude": 0.0,
            "longitude": 0.0,
            "birthTimePrecision": "exact",
        },
    )
    result = calculate_natal(request, metadata)
    validate_calculation_result(result)
    if result.reproducibilityFingerprint != reproducibility_fingerprint_for_result(result):
        raise ProviderReadinessError("PROVIDER_SENTINEL_FINGERPRINT_MISMATCH")
    return metadata


def _provider_ephemeris_data_path() -> Path:
    configured = ephemeris_data_directory()
    if configured is not None:
        return configured
    if kerykeion.__file__ is None:
        raise ProviderReadinessError("EPHEMERIS_DATA_REVISION_UNPROVEN")
    return Path(kerykeion.__file__).resolve().parent / "sweph"


def _ephemeris_artifact_revision(root: Path) -> str:
    try:
        resolved_root = root.resolve(strict=True)
    except OSError as error:
        raise ProviderReadinessError("EPHEMERIS_DATA_REVISION_UNPROVEN") from error
    if root.is_symlink() or not resolved_root.is_dir():
        raise ProviderReadinessError("EPHEMERIS_DATA_REVISION_UNPROVEN")
    artifacts = [resolved_root / name for name in REQUIRED_SWISS_EPHEMERIS_ARTIFACTS]
    if any(path.is_symlink() or not path.is_file() for path in artifacts):
        raise ProviderReadinessError("EPHEMERIS_DATA_ARTIFACTS_INCOMPLETE")
    digest = hashlib.sha256()
    for artifact in artifacts:
        relative_name = artifact.relative_to(resolved_root).as_posix()
        artifact_digest = hashlib.sha256()
        try:
            with artifact.open("rb") as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    artifact_digest.update(chunk)
        except OSError as error:
            raise ProviderReadinessError("EPHEMERIS_DATA_REVISION_UNPROVEN") from error
        digest.update(relative_name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(artifact_digest.digest())
    return f"sha256:{digest.hexdigest()}"


def _run_bounded_probe(
    probe: Probe,
    *,
    deadline: float,
    process_context: BaseContext,
    start_child: Any,
    finish_child: Any,
    shutdown_event: Event,
) -> ProviderMetadata:
    receive_connection, send_connection = process_context.Pipe(duplex=False)
    process = process_context.Process(
        target=_probe_process_entry,
        args=(send_connection, probe),
        daemon=True,
    )
    handle: _ChildProcessHandle | None = None
    try:
        handle = start_child(process, kind="readiness")
        send_connection.close()
        while True:
            if shutdown_event.is_set():
                _cancel_child_process(
                    handle,
                    cancellation_error=lambda: ProviderReadinessUnavailableError(
                        "PROVIDER_SENTINEL_CANCELLATION_FAILED"
                    ),
                )
                raise ProviderReadinessUnavailableError("PROVIDER_RUNTIME_SHUTDOWN")
            remaining = deadline - monotonic()
            if remaining <= 0:
                _cancel_child_process(
                    handle,
                    cancellation_error=lambda: ProviderReadinessUnavailableError(
                        "PROVIDER_SENTINEL_CANCELLATION_FAILED"
                    ),
                )
                raise ProviderReadinessUnavailableError("PROVIDER_READINESS_TIMEOUT")
            if receive_connection.poll(min(remaining, PROCESS_POLL_INTERVAL_SECONDS)):
                break
        try:
            status, payload = receive_connection.recv()
        except EOFError as error:
            process.join(timeout=max(0.0, deadline - monotonic()))
            raise ProviderReadinessUnavailableError("PROVIDER_SENTINEL_FAILED") from error
        process.join(timeout=max(0.0, deadline - monotonic()))
        if process.is_alive():
            _cancel_child_process(
                handle,
                cancellation_error=lambda: ProviderReadinessUnavailableError(
                    "PROVIDER_SENTINEL_CANCELLATION_FAILED"
                ),
            )
            raise ProviderReadinessUnavailableError("PROVIDER_READINESS_TIMEOUT")
        if process.exitcode != 0:
            raise ProviderReadinessUnavailableError("PROVIDER_SENTINEL_FAILED")
        if status != "ok":
            if payload in SAFE_SENTINEL_FAILURE_CODES:
                raise ProviderReadinessError(payload)
            raise ProviderReadinessUnavailableError("PROVIDER_SENTINEL_FAILED")
        return ProviderMetadata.model_validate(payload)
    except ProviderReadinessError:
        raise
    except BaseException as error:
        if handle is not None:
            _cancel_child_process(
                handle,
                cancellation_error=lambda: ProviderReadinessUnavailableError(
                    "PROVIDER_SENTINEL_CANCELLATION_FAILED"
                ),
            )
        raise ProviderReadinessUnavailableError("PROVIDER_SENTINEL_FAILED") from error
    finally:
        receive_connection.close()
        send_connection.close()
        if handle is not None:
            finish_child(handle)


def _probe_process_entry(connection: Connection, probe: Probe) -> None:
    try:
        metadata = probe()
        value = ProviderMetadata.model_validate(metadata)
        connection.send(("ok", value.model_dump(mode="json")))
    except BaseException as error:
        connection.send(("error", _safe_sentinel_failure_code(error)))
    finally:
        connection.close()


def _run_bounded_calculation(
    operation_name: str,
    request: Any,
    *,
    deadline: float,
    process_context: BaseContext,
    metadata_detector: Probe,
    calculation_runner: ProviderCalculation[T],
    expected_ephemeris: str,
    expected_flags: tuple[str, ...],
    expected_data_revision: str | None,
    start_child: Any,
    finish_child: Any,
    shutdown_event: Event,
    reap_state: _CalculationReapState,
) -> tuple[ProviderMetadata, T]:
    # Calculation payloads can be much larger than Pipe's control buffer.  A
    # Pipe can become readable after only a frame header, then block indefinitely
    # in recv() while a child stalls mid-write.  The child therefore publishes a
    # private atomic file and exits; the parent polls only process liveness.
    with TemporaryDirectory(prefix="elevenhouse-chart-result-") as transport_directory:
        result_path = Path(transport_directory) / "result.pickle"
        process = process_context.Process(
            target=_calculation_process_entry,
            args=(
                str(result_path),
                operation_name,
                request,
                metadata_detector,
                calculation_runner,
                expected_ephemeris,
                expected_flags,
                expected_data_revision,
            ),
            daemon=True,
        )
        handle: _ChildProcessHandle | None = None
        try:
            handle = start_child(process, kind="calculation")
            while process.is_alive():
                if shutdown_event.is_set():
                    _cancel_child_process(
                        handle,
                        cancellation_error=lambda: ProviderCalculationUnavailableError(
                            "CHART_PROVIDER_CALCULATION_CANCELLATION_FAILED"
                        ),
                    )
                    raise ProviderCalculationShutdownError(
                        "CHART_PROVIDER_CALCULATION_SHUTDOWN"
                    )
                remaining = deadline - monotonic()
                if remaining <= 0:
                    _cancel_child_process(
                        handle,
                        cancellation_error=lambda: ProviderCalculationUnavailableError(
                            "CHART_PROVIDER_CALCULATION_CANCELLATION_FAILED"
                        ),
                    )
                    raise ProviderCalculationTimeoutError(
                        "CHART_PROVIDER_CALCULATION_TIMEOUT"
                    )
                process.join(timeout=min(remaining, PROCESS_POLL_INTERVAL_SECONDS))
            process.join(timeout=0)
            if process.exitcode != 0:
                raise ProviderCalculationUnavailableError(
                    "CHART_PROVIDER_CALCULATION_CRASHED"
                )
            status, metadata_payload, payload = _read_calculation_transport(result_path)
            if status == "profile_error":
                raise ProviderReadinessError(str(payload))
            if status != "ok":
                raise ProviderCalculationUnavailableError(
                    "CHART_PROVIDER_CALCULATION_FAILED"
                )
            metadata = ProviderMetadata.model_validate(metadata_payload)
            return metadata, payload
        except (
            ProviderCalculationError,
            ProviderReadinessError,
        ):
            raise
        except BaseException as error:
            if handle is not None:
                _cancel_child_process(
                    handle,
                    cancellation_error=lambda: ProviderCalculationUnavailableError(
                        "CHART_PROVIDER_CALCULATION_CANCELLATION_FAILED"
                    ),
                )
            raise ProviderCalculationUnavailableError(
                "CHART_PROVIDER_CALCULATION_CRASHED"
            ) from error
        finally:
            if handle is not None:
                if not finish_child(handle):
                    # Preserve the acquired token until a process restart. A
                    # live native child is safer as a visible saturated engine
                    # than silently allowing work above the configured cap.
                    reap_state.unreaped_child = True


def _calculation_process_entry(
    result_path: str,
    operation_name: str,
    request: Any,
    metadata_detector: Probe,
    calculation_runner: ProviderCalculation[Any],
    expected_ephemeris: str,
    expected_flags: tuple[str, ...],
    expected_data_revision: str | None,
) -> None:
    try:
        metadata = ProviderMetadata.model_validate(metadata_detector())
        _validate_provider_profile(
            metadata,
            expected_ephemeris=expected_ephemeris,
            expected_flags=expected_flags,
            expected_data_revision=expected_data_revision,
        )
        result = calculation_runner(operation_name, request, metadata)
        _write_calculation_transport(
            result_path,
            ("ok", metadata.model_dump(mode="json"), result),
        )
    except ProviderReadinessError as error:
        _write_calculation_transport(
            result_path,
            ("profile_error", None, _safe_sentinel_failure_code(error)),
        )
    except BaseException:
        _write_calculation_transport(
            result_path,
            ("error", None, "CHART_PROVIDER_CALCULATION_FAILED"),
        )


def _write_calculation_transport(
    result_path: str,
    payload: tuple[str, dict[str, Any] | None, Any],
) -> None:
    target = Path(result_path)
    partial = target.with_suffix(".partial")
    with partial.open("wb") as output:
        pickle.dump(payload, output, protocol=pickle.HIGHEST_PROTOCOL)
        output.flush()
        os.fsync(output.fileno())
    os.replace(partial, target)


def _read_calculation_transport(
    result_path: Path,
) -> tuple[str, dict[str, Any] | None, Any]:
    try:
        with result_path.open("rb") as source:
            payload = pickle.load(source)
    except (OSError, EOFError, pickle.PickleError) as error:
        raise ProviderCalculationUnavailableError(
            "CHART_PROVIDER_CALCULATION_CRASHED"
        ) from error
    if (
        not isinstance(payload, tuple)
        or len(payload) != 3
        or not isinstance(payload[0], str)
        or (payload[1] is not None and not isinstance(payload[1], dict))
    ):
        raise ProviderCalculationUnavailableError("CHART_PROVIDER_CALCULATION_CRASHED")
    return payload


def _cancel_child_process(
    handle: _ChildProcessHandle,
    *,
    cancellation_error: Callable[[], RuntimeError],
) -> None:
    with handle.cancellation_lock:
        process = handle.process
        try:
            alive = process.is_alive()
        except ValueError:
            return
        if not alive:
            process.join(timeout=0)
            return
        process.terminate()
        process.join(timeout=PROCESS_TERMINATE_JOIN_SECONDS)
        if process.is_alive():
            process.kill()
            process.join(timeout=PROCESS_KILL_JOIN_SECONDS)
        if process.is_alive():
            raise cancellation_error()


def _close_child_process(handle: _ChildProcessHandle) -> bool:
    with handle.cancellation_lock:
        process = handle.process
        try:
            if process.is_alive():
                return False
            process.join(timeout=0)
            process.close()
        except ValueError:
            return True
        return True


def _duration_ms(started_at: float) -> float:
    return round((monotonic() - started_at) * 1000, 3)


def _safe_sentinel_failure_code(error: BaseException) -> str:
    diagnostic = str(error)
    for code in SAFE_SENTINEL_FAILURE_CODES:
        if code in diagnostic:
            return code
    return "PROVIDER_SENTINEL_FAILED"


def _safe_metadata_fields(metadata: ProviderMetadata) -> dict[str, Any]:
    return {
        "provider": metadata.name,
        "kerykeionVersion": metadata.version,
        "pyswissephVersion": metadata.pyswissephVersion,
        "ephemerisBackend": metadata.ephemeris,
        "ephemerisDataRevision": metadata.ephemerisDataRevision,
    }


def _log_provider_event(level: int, fields: Mapping[str, Any]) -> None:
    PROVIDER_LOGGER.log(
        level,
        json.dumps(fields, ensure_ascii=True, separators=(",", ":"), sort_keys=True),
    )
