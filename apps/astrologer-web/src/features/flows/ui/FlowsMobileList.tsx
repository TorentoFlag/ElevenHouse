import type { FlowDefinitionSummaryV2, FlowRuntimeAvailability } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { buildFlowAutomationControl } from "../model/flowRuntimePresentation";
import { buildFlowGalleryCard } from "./flowsVisualModel";

export type FlowsMobileListProps = {
  readonly flows: readonly FlowDefinitionSummaryV2[];
  readonly locale: "ru" | "en";
  readonly runtimeAvailability?: FlowRuntimeAvailability | null;
  readonly onCreateFlow?: () => void;
  readonly isCreating?: boolean;
  readonly onOpenFlow?: (flowId: string) => void;
  readonly onAutomationToggle?: (flowId: string, activate: boolean) => void;
  readonly isTogglingAutomation?: boolean;
  readonly classNames?: FlowsMobileListClassNames;
};

export type FlowsMobileListClassNames = Readonly<Record<string, string>>;

export function FlowsMobileList({
  flows,
  locale,
  runtimeAvailability = null,
  onCreateFlow,
  isCreating = false,
  onOpenFlow,
  onAutomationToggle,
  isTogglingAutomation = false,
  classNames
}: FlowsMobileListProps) {
  const cards = flows.map((flow) => ({
    card: buildFlowGalleryCard(flow, locale),
    automation: buildFlowAutomationControl(flow, runtimeAvailability, locale)
  }));
  const activeCount =
    runtimeAvailability?.executionAvailable === true
      ? flows.filter((flow) => flow.runtimeStatus === "active").length
      : 0;
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
        </button>
      </header>
      {cards.map(({ card, automation }) => (
        <article key={card.id} className={className("mobileCard")}>
          <div className={className("mobileTitleRow")}>
            <div>
              <h2 className={className("mobileTitle")}>{card.title}</h2>
              <span className={className("statusChip")}>
                {automation.statusLabel ?? card.runtimeStatusLabel}
              </span>
            </div>
            <button
              className={className("automationToggle")}
              type="button"
              role="switch"
              aria-checked={automation.checked}
              aria-label={automation.accessibleLabel}
              disabled={!onAutomationToggle || !automation.canToggle || isTogglingAutomation}
              title={automation.title}
              onClick={() => {
                if (automation.canToggle) onAutomationToggle?.(card.id, automation.nextActive);
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
              value={card.migrationRequired ? copy.migration : card.definitionStateLabel}
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
    create: "Создать воронку",
    open: "Открыть схему",
    schema: "Схема",
    revision: "Редакция",
    version: "Версия",
    state: "Состояние",
    migration: "Миграция"
  },
  en: {
    title: "Flows",
    count: "Flows",
    active: "active",
    create: "Create flow",
    open: "Open flow",
    schema: "Graph",
    revision: "Revision",
    version: "Version",
    state: "State",
    migration: "Migration"
  }
} as const;
