import pytest
import swisseph as swe
from fastapi.testclient import TestClient

from chart_engine.kerykeion_adapter import _sample_ascendant_descendant_line
from chart_engine.main import app
from test_request_validation import execution_profile


def _astrocartography_payload():
    return {
        "schemaVersion": "chart-request.v2",
        "method": "astrocartography",
        "methodVersion": "chart.astrocartography.swisseph.v2",
        "executionProfile": execution_profile(),
        "settings": {
            "zodiac": "tropical",
            "houseSystem": "placidus",
            "nodeType": "true",
            "aspectPreset": "major",
            "orbMultiplier": 1.0,
        },
        "inputSnapshot": {
            "birthDate": "1990-07-15",
            "birthTime": "10:30",
            "timezone": "Europe/Rome",
            "latitude": 41.9028,
            "longitude": 12.4964,
            "birthTimePrecision": "exact",
        },
    }


def test_astrocartography_returns_canonical_map_lines():
    client = TestClient(app)
    payload = _astrocartography_payload()

    response = client.post("/v1/astrocartography", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == "chart-result.v2"
    assert data["method"] == "astrocartography"
    assert data["provider"]["name"] == "kerykeion"
    assert data["settings"] == payload["settings"]
    assert data["inputSnapshot"] == payload["inputSnapshot"]

    lines = data["result"]["lines"]
    assert len(lines) == 40
    assert {(line["point"], line["angle"]) for line in lines} == {
        (point, angle)
        for point in {
            "sun",
            "moon",
            "mercury",
            "venus",
            "mars",
            "jupiter",
            "saturn",
            "uranus",
            "neptune",
            "pluto",
        }
        for angle in {"mc", "ic", "asc", "dsc"}
    }
    assert {line["id"] for line in lines} >= {"sun_mc", "sun_ic", "sun_asc", "sun_dsc"}
    assert {
        line["angle"] for line in lines if line["point"] == "sun"
    } == {"mc", "ic", "asc", "dsc"}
    assert all(len(line["path"]) >= 2 for line in lines)
    assert all(
        -90 <= coordinate["latitude"] <= 90
        and -180 <= coordinate["longitude"] <= 180
        for line in lines
        for coordinate in line["path"]
    )

    sun_mc = next(line for line in lines if line["id"] == "sun_mc")
    assert len({round(coordinate["longitude"], 6) for coordinate in sun_mc["path"]}) == 1
    # Provenance: independent PySwissEph right ascension minus Greenwich
    # sidereal time gives 53.974146362860 degrees; IC is its antipode.
    assert sun_mc["path"][0]["longitude"] == pytest.approx(53.974146, abs=0.000001)
    sun_ic = next(line for line in lines if line["id"] == "sun_ic")
    assert sun_ic["path"][0]["longitude"] == pytest.approx(-126.025854, abs=0.000001)
    sun_asc = next(line for line in lines if line["id"] == "sun_asc")
    sun_dsc = next(line for line in lines if line["id"] == "sun_dsc")
    # Independent equatorial horizon solutions at south pole limit, equator,
    # and north pole limit. Latitude order is the polyline order.
    assert len(sun_asc["path"]) == 45
    assert sun_asc["path"][0] == {
        "latitude": -66.0,
        "longitude": pytest.approx(26.453362, abs=0.000001),
    }
    assert sun_asc["path"][22] == {
        "latitude": 0.0,
        "longitude": pytest.approx(-36.025854, abs=0.000001),
    }
    assert sun_asc["path"][-1] == {
        "latitude": 66.0,
        "longitude": pytest.approx(-98.505069, abs=0.000001),
    }
    assert len(sun_dsc["path"]) == 45
    assert sun_dsc["path"][0] == {
        "latitude": -66.0,
        "longitude": pytest.approx(81.494931, abs=0.000001),
    }
    assert sun_dsc["path"][22] == {
        "latitude": 0.0,
        "longitude": pytest.approx(143.974146, abs=0.000001),
    }
    assert sun_dsc["path"][-1] == {
        "latitude": 66.0,
        "longitude": pytest.approx(-153.546638, abs=0.000001),
    }


def test_every_ascendant_descendant_coordinate_is_a_true_planetary_horizon_point():
    response = TestClient(app).post("/v1/astrocartography", json=_astrocartography_payload())

    assert response.status_code == 200
    lines = response.json()["result"]["lines"]
    julian_day = swe.julday(1990, 7, 15, 8.5, swe.GREG_CAL)
    body_ids = {
        "sun": swe.SUN,
        "moon": swe.MOON,
        "mercury": swe.MERCURY,
        "venus": swe.VENUS,
        "mars": swe.MARS,
        "jupiter": swe.JUPITER,
        "saturn": swe.SATURN,
        "uranus": swe.URANUS,
        "neptune": swe.NEPTUNE,
        "pluto": swe.PLUTO,
    }

    for line in lines:
        if line["angle"] not in {"asc", "dsc"}:
            continue
        right_ascension, declination, distance = swe.calc_ut(
            julian_day,
            body_ids[line["point"]],
            swe.FLG_SWIEPH | swe.FLG_EQUATORIAL,
        )[0][:3]
        for coordinate in line["path"]:
            _, true_altitude, _ = swe.azalt(
                julian_day,
                swe.EQU2HOR,
                (coordinate["longitude"], coordinate["latitude"], 0.0),
                0.0,
                0.0,
                (right_ascension, declination, distance),
            )
            hour_angle = (
                swe.sidtime(julian_day) * 15.0
                + coordinate["longitude"]
                - right_ascension
                + 180.0
            ) % 360.0 - 180.0
            assert abs(true_altitude) <= 0.00001
            assert (hour_angle < 0) is (line["angle"] == "asc")


def test_astrocartography_fails_closed_when_no_resolved_polyline_exists():
    julian_day = swe.julday(2026, 3, 20, 12.0, swe.GREG_CAL)

    with pytest.raises(RuntimeError, match="^CHART_ASTROCARTOGRAPHY_LINE_UNRESOLVED$"):
        _sample_ascendant_descendant_line(
            julian_day=julian_day,
            right_ascension=0.0,
            declination=90.0,
            distance=1.0,
            angle="asc",
        )


def test_astrocartography_warns_when_birth_time_is_approximate():
    client = TestClient(app)
    payload = _astrocartography_payload()
    payload["inputSnapshot"]["birthTimePrecision"] = "approximate"

    response = client.post("/v1/astrocartography", json=payload)

    assert response.status_code == 200
    data = response.json()
    warning_codes = {warning["code"] for warning in data["result"]["warnings"]}
    assert "BIRTH_TIME_APPROXIMATE" in warning_codes
    assert "ASTROCARTOGRAPHY_POLAR_REGIONS_OMITTED" in warning_codes
