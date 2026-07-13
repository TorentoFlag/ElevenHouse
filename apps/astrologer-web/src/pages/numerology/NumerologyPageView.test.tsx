import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type { NumerologyCalculationResponse } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { MotionContent } from "@elevenhouse/design-system/motion";
import { describe, expect, it, vi } from "vitest";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import { NumerologyResultPanel } from "../../features/numerology/components/NumerologyResultPanel";
import { NumerologyPageView, type NumerologyPageViewProps } from "./NumerologyPageView";
import { createParticipantFormState } from "../../features/numerology/model/numerologyFormModel";
import styles from "./NumerologyPage.module.css";

describe("NumerologyPageView", () => {
  it("disables link action for manual-only calculations", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({ source: "manual", clientId: null })
    });
    const linkButton = findButtonByText(view, "Привязать");

    expect(linkButton.props.disabled).toBe(true);
  });

  it("enables link for CRM-linked participants without rendering the hidden publish workflow", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      })
    });

    expect(findButtonByText(view, "Привязать").props.disabled).toBe(false);
    expect(findOptionalButtonByText(view, "Опубликовать")).toBeNull();
  });

  it("exposes the reference workspace actions instead of a saved-calculation-first toolbar", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      })
    });

    expect(findButtonByText(view, "Год")).toBeDefined();
    expect(findButtonByText(view, "Совместимость")).toBeDefined();
    expect(findButtonByText(view, "Презентация")).toBeDefined();
    expect(findButtonByText(view, "PDF").props.disabled).toBe(true);
    expect(findOptionalButtonByText(view, "Пересчитать")).toBeNull();
    expect(findOptionalButtonByText(view, "Данные расчета")).toBeNull();
    expect(findElements(view).some((element) => includesText(element.props, "Сохраненные"))).toBe(
      false
    );
  });

  it("does not render the saved calculations picker on the reference workspace", () => {
    const onSelectSaved = vi.fn();
    const saved = response({
      source: "manual",
      clientId: null
    }).calculation;
    const view = NumerologyPageView({
      ...baseProps(),
      calculations: [saved],
      onSelectSaved
    });

    expect(findElements(view).some((element) => includesText(element.props, "СОХРАНЕННЫЕ"))).toBe(
      false
    );
    expect(onSelectSaved).not.toHaveBeenCalled();
  });

  it("renders an empty state without the removed manual setup action", () => {
    const view = NumerologyPageView(baseProps());
    const emptyState = findElements(view).find(
      (element) =>
        element.type === "section" &&
        (element.props as { className?: string }).className === styles.emptyState
    );

    expect(emptyState).toBeDefined();
    expect(
      emptyState ? elementIncludesText(emptyState, "Выберите клиента для нумерологии") : false
    ).toBe(true);
    expect(findOptionalButtonByText(view, "Создать расчет")).toBeNull();
    expect(findElements(view).some((element) => elementIncludesText(element, "Новый расчет"))).toBe(
      false
    );
  });

  it("disables interpretation approval when the current result has no interpretation", () => {
    const baseResponse = response({
      source: "crm_client",
      clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
    });
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: baseResponse
    });
    const resultPanel = findRequiredElementByType<{
      readonly isApproveInterpretationDisabled?: boolean;
    }>(view, NumerologyResultPanel);

    expect(resultPanel.props.isApproveInterpretationDisabled).toBe(true);
  });

  it("disables client selection and recalculation while an action is pending", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      isBusy: true,
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      })
    });
    const clientPickers = findElements(view).filter(
      (element) => element.type === ClientSearchCombobox
    ) as ReactElement<{ disabled?: boolean }>[];

    expect(clientPickers).toHaveLength(1);
    expect(clientPickers[0]?.props.disabled).toBe(true);
    expect(findOptionalButtonByText(view, "Пересчитать")).toBeNull();
  });

  it("does not expose the non-reference publish action in the workspace", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      })
    });

    expect(findOptionalButtonByText(view, "Опубликовать")).toBeNull();
  });

  it("does not render calculation status or version badges above the reference workspace", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      })
    });

    expect(findElements(view).some((element) => elementIncludesText(element, "calculated"))).toBe(
      false
    );
    expect(findElements(view).some((element) => elementIncludesText(element, "версия 1"))).toBe(
      false
    );
  });

  it("keeps the desktop toolbar title from shrinking before the client selector", () => {
    const css = readFileSync(new URL("./NumerologyPage.module.css", import.meta.url), "utf8");
    const toolbarRule = getCssRule(css, ".toolbar");
    const titleGroupRule = getCssRule(css, ".titleGroup");
    const titleRule = getCssRule(css, ".title");

    expect(toolbarRule).toContain("height: 60px;");
    expect(toolbarRule).toContain("padding: 0 20px;");
    expect(titleGroupRule).toContain("flex: 0 0 auto;");
    expect(titleRule).not.toContain("text-overflow: ellipsis;");
  });

  it("keeps reference action buttons at fixed content width", () => {
    const css = readFileSync(new URL("./NumerologyPage.module.css", import.meta.url), "utf8");
    const toolButtonRule = getCssRule(css, ".toolButton,\n.toolButtonActive,\n.toolButtonLinked");
    const linkedRule = getCssRule(css, ".toolButtonLinked");
    const linkedDisabledRule = getCssRule(css, ".toolButtonLinked:disabled");

    expect(toolButtonRule).toContain("flex: 0 0 auto;");
    expect(toolButtonRule).toContain("gap: 8px;");
    expect(toolButtonRule).toContain("min-height: 37px;");
    expect(toolButtonRule).toContain("padding: 10px 16px;");
    expect(toolButtonRule).toContain("border-radius: 14px;");
    expect(toolButtonRule).toContain("font-size: 13px;");
    expect(toolButtonRule).toContain("font-weight: 600;");
    expect(linkedRule).toContain("color: rgb(78 200 160);");
    expect(linkedDisabledRule).toContain("opacity: 1;");
  });

  it("matches the reference action row icons and button set", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      })
    });

    expect(getButtonIconName(view, "Год")).toBe("clock");
    expect(getButtonIconName(view, "Совместимость")).toBe("users");
    expect(getButtonIconName(view, "Презентация")).toBe("arrowUpRight");
    expect(getButtonIconName(view, "Привязать")).toBe("pin");
    expect(getButtonIconName(view, "PDF")).toBe("doc");
    expect(findOptionalButtonByText(view, "Пересчитать")).toBeNull();
  });

  it("uses form compatibility mode as the toolbar toggle state without opening presentation flow", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      formState: {
        ...baseProps().formState,
        mode: "compatibility",
        partner: {
          ...createParticipantFormState("crm_client"),
          clientId: "4ab63db1-4f78-4d59-9b75-c21fc3ec9f6e",
          displayName: "Марина Краснова",
          fullName: "Марина Краснова",
          birthDate: "1990-03-14"
        }
      },
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      })
    });
    const clientPickers = findElements(view).filter(
      (element) => element.type === ClientSearchCombobox
    ) as ReactElement<{ label: string; excludeClientIds?: readonly string[] }>[];
    const compatibilityButton = findButtonByText(view, "Совместимость") as ReactElement<{
      "aria-pressed"?: boolean;
    }>;

    expect(clientPickers.map((picker) => picker.props.label)).toEqual(["Клиент", "Партнер"]);
    expect(clientPickers[0]?.props.excludeClientIds).toEqual([
      "4ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
    ]);
    expect(clientPickers[1]?.props.excludeClientIds).toEqual([
      "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
    ]);
    expect(compatibilityButton.props["aria-pressed"]).toBe(true);
    expect(findOptionalButtonByText(view, "Презентация")).toBeNull();
  });

  it("animates workspace changes with the shared motion primitive keyed by result checksum", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e",
        calculationId: "11111111-1111-4111-8111-111111111111"
      })
    });
    const motion = findRequiredElementByType<{
      readonly className?: string;
      readonly transitionKey: string;
    }>(view, MotionContent);

    expect(motion.props.className).toContain(styles.workspaceMotion);
    expect(motion.props.transitionKey).toBe(
      `individual:11111111-1111-4111-8111-111111111111:sha256:${"b".repeat(64)}`
    );
  });

  it("keeps numerology workspace motion subtle and reduced-motion compatible", () => {
    const css = readFileSync(new URL("./NumerologyPage.module.css", import.meta.url), "utf8");
    const motionRule = getCssRule(css, ".workspaceMotion");

    expect(motionRule).toContain("--eh-motion-content-enter-y: 10px;");
    expect(motionRule).toContain("--eh-motion-content-enter-scale: 0.998;");
    expect(motionRule).toContain("--eh-motion-duration-normal: 340ms;");
    expect(motionRule).toContain("will-change: opacity, transform;");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".workspaceMotion");
    expect(css).toContain("will-change: auto;");
  });
});

function baseProps(): NumerologyPageViewProps {
  return {
    calculations: [],
    selectedResponse: null,
    previewResult: null,
    formState: {
      mode: "individual",
      title: "",
      subject: {
        ...createParticipantFormState("manual"),
        source: "manual",
        clientId: "",
        displayName: "",
        fullName: "",
        birthDate: ""
      },
      partner: {
        ...createParticipantFormState("manual"),
        source: "manual",
        clientId: "",
        displayName: "",
        fullName: "",
        birthDate: ""
      },
      includeNameNumbers: true,
      includePsychomatrix: true,
      includeStrengthLines: true,
      forecastDate: ""
    },
    isYearMode: false,
    isPresentationOpen: false,
    selectedDetailSelector: null,
    interpretationText: "",
    errorMessage: null,
    isBusy: false,
    onSelectSubjectClient: vi.fn(),
    onSelectPartnerClient: vi.fn(),
    onSelectSaved: vi.fn(),
    onSelectDetail: vi.fn(),
    onToggleYearMode: vi.fn(),
    onToggleCompatibilityMode: vi.fn(),
    onOpenPresentation: vi.fn(),
    onClosePresentation: vi.fn(),
    onLink: vi.fn(),
    onPublish: vi.fn(),
    onInterpretationChange: vi.fn(),
    onSaveInterpretation: vi.fn(),
    onApproveInterpretation: vi.fn()
  };
}

function response(participant: {
  readonly source: "manual" | "crm_client";
  readonly clientId: string | null;
  readonly calculationId?: string;
}): NumerologyCalculationResponse {
  const result = {
    methodCode: "pythagorean",
    mode: "individual",
    participant: {
      calculationName: "Мария Иванова",
      calculationNameSource:
        participant.source === "crm_client" ? "crm_display_name" : "manual_entry",
      birthDate: "1990-03-14"
    },
    keyNumbers: { lifePath: 9, birthday: 5, expression: 9, soul: 3, personality: 6 },
    periods: {},
    psychomatrix: {
      sourceDigits: [1, 4, 0, 3, 1, 9, 9, 0],
      workingNumbers: { first: 27, second: 9, third: 25, fourth: 7 },
      cells: {
        "1": "11",
        "2": "",
        "3": "3",
        "4": "4",
        "5": "",
        "6": "",
        "7": "7",
        "8": "",
        "9": "999"
      }
    },
    strengthLines: []
  };
  return {
    calculation: {
      id: participant.calculationId ?? "11111111-1111-4111-8111-111111111111",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      title: "Мария",
      status: "calculated",
      requestFingerprint: `sha256:${"a".repeat(64)}`,
      inputData: {},
      resultData: result,
      resultSummary: {},
      resultChecksum: `sha256:${"b".repeat(64)}`,
      participants: [
        {
          role: "subject",
          source: participant.source,
          clientId: participant.clientId,
          displayName: "Мария"
        }
      ],
      links: [],
      interpretations: [],
      artifacts: [],
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z"
    },
    result
  } as unknown as NumerologyCalculationResponse;
}

function findButtonByText(
  root: ReactElement,
  text: string
): ReactElement<{
  disabled?: boolean;
  title?: string;
  className?: string;
  onClick?: () => void;
}> {
  return findButtonByTextInElements(findElements(root), text);
}

function findOptionalButtonByText(
  root: ReactElement,
  text: string
): ReactElement<{ disabled?: boolean; title?: string }> | null {
  return (
    (findElements(root).find(
      (element) =>
        element.type === "button" &&
        includesText((element.props as { children?: unknown }).children, text)
    ) as ReactElement<{ disabled?: boolean; title?: string }> | undefined) ?? null
  );
}

function findButtonByTextInElements(
  elements: readonly ReactElement[],
  text: string
): ReactElement<{ disabled?: boolean; title?: string }> {
  const result = elements.find(
    (element) =>
      element.type === "button" &&
      includesText((element.props as { children?: unknown }).children, text)
  );
  if (!result) throw new Error(`Button not found: ${text}`);

  return result as ReactElement<{ disabled?: boolean; title?: string }>;
}

function getButtonIconName(root: ReactElement, text: string): string | null {
  const button = findButtonByText(root, text);
  const icon = findElements(button).find((element) => element.type === Icon);

  return (icon?.props as { iconName?: string } | undefined)?.iconName ?? null;
}

function findRequiredElementByType<TProps>(
  root: ReactElement,
  type: unknown
): ReactElement<TProps> {
  const result = findElements(root).find((element) => element.type === type);
  if (!result) throw new Error("Element not found");

  return result as ReactElement<TProps>;
}

function findElements(root: ReactElement): ReactElement[] {
  const result: ReactElement[] = [root];

  const children = (root.props as { children?: ReactNode }).children;
  for (const child of Children.toArray(children)) {
    if (isValidElement(child)) {
      result.push(...findElements(child));
    }
  }

  return result;
}

function includesText(value: unknown, text: string): boolean {
  if (typeof value === "string") return value.includes(text);
  if (Array.isArray(value)) return value.some((item) => includesText(item, text));
  if (isValidElement(value)) {
    return includesText((value.props as { children?: unknown }).children, text);
  }

  return false;
}

function elementIncludesText(element: ReactElement, text: string): boolean {
  return includesText((element.props as { children?: unknown }).children, text);
}

function getCssRule(css: string, selector: string): string {
  const matches = Array.from(
    css.matchAll(new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{(?<body>[^}]*)\\}`, "g"))
  );
  const match = matches.at(-1);
  if (!match?.groups?.body) throw new Error(`CSS rule not found: ${selector}`);

  return match.groups.body;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
