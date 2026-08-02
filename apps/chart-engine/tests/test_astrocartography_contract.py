from fastapi.testclient import TestClient

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
