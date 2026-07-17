export type NumerologyToolbarActionId = "presentation" | "link" | "delete" | "pdf";

export type NumerologyToolbarAction = {
  readonly id: NumerologyToolbarActionId;
  readonly label: string;
  readonly iconName: "arrowUpRight" | "pin" | "trash" | "doc";
  readonly tone: "default" | "danger";
  readonly disabled: boolean;
  readonly description: string | null;
};

export type NumerologyToolbarActionsInput = {
  readonly hasResult: boolean;
  readonly isBusy: boolean;
  readonly isCalculationLinked: boolean;
  readonly linkDisabled: boolean;
  readonly hasLinkableClient: boolean;
  readonly pdfLabel: string;
  readonly pdfDisabled: boolean;
  readonly pdfTitle: string;
};

export function buildNumerologyToolbarActions(
  input: NumerologyToolbarActionsInput
): readonly NumerologyToolbarAction[] {
  return [
    {
      id: "presentation",
      label: "Открыть презентацию",
      iconName: "arrowUpRight",
      tone: "default",
      disabled: !input.hasResult,
      description: input.hasResult ? null : "Сначала выберите клиента"
    },
    buildLinkAction(input),
    {
      id: "pdf",
      label: getPdfMenuLabel(input.pdfLabel, input.pdfTitle),
      iconName: "doc",
      tone: "default",
      disabled: input.pdfDisabled,
      description: input.pdfDisabled ? input.pdfTitle : null
    }
  ];
}

function buildLinkAction(input: NumerologyToolbarActionsInput): NumerologyToolbarAction {
  if (input.isCalculationLinked) {
    return {
      id: "delete",
      label: "Удалить расчёт",
      iconName: "trash",
      tone: "danger",
      disabled: input.isBusy,
      description: input.isBusy ? "Действие выполняется" : null
    };
  }

  return {
    id: "link",
    label: "Привязать к клиенту",
    iconName: "pin",
    tone: "default",
    disabled: input.linkDisabled,
    description: getLinkDisabledReason(input)
  };
}

function getLinkDisabledReason(input: NumerologyToolbarActionsInput): string | null {
  if (!input.linkDisabled) return null;
  if (input.isBusy) return "Действие выполняется";
  if (!input.hasLinkableClient) return "Нужен CRM-участник";
  return "Сначала сохраните расчёт";
}

function getPdfMenuLabel(label: string, title: string): string {
  if (title === "Сформировать PDF" || title === "Повторить формирование PDF") {
    return title;
  }

  if (label === "PDF" && title === "Сначала сохраните расчёт") {
    return "Скачать PDF";
  }

  return label;
}
