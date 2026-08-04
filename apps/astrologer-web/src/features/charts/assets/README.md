# Natural Earth 1:110m land provenance

The Chart Engine world map uses the Natural Earth **Land** polygons at
1:110m scale.

## Upstream artifact

- Official dataset page:
  <https://www.naturalearthdata.com/downloads/110m-physical-vectors/>
- Exact official download:
  <https://naturalearth.s3.amazonaws.com/110m_physical/ne_110m_land.zip>
- Archive SHA-256:
  `1926c621afd6ac67c3f36639bb1236134a48d82226dc675d3e3df53d02d2a3de`
- Accessed: `2026-08-03`
- The archive's embedded `ne_110m_land.VERSION.txt` contains `4.1.0`.
- The archive lists its README and VERSION entries with date `2018-05-21`.

There is a verifiable upstream metadata inconsistency: on the access date the
official dataset page labels the Land download as version `4.0.0`, while the
file served by that link has the exact hash above and embeds version `4.1.0`.
This repository identifies the pinned artifact as `4.1.0` because that is the
version declared by the downloaded artifact itself; the page-label discrepancy
is intentionally not hidden.

To verify the pinned source:

```sh
curl --fail --location \
  https://naturalearth.s3.amazonaws.com/110m_physical/ne_110m_land.zip \
  --output ne_110m_land.zip
shasum -a 256 ne_110m_land.zip
unzip -p ne_110m_land.zip ne_110m_land.VERSION.txt
```

## Terms

Natural Earth states that all raster and vector data published on its website
is in the public domain and may be modified and used commercially without
permission. The official terms are at
<https://www.naturalearthdata.com/about/terms-of-use/>.

## Committed runtime derivation

The production map consumes
`../components/naturalEarthLand.ts`, whose SHA-256 on `2026-08-03` is
`fd694827588be5254db5efa52b7b9c5d605eaca53e6e6a32c07297ee8010b5a0`.
It contains only the SVG path needed at runtime, not invented or decorative
geography.

The derivation preserves every source polygon and multipolygon ring, projects
WGS84 longitude/latitude into the existing `720 x 360` equirectangular map
view box using `x = (longitude + 180) * 2` and
`y = (90 - latitude) * 2`, and simplifies projected geometry to `0.5` CSS
pixels before serializing the rings as closed SVG path segments. No country,
coastline, or synthetic fallback geometry is added.

The plan originally named `assets/ne_110m_land.geojson`. That intermediate is
not committed because the official pinned source is a Shapefile archive, so a
GeoJSON file would itself be another derivative and would create a second
source-of-truth artifact that production never reads. The exact upstream URL,
archive hash, embedded version, projection, simplification tolerance, and
runtime output hash above make the committed path auditable while keeping one
runtime authority.
