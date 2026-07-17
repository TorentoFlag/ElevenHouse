import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import type { NumerologyCalculationResponse } from "@elevenhouse/contracts";
import { ActionMenu, type ActionMenuItem } from "@elevenhouse/design-system/components/ActionMenu";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { MotionContent } from "@elevenhouse/design-system/motion";
import { describe, expect, it, vi } from "vitest";
import { ClientSearchCombobox } from "../../features/clients/components/ClientSearchCombobox";
import { NumerologyResultPanel } from "../../features/numerology/components/NumerologyResultPanel";
import { NumerologyPageView, type NumerologyPageViewProps } from "./NumerologyPageView";
import { NumerologyPresentationDialog } from "./NumerologyPresentationDialog";
import { NumerologyArchiveDialog } from "./NumerologyArchiveDialog";
import { NumerologyCalculationEditor } from "./NumerologyCalculationEditor";
import { NumerologyCalculationMenu } from "./NumerologyCalculationMenu";
import { NumerologyYearPicker } from "./NumerologyYearPicker";
import { createParticipantFormState } from "../../features/numerology/model/numerologyFormModel";
import styles from "./NumerologyPage.module.css";

describe("NumerologyPageView", () => {
  it("waits for the compatibility partner without raising an error banner", () => {
    const controllerSource = readFileSync(
      new URL("./useNumerologyPageController.ts", import.meta.url),
      "utf8"
    );

    expect(controllerSource).not.toContain(
      "Выберите второго клиента с датой рождения для совместимости"
    );
  });

  it("wires explicit create, replacement recalculation and archive mutations", () => {
    const controllerSource = readFileSync(
      new URL("./useNumerologyPageController.ts", import.meta.url),
      "utf8"
    );

    expect(controllerSource).toContain("useRecalculateNumerologyMutation");
    expect(controllerSource).toContain("useArchiveNumerologyMutation");
    expect(controllerSource).toContain("toNumerologyRecalculateRequest");
    expect(controllerSource).toContain("onSubmitEditor");
    expect(controllerSource).toContain("onConfirmArchive");
  });

  it("moves rare preparation commands into one labeled actions menu", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      }),
      pdfLabel: "Скачать PDF",
      pdfDisabled: false,
      pdfTitle: "Скачать готовый PDF"
    });
    const menu = getToolbarActionMenu(view);

    expect(menu.props.label).toBe("Действия");
    expect(menu.props.triggerAriaLabel).toBe("Действия расчёта");
    expect(menu.props.items.map((item) => item.id)).toEqual(["presentation", "delete", "pdf"]);
    expect(findOptionalButtonByText(view, "Презентация")).toBeNull();
    expect(findOptionalButtonByText(view, "Привязать")).toBeNull();
    expect(findOptionalButtonByText(view, "Скачать PDF")).toBeNull();
  });

  it("maps each enabled menu command to its existing callback exactly once", () => {
    const onOpenPresentation = vi.fn();
    const onRequestArchive = vi.fn();
    const onPdf = vi.fn();
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      }),
      pdfDisabled: false,
      pdfTitle: "Сформировать PDF",
      onOpenPresentation,
      onRequestArchive,
      onPdf
    });

    getActionMenuItem(view, "presentation").onSelect();
    getActionMenuItem(view, "delete").onSelect();
    getActionMenuItem(view, "pdf").onSelect();

    expect(onOpenPresentation).toHaveBeenCalledOnce();
    expect(onRequestArchive).toHaveBeenCalledOnce();
    expect(onPdf).toHaveBeenCalledOnce();
    expect(findOptionalButtonByText(view, "Опубликовать")).toBeNull();
  });

  it("keeps link and PDF disabled reasons visible inside the menu", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({ source: "manual", clientId: null }),
      pdfLabel: "PDF готовится…",
      pdfDisabled: true,
      pdfTitle: "PDF формируется"
    });

    expect(getActionMenuItem(view, "link").disabled).toBe(true);
    expect(includesText(getActionMenuItem(view, "link").label, "Нужен CRM-участник")).toBe(true);
    expect(getActionMenuItem(view, "pdf").disabled).toBe(true);
    expect(includesText(getActionMenuItem(view, "pdf").label, "PDF формируется")).toBe(true);
  });

  it("keeps the reference workspace actions and adds explicit lifecycle controls", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      })
    });

    const yearPicker = findRequiredElementByType<{
      readonly selectedYear: number;
      readonly isPeriodVisible: boolean;
    }>(view, NumerologyYearPicker);

    expect(yearPicker.props.selectedYear).toBe(2027);
    expect(yearPicker.props.isPeriodVisible).toBe(true);
    expect(findButtonByText(view, "Совместимость")).toBeDefined();
    expect(getToolbarActionMenu(view)).toBeDefined();
    const calculationMenu = renderCalculationMenu(view);
    expect(findButtonByText(calculationMenu, "Пересчитать")).toBeDefined();
    expect(findButtonByText(calculationMenu, "Удалить расчёт")).toBeDefined();
    expect(findRequiredElementByType(view, NumerologyCalculationMenu)).toBeDefined();
  });

  it("shows the save-first reason for preview PDF export", () => {
    const view = NumerologyPageView(baseProps());
    const pdfItem = getActionMenuItem(view, "pdf");

    expect(pdfItem.disabled).toBe(true);
    expect(includesText(pdfItem.label, "Скачать PDF")).toBe(true);
    expect(includesText(pdfItem.label, "Сначала сохраните расчёт")).toBe(true);
  });

  it("exposes ready and retry PDF actions without changing controller behavior", () => {
    const onPdf = vi.fn();
    const readyView = NumerologyPageView({
      ...baseProps(),
      pdfLabel: "Скачать PDF",
      pdfDisabled: false,
      pdfTitle: "Скачать готовый PDF",
      onPdf
    });
    const readyItem = getActionMenuItem(readyView, "pdf");

    readyItem.onSelect();
    expect(readyItem.disabled).toBe(false);
    expect(includesText(readyItem.label, "Скачать PDF")).toBe(true);
    expect(onPdf).toHaveBeenCalledOnce();

    const retryView = NumerologyPageView({
      ...baseProps(),
      pdfLabel: "Повторить",
      pdfDisabled: false,
      pdfTitle: "Повторить формирование PDF",
      pdfErrorMessage: "Не удалось сформировать PDF: временная ошибка"
    });
    expect(getActionMenuItem(retryView, "pdf").disabled).toBe(false);
    expect(
      includesText(getActionMenuItem(retryView, "pdf").label, "Повторить формирование PDF")
    ).toBe(true);
    expect(
      findElements(retryView).some((element) =>
        elementIncludesText(element, "Не удалось сформировать PDF: временная ошибка")
      )
    ).toBe(true);
  });

  it("keeps a queued PDF visibly pending and prevents duplicate selection", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      pdfLabel: "PDF готовится…",
      pdfDisabled: true,
      pdfTitle: "PDF формируется"
    });
    const pdfItem = getActionMenuItem(view, "pdf");

    expect(pdfItem.disabled).toBe(true);
    expect(includesText(pdfItem.label, "PDF готовится…")).toBe(true);
    expect(includesText(pdfItem.label, "PDF формируется")).toBe(true);
  });

  it("passes active saved calculations to the workspace menu", () => {
    const onSelectSaved = vi.fn();
    const saved = response({
      source: "crm_client",
      clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
    }).calculation;
    const view = NumerologyPageView({
      ...baseProps(),
      calculations: [saved],
      onSelectSaved
    });

    const menu = findRequiredElementByType<{
      readonly items: readonly unknown[];
      readonly onSelect: (calculation: unknown) => void;
    }>(view, NumerologyCalculationMenu);

    expect(menu.props.items).toHaveLength(1);
    menu.props.onSelect(saved);
    expect(onSelectSaved).toHaveBeenCalledWith(saved);
  });

  it("renders an empty state with a separate inline creation entry point", () => {
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
    const menu = findRequiredElementByType(view, NumerologyCalculationMenu);
    expect(menu).toBeDefined();
  });

  it("replaces the result area with the inline editor without removing the toolbar", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      editorState: {
        kind: "create",
        calculationId: null,
        form: baseProps().formState
      }
    });

    expect(findRequiredElementByType(view, NumerologyCalculationMenu)).toBeDefined();
    expect(findRequiredElementByType(view, NumerologyCalculationEditor)).toBeDefined();
    expect(findElements(view).some((element) => element.type === NumerologyResultPanel)).toBe(
      false
    );
  });

  it("renders archive confirmation only for the requested calculation", () => {
    const archiveTarget = response({ source: "manual", clientId: null }).calculation;
    const view = NumerologyPageView({ ...baseProps(), archiveTarget });

    const dialog = findRequiredElementByType<{
      readonly calculationTitle: string;
    }>(view, NumerologyArchiveDialog);
    expect(dialog.props.calculationTitle).toBe(archiveTarget.title);
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

  it("blocks AI generation and approval while the interpretation has unsaved changes", () => {
    const baseResponse = response({
      source: "crm_client",
      clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
    });
    const selectedResponse = {
      ...baseResponse,
      calculation: {
        ...baseResponse.calculation,
        interpretations: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            status: "draft" as const,
            text: "Сохранённый текст"
          }
        ]
      }
    };
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse,
      interpretationText: "Изменённый текст"
    });
    const resultPanel = findRequiredElementByType<{
      readonly isAiDraftDisabled: boolean;
      readonly aiDraftDisabledReason: string | null;
      readonly isApproveInterpretationDisabled: boolean;
    }>(view, NumerologyResultPanel);

    expect(resultPanel.props).toMatchObject({
      isAiDraftDisabled: true,
      aiDraftDisabledReason: "Сначала сохраните или отмените изменения",
      isApproveInterpretationDisabled: true
    });
  });

  it("passes the current period and unsaved interpretation into presentation", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      }),
      isPresentationOpen: true,
      interpretationText: "Текущий несохраненный текст"
    });
    const presentation = findRequiredElementByType<{
      readonly isPeriodVisible: boolean;
      readonly interpretationText: string;
    }>(view, NumerologyPresentationDialog);

    expect(presentation.props.isPeriodVisible).toBe(true);
    expect(presentation.props.interpretationText).toBe("Текущий несохраненный текст");
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
    expect(findButtonByText(renderCalculationMenu(view), "Пересчитать").props.disabled).toBe(true);
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

  it("uses a content-aware toolbar grid without shrinking its title", () => {
    const css = readFileSync(new URL("./NumerologyPage.module.css", import.meta.url), "utf8");
    const toolbarRule = getCssRule(css, ".toolbar");
    const toolbarLayoutRule = getCssRule(css, ".toolbarLayout");
    const titleGroupRule = getCssRule(css, ".titleGroup");
    const titleRule = getCssRule(css, ".title");

    expect(toolbarRule).toContain("container-type: inline-size;");
    expect(toolbarRule).toContain("min-height: 60px;");
    expect(toolbarRule).toContain("padding: 0 20px;");
    expect(toolbarLayoutRule).toContain(
      'grid-template-areas: "context participants spacer controls";'
    );
    expect(toolbarLayoutRule).toContain("grid-template-columns:");
    expect(titleGroupRule).toContain("flex: 0 0 auto;");
    expect(titleRule).not.toContain("text-overflow: ellipsis;");
  });

  it("keeps client and partner inside one readable participant group", () => {
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
      }
    });
    const layout = findRequiredElementByClassName(view, styles.toolbarLayout);
    const participants = findRequiredElementByClassName(layout, styles.clientStrip);
    const participantPickers = findElements(participants).filter(
      (element) => element.type === ClientSearchCombobox
    );

    expect(findRequiredElementByClassName(layout, styles.contextStrip)).toBeDefined();
    expect(findRequiredElementByClassName(layout, styles.controlStrip)).toBeDefined();
    expect(participantPickers).toHaveLength(2);
    expect(elementIncludesText(participants, "+")).toBe(true);
  });

  it("moves the whole participant group between rows at content-width breakpoints", () => {
    const css = readFileSync(new URL("./NumerologyPage.module.css", import.meta.url), "utf8");
    const clientStripRule = getCssRule(css, ".clientStrip");

    expect(clientStripRule).toContain("grid-area: participants;");
    expect(clientStripRule).toContain("min-width: 352px;");
    expect(css).toContain(".clientStrip > div");
    expect(css).toContain("min-width: 156px;");
    expect(css).toContain("@container numerology-toolbar (max-width: 1040px)");
    expect(css).toContain('grid-template-areas: "context controls" "participants participants";');
    expect(css).toContain("@container numerology-toolbar (max-width: 700px)");
    expect(css).toContain('grid-template-areas: "context" "participants" "controls";');
  });

  it("matches the approved menu icons and directly visible calculation controls", () => {
    const view = NumerologyPageView({
      ...baseProps(),
      selectedResponse: response({
        source: "crm_client",
        clientId: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e"
      })
    });

    expect(findRequiredElementByType(view, NumerologyYearPicker)).toBeDefined();
    expect(getButtonIconName(view, "Совместимость")).toBe("users");
    expect(getActionMenuIconName(view, "presentation")).toBe("arrowUpRight");
    expect(getActionMenuIconName(view, "delete")).toBe("trash");
    expect(getActionMenuItem(view, "delete").tone).toBe("danger");
    expect(getActionMenuIconName(view, "pdf")).toBe("doc");
    expect(findButtonByText(renderCalculationMenu(view), "Пересчитать")).toBeDefined();
  });

  it("hides period selection in compatibility while exposing presentation", () => {
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
    expect(findElements(view).some((element) => element.type === NumerologyYearPicker)).toBe(false);
    expect(getActionMenuItem(view, "presentation")).toBeDefined();
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
    locale: "ru",
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
    selectedYear: 2027,
    isPeriodVisible: true,
    isYearPickerOpen: false,
    isPresentationOpen: false,
    selectedDetailSelector: null,
    interpretationText: "",
    errorMessage: null,
    periodErrorMessage: null,
    aiDraftErrorMessage: null,
    pdfLabel: "PDF",
    pdfDisabled: true,
    pdfTitle: "Сначала сохраните расчёт",
    pdfErrorMessage: null,
    isBusy: false,
    isPreviewPending: false,
    isCreatingAiDraft: false,
    editorState: null,
    editorErrors: [],
    archiveTarget: null,
    onSelectSubjectClient: vi.fn(),
    onSelectPartnerClient: vi.fn(),
    onSelectSaved: vi.fn(),
    onOpenCreate: vi.fn(),
    onOpenRecalculate: vi.fn(),
    onEditorFormChange: vi.fn(),
    onEditorParticipantChange: vi.fn(),
    onEditorSelectClient: vi.fn(),
    onSubmitEditor: vi.fn(),
    onCancelEditor: vi.fn(),
    onRequestArchive: vi.fn(),
    onCloseArchive: vi.fn(),
    onConfirmArchive: vi.fn(),
    onSelectDetail: vi.fn(),
    onToggleYearPicker: vi.fn(),
    onApplyYear: vi.fn(),
    onHidePeriod: vi.fn(),
    onRetryPeriod: vi.fn(),
    onToggleCompatibilityMode: vi.fn(),
    onOpenPresentation: vi.fn(),
    onClosePresentation: vi.fn(),
    onLink: vi.fn(),
    onPublish: vi.fn(),
    onInterpretationChange: vi.fn(),
    onCreateAiDraft: vi.fn(),
    onSaveInterpretation: vi.fn(),
    onApproveInterpretation: vi.fn(),
    onPdf: vi.fn()
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
      status: participant.clientId ? "linked" : "calculated",
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
      links: participant.clientId
        ? [
            {
              clientId: participant.clientId,
              visibility: "private_to_astrologer",
              linkedAt: "2026-07-06T00:00:00.000Z",
              publishedAt: null
            }
          ]
        : [],
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

function getToolbarActionMenu(root: ReactElement): ReactElement<Parameters<typeof ActionMenu>[0]> {
  return findRequiredElementByType<Parameters<typeof ActionMenu>[0]>(root, ActionMenu);
}

function getActionMenuItem(root: ReactElement, id: string): ActionMenuItem {
  const item = getToolbarActionMenu(root).props.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Action menu item not found: ${id}`);

  return item;
}

function getActionMenuIconName(root: ReactElement, id: string): string | null {
  const icon = getActionMenuItem(root, id).icon;

  return isValidElement(icon) && icon.type === Icon
    ? ((icon.props as { iconName?: string }).iconName ?? null)
    : null;
}

function findRequiredElementByType<TProps>(
  root: ReactElement,
  type: unknown
): ReactElement<TProps> {
  const result = findElements(root).find((element) => element.type === type);
  if (!result) throw new Error("Element not found");

  return result as ReactElement<TProps>;
}

function findRequiredElementByClassName(
  root: ReactElement,
  className: string | undefined
): ReactElement {
  if (!className) throw new Error("CSS module class not found");

  const result = findElements(root).find(
    (element) => (element.props as { className?: string }).className === className
  );
  if (!result) throw new Error(`Element not found for class: ${className}`);

  return result;
}

function renderCalculationMenu(root: ReactElement): ReactElement {
  const menu = findRequiredElementByType<Parameters<typeof NumerologyCalculationMenu>[0]>(
    root,
    NumerologyCalculationMenu
  );
  return NumerologyCalculationMenu(menu.props);
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
