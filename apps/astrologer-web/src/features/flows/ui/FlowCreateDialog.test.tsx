// @vitest-environment jsdom

import type { FlowDefinitionTemplateDescriptorV2 } from "@elevenhouse/contracts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowCreateDialog, type FlowCreateDialogProps } from "./FlowCreateDialog";

const availableTemplate = {
  schemaVersion: "flow-definition-template.v2",
  key: "manual-consultation-preparation",
  version: 1,
  name: "Подготовка консультации вручную",
  description: "Создать внутреннюю задачу подготовки и завершить её вручную.",
  category: "service_delivery",
  availability: "available",
  recommendedApprovalMode: "manual_approve",
  parameters: [],
  requiredCapabilities: [],
  blockerCode: null
} satisfies FlowDefinitionTemplateDescriptorV2;

const unavailableTemplate = {
  ...availableTemplate,
  key: "post-session-follow-up",
  name: "Сопровождение после сессии",
  description: "Отправить материалы клиенту после консультации.",
  category: "retention",
  availability: "unavailable",
  requiredCapabilities: ["messaging", "consent"],
  blockerCode: "FLOW_TEMPLATE_CAPABILITY_UNAVAILABLE"
} satisfies FlowDefinitionTemplateDescriptorV2;

const defaultProps = {
  templates: [availableTemplate, unavailableTemplate],
  locale: "ru",
  open: true,
  pending: false,
  onClose: vi.fn(),
  onCreateTemplate: vi.fn(),
  onCreateBlank: vi.fn()
} satisfies FlowCreateDialogProps;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FlowCreateDialog", () => {
  it("is absent from the DOM and accessibility tree while closed", () => {
    render(<FlowCreateDialog {...defaultProps} open={false} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(availableTemplate.name)).toBeNull();
  });

  it("renders an accessible Russian dialog and closes from the required close button", () => {
    const onClose = vi.fn();
    render(<FlowCreateDialog {...defaultProps} onClose={onClose} />);

    const dialog = screen.getByRole("dialog", { name: "Новый сценарий" });

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(
      within(dialog).getByText("Выберите готовый сценарий или начните с пустого.")
    ).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Готовые сценарии" })).toBeTruthy();
    expect(within(dialog).queryByText(/собрать с AI/i)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("owns keyboard focus, traps tab navigation and closes with Escape or backdrop", () => {
    const onClose = vi.fn();
    const { rerender } = render(<FlowCreateDialog {...defaultProps} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Новый сценарий" });
    const closeButton = within(dialog).getByRole("button", { name: "Закрыть" });
    const blankButton = within(dialog).getByRole("button", {
      name: "Начать с пустого сценария"
    });

    expect(document.activeElement).toBe(closeButton);
    blankButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
    closeButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(blankButton);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(<FlowCreateDialog {...defaultProps} open={false} onClose={onClose} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("creates from an available server template and passes the complete descriptor", () => {
    const onCreateTemplate = vi.fn();
    render(<FlowCreateDialog {...defaultProps} onCreateTemplate={onCreateTemplate} />);

    const button = screen.getByRole("button", { name: new RegExp(availableTemplate.name) });

    expect(button).toHaveProperty("disabled", false);
    fireEvent.click(button);
    expect(onCreateTemplate).toHaveBeenCalledWith(availableTemplate, {});
  });

  it("keeps unavailable templates visible, disabled and honestly explained", () => {
    const onCreateTemplate = vi.fn();
    render(<FlowCreateDialog {...defaultProps} onCreateTemplate={onCreateTemplate} />);

    const unavailableButton = screen.getByRole("button", {
      name: new RegExp(unavailableTemplate.name)
    });

    expect(unavailableButton).toHaveProperty("disabled", true);
    expect(
      within(unavailableButton).getByText("Необходимые возможности пока недоступны.")
    ).toBeTruthy();

    fireEvent.click(unavailableButton);
    expect(onCreateTemplate).not.toHaveBeenCalled();
  });

  it("offers an active secondary blank-flow action", () => {
    const onCreateBlank = vi.fn();
    render(<FlowCreateDialog {...defaultProps} onCreateBlank={onCreateBlank} />);

    const blankButton = screen.getByRole("button", { name: "Начать с пустого сценария" });

    expect(blankButton).toHaveProperty("disabled", false);
    fireEvent.click(blankButton);
    expect(onCreateBlank).toHaveBeenCalledOnce();
  });

  it("localizes the dialog shell, controls and blocker reasons in English", () => {
    const englishAvailable = {
      ...availableTemplate,
      name: "Manual consultation preparation",
      description: "Create an internal preparation task and complete it manually."
    } satisfies FlowDefinitionTemplateDescriptorV2;
    const englishUnavailable = {
      ...unavailableTemplate,
      name: "Post-session follow-up",
      description: "Send materials to the client after the consultation."
    } satisfies FlowDefinitionTemplateDescriptorV2;

    render(
      <FlowCreateDialog
        {...defaultProps}
        locale="en"
        templates={[englishAvailable, englishUnavailable]}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "New flow" });

    expect(within(dialog).getByText("Choose a ready-made flow or start from blank.")).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Ready-made flows" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Start with a blank flow" })).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /Post-session follow-up/ })).getByText(
        "Required capabilities are not available yet."
      )
    ).toBeTruthy();
  });

  it("shows an integration notice and recommendation for an available requested template", () => {
    render(<FlowCreateDialog {...defaultProps} requestedTemplateKey={availableTemplate.key} />);

    expect(screen.getByRole("status").textContent).toContain(
      `Интеграция рекомендует сценарий «${availableTemplate.name}».`
    );
    expect(
      within(screen.getByRole("button", { name: new RegExp(availableTemplate.name) })).getByText(
        "Рекомендовано интеграцией"
      )
    ).toBeTruthy();
  });

  it("does not report a requested template missing while the catalog is loading", () => {
    render(
      <FlowCreateDialog
        {...defaultProps}
        templates={[]}
        loading
        requestedTemplateKey="handoff-template"
      />
    );

    expect(screen.getByRole("status").textContent).toContain("Загружаем каталог сценариев");
    expect(screen.queryByText(/отсутствует в текущем каталоге/)).toBeNull();
    expect(screen.getByRole("button", { name: "Начать с пустого сценария" })).toHaveProperty(
      "disabled",
      false
    );
  });

  it("keeps a catalog failure and retry command inside the modal", () => {
    const onRetry = vi.fn();
    render(
      <FlowCreateDialog
        {...defaultProps}
        templates={[]}
        error={new Error("Каталог временно недоступен")}
        onRetry={onRetry}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert").textContent).toContain("Каталог временно недоступен");
    fireEvent.click(within(dialog).getByRole("button", { name: "Повторить загрузку" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("explains that an unavailable integration-requested flow cannot be created", () => {
    render(
      <FlowCreateDialog
        {...defaultProps}
        locale="en"
        templates={[
          {
            ...unavailableTemplate,
            name: "Post-session follow-up",
            description: "Send materials after the consultation."
          }
        ]}
        requestedTemplateKey={unavailableTemplate.key}
      />
    );

    expect(screen.getByRole("status").textContent).toContain(
      "The integration-requested flow “Post-session follow-up” cannot be created yet."
    );
  });

  it("disables create actions while a request is pending without trapping the close command", () => {
    render(<FlowCreateDialog {...defaultProps} pending />);

    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: new RegExp(availableTemplate.name) })).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("button", { name: "Начать с пустого сценария" })).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("button", { name: "Закрыть" })).toHaveProperty("disabled", false);
  });

  it("fails closed when the server tariff entitlement does not permit funnel creation", () => {
    render(<FlowCreateDialog {...defaultProps} creationAllowed={false} />);

    expect(screen.getByText("Текущий тариф не позволяет создавать воронки.")).toBeTruthy();
    expect(screen.getByRole("button", { name: new RegExp(availableTemplate.name) })).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("button", { name: "Начать с пустого сценария" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("applies every stable class-name hook to its corresponding element", () => {
    const classNames = {
      createDialogBackdrop: "backdrop-hook",
      createDialog: "dialog-hook",
      createDialogHeader: "header-hook",
      createDialogClose: "close-hook",
      createDialogIntro: "intro-hook",
      createDialogNotice: "notice-hook",
      createDialogSection: "section-hook",
      createDialogList: "list-hook",
      createDialogTemplate: "template-hook",
      createDialogTemplateIcon: "icon-hook",
      createDialogTemplateCopy: "copy-hook",
      createDialogTemplateMeta: "meta-hook",
      createDialogBlank: "blank-hook"
    } as const;

    const { container } = render(
      <FlowCreateDialog
        {...defaultProps}
        templates={[availableTemplate]}
        requestedTemplateKey={availableTemplate.key}
        classNames={classNames}
      />
    );

    for (const className of Object.values(classNames)) {
      expect(container.querySelector(`.${className}`)).not.toBeNull();
    }
  });
});
