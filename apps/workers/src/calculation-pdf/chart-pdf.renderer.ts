import type { ChartAspect, ChartHouse, ChartPoint } from "@elevenhouse/contracts";
import type { ChartPdfDocument, ChartPdfInterpretation } from "./calculation-pdf.documents";
import {
  createPdfLayout,
  type PdfGraphicContext,
  type PdfTableOptions
} from "./pdf-layout";

type KeyValue = { readonly label: string; readonly value: string };

export type ChartPdfBlock =
  | {
      readonly kind: "wheel";
      readonly heading: string;
    }
  | {
      readonly kind: "section";
      readonly heading: string;
      readonly text: string;
      readonly muted?: boolean;
    }
  | { readonly kind: "key_values"; readonly heading: string; readonly items: readonly KeyValue[] }
  | {
      readonly kind: "table";
      readonly heading: string;
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
      readonly layout?: PdfTableOptions;
    };

export type ChartPdfRenderer = {
  readonly render: (
    document: ChartPdfDocument
  ) => Promise<{ readonly bytes: Buffer; readonly pageCount: number }>;
};

export function createChartPdfRenderer(
  input: {
    readonly regularFontBytes?: Uint8Array;
    readonly semiboldFontBytes?: Uint8Array;
  } = {}
): ChartPdfRenderer {
  return {
    render: async (document) => {
      const labels = document.locale === "ru" ? ru : en;
      const layout = await createPdfLayout({
        locale: document.locale,
        title: labels.title,
        creator: "ElevenHouse Chart Engine",
        createdAt: document.createdAt,
        ...input
      });
      layout.drawCover(labels.title, labels.subtitle);
      for (const block of buildChartPdfContent(document)) {
        if (block.kind === "wheel") {
          layout.drawGraphic(block.heading, 360, (context) => drawChartWheel(context, document, labels));
        } else if (block.kind === "section") {
          layout.drawSection(block.heading, block.text, block.muted);
        } else if (block.kind === "key_values") {
          layout.drawKeyValues(block.heading, block.items);
        } else {
          layout.drawTable(block.heading, block.headers, block.rows, block.layout);
        }
      }
      return layout.save();
    }
  };
}

export function buildChartPdfContent(document: ChartPdfDocument): readonly ChartPdfBlock[] {
  const labels = document.locale === "ru" ? ru : en;
  const result = document.result;
  const blocks: ChartPdfBlock[] = [
    {
      kind: "wheel",
      heading: labels.chartWheel
    },
    {
      kind: "key_values",
      heading: labels.calculation,
      items: [
        { label: labels.calculationTitle, value: document.calculationTitle },
        {
          label: labels.provider,
          value: `${result.provider.name} ${result.provider.version} · ${result.provider.ephemeris}`
        },
        {
          label: labels.houseSystem,
          value: labels.houseSystems[result.settings.houseSystem] ?? result.settings.houseSystem
        },
        {
          label: labels.nodes,
          value: labels.nodeTypes[result.settings.nodeType] ?? result.settings.nodeType
        },
        {
          label: labels.orbs,
          value: `${result.settings.aspectPreset} × ${result.settings.orbMultiplier}`
        }
      ]
    },
    {
      kind: "key_values",
      heading: labels.birthData,
      items: [
        { label: labels.birthDate, value: result.inputSnapshot.birthDate },
        { label: labels.birthTime, value: result.inputSnapshot.birthTime },
        { label: labels.timezone, value: result.inputSnapshot.timezone },
        {
          label: labels.place,
          value: `${result.inputSnapshot.latitude}, ${result.inputSnapshot.longitude}`
        },
        {
          label: labels.timePrecision,
          value:
            labels.timePrecisions[result.inputSnapshot.birthTimePrecision] ??
            result.inputSnapshot.birthTimePrecision
        }
      ]
    },
    {
      kind: "table",
      heading: labels.points,
      headers: [labels.point, labels.sign, labels.position, labels.house, labels.motion],
      rows: result.result.points.map((point) => pointRow(point, labels)),
      layout: { columnWeights: [1.3, 1, 1, 0.8, 0.8] }
    },
    {
      kind: "table",
      heading: labels.houses,
      headers: [labels.house, labels.sign, labels.position],
      rows: result.result.houses.map((house) => houseRow(house, labels)),
      layout: { columnWeights: [0.8, 1, 1] }
    },
    {
      kind: "table",
      heading: labels.aspects,
      headers: [labels.pointA, labels.aspect, labels.pointB, labels.orb, labels.strength],
      rows: result.result.aspects.map((aspect) => aspectRow(aspect, labels)),
      layout: { columnWeights: [1, 1, 1, 0.7, 0.7], fontSize: 8.5, lineHeight: 12 }
    },
    {
      kind: "table",
      heading: labels.distributions,
      headers: [labels.factor, labels.value],
      rows: distributionRows(document, labels),
      layout: { columnWeights: [1.5, 0.5] }
    }
  ];
  const interpretationRows = buildInterpretationRows(document.interpretations, labels);
  if (interpretationRows.length > 0) {
    blocks.push({
      kind: "table",
      heading: labels.dictionaryInterpretations,
      headers: [
        labels.interpretationPosition,
        labels.interpretationContext,
        labels.interpretationText,
        labels.interpretationSource
      ],
      rows: interpretationRows,
      layout: { columnWeights: [1.1, 1.1, 2.5, 0.8], fontSize: 8.3, lineHeight: 12 }
    });
  }
  if (result.result.warnings.length > 0) {
    blocks.push({
      kind: "table",
      heading: labels.warnings,
      headers: [labels.code, labels.message],
      rows: result.result.warnings.map((warning) => [warning.code, warning.message]),
      layout: { columnWeights: [1, 2] }
    });
  }
  return blocks;
}

function drawChartWheel(
  context: PdfGraphicContext,
  document: ChartPdfDocument,
  labels: Labels
): void {
  const result = document.result;
  const points = result.result.points;
  const houses = result.result.houses;
  const ascLongitude = houses.find((house) => house.number === 1)?.longitude ?? 0;
  const center = { x: context.x + context.width / 2, y: context.y + 186 };
  const radiusScale = 0.68;
  const outerRadius = 220 * radiusScale;
  const middleRadius = 166 * radiusScale;
  const aspectRadius = 132 * radiusScale;
  const innerRadius = 72 * radiusScale;
  const markerLongitudes = spreadPointLongitudes(
    points.filter((point) => !axisPointIds.has(point.id))
  );

  context.page.drawRectangle({
    x: context.x,
    y: context.y,
    width: context.width,
    height: context.height,
    color: context.colors.surface,
    borderColor: context.colors.border,
    borderWidth: 0.6
  });
  for (const radius of [outerRadius, middleRadius, aspectRadius, innerRadius]) {
    context.page.drawCircle({
      x: center.x,
      y: center.y,
      size: radius,
      borderColor: context.rgb(0.45, 0.41, 0.56),
      borderWidth: radius === outerRadius ? 0.9 : 0.55
    });
  }
  for (let degreeValue = 0; degreeValue < 360; degreeValue += 1) {
    const isSign = degreeValue % 30 === 0;
    const isTen = degreeValue % 10 === 0;
    const isFive = degreeValue % 5 === 0;
    const tickLength = isSign ? 10 : isTen ? 6.5 : isFive ? 4.2 : 2.3;
    const tick = radialLine(center, degreeValue, middleRadius - tickLength, middleRadius, ascLongitude);
    context.page.drawLine({
      start: { x: tick.x1, y: tick.y1 },
      end: { x: tick.x2, y: tick.y2 },
      thickness: isSign ? 0.65 : isTen ? 0.45 : 0.25,
      color: context.rgb(0.49, 0.46, 0.59)
    });
  }
  zodiacLabels.forEach((zodiac, index) => {
    const longitude = index * 30;
    const line = radialLine(center, longitude, middleRadius, outerRadius, ascLongitude);
    const label = polar(center, longitude + 15, 193 * radiusScale, ascLongitude);
    context.page.drawLine({
      start: { x: line.x1, y: line.y1 },
      end: { x: line.x2, y: line.y2 },
      thickness: 0.55,
      color: context.rgb(0.36, 0.33, 0.46)
    });
    context.page.drawText(zodiac.label, {
      x: label.x - 7,
      y: label.y - 4,
      font: context.semibold,
      size: 8.5,
      color: zodiac.color(context.rgb)
    });
  });
  for (const house of houses) {
    const line = radialLine(center, house.longitude, innerRadius, middleRadius, ascLongitude);
    const nextHouse = houses.find((candidate) => candidate.number === (house.number % 12) + 1);
    const labelLongitude =
      house.longitude + arcDistance(house.longitude, nextHouse?.longitude ?? house.longitude) / 2;
    const label = polar(center, labelLongitude, 98 * radiusScale, ascLongitude);
    const isAxis = house.number === 1 || house.number === 10;
    context.page.drawLine({
      start: { x: line.x1, y: line.y1 },
      end: { x: line.x2, y: line.y2 },
      thickness: isAxis ? 0.9 : 0.35,
      color: isAxis ? context.rgb(0.84, 0.68, 0.25) : context.rgb(0.38, 0.34, 0.51)
    });
    context.page.drawText(String(house.number), {
      x: label.x - 4,
      y: label.y - 4,
      font: context.semibold,
      size: 8,
      color: context.rgb(0.52, 0.48, 0.62)
    });
    if (isAxis) {
      const axisPosition = polar(center, house.longitude, 184 * radiusScale, ascLongitude);
      context.page.drawText(house.number === 1 ? "Asc" : "MC", {
        x: axisPosition.x - 9,
        y: axisPosition.y - 4,
        font: context.semibold,
        size: 10,
        color: context.rgb(0.84, 0.68, 0.25)
      });
    }
  }
  for (const aspect of result.result.aspects) {
    const pointA = points.find((point) => point.id === aspect.pointA);
    const pointB = points.find((point) => point.id === aspect.pointB);
    if (!pointA || !pointB) continue;
    const start = polar(center, pointA.longitude, aspectRadius, ascLongitude);
    const end = polar(center, pointB.longitude, aspectRadius, ascLongitude);
    context.page.drawLine({
      start,
      end,
      thickness: 0.55,
      color: aspectColor(aspect, context)
    });
  }
  for (const point of points) {
    if (axisPointIds.has(point.id)) continue;
    const exact = polar(center, point.longitude, middleRadius, ascLongitude);
    const marker = polar(
      center,
      markerLongitudes[point.id] ?? point.longitude,
      142 * radiusScale,
      ascLongitude
    );
    context.page.drawLine({
      start: exact,
      end: marker,
      thickness: 0.35,
      color: context.rgb(0.5, 0.48, 0.61)
    });
    context.page.drawCircle({
      x: marker.x,
      y: marker.y,
      size: 10,
      color: context.rgb(0.18, 0.15, 0.28),
      borderColor: context.rgb(0.56, 0.5, 0.72),
      borderWidth: 0.7
    });
    context.page.drawText(pointGlyph(point.id), {
      x: marker.x - 5.5,
      y: marker.y - 4,
      font: context.semibold,
      size: 7.3,
      color: context.rgb(0.92, 0.9, 0.98)
    });
    if (point.retrograde) {
      context.page.drawText("R", {
        x: marker.x + 9,
        y: marker.y + 7,
        font: context.semibold,
        size: 6,
        color: context.rgb(0.84, 0.68, 0.25)
      });
    }
  }
  context.page.drawText(labels.chartWheelCaption, {
    x: context.x + 18,
    y: context.y + 16,
    font: context.regular,
    size: 8,
    color: context.colors.muted
  });
}

function pointRow(point: ChartPoint, labels: Labels): readonly string[] {
  return [
    labels.pointsById[point.id] ?? point.label,
    labels.signs[point.sign] ?? point.sign,
    degree(point.signDegree),
    point.house ? labels.houseValue(point.house) : labels.noHouse,
    point.retrograde ? labels.retrograde : labels.direct
  ];
}

function houseRow(house: ChartHouse, labels: Labels): readonly string[] {
  return [
    labels.houseValue(house.number),
    labels.signs[house.sign] ?? house.sign,
    degree(house.signDegree)
  ];
}

function aspectRow(aspect: ChartAspect, labels: Labels): readonly string[] {
  return [
    labels.pointsById[aspect.pointA] ?? aspect.pointA,
    labels.aspectTypes[aspect.type] ?? aspect.type,
    labels.pointsById[aspect.pointB] ?? aspect.pointB,
    degree(aspect.orb),
    aspect.strength == null ? labels.notAvailable : `${Math.round(aspect.strength * 100)}%`
  ];
}

function distributionRows(
  document: ChartPdfDocument,
  labels: Labels
): readonly (readonly string[])[] {
  const distributions = document.result.result.distributions;
  return [
    [labels.fire, String(distributions.elements.fire)],
    [labels.earth, String(distributions.elements.earth)],
    [labels.air, String(distributions.elements.air)],
    [labels.water, String(distributions.elements.water)],
    [labels.cardinal, String(distributions.modalities.cardinal)],
    [labels.fixed, String(distributions.modalities.fixed)],
    [labels.mutable, String(distributions.modalities.mutable)],
    [labels.masculine, String(distributions.polarity.masculine)],
    [labels.feminine, String(distributions.polarity.feminine)]
  ];
}

function buildInterpretationRows(
  interpretations: readonly ChartPdfInterpretation[],
  labels: Labels
): readonly (readonly string[])[] {
  return interpretations.slice(0, 28).map((interpretation) => [
    interpretation.label,
    `${interpretation.meta} · ${interpretation.position}`,
    interpretation.entry?.content ??
      labels.missingInterpretationText(interpretation.code),
    interpretation.entry ? `${labels.dictionary} · ${interpretation.entry.source}` : labels.noEntry
  ]);
}

function degree(value: number): string {
  const degrees = Math.trunc(value);
  const minutes = Math.round((value - degrees) * 60);
  return `${degrees}°${String(minutes).padStart(2, "0")}'`;
}

function polar(
  center: { readonly x: number; readonly y: number },
  longitude: number,
  radius: number,
  ascLongitude: number
): { readonly x: number; readonly y: number } {
  const radians = ((180 + (longitude - ascLongitude)) * Math.PI) / 180;

  return {
    x: center.x + Math.cos(radians) * radius,
    y: center.y - Math.sin(radians) * radius
  };
}

function radialLine(
  center: { readonly x: number; readonly y: number },
  longitude: number,
  innerRadius: number,
  outerRadius: number,
  ascLongitude: number
): { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } {
  const inner = polar(center, longitude, innerRadius, ascLongitude);
  const outer = polar(center, longitude, outerRadius, ascLongitude);

  return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
}

function spreadPointLongitudes(
  points: readonly ChartPoint[],
  minSeparation = 7.5
): Record<string, number> {
  const sorted = points
    .map((point) => ({ id: point.id, longitude: normalizeLongitude(point.longitude) }))
    .sort((a, b) => a.longitude - b.longitude);
  if (sorted.length < 2) {
    return Object.fromEntries(sorted.map((point) => [point.id, point.longitude]));
  }

  for (let iteration = 0; iteration < 60; iteration += 1) {
    let moved = false;
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index]!;
      const next = sorted[(index + 1) % sorted.length]!;
      const distance =
        index === sorted.length - 1
          ? next.longitude + 360 - current.longitude
          : next.longitude - current.longitude;
      if (distance < minSeparation) {
        const push = (minSeparation - distance) / 2;
        current.longitude -= push;
        next.longitude += push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return Object.fromEntries(sorted.map((point) => [point.id, normalizeLongitude(point.longitude)]));
}

function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

function arcDistance(from: number, to: number): number {
  return normalizeLongitude(to - from);
}

function aspectColor(aspect: ChartAspect, context: PdfGraphicContext): ReturnType<typeof context.rgb> {
  if (aspect.type === "square" || aspect.type === "opposition" || aspect.type === "semi-square") {
    return context.rgb(0.77, 0.31, 0.34);
  }
  if (aspect.type === "conjunction") {
    return context.rgb(0.7, 0.58, 0.25);
  }
  return context.rgb(0.25, 0.49, 0.75);
}

function pointGlyph(pointId: string): string {
  return pointGlyphs[pointId] ?? pointId.slice(0, 2).toUpperCase();
}

type Labels = {
  readonly title: string;
  readonly subtitle: string;
  readonly calculation: string;
  readonly chartWheel: string;
  readonly chartWheelCaption: string;
  readonly calculationTitle: string;
  readonly provider: string;
  readonly houseSystem: string;
  readonly nodes: string;
  readonly orbs: string;
  readonly birthData: string;
  readonly birthDate: string;
  readonly birthTime: string;
  readonly timezone: string;
  readonly place: string;
  readonly timePrecision: string;
  readonly points: string;
  readonly point: string;
  readonly sign: string;
  readonly position: string;
  readonly house: string;
  readonly motion: string;
  readonly houses: string;
  readonly aspects: string;
  readonly pointA: string;
  readonly pointB: string;
  readonly aspect: string;
  readonly orb: string;
  readonly strength: string;
  readonly distributions: string;
  readonly factor: string;
  readonly value: string;
  readonly warnings: string;
  readonly dictionaryInterpretations: string;
  readonly interpretationPosition: string;
  readonly interpretationContext: string;
  readonly interpretationText: string;
  readonly interpretationSource: string;
  readonly dictionary: string;
  readonly noEntry: string;
  readonly missingInterpretationText: (code: string) => string;
  readonly code: string;
  readonly message: string;
  readonly direct: string;
  readonly retrograde: string;
  readonly noHouse: string;
  readonly notAvailable: string;
  readonly fire: string;
  readonly earth: string;
  readonly air: string;
  readonly water: string;
  readonly cardinal: string;
  readonly fixed: string;
  readonly mutable: string;
  readonly masculine: string;
  readonly feminine: string;
  readonly houseValue: (house: number) => string;
  readonly houseSystems: Readonly<Record<string, string>>;
  readonly nodeTypes: Readonly<Record<string, string>>;
  readonly timePrecisions: Readonly<Record<string, string>>;
  readonly pointsById: Readonly<Record<string, string>>;
  readonly signs: Readonly<Record<string, string>>;
  readonly aspectTypes: Readonly<Record<string, string>>;
};

const ru: Labels = {
  title: "Натальная карта",
  subtitle: "Детерминированный отчёт по текущему расчёту ElevenHouse",
  calculation: "Расчёт",
  chartWheel: "Колесо карты",
  chartWheelCaption: "Векторная схема: дома, оси, планеты и основные аспекты текущего расчёта.",
  calculationTitle: "Название",
  provider: "Провайдер",
  houseSystem: "Система домов",
  nodes: "Узлы",
  orbs: "Орбы",
  birthData: "Данные рождения",
  birthDate: "Дата",
  birthTime: "Время",
  timezone: "Часовой пояс",
  place: "Место",
  timePrecision: "Точность времени",
  points: "Планеты и точки",
  point: "Точка",
  sign: "Знак",
  position: "Позиция",
  house: "Дом",
  motion: "Движение",
  houses: "Дома",
  aspects: "Аспекты",
  pointA: "Точка A",
  pointB: "Точка B",
  aspect: "Аспект",
  orb: "Орб",
  strength: "Сила",
  distributions: "Распределения",
  factor: "Фактор",
  value: "Значение",
  warnings: "Предупреждения",
  dictionaryInterpretations: "Трактовки из справочника",
  interpretationPosition: "Положение",
  interpretationContext: "Контекст",
  interpretationText: "Трактовка",
  interpretationSource: "Источник",
  dictionary: "Справочник",
  noEntry: "Нет записи",
  missingInterpretationText: (code: string) =>
    `Трактовка отсутствует. Создайте её в справочнике: ${code}`,
  code: "Код",
  message: "Сообщение",
  direct: "D",
  retrograde: "R",
  noHouse: "—",
  notAvailable: "—",
  fire: "Огонь",
  earth: "Земля",
  air: "Воздух",
  water: "Вода",
  cardinal: "Кардинальный",
  fixed: "Фиксированный",
  mutable: "Мутабельный",
  masculine: "Мужская",
  feminine: "Женская",
  houseValue: (house: number) => `${house} дом`,
  houseSystems: {
    placidus: "Плацидус",
    koch: "Кох",
    whole_sign: "Целый знак",
    equal: "Равнодомная",
    regiomontanus: "Региомонтан"
  },
  nodeTypes: { true: "Истинный", mean: "Средний" },
  timePrecisions: { exact: "Точное", approximate: "Примерное" },
  pointsById: {
    sun: "Солнце",
    moon: "Луна",
    mercury: "Меркурий",
    venus: "Венера",
    mars: "Марс",
    jupiter: "Юпитер",
    saturn: "Сатурн",
    uranus: "Уран",
    neptune: "Нептун",
    pluto: "Плутон",
    ascendant: "Асцендент",
    midheaven: "Середина неба",
    north_node: "Северный узел",
    south_node: "Южный узел"
  },
  signs: {
    aries: "Овен",
    taurus: "Телец",
    gemini: "Близнецы",
    cancer: "Рак",
    leo: "Лев",
    virgo: "Дева",
    libra: "Весы",
    scorpio: "Скорпион",
    sagittarius: "Стрелец",
    capricorn: "Козерог",
    aquarius: "Водолей",
    pisces: "Рыбы"
  },
  aspectTypes: {
    conjunction: "Соединение",
    opposition: "Оппозиция",
    trine: "Трин",
    square: "Квадрат",
    sextile: "Секстиль"
  }
};

const en: Labels = {
  ...ru,
  title: "Natal chart",
  subtitle: "Deterministic report for the current ElevenHouse calculation",
  calculation: "Calculation",
  chartWheel: "Chart wheel",
  chartWheelCaption: "Vector map: houses, axes, planets and major aspects for the current calculation.",
  calculationTitle: "Title",
  provider: "Provider",
  houseSystem: "House system",
  nodes: "Nodes",
  orbs: "Orbs",
  birthData: "Birth data",
  birthDate: "Date",
  birthTime: "Time",
  timezone: "Timezone",
  place: "Place",
  timePrecision: "Time precision",
  points: "Planets and points",
  point: "Point",
  sign: "Sign",
  position: "Position",
  house: "House",
  motion: "Motion",
  houses: "Houses",
  aspects: "Aspects",
  pointA: "Point A",
  pointB: "Point B",
  aspect: "Aspect",
  orb: "Orb",
  strength: "Strength",
  distributions: "Distributions",
  factor: "Factor",
  value: "Value",
  warnings: "Warnings",
  dictionaryInterpretations: "Dictionary interpretations",
  interpretationPosition: "Position",
  interpretationContext: "Context",
  interpretationText: "Interpretation",
  interpretationSource: "Source",
  dictionary: "Dictionary",
  noEntry: "No entry",
  missingInterpretationText: (code: string) =>
    `Interpretation is missing. Create it in the dictionary: ${code}`,
  code: "Code",
  message: "Message",
  fire: "Fire",
  earth: "Earth",
  air: "Air",
  water: "Water",
  cardinal: "Cardinal",
  fixed: "Fixed",
  mutable: "Mutable",
  masculine: "Masculine",
  feminine: "Feminine",
  houseValue: (house: number) => `House ${house}`,
  houseSystems: {
    placidus: "Placidus",
    koch: "Koch",
    whole_sign: "Whole sign",
    equal: "Equal",
    regiomontanus: "Regiomontanus"
  },
  nodeTypes: { true: "True", mean: "Mean" },
  timePrecisions: { exact: "Exact", approximate: "Approximate" },
  pointsById: {
    sun: "Sun",
    moon: "Moon",
    mercury: "Mercury",
    venus: "Venus",
    mars: "Mars",
    jupiter: "Jupiter",
    saturn: "Saturn",
    uranus: "Uranus",
    neptune: "Neptune",
    pluto: "Pluto",
    ascendant: "Ascendant",
    midheaven: "Midheaven",
    north_node: "North node",
    south_node: "South node"
  },
  signs: {
    aries: "Aries",
    taurus: "Taurus",
    gemini: "Gemini",
    cancer: "Cancer",
    leo: "Leo",
    virgo: "Virgo",
    libra: "Libra",
    scorpio: "Scorpio",
    sagittarius: "Sagittarius",
    capricorn: "Capricorn",
    aquarius: "Aquarius",
    pisces: "Pisces"
  },
  aspectTypes: {
    conjunction: "Conjunction",
    opposition: "Opposition",
    trine: "Trine",
    square: "Square",
    sextile: "Sextile"
  }
};

const axisPointIds = new Set(["ascendant", "midheaven"]);

const pointGlyphs: Record<string, string> = {
  sun: "Su",
  moon: "Mo",
  mercury: "Me",
  venus: "Ve",
  mars: "Ma",
  jupiter: "Ju",
  saturn: "Sa",
  uranus: "Ur",
  neptune: "Ne",
  pluto: "Pl",
  north_node: "NN",
  south_node: "SN"
};

const zodiacLabels = [
  { label: "Ar", color: (color: typeof import("pdf-lib").rgb) => color(0.82, 0.42, 0.32) },
  { label: "Ta", color: (color: typeof import("pdf-lib").rgb) => color(0.48, 0.63, 0.32) },
  { label: "Ge", color: (color: typeof import("pdf-lib").rgb) => color(0.83, 0.67, 0.25) },
  { label: "Ca", color: (color: typeof import("pdf-lib").rgb) => color(0.42, 0.57, 0.86) },
  { label: "Le", color: (color: typeof import("pdf-lib").rgb) => color(0.82, 0.42, 0.32) },
  { label: "Vi", color: (color: typeof import("pdf-lib").rgb) => color(0.48, 0.63, 0.32) },
  { label: "Li", color: (color: typeof import("pdf-lib").rgb) => color(0.83, 0.67, 0.25) },
  { label: "Sc", color: (color: typeof import("pdf-lib").rgb) => color(0.42, 0.57, 0.86) },
  { label: "Sg", color: (color: typeof import("pdf-lib").rgb) => color(0.82, 0.42, 0.32) },
  { label: "Cp", color: (color: typeof import("pdf-lib").rgb) => color(0.48, 0.63, 0.32) },
  { label: "Aq", color: (color: typeof import("pdf-lib").rgb) => color(0.83, 0.67, 0.25) },
  { label: "Pi", color: (color: typeof import("pdf-lib").rgb) => color(0.42, 0.57, 0.86) }
] as const;
