import type {
  NumerologyCalculationResponse,
  NumerologyCompatibilityConclusion,
  NumerologyCompatibilityZone,
  NumerologyComparison,
  NumerologyRelation,
  NumerologyRelationCounts,
  NumerologyResult,
  PythagoreanCompatibilityResult
} from "@elevenhouse/contracts";
import type { NumerologyFormState } from "./numerologyFormModel";

export type NumerologyWorkspaceMode = "individual" | "compatibility";
export type NumerologyDetailSelector = string;

export type NumerologyWorkspaceParticipant = {
  readonly role: "subject" | "partner";
  readonly clientId: string | null;
  readonly displayName: string;
  readonly initials: string;
  readonly birthDate: string;
  readonly sourceLabel: string;
};

export type NumerologyWorkspaceKeyNumber = {
  readonly code: string;
  readonly selector: NumerologyDetailSelector;
  readonly label: string;
  readonly from: string;
  readonly value: number;
  readonly meaning: NumerologyMeaning | null;
};

export type NumerologyWorkspaceMatrixCell = {
  readonly digit: string;
  readonly selector: NumerologyDetailSelector;
  readonly label: string;
  readonly value: string;
  readonly count: number;
  readonly text: string;
};

export type NumerologyWorkspaceMatrix = {
  readonly cells: readonly NumerologyWorkspaceMatrixCell[];
  readonly workingNumbersLabel: string;
};

export type NumerologyWorkspaceStrengthLine = {
  readonly code: string;
  readonly selector: NumerologyDetailSelector;
  readonly label: string;
  readonly value: number;
  readonly cells: readonly string[];
  readonly level: string;
  readonly levelCode: string;
  readonly text: string;
};

export type NumerologyWorkspaceCompatibilityParticipant = {
  readonly displayName: string;
  readonly initials: string;
  readonly lifePath: number | null;
  readonly expression: number | null;
  readonly soul: number | null;
  readonly personality: number | null;
  readonly birthday: number | null;
};

export type NumerologyWorkspaceCompatibilityComparison = {
  readonly selector: NumerologyDetailSelector;
  readonly block: NumerologyComparison["block"];
  readonly code: string;
  readonly label: string;
  readonly valueA: number;
  readonly valueB: number;
  readonly difference: number;
  readonly relation: NumerologyRelation;
  readonly relationLabel: string;
  readonly explanation: string;
};

export type NumerologyWorkspaceCompatibilityZone = NumerologyCompatibilityZone & {
  readonly selector: NumerologyDetailSelector;
  readonly label: string;
  readonly relationLabel: string;
};

export type NumerologyWorkspaceCompatibilityConclusion = NumerologyCompatibilityConclusion & {
  readonly selector: NumerologyDetailSelector;
  readonly label: string;
};

export type NumerologyWorkspaceCompatibility = {
  readonly pairNumber: number | null;
  readonly pairMeaning: NumerologyMeaning | null;
  readonly participants: readonly NumerologyWorkspaceCompatibilityParticipant[];
  readonly matrices: readonly {
    readonly participant: NumerologyWorkspaceCompatibilityParticipant;
    readonly matrix: NumerologyWorkspaceMatrix | null;
  }[];
  readonly keyNumberComparisons: readonly NumerologyWorkspaceCompatibilityComparison[];
  readonly matrixComparisons: readonly NumerologyWorkspaceCompatibilityComparison[];
  readonly strengthLineComparisons: readonly NumerologyWorkspaceCompatibilityComparison[];
  readonly zones: readonly NumerologyWorkspaceCompatibilityZone[];
  readonly counts: {
    readonly key_numbers: NumerologyRelationCounts;
    readonly psychomatrix: NumerologyRelationCounts;
    readonly strength_lines: NumerologyRelationCounts;
    readonly total: NumerologyRelationCounts;
  };
  readonly conclusion: NumerologyWorkspaceCompatibilityConclusion;
};

export type NumerologyWorkspaceModel = {
  readonly mode: NumerologyWorkspaceMode;
  readonly title: string;
  readonly status: string;
  readonly subject: NumerologyWorkspaceParticipant | null;
  readonly partner: NumerologyWorkspaceParticipant | null;
  readonly keyNumbers: readonly NumerologyWorkspaceKeyNumber[];
  readonly matrix: NumerologyWorkspaceMatrix | null;
  readonly strengthLines: readonly NumerologyWorkspaceStrengthLine[];
  readonly personalYear: { readonly year: number; readonly value: number } | null;
  readonly personalMonths: readonly {
    readonly year: number;
    readonly month: number;
    readonly value: number;
  }[];
  readonly compatibility: NumerologyWorkspaceCompatibility | null;
  readonly defaultSelector: NumerologyDetailSelector | null;
};

export type NumerologyWorkspaceDetail = {
  readonly selector: NumerologyDetailSelector;
  readonly eyebrow: string;
  readonly value: string;
  readonly title: string;
  readonly subtitle: string;
  readonly text: string;
  readonly formula: string | null;
};

type NumerologyMeaning = {
  readonly essence: string;
  readonly text: string;
};

const keyNumberMeta: Record<string, { readonly label: string; readonly from: string }> = {
  lifePath: { label: "Число жизненного пути", from: "дата рождения" },
  expression: { label: "Число выражения", from: "полное имя" },
  soul: { label: "Число души", from: "гласные имени" },
  personality: { label: "Число личности", from: "согласные имени" },
  birthday: { label: "Число дня рождения", from: "день рождения" },
  personalYear: { label: "Персональный год", from: "день, месяц + год" },
  personalMonth: { label: "Персональный месяц", from: "личный год + месяц" },
  personalDay: { label: "Персональный день", from: "личный месяц + день" }
};

const keyNumberOrder = [
  "lifePath",
  "expression",
  "soul",
  "personality",
  "birthday",
  "personalYear",
  "personalMonth",
  "personalDay"
] as const;

const matrixDigits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const relationLabels: Record<NumerologyRelation, string> = {
  match: "Совпадение",
  close: "Близкие значения",
  different: "Различие",
  tension: "Напряжение"
};

const compatibilityZoneLabels: Record<NumerologyCompatibilityZone["code"], string> = {
  identity: "Идентичность",
  inner_world: "Внутренний мир",
  resources: "Ресурсы",
  dynamics: "Динамика"
};

const compatibilityConclusionLabels: Record<NumerologyCompatibilityConclusion["code"], string> = {
  harmonious: "Гармоничная совместимость",
  mixed: "Смешанная совместимость",
  attention: "Совместимость требует внимания"
};

const cellMeta: Record<
  string,
  { readonly label: string; readonly empty: string; readonly levels: readonly string[] }
> = {
  "1": {
    label: "Характер",
    empty: "Характер формируется через осознанные решения и среду.",
    levels: [
      "Мягкий характер, важны поддержка и ясные рамки.",
      "Характер включается точечно: энергия есть, но ее нужно направлять.",
      "Устойчивый характер и способность держать позицию.",
      "Сильная воля, важно не превращать силу в давление.",
      "Очень выраженный характер: лидерство требует экологичности.",
      "Сверхсильная воля, человеку важно учиться гибкости."
    ]
  },
  "2": {
    label: "Энергия",
    empty: "Энергия быстро расходуется, нужен бережный режим восстановления.",
    levels: [
      "Энергия тонкая, человек чувствителен к нагрузке.",
      "Энергии достаточно для стабильного ритма.",
      "Хороший энергетический запас, есть ресурс поддерживать других.",
      "Много энергии, важно направлять ее в действие.",
      "Сильный заряд, возможна перегрузка окружающих.",
      "Очень мощный ресурс, нужен осознанный канал реализации."
    ]
  },
  "3": {
    label: "Интерес",
    empty: "Интерес включается через практику и любопытство.",
    levels: [
      "Интерес избирательный, важно найти живую тему.",
      "Есть любознательность и гибкость мышления.",
      "Сильный интерес, талант к обучению и поиску связей.",
      "Очень активный ум, важно не распыляться.",
      "Много идей, нужна структура.",
      "Сверхинтерес: человеку важно учиться завершать начатое."
    ]
  },
  "4": {
    label: "Здоровье",
    empty: "Тело требует внимания, режима и профилактики.",
    levels: [
      "Ресурс тела есть, но его важно беречь.",
      "Стабильная телесная опора.",
      "Крепкий физический ресурс.",
      "Сильная выносливость, важно не игнорировать сигналы тела.",
      "Тело многое выдерживает, но требует регулярной заботы.",
      "Очень сильная физическая опора."
    ]
  },
  "5": {
    label: "Логика",
    empty: "Логика развивается через вопросы, факты и проверку гипотез.",
    levels: [
      "Логика включается в понятных задачах.",
      "Хороший аналитический центр.",
      "Сильная логика, способность быстро видеть структуру.",
      "Очень рациональный фильтр, важно оставлять место чувствам.",
      "Мощная аналитика, возможна чрезмерная критичность.",
      "Сверхлогика: задача в балансе анализа и доверия."
    ]
  },
  "6": {
    label: "Труд",
    empty: "Тема труда осваивается через дисциплину и ремесло.",
    levels: [
      "Трудолюбие включается при ясной цели.",
      "Есть навык доводить дела до результата.",
      "Сильная рабочая выносливость.",
      "Много трудовой энергии, важно не уходить в перегруз.",
      "Работа может становиться способом контроля.",
      "Сверхтруд: нужен баланс пользы и отдыха."
    ]
  },
  "7": {
    label: "Удача",
    empty: "Удача приходит через опыт, наблюдательность и доверие пути.",
    levels: [
      "Удача точечная, важна внимательность к знакам.",
      "Хорошая поддержка обстоятельств.",
      "Сильная интуитивная удача.",
      "Мощная защита, важно не рисковать без меры.",
      "Удача заметна, но требует благодарности и трезвости.",
      "Сверхудача: задача не перекладывать выбор на случай."
    ]
  },
  "8": {
    label: "Долг",
    empty: "Ответственность раскрывается через договоренности и зрелость.",
    levels: [
      "Ответственность включается через близкие обязательства.",
      "Стабильное чувство долга.",
      "Сильная управленческая ответственность.",
      "Много контроля, важно не брать лишнее.",
      "Ответственность может давить, нужна делегируемость.",
      "Сверхдолг: важно отделять свое от чужого."
    ]
  },
  "9": {
    label: "Память и ум",
    empty: "Память и мудрость раскрываются через практику осмысления.",
    levels: [
      "Память точечная, лучше работают личные смыслы.",
      "Хорошая память и способность удерживать контекст.",
      "Сильная память, аналитичность и внутренняя мудрость.",
      "Очень выраженный ум, важно не уходить в ментальную перегрузку.",
      "Мощное накопление опыта, нужен обмен знаниями.",
      "Сверхпамять: задача отпускать старые сюжеты."
    ]
  }
};

const strengthLineMeta: Record<string, { readonly label: string; readonly text: string }> = {
  goal: { label: "Целеустремленность", text: "Показывает способность держать цель и идти к ней." },
  family: { label: "Семейность", text: "Описывает сценарии близости, дома и поддержки." },
  stability: {
    label: "Стабильность",
    text: "Показывает потребность в устойчивости и повторяемом ритме."
  },
  self_esteem: {
    label: "Самооценка",
    text: "Отвечает за внутреннюю опору и ощущение собственной ценности."
  },
  material: {
    label: "Материя · быт",
    text: "Показывает отношение к деньгам, телу, быту и практическим задачам."
  },
  talent: { label: "Талант", text: "Подсвечивает природную выразительность и творческие каналы." },
  temperament: {
    label: "Темперамент",
    text: "Описывает интенсивность проявления и эмоциональный тонус."
  },
  spirituality: {
    label: "Духовность",
    text: "Показывает связь с ценностями, смыслом и внутренним ориентиром."
  }
};

const numberMeanings: Record<number, NumerologyMeaning> = {
  1: {
    essence: "Лидер, инициатор",
    text: "Сила числа в самостоятельности, старте и ясном выборе направления."
  },
  2: {
    essence: "Дипломат, партнер",
    text: "Сила числа в чувствительности, сотрудничестве и умении слышать другого."
  },
  3: {
    essence: "Творец, коммуникатор",
    text: "Сила числа в выражении, речи, образности и легкости контакта."
  },
  4: {
    essence: "Структура, опора",
    text: "Сила числа в системе, дисциплине и надежном практическом результате."
  },
  5: {
    essence: "Свобода, движение",
    text: "Сила числа в адаптивности, переменах и живом интересе к опыту."
  },
  6: {
    essence: "Забота, красота",
    text: "Сила числа в ответственности, гармонии, доме и внимании к людям."
  },
  7: {
    essence: "Поиск, глубина",
    text: "Сила числа в анализе, интуиции, внутренней честности и исследовании."
  },
  8: {
    essence: "Материя, управление",
    text: "Сила числа в зрелой ответственности, ресурсах и управлении процессами."
  },
  9: {
    essence: "Гуманист, завершение",
    text: "Сила числа в широте взгляда, мудрости, отдаче и завершении циклов без потери себя."
  },
  11: {
    essence: "Проводник, вдохновение",
    text: "Мастер-число усиливает интуицию, видение и тонкую чувствительность к людям."
  },
  22: {
    essence: "Мастер-строитель",
    text: "Мастер-число соединяет масштабное видение с практической реализацией."
  },
  33: {
    essence: "Учитель, служение",
    text: "Мастер-число раскрывает заботу, наставничество и исцеляющее присутствие."
  }
};

export function buildNumerologyWorkspaceModel(
  response: NumerologyCalculationResponse | null,
  previewResult: NumerologyResult | null = null,
  formState: NumerologyFormState | null = null
): NumerologyWorkspaceModel | null {
  const result = response?.result ?? previewResult;
  if (!result) return null;

  const snapshot = result as unknown as Record<string, unknown>;
  const subject = getParticipant(response, result, formState, "subject");
  const partner = getParticipant(response, result, formState, "partner");
  const mode = result.mode;
  const keyNumbers = buildKeyNumbers(snapshot);
  const matrix = buildMatrix(getRecord(snapshot.psychomatrix));
  const strengthLines = buildStrengthLines(snapshot.strengthLines);
  const compatibility =
    result.mode === "compatibility" ? buildCompatibility(response, result) : null;
  const periods = getRecord(snapshot.periods);
  const personalYear = getPeriodValue(periods?.personalYear);
  const personalMonths = Array.isArray(periods?.personalMonths)
    ? periods.personalMonths.flatMap((month) => {
        const item = getRecord(month);
        return typeof item?.year === "number" &&
          typeof item.month === "number" &&
          typeof item.value === "number"
          ? [{ year: item.year, month: item.month, value: item.value }]
          : [];
      })
    : [];

  return {
    mode,
    title: response?.calculation.title ?? formState?.title ?? "Предпросмотр расчета",
    status: response?.calculation.status ?? "preview",
    subject,
    partner,
    keyNumbers,
    matrix,
    strengthLines,
    personalYear,
    personalMonths,
    compatibility,
    defaultSelector:
      compatibility?.conclusion.selector ??
      keyNumbers[0]?.selector ??
      matrix?.cells.find((cell) => cell.count > 0)?.selector ??
      null
  };
}

export function getNumerologyDetail(
  model: NumerologyWorkspaceModel | null,
  selector: NumerologyDetailSelector | null
): NumerologyWorkspaceDetail | null {
  if (!model || !selector) return null;

  const compatibility = model.compatibility;
  if (compatibility) {
    const comparison = [
      ...compatibility.keyNumberComparisons,
      ...compatibility.matrixComparisons,
      ...compatibility.strengthLineComparisons
    ].find((item) => item.selector === selector);
    if (comparison) {
      return {
        selector,
        eyebrow: `разница: ${comparison.difference}`,
        value: `${comparison.valueA} · ${comparison.valueB}`,
        title: comparison.label,
        subtitle: comparison.relationLabel,
        text: comparison.explanation,
        formula: null
      };
    }

    const zone = compatibility.zones.find((item) => item.selector === selector);
    if (zone) {
      return {
        selector,
        eyebrow: "зона совместимости",
        value: zone.relationLabel,
        title: zone.label,
        subtitle: `${zone.comparisonCodes.length} сравнений`,
        text: zone.explanation,
        formula: null
      };
    }

    if (compatibility.conclusion.selector === selector) {
      return {
        selector,
        eyebrow: "итог совместимости",
        value: String(compatibility.pairNumber ?? "—"),
        title: compatibility.conclusion.label,
        subtitle: relationCountsSummary(compatibility.counts.total),
        text: compatibility.conclusion.explanation,
        formula: null
      };
    }
  }

  const keyNumber = model.keyNumbers.find((item) => item.selector === selector);
  if (keyNumber) {
    return {
      selector,
      eyebrow: `из: ${keyNumber.from}`,
      value: String(keyNumber.value),
      title: keyNumber.label,
      subtitle: keyNumber.meaning?.essence ?? "",
      text: keyNumber.meaning
        ? `${getKeyNumberHint(keyNumber.code)} ${keyNumber.meaning.text}`
        : "Недостаточно данных для трактовки этого числа.",
      formula: getKeyNumberFormula(keyNumber.code)
    };
  }

  if (selector.startsWith("cell:")) {
    const cell = model.matrix?.cells.find((item) => item.selector === selector);
    if (!cell) return null;

    return {
      selector,
      eyebrow: `в матрице: ${cell.count}`,
      value: cell.value || "—",
      title: `${cell.label} · цифра ${cell.digit}`,
      subtitle: cell.count > 0 ? "активная ячейка психоматрицы" : "пустая ячейка психоматрицы",
      text: cell.text,
      formula: "Считается по цифрам даты рождения и рабочим числам квадрата Пифагора."
    };
  }

  if (selector.startsWith("line:")) {
    const line = model.strengthLines.find((item) => item.selector === selector);
    if (!line) return null;

    return {
      selector,
      eyebrow: `${line.cells.join("–")} · ${line.level}`,
      value: String(line.value),
      title: `Линия: ${line.label}`,
      subtitle: "линия силы психоматрицы",
      text: `${line.text} ${getStrengthLineLevelText(line.levelCode)}`,
      formula: "Сумма количества цифр в трех ячейках линии."
    };
  }

  return null;
}

function buildKeyNumbers(
  snapshot: Record<string, unknown>
): readonly NumerologyWorkspaceKeyNumber[] {
  const keyNumbers = getRecord(snapshot.keyNumbers);
  if (!keyNumbers) return [];
  const periods = getRecord(snapshot.periods);
  const personalYear = getPeriodValue(periods?.personalYear);
  const personalDayRecord = getRecord(periods?.personalDay);
  const personalDayValue =
    typeof personalDayRecord?.value === "number" ? personalDayRecord.value : null;
  const resolvedKeyNumbers: Record<string, unknown> = {
    ...keyNumbers,
    ...(personalYear ? { personalYear: personalYear.value } : {}),
    ...(personalDayValue !== null ? { personalDay: personalDayValue } : {})
  };

  return keyNumberOrder.flatMap((code) => {
    const value = resolvedKeyNumbers[code];
    const meta = keyNumberMeta[code];
    if (typeof value !== "number" || !meta) return [];

    return [
      {
        code,
        selector: `key:${code}`,
        label:
          code === "personalYear" && personalYear
            ? `${meta.label} ${personalYear.year}`
            : meta.label,
        from: meta.from,
        value,
        meaning: numberMeanings[value] ?? null
      }
    ];
  });
}

function buildMatrix(
  psychomatrix: Record<string, unknown> | null
): NumerologyWorkspaceMatrix | null {
  const cells = getRecord(psychomatrix?.cells);
  if (!cells) return null;

  const workingNumbers = getRecord(psychomatrix?.workingNumbers);
  const workingNumbersLabel = workingNumbers
    ? ["first", "second", "third", "fourth"]
        .map((key) => workingNumbers[key])
        .filter((value): value is number => typeof value === "number")
        .join(" · ")
    : "";

  return {
    workingNumbersLabel,
    cells: matrixDigits.map((digit) => {
      const value = typeof cells[digit] === "string" ? cells[digit] : "";
      const meta = cellMeta[digit]!;
      const count = value.length;
      return {
        digit,
        selector: `cell:${digit}`,
        label: meta.label,
        value,
        count,
        text:
          count > 0
            ? (meta.levels[Math.min(count, meta.levels.length) - 1] ?? meta.levels.at(-1)!)
            : meta.empty
      };
    })
  };
}

function buildStrengthLines(value: unknown): readonly NumerologyWorkspaceStrengthLine[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((line) => {
    const record = getRecord(line);
    if (!record) return [];
    const code = typeof record.code === "string" ? record.code : "";
    const meta = strengthLineMeta[code];
    const lineValue = typeof record.value === "number" ? record.value : null;
    if (!meta || lineValue === null) return [];

    return [
      {
        code,
        selector: `line:${code}`,
        label: typeof record.label === "string" ? record.label : meta.label,
        value: lineValue,
        cells: Array.isArray(record.cells)
          ? record.cells.filter((cell): cell is string => typeof cell === "string")
          : [],
        level: typeof record.levelLabel === "string" ? record.levelLabel : "",
        levelCode: typeof record.level === "string" ? record.level : "",
        text: meta.text
      }
    ];
  });
}

function buildCompatibility(
  response: NumerologyCalculationResponse | null,
  result: PythagoreanCompatibilityResult
): NumerologyWorkspaceCompatibility {
  const individuals = result.individuals;
  const participants = response?.calculation.participants ?? [];
  const summaries = individuals.map((item, index) => {
    const keyNumbers = item.keyNumbers;
    const participant = participants[index];
    const displayName =
      participant?.displayName ||
      item.participant.calculationName ||
      (index === 0 ? "Клиент" : "Партнер");

    return {
      displayName,
      initials: getInitials(displayName),
      lifePath: keyNumbers.lifePath,
      expression: keyNumbers.expression,
      soul: keyNumbers.soul,
      personality: keyNumbers.personality,
      birthday: keyNumbers.birthday
    };
  });

  const comparisons = result.comparisons.map(toWorkspaceCompatibilityComparison);

  return {
    pairNumber: result.pairNumber,
    pairMeaning:
      typeof result.pairNumber === "number" ? (numberMeanings[result.pairNumber] ?? null) : null,
    participants: summaries,
    matrices: individuals.map((item, index) => ({
      participant: summaries[index] ?? {
        displayName: index === 0 ? "Клиент" : "Партнер",
        initials: index === 0 ? "К" : "П",
        lifePath: null,
        expression: null,
        soul: null,
        personality: null,
        birthday: null
      },
      matrix: buildMatrix(item.psychomatrix as unknown as Record<string, unknown>)
    })),
    keyNumberComparisons: comparisons.filter((item) => item.block === "key_numbers"),
    matrixComparisons: comparisons.filter((item) => item.block === "psychomatrix"),
    strengthLineComparisons: comparisons.filter((item) => item.block === "strength_lines"),
    zones: result.zones.map((zone) => ({
      ...zone,
      selector: `compatibility:zone:${zone.code}`,
      label: compatibilityZoneLabels[zone.code],
      relationLabel: relationLabels[zone.relation]
    })),
    counts: result.counts,
    conclusion: {
      ...result.conclusion,
      selector: "compatibility:conclusion",
      label: compatibilityConclusionLabels[result.conclusion.code]
    }
  };
}

function toWorkspaceCompatibilityComparison(
  comparison: NumerologyComparison
): NumerologyWorkspaceCompatibilityComparison {
  return {
    ...comparison,
    selector: `compatibility:${comparison.block}:${comparison.code}`,
    label: getCompatibilityComparisonLabel(comparison),
    relationLabel: relationLabels[comparison.relation]
  };
}

function getCompatibilityComparisonLabel(comparison: NumerologyComparison): string {
  if (comparison.block === "key_numbers") {
    return keyNumberMeta[comparison.code]?.label ?? comparison.code;
  }
  if (comparison.block === "psychomatrix") {
    const digit = comparison.code.replace(/^digit_/, "");
    const meta = cellMeta[digit];
    return meta ? `${meta.label} · цифра ${digit}` : comparison.code;
  }
  return strengthLineMeta[comparison.code]?.label ?? comparison.code;
}

function getParticipant(
  response: NumerologyCalculationResponse | null,
  result: NumerologyResult,
  formState: NumerologyFormState | null,
  role: "subject" | "partner"
): NumerologyWorkspaceParticipant | null {
  const saved = response?.calculation.participants.find((item) => item.role === role);
  const formParticipant = formState?.[role === "subject" ? "subject" : "partner"];
  const resultParticipant =
    result.mode === "individual"
      ? role === "subject"
        ? result.participant
        : null
      : role === "subject"
        ? result.participants.first
        : result.participants.second;
  if (!resultParticipant) return null;
  const displayName =
    saved?.displayName || formParticipant?.displayName || resultParticipant.calculationName;

  return {
    role,
    clientId: saved?.clientId ?? (formParticipant?.clientId || null),
    displayName,
    initials: getInitials(displayName),
    birthDate: resultParticipant.birthDate,
    sourceLabel:
      (saved?.source ?? formParticipant?.source) === "crm_client" ? "CRM-клиент" : "ручной ввод"
  };
}

function getPeriodValue(value: unknown): { readonly year: number; readonly value: number } | null {
  const period = getRecord(value);
  return typeof period?.year === "number" && typeof period.value === "number"
    ? { year: period.year, value: period.value }
    : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "К";
}

function relationCountsSummary(counts: NumerologyRelationCounts): string {
  return [
    `${counts.match} совпадений`,
    `${counts.close} близких`,
    `${counts.different} различий`,
    `${counts.tension} напряжений`
  ].join(" · ");
}

function getStrengthLineLevelText(level: string): string {
  if (level === "absent" || level === "weak") {
    return "Эта сфера требует осознанной практики и поддержки.";
  }
  if (level === "moderate") return "Сфера работает стабильно, без сильного перекоса.";
  if (level === "expressed") return "На эту сферу можно опираться в рекомендациях.";
  return "Сфера может доминировать, поэтому важно держать баланс.";
}

function getKeyNumberHint(code: string): string {
  if (code === "lifePath") return "Главный вектор и уроки жизни.";
  if (code === "expression") return "То, как человек проявляется во внешнем мире.";
  if (code === "soul") return "Внутренний мотив и эмоциональная потребность.";
  if (code === "personality") return "Впечатление, которое человек производит на других.";
  if (code === "birthday") return "Природный талант и быстрый способ включения.";
  if (code === "personalYear") return "Тема года и фон крупных решений.";
  if (code === "personalMonth") return "Тактический фон месяца.";
  if (code === "personalDay") return "Ритм дня и короткое окно действия.";
  return "Значение числа в текущем расчете.";
}

function getKeyNumberFormula(code: string): string | null {
  if (code === "lifePath" || code === "birthday" || code.startsWith("personal")) {
    return "Цифры даты рождения и выбранного периода суммируются и сводятся к корневому числу; мастер-числа сохраняются настройками метода.";
  }
  if (code === "expression" || code === "soul" || code === "personality") {
    return "Буквы имени переводятся в числа по таблице метода и сводятся к корневому числу.";
  }
  return null;
}
