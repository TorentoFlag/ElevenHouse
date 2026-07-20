# ElevenHouse Chart Engine

Private Python/FastAPI runtime for provider-backed chart calculations.

## First provider

- Provider: Kerykeion 5.12.x
- Runtime: Python >=3.10; local spike verified on Python 3.12.13
- Public service endpoints inside the private backend network: `/live`, `/ready`, `/v1/natal`
- Network exposure: private backend network only; Caddy must not route this service

## Provider boundary

The service returns ElevenHouse canonical chart JSON. It does not return raw Kerykeion models, provider SVG, client names, phone numbers, CRM notes, frontend layout coordinates, or style metadata.

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

## Concurrency

Kerykeion/Swiss Ephemeris calculations are treated as process-isolated work. Increase throughput with Uvicorn worker processes or service replicas after benchmark evidence.
