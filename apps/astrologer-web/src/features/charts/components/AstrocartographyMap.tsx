import type { StoredChartAstrocartographyCalculationPayload } from "@elevenhouse/contracts";
import { getChartPointDisplayLabel, getChartPointSymbol } from "../model/chartDisplay";
import styles from "./ChartEnginePage.module.css";

const width = 720;
const height = 360;

export function AstrocartographyMap({
  result
}: {
  readonly result?: StoredChartAstrocartographyCalculationPayload | null;
}) {
  return (
    <div className={styles.astroMapStage}>
      <svg
        aria-label="Астрокартографическая карта"
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
          {landMasses.map((landMass) => (
            <ellipse className={styles.astroMapLand} key={landMass.id} {...landMass} />
          ))}
        </g>
        {result ? (
          <g>
            {result.result.lines.map((line) => (
              <polyline
                className={styles.astroMapLine}
                data-angle={line.angle}
                data-testid={`astrocartography-line-${line.id}`}
                key={line.id}
                points={line.path
                  .map((point) => projectPoint(point.longitude, point.latitude))
                  .join(" ")}
              >
                <title>{line.label}</title>
              </polyline>
            ))}
          </g>
        ) : null}
      </svg>
      <div className={styles.astroMapLegend} aria-label="Легенда астрокартографии">
        {astrocartographyAngleLegend.map((item) => (
          <span data-angle={item.angle} key={item.angle}>
            <b aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
      {result ? (
        <div className={styles.astroLineStack}>
          {result.result.lines.slice(0, 8).map((line) => (
            <div className={styles.astroLinePill} key={line.id}>
              <span aria-hidden="true">{getChartPointSymbol(line.point, line.label)}</span>
              <strong>{getChartPointDisplayLabel(line.point, line.label)}</strong>
              <small>{formatAstrocartographyAngle(line.angle)}</small>
            </div>
          ))}
        </div>
      ) : null}
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

function formatAstrocartographyAngle(angle: string): string {
  if (angle === "mc") return "MC";
  if (angle === "ic") return "IC";
  if (angle === "asc") return "Asc";
  if (angle === "dsc") return "Dsc";
  return angle;
}

const astrocartographyAngleLegend = [
  { angle: "mc", label: "MC" },
  { angle: "ic", label: "IC" },
  { angle: "asc", label: "Asc" },
  { angle: "dsc", label: "Dsc" }
] as const;

const landMasses = [
  { id: "north-america", cx: 160, cy: 118, rx: 76, ry: 46 },
  { id: "south-america", cx: 248, cy: 245, rx: 38, ry: 72 },
  { id: "eurasia", cx: 440, cy: 112, rx: 114, ry: 45 },
  { id: "africa", cx: 416, cy: 214, rx: 46, ry: 66 },
  { id: "australia", cx: 586, cy: 260, rx: 44, ry: 24 },
  { id: "greenland", cx: 258, cy: 56, rx: 30, ry: 16 }
] as const;
