import { useState } from "react";
import type { ChartResult, DictionaryLocale } from "@elevenhouse/contracts";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import {
  formatChartPointPosition,
  formatHouseSignDisplay,
  getChartPointSymbol,
  getPrimaryChartRenderResult
} from "../model/chartDisplay";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import type { ChartEngineMode } from "../model/chartEngineMode";
import { AstrocartographyMap } from "./AstrocartographyMap";
import { ChartWheel } from "./ChartWheel";
import styles from "./ChartEnginePage.module.css";

type ChartEnginePresentationProps = {
  readonly copy: ChartEngineCopy;
  readonly locale: DictionaryLocale;
  readonly mode: ChartEngineMode;
  readonly result: ChartResult;
  readonly selectedClient: ClientSelectOption;
  readonly selectedPartnerClient?: ClientSelectOption | null;
  readonly onClose: () => void;
};

export function ChartEnginePresentation({
  copy,
  locale,
  mode,
  onClose,
  result,
  selectedClient,
  selectedPartnerClient = null
}: ChartEnginePresentationProps) {
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const title = `${copy.modes[mode].title} · ${selectedClient.label}`;
  const subjectMeta = formatSubjectMeta(selectedClient, copy);
  const summary =
    result.method === "astrocartography"
      ? getAstrocartographyPresentationSummary(result, copy)
      : getBigThreePresentationSummary(result, copy, locale);

  return (
    <Modal
      title={title}
      right={<span className={styles.presentationEscapeHint}>{copy.presentation.escape}</span>}
      closeLabel={copy.presentation.close}
      backdropClassName={styles.presentationOverlay}
      className={styles.presentationDialog}
      contentClassName={styles.presentationContent}
      onClose={onClose}
    >
      <div className={styles.presentationBody}>
        <section className={styles.presentationStage} aria-label={copy.presentation.chartSummary}>
          {result.method === "astrocartography" ? (
            <AstrocartographyMap locale={locale} result={result} />
          ) : (
            <ChartWheel
              hoveredPointId={hoveredPointId}
              locale={locale}
              result={result}
              onHoverPoint={setHoveredPointId}
            />
          )}
        </section>
        <aside className={styles.presentationSummary} aria-label={copy.presentation.chartSummary}>
          <p className={styles.presentationSubjectMeta}>{subjectMeta}</p>
          {selectedPartnerClient ? (
            <p className={styles.presentationSubjectMeta}>
              {copy.client.partnerPrefix}: {selectedPartnerClient.label}
            </p>
          ) : null}
          <h3>
            {result.method === "astrocartography"
              ? copy.presentation.astrocartographySummary
              : copy.presentation.bigThree}
          </h3>
          <div className={styles.presentationSummaryGrid}>
            {summary.map((item) => (
              <div className={styles.presentationSummaryCard} key={item.label}>
                <span aria-hidden="true">{item.symbol}</span>
                <strong>{item.label}</strong>
                <small>{item.value}</small>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function formatSubjectMeta(client: ClientSelectOption, copy: ChartEngineCopy): string {
  const birthData = client.birthData;
  if (!birthData) return copy.presentation.noData;
  return [
    client.birthDateDisplay || birthData.birthDate,
    birthData.birthTime,
    birthData.birthPlaceText
  ]
    .filter((item): item is string => Boolean(item))
    .join(" · ");
}

function getBigThreePresentationSummary(
  result: ChartResult,
  copy: ChartEngineCopy,
  locale: DictionaryLocale
) {
  const primary = getPrimaryChartRenderResult(result);
  const sun = primary.points.find((point) => point.id === "sun");
  const moon = primary.points.find((point) => point.id === "moon");
  const ascendant = primary.houses.find((house) => house.number === 1);

  return [
    {
      label: copy.rail.sun,
      symbol: sun ? getChartPointSymbol(sun.id, sun.label) : "☉︎",
      value: sun ? formatChartPointPosition(sun, locale) : copy.presentation.noData
    },
    {
      label: copy.rail.moon,
      symbol: moon ? getChartPointSymbol(moon.id, moon.label) : "☽︎",
      value: moon ? formatChartPointPosition(moon, locale) : copy.presentation.noData
    },
    {
      label: "Asc",
      symbol: "A",
      value: ascendant
        ? `${formatHouseSignDisplay(ascendant.sign, locale)} ${Math.round(
            ascendant.signDegree
          )}°`
        : copy.presentation.noData
    }
  ];
}

function getAstrocartographyPresentationSummary(
  result: Extract<ChartResult, { readonly method: "astrocartography" }>,
  copy: ChartEngineCopy
) {
  const planets = new Set(result.result.lines.map((line) => line.point));
  const angles = new Set(result.result.lines.map((line) => line.angle));
  const firstPlanet = result.result.lines[0]?.point ?? "sun";

  return [
    { label: copy.rail.astroLines, symbol: "⌁", value: String(result.result.lines.length) },
    {
      label: copy.rail.astroPlanets,
      symbol: getChartPointSymbol(firstPlanet, firstPlanet),
      value: String(planets.size)
    },
    {
      label: copy.rail.astroAngles,
      symbol: "A",
      value: [...angles].map((angle) => angle.toUpperCase()).join(" · ")
    }
  ];
}
