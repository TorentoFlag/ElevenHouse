import type { FlowDefinitionSummary } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { summarizeFlowDefinitions } from "../model/flowDisplay";
import { buildFlowAutomationControl } from "../model/flowRuntimePresentation";
import type { FlowDefinitionLifecycleAction } from "./FlowGallery";
import { FlowGraphPreview } from "./FlowGraphPreview";
import { buildFlowGalleryCard } from "./flowsVisualModel";

export type FlowsMobileListProps = {
  readonly flows: readonly FlowDefinitionSummary[];
  readonly locale: "ru" | "en";
  readonly onCreateFlow?: () => void;
  readonly isCreating?: boolean;
  readonly emptyMessage?: string;
  readonly onOpenFlow?: (flowId: string) => void;
  readonly onAutomationAction?: (
    flowId: string,
    action: "review_activation" | "pause_enrollment"
  ) => void;
  readonly onLifecycleAction?: (flowId: string, action: FlowDefinitionLifecycleAction) => void;
  readonly isTogglingAutomation?: boolean;
  readonly isLifecycleActionPending?: boolean;
  readonly classNames?: FlowsMobileListClassNames;
};

export type FlowsMobileListClassNames = Readonly<Record<string, string>>;

export function FlowsMobileList({
  flows,
  locale,
  onCreateFlow,
  isCreating = false,
  emptyMessage,
  onOpenFlow,
  onAutomationAction,
  onLifecycleAction,
  isTogglingAutomation = false,
  isLifecycleActionPending = false,
  classNames
}: FlowsMobileListProps) {
  const cards = flows.map((flow) => ({
    flow,
    card: buildFlowGalleryCard(flow, locale),
    automation: buildFlowAutomationControl(flow, locale)
  }));
  const activeCount = summarizeFlowDefinitions(flows).active;
  const className = (name: keyof FlowsMobileListClassNames) => classNames?.[name] ?? "";
  const copy = mobileCopy[locale];

  return (
    <div className={className("mobileList")}>
      <header className={className("mobileHeader")}>
        <div>
          <h1 id="flows-mobile-title" className={className("title")}>
            {copy.title}
          </h1>
          <p className={className("state")}>
            <span>
              {copy.count}: {flows.length}
            </span>
            {activeCount > 0 ? (
              <span>
                {" "}
                · {copy.active} {activeCount}
              </span>
            ) : null}
          </p>
        </div>
        <button
          className={className("createButton")}
          type="button"
          aria-label={copy.create}
          onClick={onCreateFlow}
          disabled={!onCreateFlow || isCreating}
        >
          <Icon iconName="plus" width={18} height={18} aria-hidden="true" />
          <span>{copy.create}</span>
        </button>
      </header>
      {cards.length === 0 && emptyMessage ? (
        <p className={className("emptyState")} role="status">
          {emptyMessage}
        </p>
      ) : null}
      {cards.map(({ flow, card, automation }) => (
        <article key={card.id} className={className("mobileCard")}>
          <button
            className={className("mobileCardOpenButton")}
            type="button"
            aria-label={copy.open}
            onClick={() => onOpenFlow?.(card.id)}
            disabled={!onOpenFlow}
          />
          {card.graphNodeKinds.length > 0 ? (
            <div className={className("mobileGraphPreview")} aria-label={copy.graphPreview}>
              <FlowGraphPreview
                nodeKinds={card.graphNodeKinds}
                locale={locale}
                classNames={{
                  node: className("graphNode"),
                  connector: className("graphConnector"),
                  overflow: className("graphOverflow")
                }}
              />
            </div>
          ) : null}
          <div className={className("cardBody")}>
            <div className={className("mobileTitleRow")}>
              <h2 className={className("mobileTitle")}>{card.title}</h2>
              <span className={className("approvalChip")}>{card.approvalModeLabel}</span>
            </div>
            {card.graphSummary ? (
              <p className={className("graphSummary")}>{card.graphSummary}</p>
            ) : null}
            <p className={className("cardMeta")}>
              <span>{card.updatedAtLabel}</span>
              <span>{card.draftChangesLabel}</span>
            </p>
          </div>
          <footer className={className("cardFooter")}>
            <dl className={className("mobileMetrics")}>
              <MobileMetric
                classNames={classNames}
                label={copy.state}
                value={card.definitionStateLabel}
              />
              <MobileMetric
                classNames={classNames}
                label={copy.version}
                value={card.publishedVersionLabel}
              />
              <MobileMetric
                classNames={classNames}
                label={copy.clientsInside}
                value={String(card.activeRunCountLabel.replace(`${copy.clientsInside}: `, ""))}
              />
            </dl>
            <button
              className={className("automationToggle")}
              type="button"
              role="switch"
              aria-checked={automation.checked}
              aria-label={automation.accessibleLabel}
              disabled={!onAutomationAction || !automation.canToggle || isTogglingAutomation}
              title={automation.title}
              onClick={() => {
                if (automation.canToggle && automation.nextAction !== "none") {
                  onAutomationAction?.(card.id, automation.nextAction);
                }
              }}
            >
              <span className={className("automationToggleKnob")} aria-hidden="true" />
              <span className={className("automationToggleLabel")}>
                {card.automationControlLabel}
              </span>
            </button>
          </footer>
          <div className={className("cardActions")} aria-label={`${copy.actions}: ${card.title}`}>
            {mobileLifecycleActions(flow, automation.checked, copy).map((action) => (
              <button
                key={action.action}
                className={className("cardActionButton")}
                type="button"
                disabled={!onLifecycleAction || isLifecycleActionPending || action.disabled}
                onClick={() => onLifecycleAction?.(card.id, action.action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function mobileLifecycleActions(
  flow: FlowDefinitionSummary,
  automationChecked: boolean,
  copy: (typeof mobileCopy)[keyof typeof mobileCopy]
): ReadonlyArray<{
  readonly action: FlowDefinitionLifecycleAction;
  readonly label: string;
  readonly disabled: boolean;
}> {
  return [
    flow.state === "archived"
      ? { action: "restore", label: copy.restore, disabled: false }
      : { action: "archive", label: copy.archive, disabled: automationChecked },
    { action: "duplicate", label: copy.duplicate, disabled: false },
    { action: "delete", label: copy.delete, disabled: automationChecked }
  ];
}

function MobileMetric({
  classNames,
  label,
  value
}: {
  readonly classNames: FlowsMobileListClassNames | undefined;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className={classNames?.metric ?? ""}>
      <dt>{label}</dt>
      <dd className={classNames?.metricValue ?? ""} title={value}>
        {value}
      </dd>
    </div>
  );
}

const mobileCopy = {
  ru: {
    title: "Воронки",
    count: "Воронок",
    active: "активны",
    create: "Новая воронка",
    open: "Открыть схему",
    graphPreview: "Предпросмотр схемы",
    revision: "Редакция",
    version: "Версия",
    state: "Состояние",
    clientsInside: "Клиентов внутри",
    actions: "Действия",
    archived: "Архив",
    archive: "В архив",
    restore: "Вернуть",
    duplicate: "Дублировать",
    delete: "Удалить"
  },
  en: {
    title: "Flows",
    count: "Flows",
    active: "active",
    create: "New flow",
    open: "Open flow",
    graphPreview: "Graph preview",
    revision: "Revision",
    version: "Version",
    state: "State",
    clientsInside: "Clients inside",
    actions: "Actions",
    archived: "Archived",
    archive: "Archive",
    restore: "Restore",
    duplicate: "Duplicate",
    delete: "Delete"
  }
} as const;
