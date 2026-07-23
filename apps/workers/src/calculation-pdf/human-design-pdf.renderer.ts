import type {
  HumanDesignCompatibilityResult,
  HumanDesignIndividualResult
} from "@elevenhouse/contracts";
import type { HumanDesignPdfDocument } from "./calculation-pdf.documents";
import { createPdfLayout } from "./pdf-layout";

type KeyValue = { readonly label: string; readonly value: string };
type HumanDesignActivation = HumanDesignIndividualResult["activations"][number];
type HumanDesignChannel = HumanDesignIndividualResult["definedChannels"][number];
type HumanDesignCenter = HumanDesignIndividualResult["definedCenters"][number]["code"];

export type HumanDesignPdfBlock =
  | { readonly kind: "section"; readonly heading: string; readonly text: string }
  | { readonly kind: "list"; readonly heading: string; readonly items: readonly string[] }
  | { readonly kind: "key_values"; readonly heading: string; readonly items: readonly KeyValue[] };

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
          { label: labels.subject, value: typeLabel(document.result.participants.subject.type, labels) },
          { label: labels.partner, value: typeLabel(document.result.participants.partner.type, labels) }
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
      kind: "key_values",
      heading: heading(labels.mechanics),
      items: individualSummary(result, labels)
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
      kind: "list",
      heading: heading(labels.personalityActivations),
      items: activationLines(result.activations.filter((activation) => activation.side === "personality"))
    },
    {
      kind: "list",
      heading: heading(labels.designActivations),
      items: activationLines(result.activations.filter((activation) => activation.side === "design"))
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
            (channel) => `${channelLabel(channel, labels)} · ${dynamicLabel(channel.dynamic, labels)}`
          )
        : [labels.none]
    }
  ];
}

function individualSummary(result: HumanDesignIndividualResult, labels: Labels): readonly KeyValue[] {
  return [
    { label: labels.type, value: typeLabel(result.type, labels) },
    { label: labels.strategy, value: strategyLabel(result.strategy, labels) },
    { label: labels.authority, value: authorityLabel(result.authority, labels) },
    { label: labels.profile, value: result.profile.code },
    { label: labels.definition, value: definitionLabel(result.definition, labels) }
  ];
}

function activationLines(activations: readonly HumanDesignActivation[]): readonly string[] {
  return activations.map(
    (activation) => `${activation.body}: ${activation.gate}.${activation.line}`
  );
}

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

function definitionLabel(value: HumanDesignIndividualResult["definition"], labels: Labels): string {
  return labels.definitions[value] ?? value;
}

function dynamicLabel(
  value: HumanDesignCompatibilityResult["connectionChannels"][number]["dynamic"],
  labels: Labels
): string {
  return labels.dynamics[value] ?? value;
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
  readonly type: string;
  readonly strategy: string;
  readonly authority: string;
  readonly profile: string;
  readonly definition: string;
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
  type: "Тип",
  strategy: "Стратегия",
  authority: "Авторитет",
  profile: "Профиль",
  definition: "Определение",
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
  type: "Type",
  strategy: "Strategy",
  authority: "Authority",
  profile: "Profile",
  definition: "Definition",
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
  compromise: "Compromise"
};
