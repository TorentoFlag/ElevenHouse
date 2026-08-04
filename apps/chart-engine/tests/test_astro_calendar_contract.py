from fastapi.testclient import TestClient

from chart_engine.main import app


def _astro_calendar_payload(event_types=None):
    return {
        "start": "2026-07-01",
        "end": "2026-07-30",
        "timeZone": "Europe/Moscow",
        "settings": {
            "zodiac": "tropical",
            "houseSystem": "placidus",
            "nodeType": "true",
            "aspectPreset": "major",
            "orbMultiplier": 1.0,
        },
        "eventTypes": event_types
        or ["global.moon_phase", "global.eclipse", "global.ingress"],
    }


def _client_snapshot():
    return {
        "clientId": "22222222-2222-4222-8222-222222222222",
        "displayName": "Мария Иванова",
        "initials": "МИ",
        "birthDate": "1990-07-15",
        "birthTime": "14:30",
        "birthTimePrecision": "exact",
        "birthTimezone": "Europe/Moscow",
        "birthLatitude": 55.7558,
        "birthLongitude": 37.6173,
    }


def test_astro_calendar_range_returns_provider_backed_global_events():
    client = TestClient(app)

    response = client.post("/v1/astro-calendar/range", json=_astro_calendar_payload())

    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == "astro-calendar-range.v1"
    assert data["timeZone"] == "Europe/Moscow"
    assert data["range"] == {"start": "2026-07-01", "end": "2026-07-30"}
    assert data["generation"]["status"] == "ready"
    assert data["generation"]["generationId"] is None
    assert data["generation"]["provider"]["name"] == "kerykeion"
    assert data["generation"]["provider"]["ephemeris"] == "moshier"
    assert data["readiness"]["clientsTotal"] == 0
    assert data["events"]
    assert {"global.moon_phase", "global.ingress"}.issubset(
        {event["type"] for event in data["events"]}
    )
    assert all(event["source"] == "global" for event in data["events"])
    assert all(event["clientRefs"] == [] for event in data["events"])
    assert any(event["title"] == "Новолуние" for event in data["events"])
    assert any("входит в знак" in event["title"] for event in data["events"])
    assert all(" enters " not in event["title"] for event in data["events"])


def test_astro_calendar_range_rejects_ranges_over_ninety_three_days():
    client = TestClient(app)
    payload = {
        **_astro_calendar_payload(),
        "start": "2026-01-01",
        "end": "2026-04-05",
    }

    response = client.post("/v1/astro-calendar/range", json=payload)

    assert response.status_code == 422


def test_astro_calendar_rejects_dates_outside_packaged_ephemeris_range():
    client = TestClient(app)
    range_payload = {
        **_astro_calendar_payload(),
        "start": "2400-01-01",
        "end": "2400-01-30",
    }
    client_payload = {
        **_astro_calendar_payload(["client.birthday"]),
        "clients": [{**_client_snapshot(), "birthDate": "1799-12-31"}],
    }

    range_response = client.post("/v1/astro-calendar/range", json=range_payload)
    client_response = client.post("/v1/astro-calendar/range", json=client_payload)

    assert range_response.status_code == 422
    assert client_response.status_code == 422
    assert "CHART_EPHEMERIS_DATE_UNSUPPORTED" in range_response.text
    assert "CHART_EPHEMERIS_DATE_UNSUPPORTED" in client_response.text


def test_astro_calendar_range_returns_client_date_events_from_owner_snapshot():
    client = TestClient(app)

    response = client.post(
        "/v1/astro-calendar/range",
        json={
            **_astro_calendar_payload(["client.birthday", "client.solar_window"]),
            "clients": [_client_snapshot()],
        },
    )

    assert response.status_code == 200
    data = response.json()
    client_events = [event for event in data["events"] if event["source"] == "client"]
    assert {event["type"] for event in client_events} == {
        "client.birthday",
        "client.solar_window",
    }
    assert all(
        event["clientRefs"]
        == [
            {
                "clientId": "22222222-2222-4222-8222-222222222222",
                "displayName": "Мария Иванова",
                "initials": "МИ",
            }
        ]
        for event in client_events
    )
    assert all(
        event["chartLink"]["clientId"] == "22222222-2222-4222-8222-222222222222"
        for event in client_events
    )
    assert data["summary"]["clientEventCount"] == 2
    assert data["readiness"]["clientsTotal"] == 1
    assert data["readiness"]["clientsReady"] == 1
    assert data["warnings"] == []


def test_astro_calendar_range_returns_client_transit_aspects_from_owner_snapshot():
    client = TestClient(app)

    response = client.post(
        "/v1/astro-calendar/range",
        json={
            **_astro_calendar_payload(["client.transit_aspect"]),
            "clients": [_client_snapshot()],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["warnings"] == []
    assert data["summary"]["clientEventCount"] > 0
    transit_event = next(event for event in data["events"] if event["type"] == "client.transit_aspect")
    assert transit_event["source"] == "client"
    assert transit_event["timePrecision"] == "day"
    assert transit_event["clientRefs"] == [
        {
            "clientId": "22222222-2222-4222-8222-222222222222",
            "displayName": "Мария Иванова",
            "initials": "МИ",
        }
    ]
    assert transit_event["chartLink"] == {
        "mode": "transit",
        "clientId": "22222222-2222-4222-8222-222222222222",
        "date": transit_event["startsAt"][:10],
    }
    assert transit_event["dictionaryCodes"][0].startswith("astro_calendar.client.transit.")
