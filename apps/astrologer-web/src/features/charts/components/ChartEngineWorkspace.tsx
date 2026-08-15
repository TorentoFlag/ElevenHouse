import { useState, type ReactNode } from "react";
import type {
  ChartInterpretationMode,
  ChartResult,
  ChartSettings,
  ClientBirthDataUpsertRequest,
  ClientBirthPlaceCandidate,
  DictionaryLocale
} from "@elevenhouse/contracts";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import {
  formatChartPointPosition,
  formatHouseSignDisplay,
  getChartPointDisplayLabel,
  getChartPointSymbol,
  getChartWarnings,
  getPrimaryChartRenderResult
} from "../model/chartDisplay";
import type { ChartBirthDataReadiness } from "../model/chartEngineState";
import type { ChartEngineCopy } from "../model/chartEngineCopy";
import type { ChartEngineMode, ChartEnginePageJobState } from "../model/chartEngineMode";
import { AstrocartographyMap } from "./AstrocartographyMap";
import { ChartAiPanel } from "./ChartAiPanel";
import { ChartBirthDataEditor } from "./ChartBirthDataEditor";
import { ChartSettingsPanel } from "./ChartSettingsPanel";
import { ChartTables, type ChartPanelTab } from "./ChartTables";
import { ChartWheel } from "./ChartWheel";
import styles from "./ChartEnginePage.module.css";

type AstrocartographyChartResult = Extract<ChartResult, { readonly method: "astrocartography" }>;

export function ChartEngineWorkspace({
  activeMode,
  birthDataError,
  calculationId,
  canRequestAi,
  copy,
  displayResult,
  errorMessage,
  interpretationMode,
  isBusy,
  isResultStale,
  isSavingBirthData,
  isSettingsPanelOpen,
  jobState,
  horaryReadiness,
  horarySetup,
  locale,
  onCloseSettings,
  onSaveBirthData,
  onSearchBirthPlaces,
  onSettingsChange,
  partnerReadiness,
  readiness,
  selectedClient,
  selectedPartnerClient,
  settings,
  shouldShowBirthDataEditor
}: {
  readonly activeMode: ChartEngineMode;
  readonly birthDataError: string | null;
  readonly calculationId: string | null;
  readonly canRequestAi: boolean;
  readonly copy: ChartEngineCopy;
  readonly displayResult: ChartResult | null;
  readonly errorMessage: string | null;
  readonly interpretationMode: ChartInterpretationMode | null;
  readonly isBusy: boolean;
  readonly isResultStale: boolean;
  readonly isSavingBirthData: boolean;
  readonly isSettingsPanelOpen: boolean;
  readonly jobState: ChartEnginePageJobState;
  readonly horaryReadiness?: ChartBirthDataReadiness;
  readonly horarySetup?: ReactNode;
  readonly locale: DictionaryLocale;
  readonly onCloseSettings: () => void;
  readonly onSaveBirthData?: (data: ClientBirthDataUpsertRequest) => void | Promise<void>;
  readonly onSearchBirthPlaces?: (query: string) => Promise<readonly ClientBirthPlaceCandidate[]>;
  readonly onSettingsChange: (settings: ChartSettings) => void;
  readonly partnerReadiness: ChartBirthDataReadiness;
  readonly readiness: ChartBirthDataReadiness;
  readonly selectedClient: ClientSelectOption | null;
  readonly selectedPartnerClient: ClientSelectOption | null;
  readonly settings: ChartSettings;
  readonly shouldShowBirthDataEditor: boolean;
}) {
  const [activePanelTab, setActivePanelTab] = useState<ChartPanelTab>("planets");
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const isPartnerMode = activeMode === "synastry" || activeMode === "composite";
  const isAstrocartographyMode = activeMode === "astrocartography";
  const needsBirthData = activeMode !== "horary";
  const isBirthDataBlocked = Boolean(needsBirthData && selectedClient && !readiness.ready);
  const isPartnerBirthDataBlocked = Boolean(
    needsBirthData && isPartnerMode && selectedPartnerClient && !partnerReadiness.ready
  );
  const astrocartographyResult =
    displayResult?.method === "astrocartography" ? displayResult : null;
  const wheelResult = astrocartographyResult ? null : displayResult;
  const canShowAiPanel = canRequestAi;
  const visiblePanelTabs: readonly ChartPanelTab[] = isAstrocartographyMode
    ? canShowAiPanel
      ? ["interpretations", "ai"]
      : ["interpretations"]
    : canShowAiPanel
      ? ["planets", "aspects", "houses", "interpretations", "ai"]
      : ["planets", "aspects", "houses", "interpretations"];
  const visiblePanelTab = visiblePanelTabs.includes(activePanelTab)
    ? activePanelTab
    : "interpretations";

  if (activeMode === "horary" && selectedClient && !displayResult && horarySetup) {
    const preparationTitle =
      jobState === "calculating"
        ? copy.modes.horary.calculating
        : jobState === "failed"
          ? copy.status.failed
          : copy.horary.preparationTitle;
    const preparationDetail =
      jobState === "failed"
        ? (errorMessage ?? copy.status.defaultFailure)
        : copy.horary.preparationDetail;
    const missing = horaryReadiness?.ready === false ? horaryReadiness.missing : [];
    const questionReady = !missing.includes(copy.missing.question);
    const momentReady =
      !missing.includes(copy.missing.questionDate) &&
      !missing.includes(copy.missing.questionTime) &&
      !missing.includes(copy.missing.timezone);
    const placeReady =
      !missing.includes(copy.missing.questionLatitude) &&
      !missing.includes(copy.missing.questionLongitude);

    return (
      <section className={styles.horaryPrecalculation}>
        {horarySetup}
        <section className={styles.horaryPreparation} aria-label={copy.horary.preparationTitle}>
          <header className={styles.horaryPreparationHeader}>
            <strong>{copy.horary.previewTitle}</strong>
            <span>{copy.horary.previewPending}</span>
          </header>
          {isSettingsPanelOpen ? (
            <div className={styles.horaryPreparationSettings}>
              <div className={styles.panelSettingsHeader}>
                <strong>{copy.panel.settingsTitle}</strong>
                <button
                  aria-label={copy.panel.closeSettings}
                  className={styles.panelCloseButton}
                  type="button"
                  onClick={onCloseSettings}
                >
                  +
                </button>
              </div>
              <div className={styles.panelSettings}>
                <ChartSettingsPanel
                  copy={copy}
                  disabled={isBusy}
                  settings={settings}
                  onChange={onSettingsChange}
                />
              </div>
            </div>
          ) : (
            <>
              <ol className={styles.horaryPreparationStatusGrid}>
                <HoraryPreparationStatus
                  complete={questionReady}
                  index={1}
                  label={copy.horary.question}
                  pending={copy.horary.previewQuestionPending}
                />
                <HoraryPreparationStatus
                  complete={momentReady}
                  index={2}
                  label={copy.horary.preparationMoment}
                  pending={copy.horary.previewMomentPending}
                  ready={copy.horary.previewMomentReady}
                />
                <HoraryPreparationStatus
                  complete={placeReady}
                  index={3}
                  label={copy.horary.previewPlaceLabel}
                  pending={copy.horary.previewPlacePending}
                  ready={copy.horary.previewPlaceReady}
                />
              </ol>
              <div className={styles.horaryPreparationContent}>
                <span className={styles.horaryPreparationOrb} aria-hidden="true">
                  ☉
                </span>
                <p>{copy.modes.horary.title}</p>
                <h2>{jobState === "idle" ? copy.horary.previewEmptyTitle : preparationTitle}</h2>
                <span>
                  {jobState === "idle" ? copy.horary.previewEmptyDetail : preparationDetail}
                </span>
                <ol className={styles.horaryPreparationSteps}>
                  <li>{copy.horary.question}</li>
                  <li>{copy.horary.preparationMoment}</li>
                  <li>{copy.horary.previewPlaceLabel}</li>
                </ol>
              </div>
            </>
          )}
        </section>
      </section>
    );
  }

  return (
    <section className={styles.body}>
      {!selectedClient ? (
        <section
          className={styles.emptyClientState}
          role="status"
          aria-label={copy.emptyClient.title}
        >
          <span className={styles.emptyClientGlyph} aria-hidden="true">
            ☉
          </span>
          <h2>{copy.emptyClient.title}</h2>
          <p>{copy.emptyClient.description}</p>
        </section>
      ) : (
        <>
          <section
            className={
              shouldShowBirthDataEditor
                ? `${styles.workspace} ${styles.workspaceBirthDataMode}`
                : styles.workspace
            }
          >
            {shouldShowBirthDataEditor && onSaveBirthData ? (
              <section
                className={styles.birthDataWorkspace}
                aria-label={copy.birthData.workspaceLabel}
              >
                <ChartBirthDataEditor
                  key={selectedClient.value}
                  client={selectedClient}
                  copy={copy}
                  disabled={isBusy || isSavingBirthData}
                  errorMessage={birthDataError}
                  isSaving={isSavingBirthData}
                  layout="workspace"
                  locale={locale}
                  onSave={onSaveBirthData}
                  onSearchBirthPlaces={onSearchBirthPlaces}
                />
              </section>
            ) : isAstrocartographyMode ? (
              <AstrocartographyMap locale={locale} result={astrocartographyResult} />
            ) : (
              <ChartWheel
                hoveredPointId={hoveredPointId}
                locale={locale}
                result={wheelResult}
                onHoverPoint={setHoveredPointId}
              />
            )}
            <StatusCard
              copy={copy}
              errorMessage={errorMessage}
              isResultStale={isResultStale}
              jobState={jobState}
              missingBirthData={isBirthDataBlocked && !readiness.ready ? readiness.missing : []}
              missingPartnerBirthData={
                isPartnerBirthDataBlocked && !partnerReadiness.ready ? partnerReadiness.missing : []
              }
              mode={activeMode}
              result={displayResult}
              selectedPartnerClient={selectedPartnerClient}
            />
          </section>
          <ChartSummaryRail
            copy={copy}
            displayResult={displayResult}
            isAstrocartographyMode={isAstrocartographyMode}
            locale={locale}
            needsBirthData={needsBirthData}
            readiness={readiness}
          />
          {shouldShowBirthDataEditor ? null : (
            <aside className={styles.panel} aria-label={copy.panel.ariaLabel}>
              {isSettingsPanelOpen ? (
                <>
                  <div className={styles.panelSettingsHeader}>
                    <strong>{copy.panel.settingsTitle}</strong>
                    <button
                      aria-label={copy.panel.closeSettings}
                      className={styles.panelCloseButton}
                      type="button"
                      onClick={onCloseSettings}
                    >
                      +
                    </button>
                  </div>
                  <div className={styles.panelSettings}>
                    <ChartSettingsPanel
                      copy={copy}
                      disabled={isBusy}
                      settings={settings}
                      onChange={onSettingsChange}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.panelTabs}>
                    {visiblePanelTabs.map((tab) => (
                      <button
                        aria-pressed={visiblePanelTab === tab}
                        className={
                          visiblePanelTab === tab ? styles.panelTabActive : styles.panelTab
                        }
                        key={tab}
                        type="button"
                        onClick={() => setActivePanelTab(tab)}
                      >
                        {copy.panel.tabs[tab]}
                      </button>
                    ))}
                  </div>
                  {visiblePanelTab === "ai" ? (
                    <ChartAiPanel
                      calculationId={canRequestAi ? calculationId : null}
                      isBusy={isBusy}
                      isResultStale={isResultStale}
                      locale={locale}
                      result={displayResult}
                    />
                  ) : (
                    <ChartTables
                      activeTab={visiblePanelTab}
                      hoveredPointId={hoveredPointId}
                      interpretationMode={interpretationMode === "child" ? "child" : "default"}
                      locale={locale}
                      result={displayResult}
                      onHoverPoint={setHoveredPointId}
                    />
                  )}
                </>
              )}
            </aside>
          )}
        </>
      )}
    </section>
  );
}

function HoraryPreparationStatus({
  complete,
  index,
  label,
  pending,
  ready
}: {
  readonly complete: boolean;
  readonly index: number;
  readonly label: string;
  readonly pending: string;
  readonly ready?: string;
}) {
  return (
    <li>
      <span>{`${index} · ${label}`}</span>
      <strong>
        <i aria-hidden="true">{complete ? "✓" : "○"}</i>
        {complete ? (ready ?? label) : pending}
      </strong>
    </li>
  );
}

function ChartSummaryRail({
  copy,
  displayResult,
  isAstrocartographyMode,
  locale,
  needsBirthData,
  readiness
}: {
  readonly copy: ChartEngineCopy;
  readonly displayResult: ChartResult | null;
  readonly isAstrocartographyMode: boolean;
  readonly locale: DictionaryLocale;
  readonly needsBirthData: boolean;
  readonly readiness: ChartBirthDataReadiness;
}) {
  const astroResult = displayResult?.method === "astrocartography" ? displayResult : null;
  const wheelResult = astroResult ? null : displayResult;
  const warnings = displayResult ? getChartWarnings(displayResult) : [];

  return (
    <aside className={styles.rail} aria-label={copy.rail.ariaLabel}>
      {needsBirthData && !readiness.ready ? (
        <section className={styles.railGroup}>
          <h2>{copy.rail.birthData}</h2>
          <p className={styles.warningText}>{copy.rail.missing(readiness.missing)}</p>
        </section>
      ) : null}
      {warnings.length ? (
        <section className={styles.railGroup}>
          <h2>{copy.rail.warnings}</h2>
          <div className={styles.warningStack}>
            {warnings.map((warning) => (
              <div className={styles.chartWarning} key={warning.code}>
                {formatChartWarning(warning, copy)}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className={styles.railGroup}>
        <h2>{isAstrocartographyMode ? copy.rail.astrocartography : copy.rail.bigThree}</h2>
        {astroResult ? (
          getAstrocartographySummary(astroResult, copy).map((item) => (
            <SummaryCard key={item.label} {...item} />
          ))
        ) : wheelResult ? (
          getBigThree(wheelResult, copy, locale).map((item) => (
            <SummaryCard key={item.label} {...item} />
          ))
        ) : (
          <p className={styles.muted}>
            {isAstrocartographyMode ? copy.rail.linesPending : copy.rail.chartPending}
          </p>
        )}
      </section>
      {wheelResult ? <DistributionSummary copy={copy} result={wheelResult} /> : null}
      {wheelResult ? <DominantsSummary copy={copy} locale={locale} result={wheelResult} /> : null}
      {wheelResult ? (
        <section className={styles.railGroup}>
          <h2>{copy.rail.retrogrades}</h2>
          {getPrimaryChartRenderResult(wheelResult).points.some((point) => point.retrograde) ? (
            getPrimaryChartRenderResult(wheelResult)
              .points.filter((point) => point.retrograde)
              .map((point) => (
                <div className={styles.retroPill} key={point.id}>
                  {getChartPointDisplayLabel(point.id, point.label, locale)} R
                </div>
              ))
          ) : (
            <p className={styles.muted}>{copy.rail.noRetrogrades}</p>
          )}
        </section>
      ) : null}
    </aside>
  );
}

function SummaryCard({ label, symbol, value }: { label: string; symbol: string; value: string }) {
  return (
    <div className={styles.summaryCard}>
      <span className={styles.summaryGlyph} aria-hidden="true">
        {symbol}
      </span>
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
    </div>
  );
}

function DistributionSummary({ copy, result }: { copy: ChartEngineCopy; result: ChartResult }) {
  const distributions = getPrimaryChartRenderResult(result).distributions;
  return (
    <section className={styles.railGroup}>
      <h2>{copy.rail.elements}</h2>
      <div className={styles.distributionStack}>
        {(
          Object.keys(copy.distributions.elements) as Array<keyof typeof distributions.elements>
        ).map((key) => (
          <DistributionBar
            key={key}
            label={copy.distributions.elements[key]}
            max={10}
            value={distributions.elements[key]}
          />
        ))}
      </div>
      <h2>{copy.rail.modalities}</h2>
      <div className={styles.distributionStack}>
        {(
          Object.keys(copy.distributions.modalities) as Array<keyof typeof distributions.modalities>
        ).map((key) => (
          <DistributionBar
            key={key}
            label={copy.distributions.modalities[key]}
            max={10}
            value={distributions.modalities[key]}
          />
        ))}
      </div>
      <h2>{copy.rail.polarity}</h2>
      <div className={styles.distributionStack}>
        {(
          Object.keys(copy.distributions.polarity) as Array<keyof typeof distributions.polarity>
        ).map((key) => (
          <DistributionBar
            key={key}
            label={copy.distributions.polarity[key]}
            max={10}
            value={distributions.polarity[key]}
          />
        ))}
      </div>
    </section>
  );
}

function DistributionBar({ label, max, value }: { label: string; max: number; value: number }) {
  const width = `${Math.min(100, Math.round((value / max) * 100))}%`;
  return (
    <div className={styles.distributionRow}>
      <span>{label}</span>
      <div className={styles.distributionTrack} aria-hidden="true">
        <i style={{ width }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function DominantsSummary({
  copy,
  locale,
  result
}: {
  copy: ChartEngineCopy;
  locale: DictionaryLocale;
  result: ChartResult;
}) {
  const points = getDominantPoints(result, locale);
  return (
    <section className={styles.railGroup}>
      <h2>{copy.rail.dominants}</h2>
      {points.length ? (
        <div className={styles.dominantStack}>
          {points.map((point) => (
            <div className={styles.dominantRow} key={point.id}>
              <span className={styles.dominantGlyph} aria-hidden="true">
                {point.symbol}
              </span>
              <strong>{point.label}</strong>
              <span>
                {point.count} {copy.rail.aspectsShort}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>{copy.rail.insufficientAspects}</p>
      )}
    </section>
  );
}

function StatusCard({
  copy,
  errorMessage,
  isResultStale,
  jobState,
  missingBirthData,
  missingPartnerBirthData,
  mode,
  result,
  selectedPartnerClient
}: {
  copy: ChartEngineCopy;
  errorMessage: string | null;
  isResultStale: boolean;
  jobState: ChartEnginePageJobState;
  missingBirthData: readonly string[];
  missingPartnerBirthData: readonly string[];
  mode: ChartEngineMode;
  result: ChartResult | null;
  selectedPartnerClient: ClientSelectOption | null;
}) {
  const modeCopy = copy.modes[mode];
  if (jobState === "calculating")
    return (
      <div className={styles.statusCard} role="status">
        <strong>{modeCopy.calculating}</strong>
        <span>{modeCopy.calculationDetail}</span>
      </div>
    );
  if (jobState === "failed")
    return (
      <div className={styles.statusCardError} role="alert">
        <strong>{copy.status.failed}</strong>
        <span>{errorMessage ?? copy.status.defaultFailure}</span>
      </div>
    );
  if (missingBirthData.length > 0) return null;
  if ((mode === "synastry" || mode === "composite") && !selectedPartnerClient)
    return (
      <div className={styles.statusCard} role="status">
        <strong>{copy.status.choosePartner}</strong>
        <span>{copy.status.partnerSource}</span>
      </div>
    );
  if (missingPartnerBirthData.length > 0)
    return (
      <div className={styles.statusCard} role="status">
        <strong>{copy.status.partnerData}</strong>
        <span>
          {copy.status.partnerMissing(
            missingPartnerBirthData,
            mode === "composite" ? copy.status.compositeObject : copy.status.synastryObject
          )}
        </span>
      </div>
    );
  if (!result) {
    if (mode === "natal") return null;
    return (
      <div className={styles.statusCard}>
        <strong>{modeCopy.emptyTitle}</strong>
        <span>{modeCopy.emptyDetail}</span>
      </div>
    );
  }
  if (isResultStale)
    return (
      <div className={styles.statusCard} role="status">
        <strong>{copy.status.stale}</strong>
        <span>{modeCopy.staleDetail}</span>
      </div>
    );
  return null;
}

function getBigThree(result: ChartResult, copy: ChartEngineCopy, locale: DictionaryLocale) {
  const primary = getPrimaryChartRenderResult(result);
  const sun = primary.points.find((point) => point.id === "sun");
  const moon = primary.points.find((point) => point.id === "moon");
  const asc = primary.houses.find((house) => house.number === 1);
  return [
    { label: copy.rail.sun, symbol: "☉︎", value: sun ? formatChartPointPosition(sun, locale) : "—" },
    {
      label: copy.rail.moon,
      symbol: "☽︎",
      value: moon ? formatChartPointPosition(moon, locale) : "—"
    },
    {
      label: "Asc",
      symbol: "A",
      value: asc
        ? `${formatHouseSignDisplay(asc.sign, locale)} ${Math.round(asc.signDegree)}°`
        : "—"
    }
  ];
}

function getAstrocartographySummary(result: AstrocartographyChartResult, copy: ChartEngineCopy) {
  const planets = new Set(result.result.lines.map((line) => line.point));
  const angles = new Set(result.result.lines.map((line) => line.angle));
  return [
    { label: copy.rail.astroLines, symbol: "⌁", value: String(result.result.lines.length) },
    { label: copy.rail.astroPlanets, symbol: "☉︎", value: String(planets.size) },
    {
      label: copy.rail.astroAngles,
      symbol: "A",
      value: [...angles].map((angle) => angle.toUpperCase()).join(" · ")
    }
  ];
}

const dominantPointIds = new Set([
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto"
]);

function getDominantPoints(result: ChartResult, locale: DictionaryLocale) {
  const primary = getPrimaryChartRenderResult(result);
  const pointOrder = new Map(primary.points.map((point, index) => [point.id, index]));
  const pointById = new Map(primary.points.map((point) => [point.id, point]));
  const counts = new Map<string, number>();
  for (const aspect of primary.aspects) {
    if (dominantPointIds.has(aspect.pointA))
      counts.set(aspect.pointA, (counts.get(aspect.pointA) ?? 0) + 1);
    if (dominantPointIds.has(aspect.pointB))
      counts.set(aspect.pointB, (counts.get(aspect.pointB) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => {
      const point = pointById.get(id);
      return point
        ? {
            id,
            count,
            label: getChartPointDisplayLabel(id, point.label, locale),
            symbol: getChartPointSymbol(id, point.label)
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.count - a.count || (pointOrder.get(a.id) ?? 0) - (pointOrder.get(b.id) ?? 0))
    .slice(0, 3);
}

function formatChartWarning(
  warning: ReturnType<typeof getChartWarnings>[number],
  copy: ChartEngineCopy
) {
  return warning.code === "BIRTH_TIME_APPROXIMATE" ? copy.rail.approximateWarning : warning.message;
}
