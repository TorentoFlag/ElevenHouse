import type { ChartAspect, ChartHouse, ChartPoint } from "@elevenhouse/contracts";
import type { ChartPdfDocument } from "./calculation-pdf.documents";
import { createPdfLayout, type PdfTableOptions } from "./pdf-layout";

type KeyValue = { readonly label: string; readonly value: string };

export type ChartPdfBlock =
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
        if (block.kind === "section") {
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

function degree(value: number): string {
  const degrees = Math.trunc(value);
  const minutes = Math.round((value - degrees) * 60);
  return `${degrees}°${String(minutes).padStart(2, "0")}'`;
}

type Labels = {
  readonly title: string;
  readonly subtitle: string;
  readonly calculation: string;
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
