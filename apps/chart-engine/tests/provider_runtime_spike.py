from importlib.metadata import version

import swisseph as swe
from kerykeion import AstrologicalSubjectFactory


KERYKEION_VERSION = "5.12.9"
PYSWISSEPH_VERSION = "2.10.3.2"
SWISSEPH_RUNTIME_VERSION = "2.10.03"
EXPECTED_FLAGS = swe.FLG_MOSEPH | swe.FLG_SPEED


def berlin_fold_subject(*, is_dst: bool):
    return AstrologicalSubjectFactory.from_birth_data(
        name="berlin-fold",
        year=2024,
        month=10,
        day=27,
        hour=2,
        minute=30,
        lng=13.405,
        lat=52.52,
        tz_str="Europe/Berlin",
        online=False,
        is_dst=is_dst,
        suppress_geonames_warning=True,
    )


def main() -> None:
    kerykeion_version = version("kerykeion")
    pyswisseph_version = version("pyswisseph")
    _, returned_flags = swe.calc_ut(
        2451545.0,
        swe.SUN,
        swe.FLG_SWIEPH | swe.FLG_SPEED,
    )
    first = berlin_fold_subject(is_dst=True)
    second = berlin_fold_subject(is_dst=False)

    assert kerykeion_version == KERYKEION_VERSION
    assert pyswisseph_version == PYSWISSEPH_VERSION
    assert swe.version == SWISSEPH_RUNTIME_VERSION
    assert returned_flags == EXPECTED_FLAGS
    assert first.iso_formatted_local_datetime == "2024-10-27T02:30:00+02:00"
    assert first.iso_formatted_utc_datetime == "2024-10-27T00:30:00+00:00"
    assert second.iso_formatted_local_datetime == "2024-10-27T02:30:00+01:00"
    assert second.iso_formatted_utc_datetime == "2024-10-27T01:30:00+00:00"
    assert first.julian_day != second.julian_day

    print(f"kerykeion={kerykeion_version}")
    print(f"pyswisseph={pyswisseph_version}")
    print(f"swe.version={swe.version}")
    print(f"returned_flags={returned_flags}")
    print("backend=moshier")
    print(f"first={first.iso_formatted_utc_datetime}")
    print(f"second={second.iso_formatted_utc_datetime}")


if __name__ == "__main__":
    main()
