import json
import logging
from multiprocessing import get_context

import pytest

import chart_engine.main as chart_engine_main
from chart_engine.provider_runtime import (
    ProviderCalculationUnavailableError,
    ProviderReadinessError,
    ProviderRuntime,
)
from chart_engine.schemas import ProviderMetadata
from chart_engine.schemas import (
    AstroCalendarRequest,
    AstrocartographyRequest,
    CompositeRequest,
    HoraryRequest,
    NatalRequest,
    PlanetaryPositionsRequest,
    ProgressionRequest,
    SolarReturnRequest,
    SynastryRequest,
    TransitRequest,
)
from test_request_validation import birth_snapshot, request_payload


SAFE_METADATA = {
    "name": "kerykeion",
    "version": "5.12.9",
    "ephemeris": "moshier",
    "pyswissephVersion": "2.10.3.2",
    "ephemerisFlags": ["FLG_MOSEPH", "FLG_SPEED"],
    "ephemerisDataRevision": None,
}


def safe_probe() -> dict:
    return dict(SAFE_METADATA)


def return_request(
    _operation: str,
    request: object,
    _metadata: ProviderMetadata,
) -> object:
    return request


def fail_with_request(
    _operation: str,
    request: object,
    _metadata: ProviderMetadata,
) -> None:
    raise RuntimeError(str(request))


def test_provider_operation_emits_one_safe_structured_success_record(caplog) -> None:
    sensitive = "PRIVATE_BIRTH_1990-07-15_10:30_Europe-Rome_41.9_12.49"
    runtime = ProviderRuntime(
        sentinel=safe_probe,
        metadata_detector=safe_probe,
        calculation_runner=return_request,
        process_context=get_context("spawn"),
    )

    with caplog.at_level(logging.INFO, logger="chart_engine.provider"):
        assert runtime.calculate("natal", sensitive) == sensitive

    records = _records(caplog, "chart_provider_operation")
    assert records == [
        {
            "durationMs": pytest.approx(records[0]["durationMs"], abs=0.01),
            "ephemerisBackend": "moshier",
            "ephemerisDataRevision": None,
            "event": "chart_provider_operation",
            "kerykeionVersion": "5.12.9",
            "operation": "natal",
            "provider": "kerykeion",
            "pyswissephVersion": "2.10.3.2",
            "result": "success",
        }
    ]
    assert records[0]["durationMs"] >= 0
    assert sensitive not in caplog.text


def test_provider_operation_redacts_exception_messages_and_payloads(caplog) -> None:
    sensitive = "PRIVATE_HORARY_QUESTION_AND_PROVIDER_RESPONSE"
    runtime = ProviderRuntime(
        sentinel=safe_probe,
        metadata_detector=safe_probe,
        calculation_runner=fail_with_request,
        process_context=get_context("spawn"),
    )

    with caplog.at_level(logging.INFO, logger="chart_engine.provider"):
        with pytest.raises(
            ProviderCalculationUnavailableError,
            match="^CHART_PROVIDER_CALCULATION_FAILED$",
        ):
            runtime.calculate("horary", sensitive)

    records = _records(caplog, "chart_provider_operation")
    assert len(records) == 1
    assert records[0] == {
        "durationMs": pytest.approx(records[0]["durationMs"], abs=0.01),
        "errorCode": "CHART_PROVIDER_CALCULATION_FAILED",
        "event": "chart_provider_operation",
        "operation": "horary",
        "result": "transient_failure",
    }
    assert sensitive not in caplog.text


def test_readiness_emits_safe_success_and_failure_records(caplog) -> None:
    sensitive = "PRIVATE_PROVIDER_DIAGNOSTIC_WITH_PATH_AND_COORDINATES"
    ready_runtime = ProviderRuntime(sentinel=safe_probe)
    failed_runtime = ProviderRuntime(
        sentinel=lambda: (_ for _ in ()).throw(ProviderReadinessError(sensitive))
    )

    with caplog.at_level(logging.INFO, logger="chart_engine.provider"):
        ready_runtime.ready()
        with pytest.raises(ProviderReadinessError):
            failed_runtime.ready()

    records = _records(caplog, "chart_provider_readiness")
    assert [record["result"] for record in records] == ["success", "transient_failure"]
    assert records[0]["provider"] == "kerykeion"
    assert records[0]["ephemerisBackend"] == "moshier"
    assert records[1]["errorCode"] == "CHART_PROVIDER_READINESS_UNAVAILABLE"
    assert all(record["durationMs"] >= 0 for record in records)
    assert sensitive not in caplog.text


def test_every_provider_endpoint_passes_its_exact_bounded_operation_name(monkeypatch) -> None:
    observed: list[str] = []

    class OperationObserved(RuntimeError):
        pass

    def observe(operation: str, _calculation) -> None:
        observed.append(operation)
        raise OperationObserved(operation)

    monkeypatch.setattr(chart_engine_main.provider_runtime, "calculate", observe)
    cases = [
        (chart_engine_main.natal, NatalRequest.model_validate(request_payload("natal"))),
        (
            chart_engine_main.astrocartography,
            AstrocartographyRequest.model_validate(request_payload("astrocartography")),
        ),
        (
            chart_engine_main.astro_calendar_range,
            AstroCalendarRequest.model_validate(
                {
                    "start": "2026-08-01",
                    "end": "2026-08-03",
                    "timeZone": "Europe/Moscow",
                    "settings": request_payload("natal")["settings"],
                    "eventTypes": ["global.moon_phase"],
                }
            ),
        ),
        (chart_engine_main.transits, TransitRequest.model_validate(request_payload("transit"))),
        (chart_engine_main.synastry, SynastryRequest.model_validate(request_payload("synastry"))),
        (
            chart_engine_main.composite,
            CompositeRequest.model_validate(request_payload("composite")),
        ),
        (
            chart_engine_main.solar_return,
            SolarReturnRequest.model_validate(request_payload("solar_return")),
        ),
        (
            chart_engine_main.progressions,
            ProgressionRequest.model_validate(request_payload("progression")),
        ),
        (chart_engine_main.horary, HoraryRequest.model_validate(request_payload("horary"))),
        (
            chart_engine_main.positions,
            PlanetaryPositionsRequest.model_validate(
                {
                    "schemaVersion": "chart-positions-request.v1",
                    "method": "planetary_positions",
                    "settings": {"zodiac": "tropical", "nodeType": "true"},
                    "inputSnapshot": birth_snapshot(),
                }
            ),
        ),
    ]

    for endpoint, request in cases:
        with pytest.raises(OperationObserved):
            endpoint(request)

    assert observed == [
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
    ]


def _records(caplog, event: str) -> list[dict]:
    return [
        json.loads(record.getMessage())
        for record in caplog.records
        if record.name == "chart_engine.provider"
        and json.loads(record.getMessage()).get("event") == event
    ]
