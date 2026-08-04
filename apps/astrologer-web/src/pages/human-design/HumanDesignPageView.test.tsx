import { readFileSync } from "node:fs";
import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode
} from "react";
import type {
  HumanDesignCompatibilityResult,
  HumanDesignIndividualResult,
  HumanDesignTransitResult
} from "@elevenhouse/contracts";
import { ActionMenu, type ActionMenuItem } from "@elevenhouse/design-system/components/ActionMenu";
import { describe, expect, it, vi } from "vitest";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import {
  createHumanDesignTransitViewModel,
  createHumanDesignViewModel
} from "../../features/human-design/model/humanDesignViewModel";
import {
  HumanDesignCalculationMenu,
  renderHumanDesignCalculationMenu
} from "./HumanDesignCalculationMenu";
import { HumanDesignPageView, type HumanDesignPageViewProps } from "./HumanDesignPageView";

describe("HumanDesignPageView", () => {
  it("caps mobile page gutters so the workspace does not overflow the viewport", () => {
    const css = readFileSync(new URL("./HumanDesignPage.module.css", import.meta.url), "utf8");
    const mobileBlock = css.match(/@media \(max-width: 820px\) \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(mobileBlock).toContain("margin: -32px -16px;");
    expect(mobileBlock).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(mobileBlock).toContain("overflow: hidden;");
    expect(mobileBlock).toContain("font-size: 9.5px;");
    expect(mobileBlock).not.toContain("overflow-x: auto;");
  });

  it("uses CRM client selection and hides side columns until a client is selected", () => {
    const view = HumanDesignPageView(baseProps());
    const pickers = walk(view).filter((element) => element.type === ClientSearchCombobox);
    const sideColumns = walk(view).filter(
      (element) =>
        element.type === "aside" &&
        (element.props["aria-label"] === "Свойства Human Design" ||
          element.props["aria-label"] === "Деталь Human Design")
    );

    expect(pickers).toHaveLength(1);
    expect(pickers[0]?.props.label).toBe("Клиент");
    expect(walk(view).some((element) => element.type === "input")).toBe(false);
    expect(sideColumns).toHaveLength(2);
    expect(sideColumns.every((column) => column.props.hidden === true)).toBe(true);
    expect(textOf(view)).not.toContain("Выберите клиента из CRM.");
    expect(
      walk(view).some((element) => element.type === "h2" && textOf(element) === "Клиент")
    ).toBe(false);
    expect(textOf(view)).not.toContain("Birth data берутся из карточки клиента");
    expect(textOf(view)).not.toContain("Поддержан individual preview из CRM birth data.");
    expect(textOf(view)).toContain("Выберите клиента и рассчитайте бодиграф");
  });

  it("keeps empty states free of technical preview copy", () => {
    const partnerEmpty = HumanDesignPageView({
      ...baseProps(),
      mode: "compatibility",
      selectedClient: clientOption("22222222-2222-4222-8222-222222222222", "Марина Краснова")
    });
    const transitEmpty = HumanDesignPageView({
      ...baseProps(),
      mode: "transit",
      selectedClient: clientOption("22222222-2222-4222-8222-222222222222", "Марина Краснова")
    });
    const combinedText = `${textOf(partnerEmpty)} ${textOf(transitEmpty)}`;

    expect(textOf(partnerEmpty)).toContain("Выберите двух клиентов и рассчитайте связь");
    expect(textOf(transitEmpty)).toContain("Откройте сохранённый individual расчёт");
    expect(combinedText).not.toContain("preview");
    expect(combinedText).not.toContain("CRM bodygraph");
    expect(combinedText).not.toContain("natal");
  });

  it("does not render the toolbar status summary for missing client birth data", () => {
    const view = HumanDesignPageView({
      ...baseProps(),
      selectedClient: {
        ...clientOption("22222222-2222-4222-8222-222222222222", "Мария Иванова"),
        hasBirthDate: false,
        birthDateDisplay: "",
        subtitle: "дата рождения"
      }
    });
    const text = textOf(view);

    expect(text).not.toContain("Нет даты рождения");
    expect(text).not.toContain("Заполните birth data в карточке клиента.");
    expect(text).toContain("В карточке клиента не заполнена дата рождения.");
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
    expect(text).not.toContain("Checksum");
    expect(linkButton).toBeUndefined();
    expect(getActionMenuItem(view, "link").disabled).toBe(false);
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
    const pdfItem = getActionMenuItem(view, "pdf");

    expect(pdfItem.disabled).toBe(false);
    pdfItem.onSelect();
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
    const aiItem = getActionMenuItem(view, "ai");
    const textarea = walk(view).find(
      (
        element
      ): element is ReactElement<{
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
    expect(aiItem.disabled).toBe(false);
    aiItem.onSelect();
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
    const primaryItem = getActionMenuItem(view, "calculate");
    const persistItem = getActionMenuItem(view, "link");

    expect(text).toContain("Транзитные каналы");
    expect(text).toContain("Дозамкнутые 1");
    expect(text).toContain("Канал 20–10");
    expect(text).toContain("свои 20 + транзит 10");
    expect(text).not.toContain("Транзитный checksum");
    expect(instantInput?.props.value).toBe("2026-07-23T12:15");
    primaryItem.onSelect();
    expect(onFetchTransit).toHaveBeenCalledOnce();
    expect(persistItem.disabled).toBe(true);
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
    expect(pickers[1]?.props.emptyMessage).toBe("Нет доступных партнёров");
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

  it("groups toolbar calculation actions into a single actions menu", () => {
    const view = HumanDesignPageView(baseProps());
    const menu = getToolbarActionMenu(view);
    const calculationsMenu = getCalculationMenu(view);

    expect(menu.props.label).toBe("Действия");
    expect(menu.props.triggerAriaLabel).toBe("Действия Human Design");
    expect(menu.props.open).toBe(false);
    expect(calculationsMenu.props.open).toBe(false);
    expect(typeof menu.props.onOpenChange).toBe("function");
    expect(typeof calculationsMenu.props.onOpenChange).toBe("function");
    expect(menu.props.items.map((item) => item.id)).toEqual([
      "calculate",
      "link",
      "refresh",
      "pdf",
      "ai"
    ]);
    expect(
      walk(view).some((element) => element.type === "button" && textOf(element) === "Рассчитать")
    ).toBe(false);
    expect(
      walk(view).some((element) => element.type === "button" && textOf(element) === "Привязать")
    ).toBe(false);
    expect(
      walk(view).some((element) => element.type === "button" && textOf(element) === "Обновить")
    ).toBe(false);
    expect(
      walk(view).some((element) =>
        typeof element.props.className === "string"
          ? element.props.className.includes("toolbarSpacer")
          : false
      )
    ).toBe(false);
  });

  it("renders only one open toolbar overlay at a time", () => {
    const withActionsOpen = HumanDesignPageView({
      ...baseProps(),
      openToolbarOverlay: "actions"
    });
    const withCalculationsOpen = HumanDesignPageView({
      ...baseProps(),
      openToolbarOverlay: "calculations"
    });

    expect(getToolbarActionMenu(withActionsOpen).props.open).toBe(true);
    expect(getCalculationMenu(withActionsOpen).props.open).toBe(false);
    expect(getToolbarActionMenu(withCalculationsOpen).props.open).toBe(false);
    expect(getCalculationMenu(withCalculationsOpen).props.open).toBe(true);
  });

  it("keeps compact desktop Human Design controls and bodygraph viewport-contained", () => {
    const pageCss = readFileSync(new URL("./HumanDesignPage.module.css", import.meta.url), "utf8");
    const bodygraphCss = readFileSync(
      new URL(
        "../../features/human-design/components/HumanDesignBodygraph.module.css",
        import.meta.url
      ),
      "utf8"
    );

    expect(pageCss).toContain("flex: 1 1 360px;");
    expect(pageCss).toContain("@media (max-width: 1540px) and (max-height: 800px)");
    expect(pageCss).toContain("margin-top: 56px;");
    expect(pageCss).toContain("margin-top: 6px;");
    expect(pageCss).toContain("max-height: 168px;");
    expect(bodygraphCss).toContain("@media (max-width: 1540px) and (max-height: 800px)");
    expect(bodygraphCss).toContain("width: min(270px, 100%);");
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
    const refreshItem = getActionMenuItem(view, "refresh");

    expect(refreshItem.disabled).toBe(false);
    refreshItem.onSelect();
    expect(onRecalculate).toHaveBeenCalledOnce();
  });
});

function getToolbarActionMenu(root: ReactElement): ReactElement<ComponentProps<typeof ActionMenu>> {
  const menu = walk(root).find(
    (element): element is ReactElement<ComponentProps<typeof ActionMenu>> =>
      element.type === ActionMenu
  );

  if (!menu) {
    throw new Error("Expected Human Design toolbar action menu to be rendered");
  }

  return menu;
}

function getCalculationMenu(
  root: ReactElement
): ReactElement<ComponentProps<typeof HumanDesignCalculationMenu>> {
  const menu = walk(root).find(
    (element): element is ReactElement<ComponentProps<typeof HumanDesignCalculationMenu>> =>
      element.type === HumanDesignCalculationMenu
  );

  if (!menu) {
    throw new Error("Expected Human Design calculation menu to be rendered");
  }

  return menu;
}

function getActionMenuItem(root: ReactElement, id: string): ActionMenuItem {
  const item = getToolbarActionMenu(root).props.items.find((candidate) => candidate.id === id);

  if (!item) {
    throw new Error(`Expected Human Design action menu item ${id} to be rendered`);
  }

  return item;
}

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
    openToolbarOverlay: null,
    onOpenToolbarOverlayChange: vi.fn(),
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
    interpretationMode: null,
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
    definitionComponents: [
      { centers: ["throat" as const, "sacral" as const], channels: ["20-34" as const] }
    ],
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
