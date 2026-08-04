import type { ChartResult, DictionaryLocale } from "@elevenhouse/contracts";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import { getChartPointDisplayLabel, getChartPointSymbol } from "../model/chartDisplay";
import styles from "./AstrocartographyMap.module.css";
import sharedStyles from "./ChartEnginePage.module.css";

type AstrocartographyResult = Extract<ChartResult, { readonly method: "astrocartography" }>;

export function AstrocartographyLineList({
  copy,
  locale,
  result
}: {
  readonly copy: ChartEngineCopy;
  readonly locale: DictionaryLocale;
  readonly result: AstrocartographyResult;
}) {
  return (
    <>
      <div className={styles.astroLineStack}>
        {result.result.lines.slice(0, 8).map((line) => (
          <div className={styles.astroLinePill} key={line.id}>
            <span aria-hidden="true">{getChartPointSymbol(line.point, line.label)}</span>
            <strong>{getChartPointDisplayLabel(line.point, line.label, locale)}</strong>
            <small>{formatAstrocartographyAngle(line.angle)}</small>
          </div>
        ))}
      </div>
      <ul className={sharedStyles.visuallyHidden} aria-label={copy.map.linesLabel}>
        {result.result.lines.map((line) => {
          const point = getChartPointDisplayLabel(line.point, line.label, locale);
          const angle = formatAstrocartographyAngle(line.angle);
          return (
            <li key={line.id}>{copy.map.lineDescription(point, angle, `${point} ${angle}`)}</li>
          );
        })}
      </ul>
    </>
  );
}

export function formatAstrocartographyAngle(angle: string): string {
  if (angle === "mc") return "MC";
  if (angle === "ic") return "IC";
  if (angle === "asc") return "Asc";
  if (angle === "dsc") return "Dsc";
  return angle;
}
