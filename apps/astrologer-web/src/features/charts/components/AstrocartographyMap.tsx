import type { ChartResult, DictionaryLocale } from "@elevenhouse/contracts";
import { splitAstrocartographyPathAtAntimeridian } from "../model/astrocartographyProjection";
import { getChartPointDisplayLabel } from "../model/chartDisplay";
import { chartEngineCopyByLocale } from "../model/chartEngineCopy";
import styles from "./AstrocartographyMap.module.css";
import { naturalEarthLandPath } from "./naturalEarthLand";
import { AstrocartographyLineList, formatAstrocartographyAngle } from "./AstrocartographyLineList";

const width = 720;
const height = 360;

export function AstrocartographyMap({
  locale = "ru",
  result
}: {
  readonly locale?: DictionaryLocale;
  readonly result?: Extract<ChartResult, { readonly method: "astrocartography" }> | null;
}) {
  const copy = chartEngineCopyByLocale[locale];

  return (
    <div className={styles.astroMapStage}>
      <svg
        aria-label={copy.map.ariaLabel}
        className={styles.astroMapSvg}
        data-testid="astrocartography-map"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <rect className={styles.astroMapOcean} x="0" y="0" width={width} height={height} />
        <g aria-hidden="true">
          {[-120, -60, 0, 60, 120].map((longitude) => (
            <line
              className={styles.astroMapGrid}
              key={`lon-${longitude}`}
              x1={projectLongitude(longitude)}
              x2={projectLongitude(longitude)}
              y1="0"
              y2={height}
            />
          ))}
          {[-60, -30, 0, 30, 60].map((latitude) => (
            <line
              className={styles.astroMapGrid}
              key={`lat-${latitude}`}
              x1="0"
              x2={width}
              y1={projectLatitude(latitude)}
              y2={projectLatitude(latitude)}
            />
          ))}
          <path
            className={styles.astroMapLand}
            clipRule="evenodd"
            d={naturalEarthLandPath}
            data-testid="astrocartography-land"
            fillRule="evenodd"
          />
        </g>
        {result ? (
          <g>
            {result.result.lines.flatMap((line) =>
              splitAstrocartographyPathAtAntimeridian(line.path).map((segment, index) => (
                <polyline
                  className={styles.astroMapLine}
                  data-angle={line.angle}
                  data-testid={
                    index === 0
                      ? `astrocartography-line-${line.id}`
                      : `astrocartography-line-${line.id}-segment-${index + 1}`
                  }
                  key={`${line.id}-${index}`}
                  points={segment
                    .map((point) => projectPoint(point.longitude, point.latitude))
                    .join(" ")}
                >
                  <title>
                    {copy.map.lineDescription(
                      getChartPointDisplayLabel(line.point, line.label, locale),
                      formatAstrocartographyAngle(line.angle),
                      `${getChartPointDisplayLabel(line.point, line.label, locale)} ${formatAstrocartographyAngle(line.angle)}`
                    )}
                  </title>
                </polyline>
              ))
            )}
          </g>
        ) : null}
      </svg>
      <div className={styles.astroMapLegend} aria-label={copy.map.legendLabel}>
        {astrocartographyAngleLegend.map((item) => (
          <span data-angle={item.angle} key={item.angle}>
            <b aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
      {result ? <AstrocartographyLineList copy={copy} locale={locale} result={result} /> : null}
    </div>
  );
}

function projectPoint(longitude: number, latitude: number): string {
  return `${projectLongitude(longitude).toFixed(1)},${projectLatitude(latitude).toFixed(1)}`;
}

function projectLongitude(longitude: number): number {
  return ((longitude + 180) / 360) * width;
}

function projectLatitude(latitude: number): number {
  return ((90 - latitude) / 180) * height;
}

const astrocartographyAngleLegend = [
  { angle: "mc", label: "MC" },
  { angle: "ic", label: "IC" },
  { angle: "asc", label: "Asc" },
  { angle: "dsc", label: "Dsc" }
] as const;
