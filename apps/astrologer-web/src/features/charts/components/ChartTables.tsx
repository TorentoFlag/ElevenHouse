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
  formatChartPointPosition,
  formatDegree,
  formatHouseSignDisplay,
  getChartPointDisplayLabel,
  getChartPointSymbol,
  romanHouses
} from "../model/chartDisplay";
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
  return (
    <section className={styles.tableSection} aria-labelledby="chart-planets-heading">
      <h2 id="chart-planets-heading">Планеты</h2>
      <div className={styles.planetList}>
        {result.result.points.map((point) => {
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
    </section>
  );
}

function HousesTable({ result }: { readonly result: StoredChartCalculationPayload }) {
  return (
    <section className={styles.tableSection} aria-labelledby="chart-houses-heading">
      <h2 id="chart-houses-heading">Дома</h2>
      <div className={styles.houseGrid}>
        {result.result.houses.map((house) => (
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
  const matrixPoints = getAspectMatrixPoints(result.result.points);
  const aspectsByPair = new Map(
    result.result.aspects.map((aspect) => [getAspectPairKey(aspect.pointA, aspect.pointB), aspect])
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
        {result.result.aspects.length > 0 ? (
          result.result.aspects.map((aspect, index) => (
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
  const sun = result.result.points.find((point) => point.id === "sun");
  const moon = result.result.points.find((point) => point.id === "moon");
  const ascendant = result.result.houses.find((house) => house.number === 1);
  const lookupCodes = useMemo(
    () =>
      [
        ...(sun ? [getPointSignDictionaryCode(sun), getPointHouseDictionaryCode(sun)] : []),
        ...(moon ? [getPointSignDictionaryCode(moon), getPointHouseDictionaryCode(moon)] : []),
        "house_1"
      ].filter((code): code is string => Boolean(code)),
    [moon, sun]
  );
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
      codes: lookupCodes
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
  const anchors = [
    {
      label: sun ? `Солнце · ${sun.house ? romanHouses[sun.house] : "—"} дом` : "Солнце",
      meta: "Библиотека",
      position: sun ? formatPointPosition(sun) : "—",
      entry: sun ? dictionaryEntriesByCode.get(getPointSignDictionaryCode(sun)) : undefined,
      missingCode: sun ? getPointSignDictionaryCode(sun) : undefined
    },
    {
      label: moon ? `Луна в ${formatSignPrepositional(moon.sign)}` : "Луна",
      meta: "Библиотека",
      position: moon ? formatPointPosition(moon) : "—",
      entry: moon ? dictionaryEntriesByCode.get(getPointSignDictionaryCode(moon)) : undefined,
      missingCode: moon ? getPointSignDictionaryCode(moon) : undefined
    },
    {
      label: "Asc",
      meta: "Точка входа",
      position: ascendant
        ? `${formatHouseSignDisplay(ascendant.sign)} ${formatDegree(ascendant.signDegree)}`
        : "—",
      entry: dictionaryEntriesByCode.get("house_1"),
      missingCode: "house_1"
    }
  ];
  const ascendantAnchor = anchors[2] ?? {
    label: "Asc",
    meta: "Точка входа",
    position: "—",
    entry: undefined,
    missingCode: "house_1"
  };

  return (
    <section className={styles.tableSection} aria-labelledby="chart-interpretations-heading">
      <h2 id="chart-interpretations-heading">Трактовки</h2>
      <div className={styles.interpretationStack}>
        <div>
          <div className={styles.interpretationKicker}>Опорные положения · библиотека</div>
          <div className={styles.interpretationAnchorStack}>
            {anchors.slice(0, 2).map((anchor) => (
              <div className={styles.interpretationAnchorCard} key={anchor.label}>
                <strong>{anchor.label}</strong>
                <small>{anchor.meta}</small>
                <span>{anchor.position}</span>
                <p>{getDictionaryInterpretationText(anchor, dictionaryState)}</p>
                {anchor.entry ? <em>Справочник · {anchor.entry.source}</em> : null}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.interpretationAxisCard}>
          <strong>Asc</strong>
          <span>{ascendantAnchor.position}</span>
          <p>{getDictionaryInterpretationText(ascendantAnchor, dictionaryState)}</p>
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
  anchor: {
    readonly entry?: DictionaryEffectiveEntryResponse;
    readonly missingCode?: string;
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

  if (anchor.entry) {
    return anchor.entry.content;
  }

  return anchor.missingCode
    ? `В справочнике пока нет записи ${anchor.missingCode}.`
    : "Опорная запись появится после расчёта.";
}

function getPointSignDictionaryCode(point: ChartPoint): string {
  return `${formatDictionaryCodePart(point.id)}_${formatDictionaryCodePart(point.sign)}`;
}

function getPointHouseDictionaryCode(point: ChartPoint): string | null {
  if (!point.house) {
    return null;
  }

  return `${formatDictionaryCodePart(point.id)}_house_${point.house}`;
}

function formatDictionaryCodePart(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "_");
}

function getPointLabel(result: StoredChartCalculationPayload, pointId: string): string {
  const point = result.result.points.find((candidate) => candidate.id === pointId);

  return getChartPointDisplayLabel(pointId, point?.label ?? pointId);
}

function formatPointPosition(point: ChartPoint): string {
  return formatChartPointPosition(point);
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

function formatSignPrepositional(sign: string): string {
  return zodiacPrepositionalNames[sign.toLowerCase()] ?? formatHouseSignDisplay(sign);
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

const zodiacPrepositionalNames: Record<string, string> = {
  aries: "Овне",
  taurus: "Тельце",
  gemini: "Близнецах",
  cancer: "Раке",
  leo: "Льве",
  virgo: "Деве",
  libra: "Весах",
  scorpio: "Скорпионе",
  sagittarius: "Стрельце",
  capricorn: "Козероге",
  aquarius: "Водолее",
  pisces: "Рыбах"
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
