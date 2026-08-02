import type { FlowResponse, FlowRuntimeAvailability } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { buildFlowAutomationControl } from "../model/flowRuntimePresentation";
import { buildFlowGalleryCard } from "./flowsVisualModel";

export type FlowsMobileListProps = {
  readonly flows: readonly FlowResponse[];
  readonly runtimeAvailability?: FlowRuntimeAvailability | null;
  readonly onOpenFlow?: (flowId: string) => void;
  readonly onAutomationToggle?: (flowId: string, activate: boolean) => void;
  readonly isTogglingAutomation?: boolean;
  readonly classNames?: FlowsMobileListClassNames;
};

export type FlowsMobileListClassNames = Readonly<Record<string, string>>;

export function FlowsMobileList({
  flows,
  runtimeAvailability = null,
  onOpenFlow,
  onAutomationToggle,
  isTogglingAutomation = false,
  classNames
}: FlowsMobileListProps) {
  const cards = flows.map((flow) => ({
    card: buildFlowGalleryCard(flow),
    automation: buildFlowAutomationControl(flow, runtimeAvailability)
  }));
  const className = (name: keyof FlowsMobileListClassNames) => classNames?.[name] ?? "";

  return (
    <div className={className("mobileList")}>
      <header className={className("mobileHeader")}>
        <h1 id="flows-mobile-title" className={className("title")}>
          Воронки <span className={className("count")}>{flows.length}</span>
        </h1>
      </header>
      {cards.map(({ card, automation }) => (
        <article key={card.id} className={className("mobileCard")}>
          <div className={className("mobileTitleRow")}>
            <div>
              <h2 className={className("mobileTitle")}>{card.title}</h2>
              <span className={className("statusChip")}>
                {automation.statusLabel ?? card.statusLabel}
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
                if (automation.canToggle) {
                  onAutomationToggle?.(card.id, automation.nextActive);
                }
              }}
            >
              <span aria-hidden="true" />
            </button>
          </div>
          <dl className={className("mobileMetrics")}>
            <MobileMetric classNames={classNames} label="В работе" value={card.metrics.activeRuns} />
            <MobileMetric classNames={classNames} label="Ожидают" value={card.metrics.waitingApprovals} />
            <MobileMetric classNames={classNames} label="Завершено" value={card.metrics.completedRuns} />
            <MobileMetric classNames={classNames} label="Конверсия" value={card.metrics.conversionRate} />
          </dl>
          <button
            className={className("mobileOpenButton")}
            type="button"
            onClick={() => onOpenFlow?.(card.id)}
            disabled={!onOpenFlow}
            title={onOpenFlow ? undefined : "Конструктор воронки будет доступен в следующем шаге"}
          >
            <Icon iconName="flow" width={15} height={15} aria-hidden="true" />
            Открыть схему
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
  readonly value: number | null;
}) {
  return (
    <div className={classNames?.metric ?? ""}>
      <dt>{label}</dt>
      <dd className={classNames?.metricValue ?? ""}>{value ?? "-"}</dd>
    </div>
  );
}
