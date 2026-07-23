import { readFileSync } from "node:fs";
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import type {
  HumanDesignCompatibilityResult,
  HumanDesignIndividualResult,
  HumanDesignTransitResult
} from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import {
  createHumanDesignTransitViewModel,
  createHumanDesignViewModel
} from "../../features/human-design/model/humanDesignViewModel";
import { HumanDesignCalculationMenu, renderHumanDesignCalculationMenu } from "./HumanDesignCalculationMenu";
import { HumanDesignPageView, type HumanDesignPageViewProps } from "./HumanDesignPageView";

describe("HumanDesignPageView", () => {
  it("caps mobile page gutters so the workspace does not overflow the viewport", () => {
    const css = readFileSync(
      new URL("./HumanDesignPage.module.css", import.meta.url),
      "utf8"
    );
    const mobileBlock = css.match(/@media \(max-width: 820px\) \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(mobileBlock).toContain("margin: -32px -16px;");
  });

  it("uses CRM client selection and does not expose manual birth-data or longitude input", () => {
    const view = HumanDesignPageView(baseProps());
    const pickers = walk(view).filter((element) => element.type === ClientSearchCombobox);

    expect(pickers).toHaveLength(1);
    expect(pickers[0]?.props.label).toBe("Клиент");
    expect(walk(view).some((element) => element.type === "input")).toBe(false);
    expect(textOf(view)).toContain("Birth data берутся из карточки клиента");
  });

  it("renders supported individual mechanics with link action and honest disabled future actions", () => {
    const view = HumanDesignPageView({
      ...baseProps(),
      selectedClient: {
        value: "22222222-2222-4222-8222-222222222222",
        label: "Марина Краснова",
        initials: "МК",
        subtitle: "15.07.1990 · Рим",
        birthDateDisplay: "15.07.1990",
        hasBirthDate: true,
        birthData: null
      },
      model: createHumanDesignViewModel(sampleResult())
    });
    const text = textOf(view);
    const linkButton = walk(view).find(
      (element) => element.type === "button" && textOf(element).includes("Привязать")
    );

    expect(text).toContain("Генератор");
    expect(text).toContain("Канал 20–34");
    expect(text).toContain("Личность");
    expect(text).toContain("Дизайн");
    expect(linkButton?.props.disabled).toBe(false);
  });

  it("uses the PDF toolbar action for saved Human Design calculations", () => {
    const onPdf = vi.fn();
    const saved = savedCalculation();
    const view = HumanDesignPageView({
      ...baseProps(),
      selectedClient: clientOption("22222222-2222-4222-8222-222222222222", "Марина Краснова"),
      model: createHumanDesignViewModel(sampleResult()),
      selectedCalculationId: saved.id,
      pdfLabel: "Скачать PDF",
      pdfDisabled: false,
      pdfTitle: "Скачать готовый PDF",
      isLinked: true,
      onPdf
    });
    const pdfButton = walk(view).find(
      (element): element is ReactElement<{ disabled?: boolean; onClick: () => void }> =>
        element.type === "button" && textOf(element).includes("Скачать PDF")
    );

    expect(pdfButton?.props.disabled).toBe(false);
    pdfButton?.props.onClick();
    expect(onPdf).toHaveBeenCalledOnce();
  });

  it("enables AI draft editing for an opened saved Human Design calculation", () => {
    const onCreateAiDraft = vi.fn();
    const onChangeAiDraftText = vi.fn();
    const onSaveAiDraft = vi.fn();
    const onApproveAiDraft = vi.fn();
    const saved = {
      ...savedCalculation(),
      interpretations: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          status: "draft" as const,
          text: "AI draft text"
        }
      ]
    };
    const view = HumanDesignPageView({
      ...baseProps(),
      selectedClient: clientOption("22222222-2222-4222-8222-222222222222", "Марина Краснова"),
      model: createHumanDesignViewModel(sampleResult()),
      selectedCalculationId: saved.id,
      aiDraftText: "AI draft text",
      aiDraftStatus: "draft",
      aiDraftDisabledReason: null,
      aiDraftSaveDisabled: false,
      aiDraftApproveDisabled: true,
      isLinked: true,
      onCreateAiDraft,
      onChangeAiDraftText,
      onSaveAiDraft,
      onApproveAiDraft
    });
    const text = textOf(view);
    const aiButton = walk(view).find(
      (element): element is ReactElement<{ disabled?: boolean; onClick: () => void }> =>
        element.type === "button" && textOf(element).includes("Обновить AI")
    );
    const textarea = walk(view).find(
      (element): element is ReactElement<{
        value: string;
        onChange: (event: { currentTarget: { value: string } }) => void;
      }> => element.type === "textarea"
    );
    const saveButton = walk(view).find(
      (element): element is ReactElement<{ disabled?: boolean; onClick: () => void }> =>
        element.type === "button" && textOf(element).includes("Сохранить")
    );
    const approveButton = walk(view).find(
      (element): element is ReactElement<{ disabled?: boolean; onClick: () => void }> =>
        element.type === "button" && textOf(element).includes("Утвердить")
    );

    expect(text).toContain("AI-разбор");
    expect(text).toContain("Черновик");
    expect(textarea?.props.value).toBe("AI draft text");
    expect(aiButton?.props.disabled).toBe(false);
    aiButton?.props.onClick();
    expect(onCreateAiDraft).toHaveBeenCalledOnce();
    textarea?.props.onChange({ currentTarget: { value: "Edited draft" } });
    expect(onChangeAiDraftText).toHaveBeenCalledWith("Edited draft");
    expect(saveButton?.props.disabled).toBe(false);
    saveButton?.props.onClick();
    expect(onSaveAiDraft).toHaveBeenCalledOnce();
    expect(approveButton?.props.disabled).toBe(true);
  });

  it("renders transit mode as a saved-calculation overlay with read-only fetch action", () => {
    const onFetchTransit = vi.fn();
    const onChangeTransitInstant = vi.fn();
    const view = HumanDesignPageView({
      ...baseProps(),
      mode: "transit",
      selectedClient: clientOption("22222222-2222-4222-8222-222222222222", "Марина Краснова"),
      model: createHumanDesignViewModel(sampleResult()),
      transitModel: createHumanDesignTransitViewModel(sampleTransitResult()),
      transitInstantValue: "2026-07-23T12:15",
      canOpenTransitMode: true,
      selectedCalculationId: "11111111-1111-4111-8111-111111111111",
      isLinked: false,
      onFetchTransit,
      onChangeTransitInstant
    });
    const text = textOf(view);
    const instantInput = walk(view).find(
      (element): element is ReactElement<{ value: string; onChange: (event: never) => void }> =>
        element.type === "input" && element.props.type === "datetime-local"
    );
    const primaryButton = walk(view).find(
      (element): element is ReactElement<{ disabled?: boolean; onClick: () => void }> =>
        element.type === "button" && textOf(element).includes("Показать")
    );
    const persistButton = walk(view).find(
      (element) => element.type === "button" && textOf(element).includes("Привязать")
    );

    expect(text).toContain("Транзитные каналы");
    expect(text).toContain("Дозамкнутые 1");
    expect(text).toContain("Канал 20–10");
    expect(text).toContain("свои 20 + транзит 10");
    expect(text).toContain("Транзитный checksum");
    expect(instantInput?.props.value).toBe("2026-07-23T12:15");
    primaryButton?.props.onClick();
    expect(onFetchTransit).toHaveBeenCalledOnce();
    expect(persistButton?.props.disabled).toBe(true);
  });

  it("renders partner mode with two CRM selectors and connection dynamics", () => {
    const view = HumanDesignPageView({
      ...baseProps(),
      mode: "compatibility",
      selectedClient: clientOption("22222222-2222-4222-8222-222222222222", "Марина Краснова"),
      selectedPartnerClient: clientOption("44444444-4444-4444-8444-444444444444", "Илья Орлов"),
      selectedDetailKey: "compatibility:summary",
      model: createHumanDesignViewModel(sampleCompatibilityResult())
    });
    const pickers = walk(view).filter((element) => element.type === ClientSearchCombobox);
    const text = textOf(view);

    expect(pickers).toHaveLength(2);
    expect(pickers.map((picker) => picker.props.label)).toEqual(["Клиент", "Партнёр"]);
    expect(pickers[1]?.props.excludeClientIds).toEqual(["22222222-2222-4222-8222-222222222222"]);
    expect(text).toContain("Партнёрский разбор");
    expect(text).toContain("Электромагнитика");
    expect(text).toContain("Канал 43–23");
  });

  it("keeps saved calculations in the toolbar menu instead of a persistent rail", () => {
    const onSelectSaved = vi.fn();
    const saved = savedCalculation();
    const view = HumanDesignPageView({
      ...baseProps(),
      calculations: [saved],
      selectedCalculationId: saved.id,
      onSelectSaved
    });
    const menu = walk(view).find(
      (element): element is ReactElement<ComponentProps<typeof HumanDesignCalculationMenu>> =>
        element.type === HumanDesignCalculationMenu
    );
    const renderedMenu = renderHumanDesignCalculationMenu({
      calculations: [saved],
      selectedCalculationId: saved.id,
      disabled: false,
      onSelect: onSelectSaved,
      isOpen: true,
      onOpenChange: vi.fn()
    });
    const savedButton = walk(renderedMenu).find(
      (element): element is ReactElement<{ onClick: () => void; "aria-current"?: string }> =>
        element.type === "button" && textOf(element).includes("Марина Краснова")
    );

    expect(menu?.props.calculations).toEqual([saved]);
    expect(menu?.props.selectedCalculationId).toBe(saved.id);
    expect(textOf(renderedMenu)).toContain("Расчёты");
    expect(textOf(renderedMenu)).toContain("Сохранённые расчёты");
    expect(textOf(renderedMenu)).toContain("Индивидуальный");
    expect(savedButton?.props["aria-current"]).toBe("true");
    savedButton?.props.onClick();
    expect(onSelectSaved).toHaveBeenCalledWith(saved);
  });

  it("enables recalculation only for an opened saved calculation", () => {
    const onRecalculate = vi.fn();
    const saved = savedCalculation();
    const view = HumanDesignPageView({
      ...baseProps(),
      selectedClient: {
        value: "22222222-2222-4222-8222-222222222222",
        label: "Марина Краснова",
        initials: "МК",
        subtitle: "15.07.1990 · Рим",
        birthDateDisplay: "15.07.1990",
        hasBirthDate: true,
        birthData: null
      },
      model: createHumanDesignViewModel(sampleResult()),
      calculations: [saved],
      selectedCalculationId: saved.id,
      isLinked: true,
      onRecalculate
    });
    const refreshButton = walk(view).find(
      (element): element is ReactElement<{ disabled?: boolean; onClick: () => void }> =>
        element.type === "button" && textOf(element).includes("Обновить")
    );

    expect(refreshButton?.props.disabled).toBe(false);
    refreshButton?.props.onClick();
    expect(onRecalculate).toHaveBeenCalledOnce();
  });
});

function baseProps(): HumanDesignPageViewProps {
  return {
    mode: "individual",
    selectedClient: null,
    selectedPartnerClient: null,
    model: null,
    transitModel: null,
    transitInstantValue: "2026-07-23T12:15",
    canOpenTransitMode: false,
    selectedDetailKey: "type",
    status: {
      tone: "empty",
      title: "Выберите клиента",
      detail: "Birth data берутся из карточки клиента."
    },
    errorMessage: null,
    aiDraftText: "",
    aiDraftStatus: null,
    aiDraftErrorMessage: null,
    aiDraftDisabledReason: "Сначала сохраните расчёт",
    aiDraftSaveDisabled: true,
    aiDraftApproveDisabled: true,
    pdfLabel: "PDF",
    pdfDisabled: true,
    pdfTitle: "Сначала сохраните расчёт",
    pdfErrorMessage: null,
    calculations: [],
    selectedCalculationId: null,
    isBusy: false,
    isLinked: false,
    onSelectMode: vi.fn(),
    onSelectClient: vi.fn(),
    onSelectPartnerClient: vi.fn(),
    onChangeTransitInstant: vi.fn(),
    onSelectDetail: vi.fn(),
    onChangeAiDraftText: vi.fn(),
    onPreview: vi.fn(),
    onFetchTransit: vi.fn(),
    onCreateAiDraft: vi.fn(),
    onPdf: vi.fn(),
    onSaveAiDraft: vi.fn(),
    onApproveAiDraft: vi.fn(),
    onPersist: vi.fn(),
    onSelectSaved: vi.fn(),
    onRecalculate: vi.fn()
  };
}

function clientOption(value: string, label: string) {
  return {
    value,
    label,
    initials: label
      .split(" ")
      .map((part) => part[0])
      .join(""),
    subtitle: "15.07.1990 · CRM",
    birthDateDisplay: "15.07.1990",
    hasBirthDate: true,
    birthData: null
  };
}

function savedCalculation() {
  const result = sampleResult();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownerUserId: "22222222-2222-4222-8222-222222222222",
    module: "human_design" as const,
    mode: "individual" as const,
    methodCode: "human_design_classic",
    title: "Марина Краснова — Дизайн человека",
    status: "linked" as const,
    requestFingerprint: result.inputFingerprint.value,
    inputData: { mode: "individual" },
    resultData: result,
    resultSummary: { type: result.type },
    resultChecksum: result.resultChecksum.value,
    participants: [
      {
        role: "subject" as const,
        source: "crm_client" as const,
        clientId: "33333333-3333-4333-8333-333333333333",
        displayName: "Марина Краснова"
      }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z"
  };
}

function sampleResult(): HumanDesignIndividualResult {
  const checksum = `sha256:${"c".repeat(64)}`;
  const bodies = [
    "sun",
    "earth",
    "moon",
    "north_node",
    "south_node",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ] as const;

  return {
    methodCode: "human_design_classic",
    engineRevision: 1,
    schemaVersion: "human-design-result.v1",
    mode: "individual",
    inputFingerprint: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-individual-resolved-input.v1",
      value: checksum
    },
    resultChecksum: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      value: checksum
    },
    activations: bodies.flatMap((body, index) => [
      {
        side: "personality" as const,
        body,
        longitude: index,
        gate: index === 0 ? 20 : index + 1,
        line: ((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
      },
      {
        side: "design" as const,
        body,
        longitude: index + 20,
        gate: index === 0 ? 34 : index + 20,
        line: (((index + 1) % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
      }
    ]),
    definedGates: [
      { gate: 20, activatedBy: [{ side: "personality" as const, body: "sun" as const, line: 1 }] },
      { gate: 34, activatedBy: [{ side: "design" as const, body: "sun" as const, line: 2 }] }
    ],
    definedChannels: [
      {
        code: "20-34" as const,
        gates: [20, 34] as [number, number],
        centers: ["throat", "sacral"] as const,
        circuit: "integration" as const
      }
    ],
    definedCenters: [
      { code: "throat" as const, definedByChannels: ["20-34" as const] },
      { code: "sacral" as const, definedByChannels: ["20-34" as const] }
    ],
    type: "generator" as const,
    strategy: "wait_to_respond" as const,
    signature: "satisfaction" as const,
    notSelfTheme: "frustration" as const,
    typeBasis: {
      definedCenterCount: 2,
      sacralDefined: true,
      throatDefined: true,
      throatConnectedMotorCenters: ["sacral" as const]
    },
    authority: "sacral" as const,
    authorityBasis: {
      definedCenters: ["sacral" as const, "throat" as const],
      priority: ["emotional" as const, "sacral" as const],
      selectedBy: "sacral"
    },
    definition: "single" as const,
    definitionComponents: [{ centers: ["throat" as const, "sacral" as const], channels: ["20-34" as const] }],
    definitionBasis: {
      definedCenterCount: 2,
      componentCount: 1
    },
    incarnationCross: {
      angle: "right_angle" as const,
      profileCode: "1/3",
      gates: {
        personalitySun: { gate: 20, line: 1 },
        personalityEarth: { gate: 1, line: 2 },
        designSun: { gate: 34, line: 2 },
        designEarth: { gate: 2, line: 3 }
      },
      gateSequence: [20, 1, 34, 2] as [number, number, number, number]
    },
    profile: {
      personalityLine: 1,
      designLine: 3,
      code: "1/3"
    }
  };
}

function sampleCompatibilityResult(): HumanDesignCompatibilityResult {
  const subject = sampleResult();
  const partner = {
    ...sampleResult(),
    inputFingerprint: {
      algorithm: "sha256" as const,
      canonicalization: "json-stable-v1" as const,
      scope: "human-design-individual-resolved-input.v1" as const,
      value: `sha256:${"d".repeat(64)}`
    },
    resultChecksum: {
      algorithm: "sha256" as const,
      canonicalization: "json-stable-v1" as const,
      value: `sha256:${"e".repeat(64)}`
    }
  };
  return {
    methodCode: "human_design_classic",
    engineRevision: 1,
    schemaVersion: "human-design-compatibility-result.v1",
    mode: "compatibility",
    participants: { subject, partner },
    connectionChannels: [
      {
        code: "43-23",
        gates: [43, 23],
        centers: ["ajna", "throat"],
        circuit: "individual",
        dynamic: "electromagnetic",
        subjectGateState: "hanging",
        partnerGateState: "hanging"
      }
    ],
    dynamicCounts: {
      electromagnetic: 1,
      companionship: 0,
      dominance: 0,
      compromise: 0
    },
    sharedDefinedCenters: ["throat"],
    bridgedCenters: ["ajna"],
    inputFingerprint: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-compatibility-input.v1",
      value: `sha256:${"f".repeat(64)}`
    },
    resultChecksum: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      value: `sha256:${"f".repeat(64)}`
    }
  };
}

function sampleTransitResult(): HumanDesignTransitResult {
  const checksum = `sha256:${"9".repeat(64)}`;
  const natal = {
    ...sampleResult(),
    definedChannels: [],
    definedCenters: [],
    definedGates: [
      { gate: 20, activatedBy: [{ side: "personality" as const, body: "sun" as const, line: 1 }] }
    ]
  };
  const bodies = [
    "sun",
    "earth",
    "moon",
    "north_node",
    "south_node",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto"
  ] as const;

  return {
    methodCode: "human_design_classic",
    engineRevision: 1,
    schemaVersion: "human-design-transit-result.v1",
    mode: "transit",
    natal,
    transitSnapshot: {
      instant: "2026-07-23T09:15:00.000Z",
      date: "2026-07-23",
      time: "12:15",
      timezone: "Europe/Moscow",
      latitude: 55.7558,
      longitude: 37.6173
    },
    transitActivations: bodies.map((body, index) => ({
      side: "transit",
      body,
      longitude: index,
      gate: index === 0 ? 10 : index + 1,
      line: ((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
    })),
    transitDefinedGates: [
      {
        gate: 10,
        activatedBy: [{ body: "sun", line: 1 }]
      }
    ],
    completedChannels: [
      {
        code: "20-10",
        gates: [20, 10],
        centers: ["throat", "g"],
        circuit: "integration",
        natalGate: 20,
        transitGate: 10
      }
    ],
    temporarilyDefinedCenters: [
      {
        code: "g",
        definedByCompletedChannels: ["20-10"]
      }
    ],
    summary: {
      transitActivationCount: 13,
      completedChannelCount: 1,
      temporarilyDefinedCenterCount: 1
    },
    inputFingerprint: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      scope: "human-design-transit-input.v1",
      value: checksum
    },
    resultChecksum: {
      algorithm: "sha256",
      canonicalization: "json-stable-v1",
      value: checksum
    }
  };
}

function walk(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(walk)];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return Children.toArray(node.props.children).map(textOf).join(" ");
}
