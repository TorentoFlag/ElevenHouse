import { useEffect, useMemo, useState } from "react";
import type {
  ChartAspect,
  ChartPoint,
  DictionaryEffectiveEntryResponse,
  DictionaryLocale,
  StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import { listDictionaryEntriesByCodes } from "../../dictionary/api/listDictionaryEntriesByCodes";
import {
  formatAspectTypeDisplay,
  formatDegree,
  formatHouseSignDisplay,
  getPrimaryChartRenderResult,
  getTransitChartRenderResult,
  getTransitChartResult,
  getChartPointDisplayLabel,
  getChartPointSymbol,
  romanHouses
} from "../model/chartDisplay";
import {
  buildChartInterpretationAnchors,
  getChartInterpretationLookupCodes,
  type ChartInterpretationAnchor,
  type ChartInterpretationAnchorGroup
} from "../model/chartInterpretations";
import styles from "./ChartEnginePage.module.css";

export type ChartPanelTab = "planets" | "aspects" | "houses" | "interpretations";

export type ChartTablesProps = {
  readonly result: StoredChartCalculationPayload | null;
  readonly activeTab: ChartPanelTab;
  readonly locale: DictionaryLocale;
  readonly hoveredPointId: string | null;
  readonly onHoverPoint: (pointId: string | null) => void;
};

export function ChartTables({
  activeTab,
  hoveredPointId,
  locale,
  onHoverPoint,
  result
}: ChartTablesProps) {
  if (!result) {
    return (
      <div className={styles.panelEmpty}>
        После расчёта здесь появятся планеты, аспекты и дома из canonical result.
      </div>
    );
  }

  return (
    <div className={styles.tableStack}>
      {activeTab === "planets" ? (
        <PlanetsTable hoveredPointId={hoveredPointId} onHoverPoint={onHoverPoint} result={result} />
      ) : null}
      {activeTab === "aspects" ? <AspectsTable result={result} /> : null}
      {activeTab === "houses" ? <HousesTable result={result} /> : null}
      {activeTab === "interpretations" ? (
        <InterpretationSummary locale={locale} result={result} />
      ) : null}
    </div>
  );
}

function PlanetsTable({
  hoveredPointId,
  onHoverPoint,
  result
}: {
  readonly hoveredPointId: string | null;
  readonly onHoverPoint: (pointId: string | null) => void;
  readonly result: StoredChartCalculationPayload;
}) {
  const renderResult = getPrimaryChartRenderResult(result);
  const transitRenderResult = getTransitChartRenderResult(result);

  return (
    <section className={styles.tableSection} aria-labelledby="chart-planets-heading">
      <h2 id="chart-planets-heading">Планеты</h2>
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
                {getChartPointDisplayLabel(point.id, point.label)}
              </span>
              <span className={styles.signGlyph} aria-hidden="true">
                {getZodiacSymbol(point.sign)}
              </span>
              <span className={styles.pointDegree}>
                {formatDegree(point.signDegree)}
                {point.retrograde ? <b>R</b> : null}
              </span>
              <span className={styles.pointHouse}>
                {point.house ? `${romanHouses[point.house]} дом` : "—"}
              </span>
            </div>
          );
        })}
      </div>
      {transitRenderResult ? (
        <>
          <h3 className={styles.matrixHeading}>Транзитные планеты</h3>
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
                    {getChartPointDisplayLabel(point.id, point.label)}
                  </span>
                  <span className={styles.signGlyph} aria-hidden="true">
                    {getZodiacSymbol(point.sign)}
                  </span>
                  <span className={styles.pointDegree}>
                    {formatDegree(point.signDegree)}
                    {point.retrograde ? <b>R</b> : null}
                  </span>
                  <span className={styles.pointHouse}>
                    {point.house ? `${romanHouses[point.house]} дом` : "—"}
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

function HousesTable({ result }: { readonly result: StoredChartCalculationPayload }) {
  const renderResult = getPrimaryChartRenderResult(result);

  return (
    <section className={styles.tableSection} aria-labelledby="chart-houses-heading">
      <h2 id="chart-houses-heading">Дома</h2>
      <div className={styles.houseGrid}>
        {renderResult.houses.map((house) => (
          <div className={styles.houseCard} key={house.number}>
            <span>{romanHouses[house.number]} дом</span>
            <strong>
              {getZodiacSymbol(house.sign)} {formatDegree(house.signDegree)}
            </strong>
            <small>{formatHouseSignDisplay(house.sign)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function AspectsTable({ result }: { readonly result: StoredChartCalculationPayload }) {
  const renderResult = getPrimaryChartRenderResult(result);
  const transitResult = getTransitChartResult(result);
  const transitRenderResult = getTransitChartRenderResult(result);
  const matrixPoints = getAspectMatrixPoints(renderResult.points);
  const aspectsByPair = new Map(
    renderResult.aspects.map((aspect) => [getAspectPairKey(aspect.pointA, aspect.pointB), aspect])
  );

  return (
    <section className={styles.tableSection} aria-labelledby="chart-aspects-heading">
      <h2 id="chart-aspects-heading">Аспекты</h2>
      <h3 className={styles.matrixHeading}>Матрица аспектов</h3>
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
              rowIndex={rowIndex}
              rowPoint={rowPoint}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyRow}>Недостаточно точек для матрицы</div>
      )}
      <div className={styles.aspectLegend} aria-label="Легенда аспектов">
        {aspectLegendItems.map((item) => (
          <span key={item.type}>
            <b>{item.symbol}</b>
            {item.label}
          </span>
        ))}
      </div>
      <h2>Список аспектов</h2>
      <div className={styles.aspectList}>
        {renderResult.aspects.length > 0 ? (
          renderResult.aspects.map((aspect, index) => (
            <div className={styles.aspectRow} key={`${aspect.pointA}-${aspect.pointB}-${index}`}>
              <span>{formatAspectTypeDisplay(aspect.type)}</span>
              <span>
                {getPointLabel(result, aspect.pointA)} — {getPointLabel(result, aspect.pointB)}
              </span>
              <span>{aspect.orb.toFixed(2)}°</span>
            </div>
          ))
        ) : (
          <div className={styles.emptyRow}>Мажорные аспекты не найдены</div>
        )}
      </div>
      {transitResult ? (
        <>
          <h2>Транзитные аспекты к наталу</h2>
          <div className={styles.aspectList}>
            {transitResult.result.aspectsToNatal.length > 0 ? (
              transitResult.result.aspectsToNatal.map((aspect, index) => (
                <div
                  className={styles.aspectRow}
                  key={`transit-${aspect.transitPoint}-${aspect.natalPoint}-${index}`}
                >
                  <span>{formatAspectTypeDisplay(aspect.type)}</span>
                  <span>
                    {getPointLabelFromCollection(transitRenderResult?.points ?? [], aspect.transitPoint)} —{" "}
                    {getPointLabelFromCollection(renderResult.points, aspect.natalPoint)}
                  </span>
                  <span>{aspect.orb.toFixed(2)}°</span>
                </div>
              ))
            ) : (
              <div className={styles.emptyRow}>Транзитные аспекты к наталу не найдены</div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

function AspectMatrixRow({
  aspectsByPair,
  points,
  rowIndex,
  rowPoint
}: {
  readonly aspectsByPair: ReadonlyMap<string, ChartAspect>;
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
                ? `${getPointLabelFromPoint(rowPoint)} ${formatAspectTypeDisplay(aspect.type)} ${getPointLabelFromPoint(
                    columnPoint
                  )}, орбис ${aspect.orb.toFixed(2)}°`
                : undefined
            }
            className={isEmpty ? styles.aspectMatrixEmpty : styles.aspectMatrixCell}
            key={`${rowPoint.id}-${columnPoint.id}`}
          >
            {!isEmpty && aspect ? getAspectSymbol(aspect.type) : ""}
          </span>
        );
      })}
    </>
  );
}

function InterpretationSummary({
  locale,
  result
}: {
  readonly locale: DictionaryLocale;
  readonly result: StoredChartCalculationPayload;
}) {
  const anchors = useMemo(() => buildChartInterpretationAnchors(result), [result]);
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
          errorMessage: "Не удалось загрузить трактовки из справочника."
        });
      });

    return () => {
      isMounted = false;
    };
  }, [locale, lookupCodes]);

  const dictionaryEntriesByCode = new Map(
    dictionaryState.entries.map((entry) => [entry.code, entry])
  );
  const anchorGroups = getInterpretationAnchorGroups(anchors);

  return (
    <section className={styles.tableSection} aria-labelledby="chart-interpretations-heading">
      <h2 id="chart-interpretations-heading">Трактовки</h2>
      <div className={styles.interpretationStack}>
        <div>
          <div className={styles.interpretationKicker}>Опорные положения · библиотека</div>
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
                        <p>{getDictionaryInterpretationText({ anchor, entry }, dictionaryState)}</p>
                        {entry ? <em>Справочник · {entry.source}</em> : null}
                        {isMissingEntry ? (
                          <a
                            aria-label={`Создать трактовку ${anchor.code} в справочнике`}
                            className={styles.interpretationMissingAction}
                            href={getReferenceCreateInterpretationHref(anchor)}
                          >
                            Создать трактовку
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className={styles.interpretationAiPanel}>
          <div className={styles.interpretationAiHeader}>
            <div>
              <span>AI-трактовка · натальная карта</span>
              <strong>Черновик появится после подключения production-контура</strong>
            </div>
            <b>позже</b>
          </div>
          <p>
            AI-контур для карт ещё не подключён. Пока показываем только детерминированные опорные
            положения из canonical result.
          </p>
          <button type="button" disabled>
            AI-черновик недоступен
          </button>
          <small>
            Будущая трактовка будет черновиком поверх детерминированного расчёта; астролог проверит
            текст перед отправкой клиенту.
          </small>
        </div>
      </div>
    </section>
  );
}

function getDictionaryInterpretationText(
  input: {
    readonly anchor: ChartInterpretationAnchor;
    readonly entry?: DictionaryEffectiveEntryResponse;
  },
  state: {
    readonly isLoading: boolean;
    readonly errorMessage: string | null;
  }
): string {
  if (state.isLoading) {
    return "Загружаем трактовку из справочника...";
  }

  if (state.errorMessage) {
    return state.errorMessage;
  }

  if (input.entry) {
    return input.entry.content;
  }

  return `В справочнике пока нет записи ${input.anchor.code}.`;
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

function getReferenceCreateInterpretationHref(anchor: ChartInterpretationAnchor): string {
  const searchParams = new URLSearchParams({
    category: anchor.categoryCode,
    create: anchor.code,
    search: anchor.code,
    title: anchor.label
  });

  return `/reference?${searchParams.toString()}`;
}

function getInterpretationAnchorGroups(anchors: readonly ChartInterpretationAnchor[]) {
  return interpretationGroupOrder
    .map((groupId) => ({
      id: groupId,
      title: interpretationGroupTitles[groupId],
      anchors: anchors.filter((anchor) => anchor.group === groupId)
    }))
    .filter((group) => group.anchors.length > 0);
}

const interpretationGroupOrder: readonly ChartInterpretationAnchorGroup[] = [
  "points",
  "houses",
  "aspects"
];

const interpretationGroupTitles: Record<ChartInterpretationAnchorGroup, string> = {
  points: "Положения",
  houses: "Дома",
  aspects: "Аспекты"
};

function getPointLabel(result: StoredChartCalculationPayload, pointId: string): string {
  const point = getPrimaryChartRenderResult(result).points.find((candidate) => candidate.id === pointId);

  return getChartPointDisplayLabel(pointId, point?.label ?? pointId);
}

function getPointLabelFromCollection(points: readonly ChartPoint[], pointId: string): string {
  const point = points.find((candidate) => candidate.id === pointId);

  return getChartPointDisplayLabel(pointId, point?.label ?? pointId);
}

function getPointLabelFromPoint(point: ChartPoint): string {
  return getChartPointDisplayLabel(point.id, point.label);
}

function getAspectMatrixPoints(points: readonly ChartPoint[]): readonly ChartPoint[] {
  return mainPointOrder
    .map((pointId) => points.find((point) => point.id === pointId))
    .filter((point): point is ChartPoint => Boolean(point));
}

function getAspectPairKey(pointA: string, pointB: string): string {
  return [pointA, pointB].sort().join(":");
}

function getAspectSymbol(type: string): string {
  return aspectSymbols[type] ?? "•";
}

function getZodiacSymbol(sign: string): string {
  return zodiacSymbols[sign.toLowerCase()] ?? "♈︎";
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

const zodiacSymbols: Record<string, string> = {
  aries: "♈︎",
  taurus: "♉︎",
  gemini: "♊︎",
  cancer: "♋︎",
  leo: "♌︎",
  virgo: "♍︎",
  libra: "♎︎",
  scorpio: "♏︎",
  sagittarius: "♐︎",
  capricorn: "♑︎",
  aquarius: "♒︎",
  pisces: "♓︎"
};

const aspectSymbols: Record<string, string> = {
  conjunction: "☌",
  sextile: "✶",
  square: "□",
  trine: "△",
  opposition: "☍",
  "semi-sextile": "⚺",
  "semi-square": "∠",
  quincunx: "⚻",
  quintile: "Q"
};

const aspectLegendItems = [
  { type: "conjunction", symbol: "☌", label: "Соединение" },
  { type: "sextile", symbol: "✶", label: "Секстиль" },
  { type: "square", symbol: "□", label: "Квадрат" },
  { type: "trine", symbol: "△", label: "Тригон" },
  { type: "opposition", symbol: "☍", label: "Оппозиция" }
] as const;
