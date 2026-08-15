import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChartAspect,
  ChartPoint,
  ChartResult,
  DictionaryEffectiveEntryResponse,
  DictionaryLocale
} from "@elevenhouse/contracts";
import { listDictionaryEntriesByCodes } from "../../dictionary/api/listDictionaryEntriesByCodes";
import {
  formatAspectTypeDisplay,
  formatHouseSignDisplay,
  getAspectDisplaySymbol,
  getPrimaryChartRenderResult,
  getPartnerChartRenderResult,
  getProgressionChartRenderResult,
  getProgressionChartResult,
  getSolarReturnChartRenderResult,
  getSolarReturnChartResult,
  getSynastryChartResult,
  getTransitChartRenderResult,
  getTransitChartResult,
  getChartPointDisplayLabel,
  getChartPointSymbol,
  getRoundedChartPointPosition,
  getZodiacDisplaySymbol,
  romanHouses
} from "../model/chartDisplay";
import {
  buildChartInterpretationAnchors,
  getChartInterpretationLookupCodes,
  type ChartInterpretationAnchor,
  type ChartInterpretationAnchorGroup,
  type ChartInterpretationMode
} from "../model/chartInterpretations";
import { chartEngineCopyByLocale, type ChartEngineCopy } from "../model/chartEngineCopy";
import { ChartInterpretationCreateForm } from "./ChartInterpretationCreateForm";
import styles from "./ChartEnginePage.module.css";

export type ChartPanelTab = "planets" | "aspects" | "houses" | "interpretations" | "ai";

export type ChartTablesProps = {
  readonly result: ChartResult | null;
  readonly activeTab: ChartPanelTab;
  readonly locale: DictionaryLocale;
  readonly hoveredPointId: string | null;
  readonly interpretationMode?: ChartInterpretationMode;
  readonly onHoverPoint: (pointId: string | null) => void;
};

export function ChartTables({
  activeTab,
  hoveredPointId,
  interpretationMode = "default",
  locale,
  onHoverPoint,
  result
}: ChartTablesProps) {
  const copy = chartEngineCopyByLocale[locale];
  if (!result) {
    return (
      <div className={styles.panelEmpty}>
        {activeTab === "interpretations"
          ? copy.tables.emptyInterpretations
          : copy.tables.emptyTables}
      </div>
    );
  }

  return (
    <div className={styles.tableStack}>
      {activeTab === "planets" ? (
        <PlanetsTable
          copy={copy}
          hoveredPointId={hoveredPointId}
          locale={locale}
          onHoverPoint={onHoverPoint}
          result={result}
        />
      ) : null}
      {activeTab === "aspects" ? (
        <AspectsTable copy={copy} locale={locale} result={result} />
      ) : null}
      {activeTab === "houses" ? <HousesTable copy={copy} locale={locale} result={result} /> : null}
      {activeTab === "interpretations" ? (
        <InterpretationSummary
          interpretationMode={interpretationMode}
          locale={locale}
          result={result}
        />
      ) : null}
    </div>
  );
}

function PlanetsTable({
  copy,
  hoveredPointId,
  locale,
  onHoverPoint,
  result
}: {
  readonly copy: ChartEngineCopy;
  readonly hoveredPointId: string | null;
  readonly locale: DictionaryLocale;
  readonly onHoverPoint: (pointId: string | null) => void;
  readonly result: ChartResult;
}) {
  const renderResult = getPrimaryChartRenderResult(result);
  const transitRenderResult = getTransitChartRenderResult(result);
  const solarReturnRenderResult = getSolarReturnChartRenderResult(result);
  const progressionRenderResult = getProgressionChartRenderResult(result);
  const partnerRenderResult = getPartnerChartRenderResult(result);

  return (
    <section className={styles.tableSection} aria-labelledby="chart-planets-heading">
      <h2 id="chart-planets-heading">{copy.tables.planets}</h2>
      <div className={styles.planetList}>
        {renderResult.points.map((point) => {
          const hovered = hoveredPointId === point.id;

          return (
            <div
              className={hovered ? styles.planetRowHovered : styles.planetRow}
              data-hovered={hovered ? "true" : "false"}
              data-testid={`chart-planet-row-${point.id}`}
              key={point.id}
              onBlur={() => onHoverPoint(null)}
              onFocus={() => onHoverPoint(point.id)}
              onMouseEnter={() => onHoverPoint(point.id)}
              onMouseLeave={() => onHoverPoint(null)}
              tabIndex={0}
            >
              <span className={styles.pointGlyph} aria-hidden="true">
                {getChartPointSymbol(point.id, point.label)}
              </span>
              <span className={styles.pointName}>
                {getChartPointDisplayLabel(point.id, point.label, locale)}
              </span>
              <span className={styles.signGlyph} aria-hidden="true">
                {getZodiacSymbol(getRoundedChartPointPosition(point).sign)}
              </span>
              <span className={styles.pointDegree}>
                {getRoundedChartPointPosition(point).degree}
                {point.retrograde ? <b>R</b> : null}
              </span>
              <span className={styles.pointHouse}>
                {point.house ? copy.tables.house(romanHouses[point.house] ?? "") : "—"}
              </span>
            </div>
          );
        })}
      </div>
      {transitRenderResult ? (
        <>
          <h3 className={styles.matrixHeading}>{copy.tables.transitPlanets}</h3>
          <div className={styles.planetList}>
            {transitRenderResult.points.map((point) => {
              const hoverId = `transit:${point.id}`;
              const hovered = hoveredPointId === hoverId;

              return (
                <div
                  className={hovered ? styles.planetRowHovered : styles.planetRow}
                  data-hovered={hovered ? "true" : "false"}
                  data-testid={`chart-transit-planet-row-${point.id}`}
                  key={`transit-${point.id}`}
                  onBlur={() => onHoverPoint(null)}
                  onFocus={() => onHoverPoint(hoverId)}
                  onMouseEnter={() => onHoverPoint(hoverId)}
                  onMouseLeave={() => onHoverPoint(null)}
                  tabIndex={0}
                >
                  <span className={styles.pointGlyph} aria-hidden="true">
                    {getChartPointSymbol(point.id, point.label)}
                  </span>
                  <span className={styles.pointName}>
                    {getChartPointDisplayLabel(point.id, point.label, locale)}
                  </span>
                  <span className={styles.signGlyph} aria-hidden="true">
                    {getZodiacSymbol(getRoundedChartPointPosition(point).sign)}
                  </span>
                  <span className={styles.pointDegree}>
                    {getRoundedChartPointPosition(point).degree}
                    {point.retrograde ? <b>R</b> : null}
                  </span>
                  <span className={styles.pointHouse}>
                    {point.house ? copy.tables.house(romanHouses[point.house] ?? "") : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      {solarReturnRenderResult ? (
        <>
          <h3 className={styles.matrixHeading}>{copy.tables.solarPlanets}</h3>
          <div className={styles.planetList}>
            {solarReturnRenderResult.points.map((point) => {
              const hoverId = `solar_return:${point.id}`;
              const hovered = hoveredPointId === hoverId;

              return (
                <div
                  className={hovered ? styles.planetRowHovered : styles.planetRow}
                  data-hovered={hovered ? "true" : "false"}
                  data-testid={`chart-solar-return-planet-row-${point.id}`}
                  key={`solar-return-${point.id}`}
                  onBlur={() => onHoverPoint(null)}
                  onFocus={() => onHoverPoint(hoverId)}
                  onMouseEnter={() => onHoverPoint(hoverId)}
                  onMouseLeave={() => onHoverPoint(null)}
                  tabIndex={0}
                >
                  <span className={styles.pointGlyph} aria-hidden="true">
                    {getChartPointSymbol(point.id, point.label)}
                  </span>
                  <span className={styles.pointName}>
                    {getChartPointDisplayLabel(point.id, point.label, locale)}
                  </span>
                  <span className={styles.signGlyph} aria-hidden="true">
                    {getZodiacSymbol(getRoundedChartPointPosition(point).sign)}
                  </span>
                  <span className={styles.pointDegree}>
                    {getRoundedChartPointPosition(point).degree}
                    {point.retrograde ? <b>R</b> : null}
                  </span>
                  <span className={styles.pointHouse}>
                    {point.house ? copy.tables.house(romanHouses[point.house] ?? "") : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      {progressionRenderResult ? (
        <>
          <h3 className={styles.matrixHeading}>{copy.tables.progressedPlanets}</h3>
          <div className={styles.planetList}>
            {progressionRenderResult.points.map((point) => {
              const hoverId = `progression:${point.id}`;
              const hovered = hoveredPointId === hoverId;

              return (
                <div
                  className={hovered ? styles.planetRowHovered : styles.planetRow}
                  data-hovered={hovered ? "true" : "false"}
                  data-testid={`chart-progression-planet-row-${point.id}`}
                  key={`progression-${point.id}`}
                  onBlur={() => onHoverPoint(null)}
                  onFocus={() => onHoverPoint(hoverId)}
                  onMouseEnter={() => onHoverPoint(hoverId)}
                  onMouseLeave={() => onHoverPoint(null)}
                  tabIndex={0}
                >
                  <span className={styles.pointGlyph} aria-hidden="true">
                    {getChartPointSymbol(point.id, point.label)}
                  </span>
                  <span className={styles.pointName}>
                    {getChartPointDisplayLabel(point.id, point.label, locale)}
                  </span>
                  <span className={styles.signGlyph} aria-hidden="true">
                    {getZodiacSymbol(getRoundedChartPointPosition(point).sign)}
                  </span>
                  <span className={styles.pointDegree}>
                    {getRoundedChartPointPosition(point).degree}
                    {point.retrograde ? <b>R</b> : null}
                  </span>
                  <span className={styles.pointHouse}>
                    {point.house ? copy.tables.house(romanHouses[point.house] ?? "") : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      {partnerRenderResult ? (
        <>
          <h3 className={styles.matrixHeading}>{copy.tables.partnerPlanets}</h3>
          <div className={styles.planetList}>
            {partnerRenderResult.points.map((point) => {
              const hoverId = `partner:${point.id}`;
              const hovered = hoveredPointId === hoverId;

              return (
                <div
                  className={hovered ? styles.planetRowHovered : styles.planetRow}
                  data-hovered={hovered ? "true" : "false"}
                  data-testid={`chart-partner-planet-row-${point.id}`}
                  key={`partner-${point.id}`}
                  onBlur={() => onHoverPoint(null)}
                  onFocus={() => onHoverPoint(hoverId)}
                  onMouseEnter={() => onHoverPoint(hoverId)}
                  onMouseLeave={() => onHoverPoint(null)}
                  tabIndex={0}
                >
                  <span className={styles.pointGlyph} aria-hidden="true">
                    {getChartPointSymbol(point.id, point.label)}
                  </span>
                  <span className={styles.pointName}>
                    {getChartPointDisplayLabel(point.id, point.label, locale)}
                  </span>
                  <span className={styles.signGlyph} aria-hidden="true">
                    {getZodiacSymbol(getRoundedChartPointPosition(point).sign)}
                  </span>
                  <span className={styles.pointDegree}>
                    {getRoundedChartPointPosition(point).degree}
                    {point.retrograde ? <b>R</b> : null}
                  </span>
                  <span className={styles.pointHouse}>
                    {point.house ? copy.tables.house(romanHouses[point.house] ?? "") : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}

function HousesTable({
  copy,
  locale,
  result
}: {
  readonly copy: ChartEngineCopy;
  readonly locale: DictionaryLocale;
  readonly result: ChartResult;
}) {
  const renderResult = getPrimaryChartRenderResult(result);

  return (
    <section className={styles.tableSection} aria-labelledby="chart-houses-heading">
      <h2 id="chart-houses-heading">{copy.tables.houses}</h2>
      <div className={styles.houseGrid}>
        {renderResult.houses.map((house) => (
          <div className={styles.houseCard} key={house.number}>
            <span>{copy.tables.house(romanHouses[house.number] ?? "")}</span>
            <strong>
              {getZodiacSymbol(getRoundedChartPointPosition(house).sign)}{" "}
              {getRoundedChartPointPosition(house).degree}
            </strong>
            <small>
              {formatHouseSignDisplay(getRoundedChartPointPosition(house).sign, locale)}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}

function AspectsTable({
  copy,
  locale,
  result
}: {
  readonly copy: ChartEngineCopy;
  readonly locale: DictionaryLocale;
  readonly result: ChartResult;
}) {
  const renderResult = getPrimaryChartRenderResult(result);
  const transitResult = getTransitChartResult(result);
  const solarReturnResult = getSolarReturnChartResult(result);
  const progressionResult = getProgressionChartResult(result);
  const synastryResult = getSynastryChartResult(result);
  const transitRenderResult = getTransitChartRenderResult(result);
  const solarReturnRenderResult = getSolarReturnChartRenderResult(result);
  const progressionRenderResult = getProgressionChartRenderResult(result);
  const partnerRenderResult = getPartnerChartRenderResult(result);
  const matrixPoints = getAspectMatrixPoints(renderResult.points);
  const aspectsByPair = new Map(
    renderResult.aspects.map((aspect) => [getAspectPairKey(aspect.pointA, aspect.pointB), aspect])
  );

  return (
    <section className={styles.tableSection} aria-labelledby="chart-aspects-heading">
      <h2 id="chart-aspects-heading">{copy.tables.aspects}</h2>
      <h3 className={styles.matrixHeading}>{copy.tables.aspectMatrix}</h3>
      {matrixPoints.length > 1 ? (
        <div
          className={styles.aspectMatrix}
          style={{ gridTemplateColumns: `34px repeat(${matrixPoints.length}, minmax(22px, 1fr))` }}
        >
          <span aria-hidden="true" />
          {matrixPoints.map((point) => (
            <span className={styles.aspectMatrixHead} key={`head-${point.id}`}>
              {getChartPointSymbol(point.id, point.label)}
            </span>
          ))}
          {matrixPoints.map((rowPoint, rowIndex) => (
            <AspectMatrixRow
              aspectsByPair={aspectsByPair}
              key={rowPoint.id}
              points={matrixPoints}
              copy={copy}
              locale={locale}
              rowIndex={rowIndex}
              rowPoint={rowPoint}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyRow}>{copy.tables.insufficientMatrix}</div>
      )}
      <div className={styles.aspectLegend} aria-label={copy.tables.aspectLegend}>
        {aspectLegendItems.map((item) => (
          <span key={item.type}>
            <b>{item.symbol}</b>
            {formatAspectTypeDisplay(item.type, locale)}
          </span>
        ))}
      </div>
      <h2>{copy.tables.aspectList}</h2>
      <div className={styles.aspectList}>
        {renderResult.aspects.length > 0 ? (
          renderResult.aspects.map((aspect, index) => (
            <div className={styles.aspectRow} key={`${aspect.pointA}-${aspect.pointB}-${index}`}>
              <span>{formatAspectTypeDisplay(aspect.type, locale)}</span>
              <span>
                {getPointLabel(result, aspect.pointA, locale)} —{" "}
                {getPointLabel(result, aspect.pointB, locale)}
              </span>
              <span>{aspect.orb.toFixed(2)}°</span>
            </div>
          ))
        ) : (
          <div className={styles.emptyRow}>{copy.tables.noMajorAspects}</div>
        )}
      </div>
      {transitResult ? (
        <>
          <h2>{copy.tables.transitAspects}</h2>
          <div className={styles.aspectList}>
            {transitResult.result.aspectsToNatal.length > 0 ? (
              transitResult.result.aspectsToNatal.map((aspect, index) => (
                <div
                  className={styles.aspectRow}
                  key={`transit-${aspect.transitPoint}-${aspect.natalPoint}-${index}`}
                >
                  <span>{formatAspectTypeDisplay(aspect.type, locale)}</span>
                  <span>
                    {getPointLabelFromCollection(
                      transitRenderResult?.points ?? [],
                      aspect.transitPoint,
                      locale
                    )}{" "}
                    — {getPointLabelFromCollection(renderResult.points, aspect.natalPoint, locale)}
                  </span>
                  <span>{aspect.orb.toFixed(2)}°</span>
                </div>
              ))
            ) : (
              <div className={styles.emptyRow}>{copy.tables.noTransitAspects}</div>
            )}
          </div>
        </>
      ) : null}
      {solarReturnResult ? (
        <>
          <h2>{copy.tables.solarAspects}</h2>
          <div className={styles.aspectList}>
            {solarReturnResult.result.aspectsToNatal.length > 0 ? (
              solarReturnResult.result.aspectsToNatal.map((aspect, index) => (
                <div
                  className={styles.aspectRow}
                  key={`solar-return-${aspect.solarReturnPoint}-${aspect.natalPoint}-${index}`}
                >
                  <span>{formatAspectTypeDisplay(aspect.type, locale)}</span>
                  <span>
                    {getPointLabelFromCollection(
                      solarReturnRenderResult?.points ?? [],
                      aspect.solarReturnPoint,
                      locale
                    )}{" "}
                    — {getPointLabelFromCollection(renderResult.points, aspect.natalPoint, locale)}
                  </span>
                  <span>{aspect.orb.toFixed(2)}°</span>
                </div>
              ))
            ) : (
              <div className={styles.emptyRow}>{copy.tables.noSolarAspects}</div>
            )}
          </div>
        </>
      ) : null}
      {progressionResult ? (
        <>
          <h2>{copy.tables.progressionAspects}</h2>
          <div className={styles.aspectList}>
            {progressionResult.result.aspectsToNatal.length > 0 ? (
              progressionResult.result.aspectsToNatal.map((aspect, index) => (
                <div
                  className={styles.aspectRow}
                  key={`progression-${aspect.progressedPoint}-${aspect.natalPoint}-${index}`}
                >
                  <span>{formatAspectTypeDisplay(aspect.type, locale)}</span>
                  <span>
                    {getPointLabelFromCollection(
                      progressionRenderResult?.points ?? [],
                      aspect.progressedPoint,
                      locale
                    )}{" "}
                    — {getPointLabelFromCollection(renderResult.points, aspect.natalPoint, locale)}
                  </span>
                  <span>{aspect.orb.toFixed(2)}°</span>
                </div>
              ))
            ) : (
              <div className={styles.emptyRow}>{copy.tables.noProgressionAspects}</div>
            )}
          </div>
        </>
      ) : null}
      {synastryResult ? (
        <>
          <h2>{copy.tables.betweenAspects}</h2>
          <div className={styles.aspectList}>
            {synastryResult.result.aspectsBetween.length > 0 ? (
              synastryResult.result.aspectsBetween.map((aspect, index) => (
                <div
                  className={styles.aspectRow}
                  key={`synastry-${aspect.primaryPoint}-${aspect.partnerPoint}-${index}`}
                >
                  <span>{formatAspectTypeDisplay(aspect.type, locale)}</span>
                  <span>
                    {getPointLabelFromCollection(renderResult.points, aspect.primaryPoint, locale)}{" "}
                    —{" "}
                    {getPointLabelFromCollection(
                      partnerRenderResult?.points ?? [],
                      aspect.partnerPoint,
                      locale
                    )}
                  </span>
                  <span>{aspect.orb.toFixed(2)}°</span>
                </div>
              ))
            ) : (
              <div className={styles.emptyRow}>{copy.tables.noBetweenAspects}</div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

function AspectMatrixRow({
  aspectsByPair,
  copy,
  locale,
  points,
  rowIndex,
  rowPoint
}: {
  readonly aspectsByPair: ReadonlyMap<string, ChartAspect>;
  readonly copy: ChartEngineCopy;
  readonly locale: DictionaryLocale;
  readonly points: readonly ChartPoint[];
  readonly rowIndex: number;
  readonly rowPoint: ChartPoint;
}) {
  return (
    <>
      <span className={styles.aspectMatrixHead}>
        {getChartPointSymbol(rowPoint.id, rowPoint.label)}
      </span>
      {points.map((columnPoint, columnIndex) => {
        const aspect = aspectsByPair.get(getAspectPairKey(rowPoint.id, columnPoint.id));
        const isEmpty = columnIndex >= rowIndex || !aspect;

        return (
          <span
            aria-label={
              !isEmpty && aspect
                ? `${getPointLabelFromPoint(rowPoint, locale)} ${formatAspectTypeDisplay(aspect.type, locale)} ${getPointLabelFromPoint(
                    columnPoint,
                    locale
                  )}, ${copy.tables.orb} ${aspect.orb.toFixed(2)}°`
                : undefined
            }
            className={isEmpty ? styles.aspectMatrixEmpty : styles.aspectMatrixCell}
            key={`${rowPoint.id}-${columnPoint.id}`}
          >
            {!isEmpty && aspect ? getAspectDisplaySymbol(aspect.type, locale) : ""}
          </span>
        );
      })}
    </>
  );
}

function InterpretationSummary({
  interpretationMode,
  locale,
  result
}: {
  readonly interpretationMode: ChartInterpretationMode;
  readonly locale: DictionaryLocale;
  readonly result: ChartResult;
}) {
  const anchors = useMemo(
    () => buildChartInterpretationAnchors(result, { mode: interpretationMode, locale }),
    [interpretationMode, locale, result]
  );
  const copy = chartEngineCopyByLocale[locale].tables;
  const lookupCodes = useMemo(() => getChartInterpretationLookupCodes(anchors), [anchors]);
  const [dictionaryState, setDictionaryState] = useState<{
    readonly entries: readonly DictionaryEffectiveEntryResponse[];
    readonly isLoading: boolean;
    readonly errorMessage: string | null;
  }>({
    entries: [],
    isLoading: lookupCodes.length > 0,
    errorMessage: null
  });
  const [creationAnchor, setCreationAnchor] = useState<ChartInterpretationAnchor | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const creationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusAnchorIdRef = useRef<string | null>(null);
  useEffect(() => {
    let isMounted = true;

    if (!lookupCodes.length) {
      setDictionaryState({ entries: [], isLoading: false, errorMessage: null });
      return () => {
        isMounted = false;
      };
    }

    setDictionaryState((current) => ({
      entries: current.entries,
      isLoading: true,
      errorMessage: null
    }));

    listDictionaryEntriesByCodes({
      locale,
      codes: [...lookupCodes]
    })
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setDictionaryState({
          entries: response.entries,
          isLoading: false,
          errorMessage: null
        });
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setDictionaryState({
          entries: [],
          isLoading: false,
          errorMessage: copy.dictionaryLoadError
        });
      });

    return () => {
      isMounted = false;
    };
  }, [copy.dictionaryLoadError, locale, lookupCodes, refreshVersion]);

  const dictionaryEntriesByCode = new Map(
    dictionaryState.entries.map((entry) => [entry.code, entry])
  );
  const anchorGroups = getInterpretationAnchorGroups(anchors, copy);
  const interpretationCopy = getInterpretationCopy({ copy, interpretationMode, result });

  return (
    <section className={styles.tableSection} aria-labelledby="chart-interpretations-heading">
      <h2 id="chart-interpretations-heading">{copy.interpretations}</h2>
      {creationAnchor ? (
        <ChartInterpretationCreateForm
          anchor={creationAnchor}
          copy={copy.interpretationEditor}
          locale={locale}
          onCancel={() => {
            setCreationAnchor(null);
            requestAnimationFrame(() => creationTriggerRef.current?.focus());
          }}
          onSaved={() => {
            setCreationAnchor(null);
            setRefreshVersion((current) => current + 1);
          }}
        />
      ) : (
        <div>
          <div className={styles.interpretationKicker}>{interpretationCopy.kicker}</div>
          <div className={styles.interpretationGroupStack}>
            {anchorGroups.map((group) => (
              <section className={styles.interpretationGroup} key={group.id}>
                <h3 className={styles.interpretationGroupTitle}>{group.title}</h3>
                <div className={styles.interpretationAnchorStack}>
                  {group.anchors.map((anchor) => {
                    const entry = dictionaryEntriesByCode.get(anchor.code);
                    const isMissingEntry = isDictionaryInterpretationMissing({
                      entry,
                      state: dictionaryState
                    });

                    return (
                      <div className={styles.interpretationAnchorCard} key={anchor.id}>
                        <strong>{anchor.label}</strong>
                        <small>{anchor.meta}</small>
                        <span>{anchor.position}</span>
                        <p>
                          {getDictionaryInterpretationText(
                            { anchor, entry },
                            dictionaryState,
                            copy
                          )}
                        </p>
                        {entry ? <em>{copy.dictionarySource(entry.source)}</em> : null}
                        {isMissingEntry ? (
                          <button
                            ref={(element) => {
                              if (element && returnFocusAnchorIdRef.current === anchor.id) {
                                creationTriggerRef.current = element;
                              }
                            }}
                            aria-label={copy.addInterpretationAria(anchor.label)}
                            className={styles.interpretationMissingAction}
                            type="button"
                            onClick={(event) => {
                              returnFocusAnchorIdRef.current = anchor.id;
                              creationTriggerRef.current = event.currentTarget;
                              setCreationAnchor(anchor);
                            }}
                          >
                            {copy.addInterpretation}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function getInterpretationCopy({
  copy,
  interpretationMode,
  result
}: {
  readonly copy: ChartEngineCopy["tables"];
  readonly interpretationMode: ChartInterpretationMode;
  readonly result: ChartResult;
}) {
  if (interpretationMode === "child") {
    return {
      kicker: copy.interpretationKickers.child
    };
  }

  if (result.method === "horary") {
    return {
      kicker: copy.interpretationKickers.horary
    };
  }

  if (result.method === "astrocartography") {
    return {
      kicker: copy.interpretationKickers.astrocartography
    };
  }

  return {
    kicker: copy.interpretationKickers.default
  };
}

function getDictionaryInterpretationText(
  input: {
    readonly anchor: ChartInterpretationAnchor;
    readonly entry?: DictionaryEffectiveEntryResponse;
  },
  state: {
    readonly isLoading: boolean;
    readonly errorMessage: string | null;
  },
  copy: ChartEngineCopy["tables"]
): string {
  if (state.isLoading) {
    return copy.dictionaryLoading;
  }

  if (state.errorMessage) {
    return state.errorMessage;
  }

  if (input.entry) {
    return input.entry.content;
  }

  return copy.dictionaryMissing;
}

function isDictionaryInterpretationMissing(input: {
  readonly entry?: DictionaryEffectiveEntryResponse;
  readonly state: {
    readonly isLoading: boolean;
    readonly errorMessage: string | null;
  };
}): boolean {
  return !input.entry && !input.state.isLoading && !input.state.errorMessage;
}

function getInterpretationAnchorGroups(
  anchors: readonly ChartInterpretationAnchor[],
  copy: ChartEngineCopy["tables"]
) {
  return interpretationGroupOrder
    .map((groupId) => ({
      id: groupId,
      title: copy.groupTitles[groupId],
      anchors: anchors.filter((anchor) => anchor.group === groupId)
    }))
    .filter((group) => group.anchors.length > 0);
}

const interpretationGroupOrder: readonly ChartInterpretationAnchorGroup[] = [
  "points",
  "houses",
  "aspects"
];

function getPointLabel(result: ChartResult, pointId: string, locale: DictionaryLocale): string {
  const point = getPrimaryChartRenderResult(result).points.find(
    (candidate) => candidate.id === pointId
  );

  return getChartPointDisplayLabel(pointId, point?.label ?? pointId, locale);
}

function getPointLabelFromCollection(
  points: readonly ChartPoint[],
  pointId: string,
  locale: DictionaryLocale
): string {
  const point = points.find((candidate) => candidate.id === pointId);

  return getChartPointDisplayLabel(pointId, point?.label ?? pointId, locale);
}

function getPointLabelFromPoint(point: ChartPoint, locale: DictionaryLocale): string {
  return getChartPointDisplayLabel(point.id, point.label, locale);
}

function getAspectMatrixPoints(points: readonly ChartPoint[]): readonly ChartPoint[] {
  return mainPointOrder
    .map((pointId) => points.find((point) => point.id === pointId))
    .filter((point): point is ChartPoint => Boolean(point));
}

function getAspectPairKey(pointA: string, pointB: string): string {
  return [pointA, pointB].sort().join(":");
}

function getZodiacSymbol(sign: string): string {
  return getZodiacDisplaySymbol(sign);
}

const mainPointOrder = [
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
] as const;

const aspectLegendItems = [
  { type: "conjunction", symbol: "☌" },
  { type: "sextile", symbol: "✶" },
  { type: "square", symbol: "□" },
  { type: "trine", symbol: "△" },
  { type: "opposition", symbol: "☍" }
] as const;
