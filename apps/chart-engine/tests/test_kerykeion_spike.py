from chart_engine.kerykeion_adapter import calculate_natal
from chart_engine.main import provider_runtime
from chart_engine.schemas import NatalInputSnapshot, NatalRequest, NatalSettings
from test_request_validation import execution_profile


def _calculate(request: NatalRequest):
    return provider_runtime.calculate(
        lambda: calculate_natal(request, provider_runtime.metadata())
    )


def test_kerykeion_spike_maps_real_subject_points_and_houses():
    request = NatalRequest(
        schemaVersion="chart-request.v2",
        method="natal",
        methodVersion="chart.natal.kerykeion-5.12.v2",
        executionProfile=execution_profile(),
        settings=NatalSettings(
            houseSystem="placidus",
            nodeType="mean",
            aspectPreset="major",
            orbMultiplier=1.0,
        ),
        inputSnapshot=NatalInputSnapshot(
            birthDate="1990-07-15",
            birthTime="10:30",
            timezone="Europe/Rome",
            latitude=41.9028,
            longitude=12.4964,
            birthTimePrecision="exact",
        ),
    )

    result = _calculate(request)

    assert result.provider.name == "kerykeion"
    assert result.provider.version
    assert result.provider.ephemeris == "moshier"
    assert result.result.houses[0].number == 1
    assert len(result.result.houses) == 12
    point_by_id = {point.id: point for point in result.result.points}
    assert point_by_id["sun"].longitude != 0
    assert point_by_id["north_node"].label == "Mean North Node"
    assert point_by_id["south_node"].label == "Mean South Node"
    assert all(aspect.pointA != aspect.pointB for aspect in result.result.aspects)
    aspect_keys = {(aspect.pointA, aspect.pointB, aspect.type) for aspect in result.result.aspects}
    assert len(aspect_keys) == len(result.result.aspects)


def test_orb_multiplier_changes_natal_aspect_inclusion():
    narrow = _calculate(
        NatalRequest(
            schemaVersion="chart-request.v2",
            method="natal",
            methodVersion="chart.natal.kerykeion-5.12.v2",
            executionProfile=execution_profile(),
            settings=NatalSettings(
                houseSystem="placidus",
                nodeType="true",
                aspectPreset="major",
                orbMultiplier=0.5,
            ),
            inputSnapshot=NatalInputSnapshot(
                birthDate="1990-07-15",
                birthTime="10:30",
                timezone="Europe/Rome",
                latitude=41.9028,
                longitude=12.4964,
                birthTimePrecision="exact",
            ),
        )
    )
    wide = _calculate(
        NatalRequest(
            schemaVersion="chart-request.v2",
            method="natal",
            methodVersion="chart.natal.kerykeion-5.12.v2",
            executionProfile=execution_profile(),
            settings=NatalSettings(
                houseSystem="placidus",
                nodeType="true",
                aspectPreset="major",
                orbMultiplier=1.5,
            ),
            inputSnapshot=NatalInputSnapshot(
                birthDate="1990-07-15",
                birthTime="10:30",
                timezone="Europe/Rome",
                latitude=41.9028,
                longitude=12.4964,
                birthTimePrecision="exact",
            ),
        )
    )

    narrow_keys = {(aspect.pointA, aspect.pointB, aspect.type) for aspect in narrow.result.aspects}
    wide_keys = {(aspect.pointA, aspect.pointB, aspect.type) for aspect in wide.result.aspects}

    assert narrow_keys < wide_keys
