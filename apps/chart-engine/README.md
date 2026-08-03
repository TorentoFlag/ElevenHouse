# ElevenHouse Chart Engine

Private Python/FastAPI runtime for provider-backed chart calculations.

## First provider

- Provider: Kerykeion 5.12.9 with PySwissEph 2.10.3.2
- Runtime: Python >=3.10; local spike verified on Python 3.12.13
- Public service endpoints inside the private backend network: `/live`, `/ready`, calculation routes under `/v1/*`
- Network exposure: private backend network only; Caddy must not route this service

## Provider boundary

The service accepts strict `chart-request.v2` payloads for chart calculations and
returns validated `chart-result.v2` payloads with exact method versions, actual
provider provenance and a reproducibility fingerprint. It does not return raw
Kerykeion models, provider SVG, client names, phone numbers, CRM notes, frontend
layout coordinates, or style metadata.

The canonical payload has two separate data layers:

- `inputSnapshot`: private birth input used for reproducibility, fingerprints and authorized internal audit;
- `result`: renderable chart data consumed by wheel, tables and deterministic UI summaries.

Do not reuse `inputSnapshot` as public/client-visible render data.

## Kerykeion field mapping

- Subject factory: `AstrologicalSubjectFactory.from_birth_data(..., online=False, lng, lat, tz_str, houses_system_identifier)`
- Required first-slice points: `sun`, `moon`, `mercury`, `venus`, `mars`, `jupiter`, `saturn`, `uranus`, `neptune`, `pluto`, `ascendant`, `medium_coeli`, selected lunar nodes
- True nodes: `true_north_lunar_node`, `true_south_lunar_node`
- Mean nodes: `mean_north_lunar_node`, `mean_south_lunar_node`
- Houses: `first_house` through `twelfth_house`
- Longitude: provider `abs_pos`
- Degree in sign: provider `position`
- Sign: provider three-letter sign normalized to lower-case canonical names
- House number: provider point `house`, mapped from `First_House` through `Twelfth_House`

## Canonical result completeness

The natal render result must include:

- points: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Ascendant, Midheaven, North Node and South Node;
- all 12 houses;
- aspects without self-pairs or duplicate normalized point/type pairs;
- distributions with fixed `elements`, `modalities` and `polarity` keys;
- calculation warnings, including approximate birth time when applicable.

Frontend chart screens render from `result` only. The wheel and tables must not
infer missing houses, points or distributions from private birth input.

## Aspect settings

`orbMultiplier` is applied to provider aspect inclusion and to the returned
`strength` calculation. The supported aspect presets are:

- `major`: conjunction, opposition, square, trine, sextile;
- `major_minor`: major aspects plus semi-sextile, semi-square, quincunx and quintile.

## Concurrency

Every Kerykeion/Swiss Ephemeris operation, including planetary positions,
AstroCalendar and the readiness sentinel, enters one process-local provider
lock. Increase throughput with Uvicorn worker processes or service replicas
after benchmark evidence.

## Provider readiness and ephemeris data

`/ready` runs a canonical natal sentinel in a cancellable child process under
the provider lock. One deadline covers lock acquisition, calculation and child
cleanup. It returns exact provider versions, backend and normalized flags from
that sentinel execution. If Swiss Ephemeris falls back to Moshier, readiness
reports the actual Moshier result and fails the configured Swiss profile.
Provider flags use Swiss API names only: Moshier reports exactly
`FLG_MOSEPH,FLG_SPEED`, while licensed Swiss data reports exactly
`FLG_SWIEPH,FLG_SPEED`. Flag order is not significant. Moshier reports a null
data revision; Swiss data reports `sha256:` followed by 64 lowercase hex
characters.

Production requires all three profile values and passes them consistently to
`astrologer-api`, `chart-worker` and `chart-engine`:

- `CHART_ENGINE_EXPECTED_EPHEMERIS`;
- `CHART_ENGINE_EXPECTED_EPHEMERIS_FLAGS`;
- `CHART_ENGINE_EXPECTED_EPHEMERIS_DATA_REVISION` when packaged Swiss data is expected.

For a licensed Swiss-data deployment, the runtime derives the revision from the
installed Kerykeion `sweph` directory that Kerykeion 5.12.9 actually selects.
It computes a SHA-256 manifest over sorted top-level `.se1` filenames and their
content hashes, then compares it with the expected revision. Missing,
unreadable or symlinked data fails closed. Moshier always reports a null data
revision. The readiness deadline is configurable with
`CHART_ENGINE_READINESS_TIMEOUT_SECONDS` and defaults to five seconds.

The image does not download or package `.se1` files. Adding ephemeris data or
making licensing claims requires separate authority and legal review.
