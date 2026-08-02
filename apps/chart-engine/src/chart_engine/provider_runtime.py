from collections.abc import Callable
from importlib.metadata import version
from threading import Lock
from typing import TypeVar

import swisseph as swe

from chart_engine.schemas import NatalRequest, ProviderMetadata
from chart_engine.settings import (
    expected_ephemeris,
    expected_ephemeris_data_revision,
    expected_ephemeris_flags,
)


T = TypeVar("T")

KERYKEION_VERSION = "5.12.9"
PYSWISSEPH_VERSION = "2.10.3.2"


class ProviderReadinessError(RuntimeError):
    pass


class ProviderRuntime:
    def __init__(
        self,
        *,
        version_reader: Callable[[str], str] = version,
        sentinel: Callable[[], None] | None = None,
    ) -> None:
        self._lock = Lock()
        self._version_reader = version_reader
        self._sentinel = sentinel or self._default_sentinel
        self._expected_ephemeris = expected_ephemeris()
        self._expected_flags = expected_ephemeris_flags()
        self._expected_data_revision = expected_ephemeris_data_revision()
        self._metadata = self._detect_metadata()

    def metadata(self) -> ProviderMetadata:
        return self._metadata.model_copy(deep=True)

    def ready(self) -> ProviderMetadata:
        with self._lock:
            self._validate_profile()
            self._sentinel()
            return self.metadata()

    def calculate(self, operation: Callable[[], T]) -> T:
        with self._lock:
            return operation()

    def _detect_metadata(self) -> ProviderMetadata:
        _, returned_flags = swe.calc_ut(
            2451545.0,
            swe.SUN,
            swe.FLG_SWIEPH | swe.FLG_SPEED,
        )
        backend = "moshier" if returned_flags & swe.FLG_MOSEPH else "swiss-ephemeris"
        flags = [backend]
        if returned_flags & swe.FLG_SPEED:
            flags.append("speed")
        return ProviderMetadata(
            name="kerykeion",
            version=self._version_reader("kerykeion"),
            ephemeris=backend,
            pyswissephVersion=self._version_reader("pyswisseph"),
            ephemerisFlags=flags,
            ephemerisDataRevision=(
                self._expected_data_revision if backend == "swiss-ephemeris" else None
            ),
        )

    def _validate_profile(self) -> None:
        if self._metadata.version != KERYKEION_VERSION:
            raise ProviderReadinessError("KERYKEION_VERSION_MISMATCH")
        if self._metadata.pyswissephVersion != PYSWISSEPH_VERSION:
            raise ProviderReadinessError("PYSWISSEPH_VERSION_MISMATCH")
        if self._metadata.ephemeris != self._expected_ephemeris:
            raise ProviderReadinessError("EPHEMERIS_BACKEND_MISMATCH")
        if tuple(self._metadata.ephemerisFlags) != self._expected_flags:
            raise ProviderReadinessError("EPHEMERIS_FLAGS_MISMATCH")
        if self._metadata.ephemerisDataRevision != self._expected_data_revision:
            raise ProviderReadinessError("EPHEMERIS_DATA_REVISION_MISMATCH")

    def _default_sentinel(self) -> None:
        from chart_engine.canonical_validation import validate_calculation_result
        from chart_engine.kerykeion_adapter import calculate_natal

        request = NatalRequest(
            schemaVersion="chart-request.v2",
            method="natal",
            methodVersion="chart.natal.kerykeion-5.12.v2",
            executionProfile={
                "provider": "kerykeion",
                "kerykeionVersion": KERYKEION_VERSION,
                "pyswissephVersion": PYSWISSEPH_VERSION,
                "expectedEphemeris": self._expected_ephemeris,
                "expectedEphemerisFlags": list(self._expected_flags),
                "expectedEphemerisDataRevision": self._expected_data_revision,
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
        validate_calculation_result(calculate_natal(request, self._metadata))
