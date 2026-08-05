import type { FlowWorkItem, FlowWorkItemStatus } from "@elevenhouse/contracts";

export type FlowWorkItemPresentationLocale = "ru" | "en";
export type FlowWorkItemPrimaryAction = "start" | "complete" | "resume" | "none";
export type FlowWorkItemSecondaryAction = "snooze" | "none";
export type FlowWorkItemDueState = "none" | "scheduled" | "overdue";

export type FlowWorkItemPresentation = {
  readonly statusLabel: string;
  readonly priorityLabel: string;
  readonly dueState: FlowWorkItemDueState;
  readonly dueLabel: string | null;
  readonly snoozeLabel: string | null;
  readonly primaryAction: FlowWorkItemPrimaryAction;
  readonly secondaryAction: FlowWorkItemSecondaryAction;
  readonly readOnly: boolean;
};

export function buildFlowWorkItemPresentation(input: {
  readonly workItem: FlowWorkItem;
  readonly locale: FlowWorkItemPresentationLocale;
  readonly timeZone: string;
  readonly now: Date;
}): FlowWorkItemPresentation {
  const copy = workItemCopy[input.locale];
  const formatter = createDateTimeFormatter(input.locale, input.timeZone);
  const readOnly = isTerminalStatus(input.workItem.status);
  const due = presentDueAt(input.workItem, input.now, formatter, copy);
  const snoozeLabel = presentSnooze(input.workItem, input.now, formatter, copy);

  return {
    statusLabel: copy.status[input.workItem.status],
    priorityLabel: copy.priority[input.workItem.priority],
    dueState: due.state,
    dueLabel: due.label,
    snoozeLabel,
    primaryAction: primaryAction(input.workItem, input.now),
    secondaryAction: readOnly ? "none" : "snooze",
    readOnly
  };
}

function primaryAction(workItem: FlowWorkItem, now: Date): FlowWorkItemPrimaryAction {
  if (workItem.status === "pending") return "start";
  if (workItem.status === "in_progress") return "complete";
  if (
    workItem.status === "snoozed" &&
    workItem.snoozedUntil !== null &&
    Date.parse(workItem.snoozedUntil) <= now.getTime()
  ) {
    return "resume";
  }
  return "none";
}

function presentDueAt(
  workItem: FlowWorkItem,
  now: Date,
  formatter: Intl.DateTimeFormat,
  copy: (typeof workItemCopy)[FlowWorkItemPresentationLocale]
): { readonly state: FlowWorkItemDueState; readonly label: string | null } {
  if (workItem.dueAt === null) return { state: "none", label: null };

  const formatted = formatter.format(new Date(workItem.dueAt));
  if (!isTerminalStatus(workItem.status) && Date.parse(workItem.dueAt) < now.getTime()) {
    return { state: "overdue", label: `${copy.overdue}: ${formatted}` };
  }
  return { state: "scheduled", label: `${copy.due}: ${formatted}` };
}

function presentSnooze(
  workItem: FlowWorkItem,
  now: Date,
  formatter: Intl.DateTimeFormat,
  copy: (typeof workItemCopy)[FlowWorkItemPresentationLocale]
): string | null {
  if (workItem.status !== "snoozed" || workItem.snoozedUntil === null) return null;
  if (Date.parse(workItem.snoozedUntil) <= now.getTime()) return copy.canResume;
  return `${copy.until} ${formatter.format(new Date(workItem.snoozedUntil))}`;
}

function createDateTimeFormatter(
  locale: FlowWorkItemPresentationLocale,
  timeZone: string
): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone
    });
  } catch {
    throw new TypeError("A valid IANA timezone is required to present flow work items");
  }
}

function isTerminalStatus(status: FlowWorkItemStatus): boolean {
  return status === "completed" || status === "expired" || status === "canceled";
}

const workItemCopy = {
  ru: {
    status: {
      pending: "К выполнению",
      in_progress: "В работе",
      snoozed: "Отложено",
      completed: "Завершено",
      expired: "Срок истёк",
      canceled: "Отменено"
    },
    priority: {
      low: "Низкий",
      normal: "Обычный",
      high: "Высокий",
      urgent: "Срочный"
    },
    due: "Срок",
    overdue: "Просрочено",
    until: "До",
    canResume: "Можно продолжить"
  },
  en: {
    status: {
      pending: "To do",
      in_progress: "In progress",
      snoozed: "Snoozed",
      completed: "Completed",
      expired: "Expired",
      canceled: "Canceled"
    },
    priority: {
      low: "Low",
      normal: "Normal",
      high: "High",
      urgent: "Urgent"
    },
    due: "Due",
    overdue: "Overdue",
    until: "Until",
    canResume: "Ready to resume"
  }
} as const;
