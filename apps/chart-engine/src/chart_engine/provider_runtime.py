import hashlib
from collections.abc import Callable, Mapping
from importlib.metadata import version
from multiprocessing import get_context
from multiprocessing.connection import Connection
from multiprocessing.context import BaseContext
from pathlib import Path
from threading import RLock
from time import monotonic
from typing import Any, TypeVar

import swisseph as swe
import kerykeion

from chart_engine.schemas import NatalRequest, ProviderMetadata
from chart_engine.settings import (
    expected_ephemeris,
    expected_ephemeris_data_revision,
    expected_ephemeris_flags,
    provider_readiness_timeout_seconds,
)


T = TypeVar("T")
Probe = Callable[[], ProviderMetadata | Mapping[str, Any]]

KERYKEION_VERSION = "5.12.9"
PYSWISSEPH_VERSION = "2.10.3.2"


class ProviderReadinessError(RuntimeError):
    pass


class ProviderRuntime:
    def __init__(
        self,
        *,
        sentinel: Probe | None = None,
        readiness_timeout_seconds: float | None = None,
        process_context: BaseContext | None = None,
    ) -> None:
        self._lock = RLock()
        self._sentinel = sentinel or provider_readiness_probe
        self._readiness_timeout_seconds = (
            readiness_timeout_seconds
            if readiness_timeout_seconds is not None
            else provider_readiness_timeout_seconds()
        )
        if self._readiness_timeout_seconds <= 0:
            raise ValueError("PROVIDER_READINESS_TIMEOUT_INVALID")
        self._process_context = process_context or get_context("spawn")
        self._expected_ephemeris = expected_ephemeris()
        self._expected_flags = expected_ephemeris_flags()
        self._expected_data_revision = expected_ephemeris_data_revision()

    def metadata(self) -> ProviderMetadata:
        with self._lock:
            return detect_actual_provider_metadata()

    def ready(self) -> ProviderMetadata:
        deadline = monotonic() + self._readiness_timeout_seconds
        if not self._lock.acquire(timeout=self._readiness_timeout_seconds):
            raise ProviderReadinessError("PROVIDER_READINESS_TIMEOUT")
        try:
            remaining = deadline - monotonic()
            if remaining <= 0:
                raise ProviderReadinessError("PROVIDER_READINESS_TIMEOUT")
            metadata = _run_bounded_probe(
                self._sentinel,
                deadline=deadline,
                process_context=self._process_context,
            )
            self._validate_profile(metadata)
            return metadata
        finally:
            self._lock.release()

    def calculate(self, operation: Callable[[], T]) -> T:
        with self._lock:
            return operation()

    def _validate_profile(self, metadata: ProviderMetadata) -> None:
        if metadata.version != KERYKEION_VERSION:
            raise ProviderReadinessError("KERYKEION_VERSION_MISMATCH")
        if metadata.pyswissephVersion != PYSWISSEPH_VERSION:
            raise ProviderReadinessError("PYSWISSEPH_VERSION_MISMATCH")
        if metadata.ephemeris != self._expected_ephemeris:
            raise ProviderReadinessError("EPHEMERIS_BACKEND_MISMATCH")
        if set(metadata.ephemerisFlags) != set(self._expected_flags):
            raise ProviderReadinessError("EPHEMERIS_FLAGS_MISMATCH")
        if metadata.ephemerisDataRevision != self._expected_data_revision:
            raise ProviderReadinessError("EPHEMERIS_DATA_REVISION_MISMATCH")


def detect_actual_provider_metadata() -> ProviderMetadata:
    data_path = _provider_ephemeris_data_path()
    swe.set_ephe_path(str(data_path))
    _, returned_flags = swe.calc_ut(
        2451545.0,
        swe.SUN,
        swe.FLG_SWIEPH | swe.FLG_SPEED,
    )
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
    artifacts = sorted(
        resolved_root.glob("*.se1"),
        key=lambda path: path.relative_to(resolved_root).as_posix(),
    )
    if not artifacts or any(path.is_symlink() or not path.is_file() for path in artifacts):
        raise ProviderReadinessError("EPHEMERIS_DATA_REVISION_UNPROVEN")
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
) -> ProviderMetadata:
    receive_connection, send_connection = process_context.Pipe(duplex=False)
    process = process_context.Process(
        target=_probe_process_entry,
        args=(send_connection, probe),
        daemon=True,
    )
    try:
        process.start()
        send_connection.close()
        remaining = deadline - monotonic()
        if remaining <= 0 or not receive_connection.poll(remaining):
            _cancel_probe_process(process)
            raise ProviderReadinessError("PROVIDER_READINESS_TIMEOUT")
        status, payload = receive_connection.recv()
        process.join(timeout=max(0.0, deadline - monotonic()))
        if process.is_alive():
            _cancel_probe_process(process)
            raise ProviderReadinessError("PROVIDER_READINESS_TIMEOUT")
        if status != "ok":
            raise ProviderReadinessError(f"PROVIDER_SENTINEL_FAILED:{payload}")
        return ProviderMetadata.model_validate(payload)
    except ProviderReadinessError:
        raise
    except BaseException as error:
        if process.pid is not None and process.is_alive():
            _cancel_probe_process(process)
        raise ProviderReadinessError("PROVIDER_SENTINEL_FAILED") from error
    finally:
        receive_connection.close()
        send_connection.close()
        if process.pid is not None and not process.is_alive():
            process.close()


def _probe_process_entry(connection: Connection, probe: Probe) -> None:
    try:
        metadata = probe()
        value = ProviderMetadata.model_validate(metadata)
        connection.send(("ok", value.model_dump(mode="json")))
    except BaseException as error:
        connection.send(("error", f"{type(error).__name__}:{error}"))
    finally:
        connection.close()


def _cancel_probe_process(process: Any) -> None:
    process.terminate()
    process.join(timeout=0.5)
    if process.is_alive():
        process.kill()
        process.join(timeout=0.5)
    if process.is_alive():
        raise ProviderReadinessError("PROVIDER_SENTINEL_CANCELLATION_FAILED")
