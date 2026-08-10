import type { FlowDefinitionSummary } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { summarizeFlowDefinitions } from "../model/flowDisplay";
import { buildFlowAutomationControl } from "../model/flowRuntimePresentation";
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
  readonly isTogglingAutomation?: boolean;
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
  isTogglingAutomation = false,
  classNames
}: FlowsMobileListProps) {
  const cards = flows.map((flow) => ({
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
      {cards.map(({ card, automation }) => (
        <article key={card.id} className={className("mobileCard")}>
          <div className={className("mobileTitleRow")}>
            <div>
              <h2 className={className("mobileTitle")}>{card.title}</h2>
              <span className={className("statusChip")}>
                {automation.statusLabel ?? card.automationStatusLabel}
              </span>
            </div>
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
              <span aria-hidden="true" />
            </button>
          </div>
          <dl className={className("mobileMetrics")}>
            <MobileMetric
              classNames={classNames}
              label={copy.schema}
              value={card.graphSchemaLabel}
            />
            <MobileMetric
              classNames={classNames}
              label={copy.revision}
              value={card.revisionLabel}
            />
            <MobileMetric
              classNames={classNames}
              label={copy.version}
              value={card.publishedVersionLabel}
            />
            <MobileMetric
              classNames={classNames}
              label={copy.state}
              value={card.definitionStateLabel}
            />
          </dl>
          <button
            className={className("mobileOpenButton")}
            type="button"
            onClick={() => onOpenFlow?.(card.id)}
            disabled={!onOpenFlow}
          >
            <Icon iconName="flow" width={15} height={15} aria-hidden="true" />
            {copy.open}
          </button>
        </article>
      ))}
    </div>
  );
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
      <dd className={classNames?.metricValue ?? ""}>{value}</dd>
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
    schema: "Схема",
    revision: "Редакция",
    version: "Версия",
    state: "Состояние"
  },
  en: {
    title: "Flows",
    count: "Flows",
    active: "active",
    create: "New flow",
    open: "Open flow",
    schema: "Graph",
    revision: "Revision",
    version: "Version",
    state: "State"
  }
} as const;
