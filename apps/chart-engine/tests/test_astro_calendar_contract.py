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
    assert data["generation"]["provider"]["ephemeris"] == "swiss-ephemeris"
    assert data["readiness"]["clientsTotal"] == 0
    assert data["events"]
    assert {"global.moon_phase", "global.ingress"}.issubset(
        {event["type"] for event in data["events"]}
    )
    assert all(event["source"] == "global" for event in data["events"])
    assert all(event["clientRefs"] == [] for event in data["events"])


def test_astro_calendar_range_rejects_ranges_over_ninety_three_days():
    client = TestClient(app)
    payload = {
        **_astro_calendar_payload(),
        "start": "2026-01-01",
        "end": "2026-04-05",
    }

    response = client.post("/v1/astro-calendar/range", json=payload)

    assert response.status_code == 422


def test_astro_calendar_range_warns_for_client_events_without_fake_provider_data():
    client = TestClient(app)

    response = client.post(
        "/v1/astro-calendar/range",
        json=_astro_calendar_payload(["client.birthday", "global.ingress"]),
    )

    assert response.status_code == 200
    data = response.json()
    assert {event["type"] for event in data["events"]} == {"global.ingress"}
    assert data["warnings"] == [
        {
            "code": "PROVIDER_PRECISION_LIMITED",
            "severity": "warning",
            "message": "Chart engine does not generate client.birthday without owner-scoped CRM data.",
            "clientId": None,
            "eventId": None,
            "dictionaryCode": None,
            "action": None,
        }
    ]
