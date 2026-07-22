import { readFileSync } from "node:fs";
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import type { HumanDesignIndividualResult } from "@elevenhouse/contracts";
import { describe, expect, it, vi } from "vitest";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import { SavedCalculationPicker } from "../../features/calculations/components/SavedCalculationPicker";
import { createHumanDesignViewModel } from "../../features/human-design/model/humanDesignViewModel";
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
    const disabledFutureButtons = walk(view).filter(
      (element) =>
        element.type === "button" &&
        element.props.disabled === true &&
        ["Транзиты", "Партнёрский", "PDF", "AI-разбор"].some((label) =>
          textOf(element).includes(label)
        )
    );
    const linkButton = walk(view).find(
      (element) => element.type === "button" && textOf(element).includes("Привязать")
    );

    expect(text).toContain("Генератор");
    expect(text).toContain("Канал 20–34");
    expect(text).toContain("Личность");
    expect(text).toContain("Дизайн");
    expect(disabledFutureButtons).toHaveLength(4);
    expect(linkButton?.props.disabled).toBe(false);
  });

  it("renders saved calculations rail and opens selected records", () => {
    const onSelectSaved = vi.fn();
    const saved = savedCalculation();
    const view = HumanDesignPageView({
      ...baseProps(),
      calculations: [saved],
      selectedCalculationId: saved.id,
      onSelectSaved
    });
    const picker = walk(view).find(
      (element): element is ReactElement<ComponentProps<typeof SavedCalculationPicker>> =>
        element.type === SavedCalculationPicker
    );

    expect(picker?.props.calculations).toEqual([saved]);
    expect(picker?.props.selectedCalculationId).toBe(saved.id);
    picker?.props.onSelect(saved);
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
    selectedClient: null,
    model: null,
    selectedDetailKey: "type",
    status: {
      tone: "empty",
      title: "Выберите клиента",
      detail: "Birth data берутся из карточки клиента."
    },
    errorMessage: null,
    calculations: [],
    selectedCalculationId: null,
    isBusy: false,
    isLinked: false,
    onSelectClient: vi.fn(),
    onSelectDetail: vi.fn(),
    onPreview: vi.fn(),
    onPersist: vi.fn(),
    onSelectSaved: vi.fn(),
    onRecalculate: vi.fn()
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

function walk(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(walk)];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return Children.toArray(node.props.children).map(textOf).join(" ");
}
