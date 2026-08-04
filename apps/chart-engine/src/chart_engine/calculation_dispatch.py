from typing import Any

from chart_engine.kerykeion_adapter import (
    calculate_astro_calendar_range,
    calculate_astrocartography,
    calculate_composite,
    calculate_horary,
    calculate_natal,
    calculate_planetary_positions,
    calculate_progression,
    calculate_solar_return,
    calculate_synastry,
    calculate_transit,
)
from chart_engine.schemas import ProviderMetadata


def dispatch_provider_calculation(
    operation_name: str,
    request: Any,
    metadata: ProviderMetadata,
) -> Any:
    calculations = {
        "natal": calculate_natal,
        "astrocartography": calculate_astrocartography,
        "astro_calendar": calculate_astro_calendar_range,
        "transit": calculate_transit,
        "synastry": calculate_synastry,
        "composite": calculate_composite,
        "solar_return": calculate_solar_return,
        "progression": calculate_progression,
        "horary": calculate_horary,
        "positions": calculate_planetary_positions,
    }
    try:
        calculation = calculations[operation_name]
    except KeyError as error:
        raise ValueError("CHART_PROVIDER_OPERATION_INVALID") from error
    return calculation(request, metadata)
