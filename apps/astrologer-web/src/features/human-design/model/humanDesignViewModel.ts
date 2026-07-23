import type {
  HumanDesignCompatibilityResult,
  HumanDesignIndividualResult,
  HumanDesignResult,
  HumanDesignTransitResult
} from "@elevenhouse/contracts";

type HumanDesignActivation = HumanDesignIndividualResult["activations"][number];
type HumanDesignTransitActivation = HumanDesignTransitResult["transitActivations"][number];
type HumanDesignCenterCode = HumanDesignIndividualResult["definedCenters"][number]["code"];
type HumanDesignChannelCode = HumanDesignIndividualResult["definedChannels"][number]["code"];
type HumanDesignConnectionDynamicCode =
  HumanDesignCompatibilityResult["connectionChannels"][number]["dynamic"];

export type HumanDesignDetailKey =
  | "type"
  | "strategy"
  | "authority"
  | "profile"
  | "definition"
  | "compatibility:summary"
  | HumanDesignCenterCode
  | `ch:${HumanDesignChannelCode}`
  | `conn:${HumanDesignConnectionDynamicCode}:${HumanDesignChannelCode}`;

export type HumanDesignPropertyView = {
  readonly key: HumanDesignDetailKey;
  readonly label: string;
  readonly value: string;
  readonly accent?: boolean;
};

export type HumanDesignCenterView = {
  readonly code: HumanDesignCenterCode;
  readonly label: string;
  readonly theme: string;
  readonly defined: boolean;
  readonly stateLabel: string;
  readonly color: string;
};

export type HumanDesignChannelView = {
  readonly code: HumanDesignChannelCode;
  readonly label: string;
  readonly name: string;
  readonly gates: readonly [number, number];
};

export type HumanDesignActivationView = {
  readonly body: HumanDesignActivation["body"];
  readonly label: string;
  readonly glyph: string;
  readonly gate: number;
  readonly line: number;
  readonly side: HumanDesignActivation["side"];
};

export type HumanDesignTransitActivationView = {
  readonly body: HumanDesignTransitActivation["body"];
  readonly label: string;
  readonly glyph: string;
  readonly gate: number;
  readonly line: number;
  readonly side: HumanDesignTransitActivation["side"];
};

export type HumanDesignViewModel = {
  readonly mode: HumanDesignResult["mode"];
  readonly sourceResult: HumanDesignResult;
  readonly result: HumanDesignIndividualResult;
  readonly properties: readonly HumanDesignPropertyView[];
  readonly centers: readonly HumanDesignCenterView[];
  readonly channels: readonly HumanDesignChannelView[];
  readonly personalityActivations: readonly HumanDesignActivationView[];
  readonly designActivations: readonly HumanDesignActivationView[];
  readonly activeGates: ReadonlyMap<number, ReadonlySet<HumanDesignActivation["side"]>>;
  readonly definedCenterCodes: readonly HumanDesignCenterCode[];
  readonly checksumShort: string;
  readonly compatibility: HumanDesignCompatibilityView | null;
};

export type HumanDesignTransitViewModel = {
  readonly result: HumanDesignTransitResult;
  readonly snapshotLabel: string;
  readonly checksumShort: string;
  readonly transitActivations: readonly HumanDesignTransitActivationView[];
  readonly transitGateNumbers: readonly number[];
  readonly completedChannels: readonly HumanDesignTransitChannelView[];
  readonly temporarilyDefinedCenters: readonly HumanDesignTransitCenterView[];
  readonly summary: {
    readonly transitActivationCount: number;
    readonly completedChannelCount: number;
    readonly temporarilyDefinedCenterCount: number;
  };
};

export type HumanDesignTransitChannelView = {
  readonly code: HumanDesignChannelCode;
  readonly label: string;
  readonly name: string;
  readonly gates: readonly [number, number];
  readonly natalGate: number;
  readonly transitGate: number;
};

export type HumanDesignTransitCenterView = {
  readonly code: HumanDesignCenterCode;
  readonly label: string;
  readonly theme: string;
  readonly definedByCompletedChannels: readonly HumanDesignChannelCode[];
  readonly color: string;
};

export type HumanDesignCompatibilityView = {
  readonly partner: {
    readonly type: string;
    readonly authority: string;
    readonly profile: string;
    readonly definition: string;
  };
  readonly dynamicGroups: readonly HumanDesignConnectionDynamicGroupView[];
  readonly sharedDefinedCenters: readonly HumanDesignCenterView[];
  readonly bridgedCenters: readonly HumanDesignCenterView[];
};

export type HumanDesignConnectionDynamicGroupView = {
  readonly dynamic: HumanDesignConnectionDynamicCode;
  readonly label: string;
  readonly count: number;
  readonly channels: readonly {
    readonly key: `conn:${HumanDesignConnectionDynamicCode}:${HumanDesignChannelCode}`;
    readonly code: HumanDesignChannelCode;
    readonly label: string;
    readonly name: string;
    readonly gates: readonly [number, number];
  }[];
};

export type HumanDesignDetailView = {
  readonly title: string;
  readonly subtitle: string;
  readonly tone: "accent" | "defined" | "muted";
  readonly text: string;
};

export const humanDesignCenterGeometry = [
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
  | { readonly code: HumanDesignCenterCode; readonly polygon: string }
  | { readonly code: HumanDesignCenterCode; readonly rect: readonly [number, number, number, number, number] }
)[];

export const humanDesignGateGeometry = {
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
} as const satisfies Record<number, { readonly center: HumanDesignCenterCode; readonly x: number; readonly y: number }>;

export const humanDesignChannelGeometry = [
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
  { code: "20-34", gates: [20, 34], via: [[164, 304], [164, 408]] },
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

const centerMeta = {
  head: { label: "Голова", theme: "вдохновение, вопросы, ментальное давление", color: "#e9c964" },
  ajna: { label: "Аджна", theme: "ум, концепции, осмысление", color: "#8fbf6a" },
  throat: { label: "Горло", theme: "проявление, речь, действие", color: "#b98a5a" },
  g: { label: "G-центр", theme: "идентичность, любовь, направление", color: "#e9c964" },
  heart: { label: "Сердце / Эго", theme: "воля, ценность, обещания", color: "#e0635c" },
  spleen: { label: "Селезёнка", theme: "интуиция, здоровье, страхи", color: "#c49a6c" },
  solar_plexus: { label: "Солнечное сплетение", theme: "эмоции, чувства, волна", color: "#c97e52" },
  sacral: { label: "Сакрал", theme: "жизненная сила, работа, отклик", color: "#e0635c" },
  root: { label: "Корень", theme: "давление, драйв, стресс", color: "#a6714b" }
} satisfies Record<HumanDesignCenterCode, { readonly label: string; readonly theme: string; readonly color: string }>;

const channelNames = {
  "64-47": "Абстракции",
  "61-24": "Осознания",
  "63-4": "Логики",
  "17-62": "Принятия",
  "43-23": "Структурирования",
  "11-56": "Любопытства",
  "31-7": "Альфы",
  "8-1": "Вдохновения",
  "33-13": "Блудного сына",
  "20-10": "Пробуждения",
  "45-21": "Денег",
  "35-36": "Мимолётности",
  "12-22": "Открытости",
  "16-48": "Таланта",
  "20-57": "Мозговой волны",
  "20-34": "Харизмы",
  "2-14": "Пульса",
  "15-5": "Ритма",
  "46-29": "Открытия",
  "10-34": "Исследования",
  "25-51": "Посвящения",
  "10-57": "Совершенной формы",
  "40-37": "Общности",
  "26-44": "Передачи",
  "59-6": "Близости",
  "34-57": "Силы",
  "27-50": "Сохранения",
  "3-60": "Мутации",
  "42-53": "Созревания",
  "9-52": "Концентрации",
  "32-54": "Преображения",
  "28-38": "Борьбы",
  "18-58": "Суждения",
  "30-41": "Узнавания",
  "55-39": "Эмоциональности",
  "49-19": "Синтеза"
} satisfies Record<HumanDesignChannelCode, string>;

const typeLabels = {
  manifestor: "Манифестор",
  generator: "Генератор",
  manifesting_generator: "Манифестирующий Генератор",
  projector: "Проектор",
  reflector: "Рефлектор"
} satisfies Record<HumanDesignIndividualResult["type"], string>;

const strategyLabels = {
  inform_before_acting: "Информировать",
  wait_to_respond: "Откликаться",
  wait_for_invitation: "Ждать приглашения",
  wait_lunar_cycle: "Ждать лунный цикл"
} satisfies Record<HumanDesignIndividualResult["strategy"], string>;

const authorityLabels = {
  emotional: "Эмоциональный",
  sacral: "Сакральный",
  splenic: "Селезёночный",
  ego: "Эго / сердечный",
  self_projected: "Самоспроецированный",
  mental: "Ментальный / внешний",
  lunar: "Лунный"
} satisfies Record<HumanDesignIndividualResult["authority"], string>;

const definitionLabels = {
  no_definition: "Нет определения",
  single: "Единичное",
  split: "Раздвоенное",
  triple_split: "Тройное",
  quadruple_split: "Четверное"
} satisfies Record<HumanDesignIndividualResult["definition"], string>;

const signatureLabels = {
  peace: "Покой",
  satisfaction: "Удовлетворение",
  success: "Успех",
  surprise: "Удивление"
} satisfies Record<HumanDesignIndividualResult["signature"], string>;

const notSelfLabels = {
  anger: "Гнев",
  frustration: "Фрустрация",
  bitterness: "Горечь",
  disappointment: "Разочарование"
} satisfies Record<HumanDesignIndividualResult["notSelfTheme"], string>;

const connectionDynamicLabels = {
  electromagnetic: "Электромагнитика",
  companionship: "Дружба",
  dominance: "Доминирование",
  compromise: "Компромисс"
} satisfies Record<HumanDesignConnectionDynamicCode, string>;

const planetLabels = {
  sun: { label: "Солнце", glyph: "☉" },
  earth: { label: "Земля", glyph: "⊕" },
  moon: { label: "Луна", glyph: "☽" },
  north_node: { label: "Сев. узел", glyph: "☊" },
  south_node: { label: "Юж. узел", glyph: "☋" },
  mercury: { label: "Меркурий", glyph: "☿" },
  venus: { label: "Венера", glyph: "♀" },
  mars: { label: "Марс", glyph: "♂" },
  jupiter: { label: "Юпитер", glyph: "♃" },
  saturn: { label: "Сатурн", glyph: "♄" },
  uranus: { label: "Уран", glyph: "♅" },
  neptune: { label: "Нептун", glyph: "♆" },
  pluto: { label: "Плутон", glyph: "♇" }
} satisfies Record<HumanDesignActivation["body"], { readonly label: string; readonly glyph: string }>;

export function createHumanDesignViewModel(
  result: HumanDesignResult
): HumanDesignViewModel {
  const individualResult = result.mode === "compatibility" ? result.participants.subject : result;
  const responseDefinedCenterCodes = new Set(
    individualResult.definedCenters.map((center) => center.code)
  );
  const definedCenterCodes = humanDesignCenterGeometry
    .map((center) => center.code)
    .filter((code) => responseDefinedCenterCodes.has(code));
  const definedCenterSet = new Set(definedCenterCodes);
  const activeGates = new Map<number, Set<HumanDesignActivation["side"]>>();

  for (const activation of individualResult.activations) {
    const sides = activeGates.get(activation.gate) ?? new Set<HumanDesignActivation["side"]>();
    sides.add(activation.side);
    activeGates.set(activation.gate, sides);
  }

  return {
    mode: result.mode,
    sourceResult: result,
    result: individualResult,
    properties: [
      { key: "type", label: "Тип", value: typeLabels[individualResult.type] },
      {
        key: "strategy",
        label: "Стратегия",
        value: strategyLabels[individualResult.strategy],
        accent: true
      },
      { key: "authority", label: "Авторитет", value: authorityLabels[individualResult.authority] },
      { key: "profile", label: "Профиль", value: individualResult.profile.code },
      { key: "definition", label: "Определение", value: definitionLabels[individualResult.definition] },
      ...(result.mode === "compatibility"
        ? [{ key: "compatibility:summary" as const, label: "Связь", value: "Партнёрский разбор", accent: true }]
        : [])
    ],
    centers: humanDesignCenterGeometry.map(({ code }) => ({
      code,
      label: centerMeta[code].label,
      theme: centerMeta[code].theme,
      defined: definedCenterSet.has(code),
      stateLabel: definedCenterSet.has(code) ? "опр." : "откр.",
      color: centerMeta[code].color
    })),
    channels: individualResult.definedChannels.map((channel) => ({
      code: channel.code,
      label: channel.code.replace("-", "–"),
      name: channelNames[channel.code],
      gates: channel.gates
    })),
    personalityActivations: toActivationViews(individualResult.activations, "personality"),
    designActivations: toActivationViews(individualResult.activations, "design"),
    activeGates,
    definedCenterCodes,
    checksumShort: result.resultChecksum.value.slice(7, 19),
    compatibility: result.mode === "compatibility" ? toCompatibilityView(result) : null
  };
}

export function createHumanDesignTransitViewModel(
  result: HumanDesignTransitResult
): HumanDesignTransitViewModel {
  return {
    result,
    snapshotLabel: formatTransitSnapshot(result.transitSnapshot),
    checksumShort: result.resultChecksum.value.slice(7, 19),
    transitActivations: result.transitActivations.map((activation) => ({
      side: activation.side,
      body: activation.body,
      label: planetLabels[activation.body].label,
      glyph: planetLabels[activation.body].glyph,
      gate: activation.gate,
      line: activation.line
    })),
    transitGateNumbers: Array.from(
      new Set(result.transitActivations.map((activation) => activation.gate))
    ).sort((left, right) => left - right),
    completedChannels: result.completedChannels.map((channel) => ({
      code: channel.code,
      label: channel.code.replace("-", "–"),
      name: channelNames[channel.code],
      gates: channel.gates,
      natalGate: channel.natalGate,
      transitGate: channel.transitGate
    })),
    temporarilyDefinedCenters: result.temporarilyDefinedCenters.map((center) => ({
      code: center.code,
      label: centerMeta[center.code].label,
      theme: centerMeta[center.code].theme,
      definedByCompletedChannels: center.definedByCompletedChannels,
      color: centerMeta[center.code].color
    })),
    summary: result.summary
  };
}

export function getHumanDesignDetail(
  model: HumanDesignViewModel,
  key: HumanDesignDetailKey
): HumanDesignDetailView {
  if (key === "type") {
    return {
      title: typeLabels[model.result.type],
      subtitle: "Тип",
      tone: "accent",
      text: `${typeLabels[model.result.type]} следует стратегии "${strategyLabels[model.result.strategy].toLowerCase()}". Подпись: ${signatureLabels[model.result.signature].toLowerCase()}; тема не-себя: ${notSelfLabels[model.result.notSelfTheme].toLowerCase()}.`
    };
  }
  if (key === "strategy") {
    return {
      title: strategyLabels[model.result.strategy],
      subtitle: "Стратегия",
      tone: "accent",
      text: "Стратегия показывает корректный способ входить в решения и действия. Значение рассчитано серверным Human Design engine из определённости центров и связей."
    };
  }
  if (key === "authority") {
    return {
      title: authorityLabels[model.result.authority],
      subtitle: "Внутренний авторитет",
      tone: "accent",
      text: `Авторитет выбран по server-side priority: ${model.result.authorityBasis.selectedBy}. React только отображает результат и не пересчитывает механику.`
    };
  }
  if (key === "profile") {
    return {
      title: `Профиль ${model.result.profile.code}`,
      subtitle: "Роль",
      tone: "accent",
      text: `Линия личности ${model.result.profile.personalityLine}, линия дизайна ${model.result.profile.designLine}. Профиль берётся из активаций Солнца личности и дизайна.`
    };
  }
  if (key === "definition") {
    return {
      title: definitionLabels[model.result.definition],
      subtitle: "Определение",
      tone: "accent",
      text: `Компонентов определённости: ${model.result.definitionBasis.componentCount}. Это описывает связность определённых центров, рассчитанную в доменном слое.`
    };
  }
  if (key === "compatibility:summary" && model.compatibility) {
    const counts = model.compatibility.dynamicGroups
      .map((group) => `${group.label.toLowerCase()}: ${group.count}`)
      .join("; ");
    return {
      title: "Партнёрский разбор",
      subtitle: "Connection dynamics",
      tone: "accent",
      text: `Связь рассчитана сервером из двух индивидуальных бодиграфов. ${counts}. Партнёр: ${model.compatibility.partner.type}, профиль ${model.compatibility.partner.profile}.`
    };
  }
  if (key.startsWith("conn:") && model.compatibility) {
    const [, dynamic, channelCode] = key.split(":") as [
      "conn",
      HumanDesignConnectionDynamicCode,
      HumanDesignChannelCode
    ];
    const group = model.compatibility.dynamicGroups.find((item) => item.dynamic === dynamic);
    const channel = group?.channels.find((item) => item.code === channelCode);
    if (group && channel) {
      return {
        title: `Канал ${channel.label} · ${channel.name}`,
        subtitle: group.label,
        tone: "defined",
        text: `Connection dynamic: ${group.label.toLowerCase()}. Канал построен из checksum-bound compatibility result, без frontend-расчётов.`
      };
    }
  }
  if (key.startsWith("ch:")) {
    const code = key.slice(3) as HumanDesignChannelCode;
    const channel = model.channels.find((item) => item.code === code);
    if (channel) {
      return {
        title: `Канал ${channel.label} · ${channel.name}`,
        subtitle: "Определён",
        tone: "defined",
        text: `Активированы ворота ${channel.gates.join(" и ")}. Канал соединяет центры и участвует в типе, авторитете и определении.`
      };
    }
    const catalogChannel = humanDesignChannelGeometry.find((item) => item.code === code);
    if (catalogChannel) {
      return {
        title: `Канал ${code.replace("-", "–")} · ${channelNames[code]}`,
        subtitle: "Не активирован",
        tone: "muted",
        text: `Ворота ${catalogChannel.gates.join(" и ")} не образуют определённый канал в текущем результате.`
      };
    }
  }
  const center = model.centers.find((item) => item.code === key);
  if (center) {
    return {
      title: center.label,
      subtitle: center.defined ? "Определён" : "Открыт",
      tone: center.defined ? "defined" : "muted",
      text: `Тема центра: ${center.theme}. ${center.defined ? "Определённость пришла из серверных каналов результата." : "Открытый центр отображается без локальной попытки достроить механику."}`
    };
  }

  return {
    title: "Выберите элемент",
    subtitle: "Деталь",
    tone: "muted",
    text: "Кликните свойство, центр или канал, чтобы открыть деталь."
  };
}

function toCompatibilityView(result: HumanDesignCompatibilityResult): HumanDesignCompatibilityView {
  const subjectCenterViews = new Map(
    humanDesignCenterGeometry.map(({ code }) => [
      code,
      {
        code,
        label: centerMeta[code].label,
        theme: centerMeta[code].theme,
        defined: true,
        stateLabel: "опр.",
        color: centerMeta[code].color
      }
    ])
  );
  const dynamicGroups = ([
    "electromagnetic",
    "companionship",
    "dominance",
    "compromise"
  ] as const).map((dynamic) => {
    const channels = result.connectionChannels
      .filter((channel) => channel.dynamic === dynamic)
      .map((channel) => ({
        key: `conn:${dynamic}:${channel.code}` as const,
        code: channel.code,
        label: channel.code.replace("-", "–"),
        name: channelNames[channel.code],
        gates: channel.gates
      }));
    return {
      dynamic,
      label: connectionDynamicLabels[dynamic],
      count: result.dynamicCounts[dynamic],
      channels
    };
  });
  return {
    partner: {
      type: typeLabels[result.participants.partner.type],
      authority: authorityLabels[result.participants.partner.authority],
      profile: result.participants.partner.profile.code,
      definition: definitionLabels[result.participants.partner.definition]
    },
    dynamicGroups,
    sharedDefinedCenters: result.sharedDefinedCenters.flatMap((code) =>
      subjectCenterViews.get(code) ? [subjectCenterViews.get(code)!] : []
    ),
    bridgedCenters: result.bridgedCenters.flatMap((code) =>
      subjectCenterViews.get(code) ? [subjectCenterViews.get(code)!] : []
    )
  };
}

function toActivationViews(
  activations: readonly HumanDesignActivation[],
  side: HumanDesignActivation["side"]
): readonly HumanDesignActivationView[] {
  return activations
    .filter((activation) => activation.side === side)
    .map((activation) => ({
      side,
      body: activation.body,
      label: planetLabels[activation.body].label,
      glyph: planetLabels[activation.body].glyph,
      gate: activation.gate,
      line: activation.line
    }));
}

function formatTransitSnapshot(snapshot: HumanDesignTransitResult["transitSnapshot"]): string {
  return `${formatDate(snapshot.date)} · ${snapshot.time} · ${snapshot.timezone}`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}
