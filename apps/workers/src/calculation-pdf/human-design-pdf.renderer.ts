import type {
  HumanDesignCompatibilityResult,
  HumanDesignIndividualResult
} from "@elevenhouse/contracts";
import type { HumanDesignPdfDocument } from "./calculation-pdf.documents";
import { createPdfLayout, type PdfGraphicContext, type PdfTableOptions } from "./pdf-layout";

type KeyValue = { readonly label: string; readonly value: string };
type HumanDesignActivation = HumanDesignIndividualResult["activations"][number];
type HumanDesignChannel = HumanDesignIndividualResult["definedChannels"][number];
type HumanDesignCenter = HumanDesignIndividualResult["definedCenters"][number]["code"];
type HumanDesignChannelCode = HumanDesignChannel["code"];
type HumanDesignActivationBody = HumanDesignActivation["body"];

export type HumanDesignPdfBlock =
  | { readonly kind: "section"; readonly heading: string; readonly text: string }
  | { readonly kind: "list"; readonly heading: string; readonly items: readonly string[] }
  | { readonly kind: "key_values"; readonly heading: string; readonly items: readonly KeyValue[] }
  | {
      readonly kind: "bodygraph";
      readonly heading: string;
      readonly result: HumanDesignIndividualResult;
    }
  | {
      readonly kind: "table";
      readonly heading: string;
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
      readonly layout?: PdfTableOptions;
    };

export type HumanDesignPdfRenderer = {
  readonly render: (
    document: HumanDesignPdfDocument
  ) => Promise<{ readonly bytes: Buffer; readonly pageCount: number }>;
};

export function createHumanDesignPdfRenderer(
  input: {
    readonly regularFontBytes?: Uint8Array;
    readonly semiboldFontBytes?: Uint8Array;
  } = {}
): HumanDesignPdfRenderer {
  return {
    render: async (document) => {
      const labels = document.locale === "ru" ? ru : en;
      const layout = await createPdfLayout({
        locale: document.locale,
        title: labels.title,
        creator: "ElevenHouse Human Design",
        createdAt: document.createdAt,
        ...input
      });
      layout.drawCover(
        labels.title,
        document.result.mode === "individual"
          ? labels.individualSubtitle
          : labels.compatibilitySubtitle
      );
      for (const block of buildHumanDesignPdfContent(document)) {
        if (block.kind === "section") {
          layout.drawSection(block.heading, block.text);
        } else if (block.kind === "list") {
          layout.drawList(block.heading, block.items);
        } else if (block.kind === "bodygraph") {
          layout.drawGraphic(block.heading, 430, (context) =>
            drawHumanDesignBodygraph(context, block.result, labels)
          );
        } else if (block.kind === "table") {
          layout.drawTable(block.heading, block.headers, block.rows, block.layout);
        } else {
          layout.drawKeyValues(block.heading, block.items);
        }
      }
      return layout.save();
    }
  };
}

export function buildHumanDesignPdfContent(
  document: HumanDesignPdfDocument
): readonly HumanDesignPdfBlock[] {
  const labels = document.locale === "ru" ? ru : en;
  const blocks: HumanDesignPdfBlock[] = [];
  if (document.result.mode === "individual") {
    blocks.push(
      {
        kind: "key_values",
        heading: labels.calculation,
        items: [
          { label: labels.calculationTitle, value: document.calculationTitle },
          ...individualSummary(document.result, labels)
        ]
      },
      ...individualBlocks(document.result, labels)
    );
  } else {
    blocks.push(
      {
        kind: "key_values",
        heading: labels.compatibilityCalculation,
        items: [
          { label: labels.calculationTitle, value: document.calculationTitle },
          {
            label: labels.subject,
            value: typeLabel(document.result.participants.subject.type, labels)
          },
          {
            label: labels.partner,
            value: typeLabel(document.result.participants.partner.type, labels)
          }
        ]
      },
      ...individualBlocks(document.result.participants.subject, labels, labels.subject),
      ...individualBlocks(document.result.participants.partner, labels, labels.partner),
      ...compatibilityBlocks(document.result, labels)
    );
  }
  if (document.approvedInterpretation?.trim()) {
    blocks.push({
      kind: "section",
      heading: labels.approvedInterpretation,
      text: document.approvedInterpretation
    });
  }
  return blocks;
}

function individualBlocks(
  result: HumanDesignIndividualResult,
  labels: Labels,
  participantName?: string
): readonly HumanDesignPdfBlock[] {
  const heading = (value: string) => (participantName ? `${value} · ${participantName}` : value);
  return [
    {
      kind: "bodygraph",
      heading: heading(labels.bodygraph),
      result
    },
    {
      kind: "key_values",
      heading: heading(labels.mechanics),
      items: individualSummary(result, labels)
    },
    {
      kind: "key_values",
      heading: heading(labels.mechanicsBasis),
      items: individualBasis(result, labels)
    },
    {
      kind: "list",
      heading: heading(labels.definedCenters),
      items: result.definedCenters.length
        ? result.definedCenters.map((center) => centerLabel(center.code, labels))
        : [labels.none]
    },
    {
      kind: "list",
      heading: heading(labels.definedChannels),
      items: result.definedChannels.length
        ? result.definedChannels.map((channel) => channelLabel(channel, labels))
        : [labels.none]
    },
    {
      kind: "table",
      heading: heading(labels.personalityActivations),
      headers: [labels.body, labels.gate, labels.line],
      rows: activationRows(
        result.activations.filter((activation) => activation.side === "personality"),
        labels
      ),
      layout: activationTableLayout
    },
    {
      kind: "table",
      heading: heading(labels.designActivations),
      headers: [labels.body, labels.gate, labels.line],
      rows: activationRows(
        result.activations.filter((activation) => activation.side === "design"),
        labels
      ),
      layout: activationTableLayout
    }
  ];
}

function compatibilityBlocks(
  result: HumanDesignCompatibilityResult,
  labels: Labels
): readonly HumanDesignPdfBlock[] {
  return [
    {
      kind: "key_values",
      heading: labels.connectionDynamics,
      items: [
        { label: labels.electromagnetic, value: String(result.dynamicCounts.electromagnetic) },
        { label: labels.companionship, value: String(result.dynamicCounts.companionship) },
        { label: labels.dominance, value: String(result.dynamicCounts.dominance) },
        { label: labels.compromise, value: String(result.dynamicCounts.compromise) }
      ]
    },
    {
      kind: "list",
      heading: labels.connectionChannels,
      items: result.connectionChannels.length
        ? result.connectionChannels.map(
            (channel) =>
              `${channelLabel(channel, labels)} · ${dynamicLabel(channel.dynamic, labels)}`
          )
        : [labels.none]
    }
  ];
}

function individualSummary(
  result: HumanDesignIndividualResult,
  labels: Labels
): readonly KeyValue[] {
  return [
    { label: labels.type, value: typeLabel(result.type, labels) },
    { label: labels.strategy, value: strategyLabel(result.strategy, labels) },
    { label: labels.authority, value: authorityLabel(result.authority, labels) },
    { label: labels.profile, value: result.profile.code },
    { label: labels.definition, value: definitionLabel(result.definition, labels) },
    { label: labels.signature, value: signatureLabel(result.signature, labels) },
    { label: labels.notSelfTheme, value: notSelfThemeLabel(result.notSelfTheme, labels) },
    { label: labels.incarnationCross, value: incarnationCrossLabel(result, labels) }
  ];
}

function individualBasis(result: HumanDesignIndividualResult, labels: Labels): readonly KeyValue[] {
  return [
    {
      label: labels.typeBasis,
      value: [
        `${labels.definedCentersCount}: ${result.typeBasis.definedCenterCount}`,
        `${labels.sacralDefined}: ${yesNo(result.typeBasis.sacralDefined, labels)}`,
        `${labels.throatDefined}: ${yesNo(result.typeBasis.throatDefined, labels)}`,
        `${labels.motorToThroat}: ${result.typeBasis.throatConnectedMotorCenters.length ? result.typeBasis.throatConnectedMotorCenters.map((center) => centerLabel(center, labels)).join(", ") : labels.none}`
      ].join("; ")
    },
    {
      label: labels.authorityBasis,
      value: `${labels.selectedBy}: ${authorityBasisLabel(result.authorityBasis.selectedBy, labels)}; ${labels.priority}: ${result.authorityBasis.priority.map((authority) => authorityBasisLabel(authority, labels)).join(" → ")}`
    },
    {
      label: labels.definitionBasis,
      value: `${labels.definedCentersCount}: ${result.definitionBasis.definedCenterCount}; ${labels.definitionComponents}: ${result.definitionBasis.componentCount}`
    }
  ];
}

function activationRows(
  activations: readonly HumanDesignActivation[],
  labels: Labels
): readonly (readonly string[])[] {
  return activations.map((activation) => [
    bodyLabel(activation.body, labels),
    String(activation.gate),
    String(activation.line)
  ]);
}

const activationTableLayout: PdfTableOptions = {
  columnWeights: [2.3, 0.8, 0.8],
  fontSize: 8.8,
  lineHeight: 12
};

function channelLabel(channel: Pick<HumanDesignChannel, "code" | "gates">, labels: Labels): string {
  return `${labels.channel} ${channel.gates[0]}-${channel.gates[1]} (${channel.code})`;
}

function centerLabel(center: HumanDesignCenter, labels: Labels): string {
  return labels.centers[center] ?? center;
}

function typeLabel(value: HumanDesignIndividualResult["type"], labels: Labels): string {
  return labels.types[value] ?? value;
}

function strategyLabel(value: HumanDesignIndividualResult["strategy"], labels: Labels): string {
  return labels.strategies[value] ?? value;
}

function authorityLabel(value: HumanDesignIndividualResult["authority"], labels: Labels): string {
  return labels.authorities[value] ?? value;
}

function authorityBasisLabel(value: string, labels: Labels): string {
  return labels.authorities[value as HumanDesignIndividualResult["authority"]] ?? value;
}

function definitionLabel(value: HumanDesignIndividualResult["definition"], labels: Labels): string {
  return labels.definitions[value] ?? value;
}

function signatureLabel(value: HumanDesignIndividualResult["signature"], labels: Labels): string {
  return labels.signatures[value] ?? value;
}

function notSelfThemeLabel(
  value: HumanDesignIndividualResult["notSelfTheme"],
  labels: Labels
): string {
  return labels.notSelfThemes[value] ?? value;
}

function dynamicLabel(
  value: HumanDesignCompatibilityResult["connectionChannels"][number]["dynamic"],
  labels: Labels
): string {
  return labels.dynamics[value] ?? value;
}

function bodyLabel(value: HumanDesignActivationBody, labels: Labels): string {
  return labels.bodies[value] ?? value;
}

function incarnationCrossLabel(result: HumanDesignIndividualResult, labels: Labels): string {
  const cross = result.incarnationCross;
  return [
    labels.crossAngles[cross.angle] ?? cross.angle,
    labels.profile.toLowerCase(),
    cross.profileCode,
    `${labels.gates}: ${cross.gateSequence.join("-")}`
  ].join(" · ");
}

function yesNo(value: boolean, labels: Labels): string {
  return value ? labels.yes : labels.no;
}

function drawHumanDesignBodygraph(
  context: PdfGraphicContext,
  result: HumanDesignIndividualResult,
  labels: Labels
): void {
  const sourceWidth = 440;
  const sourceHeight = 620;
  const scale = Math.min((context.width - 36) / sourceWidth, (context.height - 36) / sourceHeight);
  const left = context.x + (context.width - sourceWidth * scale) / 2;
  const bottom = context.y + (context.height - sourceHeight * scale) / 2;
  const point = (source: { readonly x: number; readonly y: number }) => ({
    x: left + source.x * scale,
    y: bottom + (sourceHeight - source.y) * scale
  });
  const size = (value: number) => value * scale;
  const definedCenters = new Set(result.definedCenters.map((center) => center.code));
  const definedChannels = new Set(result.definedChannels.map((channel) => channel.code));
  const activeGates = activeGateSides(result);

  context.page.drawRectangle({
    x: context.x,
    y: context.y,
    width: context.width,
    height: context.height,
    color: context.rgb(0.98, 0.97, 1),
    borderColor: context.rgb(0.84, 0.8, 0.92),
    borderWidth: 0.7
  });

  for (const channel of humanDesignChannelGeometry) {
    const startGate = humanDesignGateGeometry[channel.gates[0]];
    const endGate = humanDesignGateGeometry[channel.gates[1]];
    if (!startGate || !endGate) continue;
    const via = "via" in channel ? channel.via : [];
    const channelPoints = [
      startGate,
      ...via.map(([x, y]: readonly [number, number]) => ({ x, y })),
      endGate
    ].map(point);
    const active = definedChannels.has(channel.code);
    for (let index = 0; index < channelPoints.length - 1; index += 1) {
      context.page.drawLine({
        start: channelPoints[index]!,
        end: channelPoints[index + 1]!,
        thickness: active ? size(4.2) : size(1.8),
        color: active ? context.rgb(0.48, 0.33, 0.85) : context.rgb(0.73, 0.7, 0.8)
      });
    }
  }

  for (const center of humanDesignCenterGeometry) {
    const defined = definedCenters.has(center.code);
    const fill = defined ? centerColor(center.code, context) : context.rgb(1, 1, 1);
    const border = defined ? context.rgb(0.45, 0.39, 0.62) : context.rgb(0.7, 0.67, 0.78);
    if ("rect" in center) {
      const [x, y, width, height] = center.rect;
      const topLeft = point({ x, y });
      context.page.drawRectangle({
        x: topLeft.x,
        y: topLeft.y - size(height),
        width: size(width),
        height: size(height),
        color: fill,
        borderColor: border,
        borderWidth: size(1.2)
      });
    } else {
      context.page.drawSvgPath(polygonPath(center.polygon, point), {
        color: fill,
        borderColor: border,
        borderWidth: size(1.2)
      });
    }
  }

  for (const [gate, geometry] of Object.entries(humanDesignGateGeometry)) {
    const gateNumber = Number(gate);
    const sides = activeGates.get(gateNumber);
    const gatePoint = point(geometry);
    const active = Boolean(sides?.size);
    const bothSides = sides?.has("personality") && sides.has("design");
    const fill = bothSides
      ? context.rgb(0.48, 0.33, 0.85)
      : sides?.has("personality")
        ? context.rgb(0.98, 0.76, 0.86)
        : sides?.has("design")
          ? context.rgb(0.88, 0.75, 0.41)
          : context.rgb(0.24, 0.22, 0.32);
    context.page.drawCircle({
      x: gatePoint.x,
      y: gatePoint.y,
      size: active ? size(9.2) : size(7.8),
      color: fill,
      borderColor: active ? context.rgb(1, 1, 1) : context.rgb(0.5, 0.47, 0.6),
      borderWidth: size(active ? 1.25 : 0.75)
    });
    const label = String(gateNumber);
    context.page.drawText(label, {
      x: gatePoint.x - context.semibold.widthOfTextAtSize(label, size(9)) / 2,
      y: gatePoint.y - size(3.1),
      font: context.semibold,
      size: size(9),
      color: active && bothSides ? context.rgb(1, 1, 1) : context.rgb(0.12, 0.1, 0.17)
    });
  }

  context.page.drawText(labels.personalityDesignLegend, {
    x: context.x + 16,
    y: context.y + 15,
    font: context.regular,
    size: 8,
    color: context.colors.muted
  });
}

function activeGateSides(
  result: HumanDesignIndividualResult
): ReadonlyMap<number, ReadonlySet<HumanDesignActivation["side"]>> {
  const fromDefinedGates = new Map<number, Set<HumanDesignActivation["side"]>>();
  for (const gate of result.definedGates) {
    const sides = fromDefinedGates.get(gate.gate) ?? new Set<HumanDesignActivation["side"]>();
    gate.activatedBy.forEach((activation) => sides.add(activation.side));
    fromDefinedGates.set(gate.gate, sides);
  }
  if (fromDefinedGates.size > 0) return fromDefinedGates;

  const fromActivations = new Map<number, Set<HumanDesignActivation["side"]>>();
  for (const activation of result.activations) {
    const sides = fromActivations.get(activation.gate) ?? new Set<HumanDesignActivation["side"]>();
    sides.add(activation.side);
    fromActivations.set(activation.gate, sides);
  }
  return fromActivations;
}

function polygonPath(
  polygon: string,
  point: (source: { readonly x: number; readonly y: number }) => {
    readonly x: number;
    readonly y: number;
  }
): string {
  const points = polygon.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return point({ x: x ?? 0, y: y ?? 0 });
  });
  return points
    .map((item, index) => `${index === 0 ? "M" : "L"} ${item.x} ${item.y}`)
    .concat("Z")
    .join(" ");
}

function centerColor(
  center: HumanDesignCenter,
  context: PdfGraphicContext
): ReturnType<PdfGraphicContext["rgb"]> {
  const colors: Record<HumanDesignCenter, ReturnType<PdfGraphicContext["rgb"]>> = {
    head: context.rgb(0.91, 0.78, 0.39),
    ajna: context.rgb(0.56, 0.75, 0.42),
    throat: context.rgb(0.72, 0.54, 0.35),
    g: context.rgb(0.91, 0.78, 0.39),
    heart: context.rgb(0.88, 0.39, 0.36),
    spleen: context.rgb(0.77, 0.6, 0.42),
    solar_plexus: context.rgb(0.79, 0.49, 0.32),
    sacral: context.rgb(0.88, 0.39, 0.36),
    root: context.rgb(0.63, 0.43, 0.28)
  };
  return colors[center];
}

type Labels = {
  readonly title: string;
  readonly individualSubtitle: string;
  readonly compatibilitySubtitle: string;
  readonly calculation: string;
  readonly compatibilityCalculation: string;
  readonly calculationTitle: string;
  readonly subject: string;
  readonly partner: string;
  readonly mechanics: string;
  readonly mechanicsBasis: string;
  readonly bodygraph: string;
  readonly type: string;
  readonly strategy: string;
  readonly authority: string;
  readonly profile: string;
  readonly definition: string;
  readonly signature: string;
  readonly notSelfTheme: string;
  readonly incarnationCross: string;
  readonly typeBasis: string;
  readonly authorityBasis: string;
  readonly definitionBasis: string;
  readonly definedCentersCount: string;
  readonly sacralDefined: string;
  readonly throatDefined: string;
  readonly motorToThroat: string;
  readonly selectedBy: string;
  readonly priority: string;
  readonly definitionComponents: string;
  readonly body: string;
  readonly gate: string;
  readonly line: string;
  readonly gates: string;
  readonly yes: string;
  readonly no: string;
  readonly personalityDesignLegend: string;
  readonly definedCenters: string;
  readonly definedChannels: string;
  readonly personalityActivations: string;
  readonly designActivations: string;
  readonly connectionDynamics: string;
  readonly connectionChannels: string;
  readonly approvedInterpretation: string;
  readonly none: string;
  readonly channel: string;
  readonly electromagnetic: string;
  readonly companionship: string;
  readonly dominance: string;
  readonly compromise: string;
  readonly types: Record<HumanDesignIndividualResult["type"], string>;
  readonly strategies: Record<HumanDesignIndividualResult["strategy"], string>;
  readonly authorities: Record<HumanDesignIndividualResult["authority"], string>;
  readonly definitions: Record<HumanDesignIndividualResult["definition"], string>;
  readonly signatures: Record<HumanDesignIndividualResult["signature"], string>;
  readonly notSelfThemes: Record<HumanDesignIndividualResult["notSelfTheme"], string>;
  readonly crossAngles: Record<HumanDesignIndividualResult["incarnationCross"]["angle"], string>;
  readonly bodies: Record<HumanDesignActivationBody, string>;
  readonly centers: Record<HumanDesignCenter, string>;
  readonly dynamics: Record<
    HumanDesignCompatibilityResult["connectionChannels"][number]["dynamic"],
    string
  >;
};

const ru: Labels = {
  title: "Дизайн человека",
  individualSubtitle: "Индивидуальный отчёт",
  compatibilitySubtitle: "Партнёрский отчёт",
  calculation: "Расчёт",
  compatibilityCalculation: "Партнёрский расчёт",
  calculationTitle: "Название",
  subject: "Клиент",
  partner: "Партнёр",
  mechanics: "Механика",
  mechanicsBasis: "Основание расчёта",
  bodygraph: "Бодиграф",
  type: "Тип",
  strategy: "Стратегия",
  authority: "Авторитет",
  profile: "Профиль",
  definition: "Определение",
  signature: "Подпись",
  notSelfTheme: "Тема не-себя",
  incarnationCross: "Инкарнационный крест",
  typeBasis: "Почему выбран тип",
  authorityBasis: "Почему выбран авторитет",
  definitionBasis: "Почему выбрано определение",
  definedCentersCount: "Определённых центров",
  sacralDefined: "Сакрал определён",
  throatDefined: "Горло определено",
  motorToThroat: "Моторы к горлу",
  selectedBy: "Выбран по",
  priority: "Приоритет",
  definitionComponents: "Компонентов",
  body: "Планета",
  gate: "Ворота",
  line: "Линия",
  gates: "Ворота",
  yes: "да",
  no: "нет",
  personalityDesignLegend: "Розовый — личность, золотой — дизайн, фиолетовый — обе стороны.",
  definedCenters: "Определённые центры",
  definedChannels: "Определённые каналы",
  personalityActivations: "Активации личности",
  designActivations: "Активации дизайна",
  connectionDynamics: "Динамика связи",
  connectionChannels: "Каналы связи",
  approvedInterpretation: "Утверждённая трактовка",
  none: "Нет",
  channel: "Канал",
  electromagnetic: "Электромагнитика",
  companionship: "Дружба",
  dominance: "Доминирование",
  compromise: "Компромисс",
  types: {
    generator: "Генератор",
    manifesting_generator: "Манифестирующий генератор",
    projector: "Проектор",
    manifestor: "Манифестор",
    reflector: "Рефлектор"
  },
  strategies: {
    wait_to_respond: "Откликаться",
    inform_before_acting: "Информировать",
    wait_for_invitation: "Ждать приглашения",
    wait_lunar_cycle: "Ждать лунный цикл"
  },
  authorities: {
    emotional: "Эмоциональный",
    sacral: "Сакральный",
    splenic: "Селезёночный",
    ego: "Эго",
    self_projected: "Самопроецируемый",
    mental: "Ментальный",
    lunar: "Лунный"
  },
  definitions: {
    single: "Единичное",
    split: "Двойное",
    triple_split: "Тройное",
    quadruple_split: "Четверное",
    no_definition: "Нет"
  },
  signatures: {
    peace: "Покой",
    satisfaction: "Удовлетворение",
    success: "Успех",
    surprise: "Удивление"
  },
  notSelfThemes: {
    anger: "Гнев",
    frustration: "Фрустрация",
    bitterness: "Горечь",
    disappointment: "Разочарование"
  },
  crossAngles: {
    right_angle: "Правоугольный",
    left_angle: "Левоугольный",
    juxtaposition: "Джакстапозиция"
  },
  bodies: {
    sun: "Солнце",
    earth: "Земля",
    moon: "Луна",
    north_node: "Северный узел",
    south_node: "Южный узел",
    mercury: "Меркурий",
    venus: "Венера",
    mars: "Марс",
    jupiter: "Юпитер",
    saturn: "Сатурн",
    uranus: "Уран",
    neptune: "Нептун",
    pluto: "Плутон"
  },
  centers: {
    head: "Голова",
    ajna: "Аджна",
    throat: "Горло",
    g: "G-центр",
    heart: "Сердце / Эго",
    spleen: "Селезёнка",
    solar_plexus: "Солнечное сплетение",
    sacral: "Сакрал",
    root: "Корень"
  },
  dynamics: {
    electromagnetic: "Электромагнитика",
    companionship: "Дружба",
    dominance: "Доминирование",
    compromise: "Компромисс"
  }
};

const en: Labels = {
  ...ru,
  title: "Human Design",
  individualSubtitle: "Individual report",
  compatibilitySubtitle: "Relationship report",
  calculation: "Calculation",
  compatibilityCalculation: "Relationship calculation",
  calculationTitle: "Title",
  subject: "Subject",
  partner: "Partner",
  mechanics: "Mechanics",
  mechanicsBasis: "Calculation basis",
  bodygraph: "Bodygraph",
  type: "Type",
  strategy: "Strategy",
  authority: "Authority",
  profile: "Profile",
  definition: "Definition",
  signature: "Signature",
  notSelfTheme: "Not-self theme",
  incarnationCross: "Incarnation cross",
  typeBasis: "Why this type",
  authorityBasis: "Why this authority",
  definitionBasis: "Why this definition",
  definedCentersCount: "Defined center count",
  sacralDefined: "Sacral defined",
  throatDefined: "Throat defined",
  motorToThroat: "Motors to throat",
  selectedBy: "Selected by",
  priority: "Priority",
  definitionComponents: "Components",
  body: "Planet",
  gate: "Gate",
  line: "Line",
  gates: "Gates",
  yes: "yes",
  no: "no",
  personalityDesignLegend: "Pink means personality, gold means design, purple means both sides.",
  definedCenters: "Defined centers",
  definedChannels: "Defined channels",
  personalityActivations: "Personality activations",
  designActivations: "Design activations",
  connectionDynamics: "Connection dynamics",
  connectionChannels: "Connection channels",
  approvedInterpretation: "Approved interpretation",
  none: "None",
  channel: "Channel",
  electromagnetic: "Electromagnetic",
  companionship: "Companionship",
  dominance: "Dominance",
  compromise: "Compromise",
  types: {
    generator: "Generator",
    manifesting_generator: "Manifesting Generator",
    projector: "Projector",
    manifestor: "Manifestor",
    reflector: "Reflector"
  },
  strategies: {
    wait_to_respond: "Wait to respond",
    inform_before_acting: "Inform before acting",
    wait_for_invitation: "Wait for invitation",
    wait_lunar_cycle: "Wait a lunar cycle"
  },
  authorities: {
    emotional: "Emotional",
    sacral: "Sacral",
    splenic: "Splenic",
    ego: "Ego",
    self_projected: "Self-projected",
    mental: "Mental",
    lunar: "Lunar"
  },
  definitions: {
    single: "Single",
    split: "Split",
    triple_split: "Triple split",
    quadruple_split: "Quadruple split",
    no_definition: "None"
  },
  signatures: {
    peace: "Peace",
    satisfaction: "Satisfaction",
    success: "Success",
    surprise: "Surprise"
  },
  notSelfThemes: {
    anger: "Anger",
    frustration: "Frustration",
    bitterness: "Bitterness",
    disappointment: "Disappointment"
  },
  crossAngles: {
    right_angle: "Right angle",
    left_angle: "Left angle",
    juxtaposition: "Juxtaposition"
  },
  bodies: {
    sun: "Sun",
    earth: "Earth",
    moon: "Moon",
    north_node: "North node",
    south_node: "South node",
    mercury: "Mercury",
    venus: "Venus",
    mars: "Mars",
    jupiter: "Jupiter",
    saturn: "Saturn",
    uranus: "Uranus",
    neptune: "Neptune",
    pluto: "Pluto"
  },
  centers: {
    head: "Head",
    ajna: "Ajna",
    throat: "Throat",
    g: "G center",
    heart: "Heart / Ego",
    spleen: "Spleen",
    solar_plexus: "Solar plexus",
    sacral: "Sacral",
    root: "Root"
  },
  dynamics: {
    electromagnetic: "Electromagnetic",
    companionship: "Companionship",
    dominance: "Dominance",
    compromise: "Compromise"
  }
};

const humanDesignCenterGeometry = [
  { code: "head", polygon: "220,18 180,64 260,64" },
  { code: "ajna", polygon: "180,92 260,92 220,148" },
  { code: "throat", rect: [182, 176, 76, 84, 9] },
  { code: "g", polygon: "220,282 268,330 220,378 172,330" },
  { code: "heart", polygon: "274,366 332,380 296,414" },
  { code: "spleen", polygon: "50,404 50,536 124,470" },
  { code: "solar_plexus", polygon: "390,404 390,536 316,470" },
  { code: "sacral", rect: [184, 438, 72, 64, 9] },
  { code: "root", rect: [184, 540, 72, 64, 9] }
] as const satisfies readonly (
  | { readonly code: HumanDesignCenter; readonly polygon: string }
  | {
      readonly code: HumanDesignCenter;
      readonly rect: readonly [number, number, number, number, number];
    }
)[];

const humanDesignGateGeometry = {
  64: { center: "head", x: 196, y: 55 },
  61: { center: "head", x: 220, y: 55 },
  63: { center: "head", x: 244, y: 55 },
  47: { center: "ajna", x: 196, y: 101 },
  24: { center: "ajna", x: 220, y: 101 },
  4: { center: "ajna", x: 244, y: 101 },
  17: { center: "ajna", x: 204, y: 119 },
  43: { center: "ajna", x: 220, y: 133 },
  11: { center: "ajna", x: 236, y: 119 },
  62: { center: "throat", x: 196, y: 184 },
  23: { center: "throat", x: 220, y: 184 },
  56: { center: "throat", x: 244, y: 184 },
  16: { center: "throat", x: 190, y: 202 },
  20: { center: "throat", x: 190, y: 224 },
  35: { center: "throat", x: 250, y: 196 },
  12: { center: "throat", x: 250, y: 218 },
  45: { center: "throat", x: 250, y: 240 },
  31: { center: "throat", x: 196, y: 252 },
  8: { center: "throat", x: 220, y: 252 },
  33: { center: "throat", x: 244, y: 252 },
  1: { center: "g", x: 220, y: 296 },
  7: { center: "g", x: 202, y: 314 },
  13: { center: "g", x: 238, y: 314 },
  10: { center: "g", x: 188, y: 330 },
  25: { center: "g", x: 252, y: 330 },
  15: { center: "g", x: 202, y: 346 },
  46: { center: "g", x: 238, y: 346 },
  2: { center: "g", x: 220, y: 362 },
  21: { center: "heart", x: 302, y: 378 },
  51: { center: "heart", x: 288, y: 390 },
  26: { center: "heart", x: 300, y: 400 },
  40: { center: "heart", x: 316, y: 388 },
  48: { center: "spleen", x: 64, y: 420 },
  57: { center: "spleen", x: 63, y: 437 },
  44: { center: "spleen", x: 62, y: 455 },
  50: { center: "spleen", x: 62, y: 472 },
  32: { center: "spleen", x: 62, y: 490 },
  28: { center: "spleen", x: 63, y: 507 },
  18: { center: "spleen", x: 64, y: 524 },
  36: { center: "solar_plexus", x: 376, y: 420 },
  22: { center: "solar_plexus", x: 377, y: 437 },
  37: { center: "solar_plexus", x: 378, y: 455 },
  6: { center: "solar_plexus", x: 378, y: 472 },
  49: { center: "solar_plexus", x: 378, y: 490 },
  55: { center: "solar_plexus", x: 377, y: 507 },
  30: { center: "solar_plexus", x: 376, y: 524 },
  5: { center: "sacral", x: 196, y: 446 },
  14: { center: "sacral", x: 220, y: 446 },
  29: { center: "sacral", x: 244, y: 446 },
  34: { center: "sacral", x: 190, y: 464 },
  27: { center: "sacral", x: 190, y: 484 },
  59: { center: "sacral", x: 250, y: 478 },
  42: { center: "sacral", x: 196, y: 494 },
  3: { center: "sacral", x: 220, y: 494 },
  9: { center: "sacral", x: 244, y: 494 },
  53: { center: "root", x: 196, y: 548 },
  60: { center: "root", x: 220, y: 548 },
  52: { center: "root", x: 244, y: 548 },
  54: { center: "root", x: 190, y: 566 },
  38: { center: "root", x: 190, y: 581 },
  58: { center: "root", x: 190, y: 596 },
  19: { center: "root", x: 250, y: 566 },
  39: { center: "root", x: 250, y: 581 },
  41: { center: "root", x: 250, y: 596 }
} as const satisfies Record<
  number,
  { readonly center: HumanDesignCenter; readonly x: number; readonly y: number }
>;

const humanDesignChannelGeometry = [
  { code: "64-47", gates: [64, 47] },
  { code: "61-24", gates: [61, 24] },
  { code: "63-4", gates: [63, 4] },
  { code: "17-62", gates: [17, 62] },
  { code: "43-23", gates: [43, 23] },
  { code: "11-56", gates: [11, 56] },
  { code: "31-7", gates: [31, 7] },
  { code: "8-1", gates: [8, 1] },
  { code: "33-13", gates: [33, 13] },
  { code: "20-10", gates: [20, 10] },
  { code: "45-21", gates: [45, 21] },
  { code: "35-36", gates: [35, 36] },
  { code: "12-22", gates: [12, 22] },
  { code: "16-48", gates: [16, 48] },
  { code: "20-57", gates: [20, 57] },
  {
    code: "20-34",
    gates: [20, 34],
    via: [
      [164, 304],
      [164, 408]
    ]
  },
  { code: "2-14", gates: [2, 14] },
  { code: "15-5", gates: [15, 5] },
  { code: "46-29", gates: [46, 29] },
  { code: "10-34", gates: [10, 34] },
  { code: "25-51", gates: [25, 51] },
  { code: "10-57", gates: [10, 57] },
  { code: "40-37", gates: [40, 37] },
  { code: "26-44", gates: [26, 44] },
  { code: "59-6", gates: [59, 6] },
  { code: "34-57", gates: [34, 57] },
  { code: "27-50", gates: [27, 50] },
  { code: "3-60", gates: [3, 60] },
  { code: "42-53", gates: [42, 53] },
  { code: "9-52", gates: [9, 52] },
  { code: "32-54", gates: [32, 54] },
  { code: "28-38", gates: [28, 38] },
  { code: "18-58", gates: [18, 58] },
  { code: "30-41", gates: [30, 41] },
  { code: "55-39", gates: [55, 39] },
  { code: "49-19", gates: [49, 19] }
] as const satisfies readonly {
  readonly code: HumanDesignChannelCode;
  readonly gates: readonly [number, number];
  readonly via?: readonly (readonly [number, number])[];
}[];
