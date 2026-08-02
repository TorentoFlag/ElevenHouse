from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class CivilTimeError(ValueError):
    pass


@dataclass(frozen=True)
class CivilTimeResolution:
    kind: Literal["resolved", "ambiguous", "nonexistent"]
    instant: str | None = None
    first_instant: str | None = None
    second_instant: str | None = None


@dataclass(frozen=True)
class ResolvedCivilTime:
    instant: str
    occurrence: Literal["first", "second"] | None


def inspect_civil_time(
    date_value: str,
    time_value: str,
    timezone_value: str,
) -> CivilTimeResolution:
    local_date = _parse_date(date_value)
    local_time = _parse_time(time_value)
    zone = _parse_zone(timezone_value)
    requested = datetime.combine(local_date, local_time)
    candidates: list[datetime] = []

    for fold in (0, 1):
        candidate = requested.replace(tzinfo=zone, fold=fold)
        instant = candidate.astimezone(timezone.utc)
        if instant.astimezone(zone).replace(tzinfo=None) == requested:
            candidates.append(instant)

    unique = sorted({candidate for candidate in candidates})
    if not unique:
        return CivilTimeResolution(kind="nonexistent")
    if len(unique) == 1:
        return CivilTimeResolution(kind="resolved", instant=unique[0].isoformat())
    return CivilTimeResolution(
        kind="ambiguous",
        first_instant=unique[0].isoformat(),
        second_instant=unique[1].isoformat(),
    )


def resolve_civil_time(
    date_value: str,
    time_value: str,
    timezone_value: str,
    occurrence: Literal["first", "second"] | None,
) -> ResolvedCivilTime:
    resolution = inspect_civil_time(date_value, time_value, timezone_value)
    if resolution.kind == "nonexistent":
        raise CivilTimeError("CHART_CIVIL_TIME_NONEXISTENT")
    if resolution.kind == "resolved":
        return ResolvedCivilTime(instant=resolution.instant or "", occurrence=None)
    if occurrence is None:
        raise CivilTimeError("CHART_CIVIL_TIME_OCCURRENCE_REQUIRED")
    instant = resolution.first_instant if occurrence == "first" else resolution.second_instant
    return ResolvedCivilTime(instant=instant or "", occurrence=occurrence)


def _parse_date(value: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise CivilTimeError("CHART_CIVIL_DATE_INVALID") from error
    if parsed.isoformat() != value:
        raise CivilTimeError("CHART_CIVIL_DATE_INVALID")
    return parsed


def _parse_time(value: str) -> time:
    try:
        parsed = time.fromisoformat(value)
    except ValueError as error:
        raise CivilTimeError("CHART_CIVIL_TIME_INVALID") from error
    if len(value) != 5 or parsed.second != 0 or parsed.microsecond != 0:
        raise CivilTimeError("CHART_CIVIL_TIME_INVALID")
    return parsed


def _parse_zone(value: str) -> ZoneInfo:
    try:
        return ZoneInfo(value)
    except (ValueError, ZoneInfoNotFoundError) as error:
        raise CivilTimeError("CHART_CIVIL_TIMEZONE_INVALID") from error
