import type { FlowResponse, FlowTemplate } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { buildFlowGalleryCard, buildFlowTemplateCard } from "./flowsVisualModel";

export type FlowGalleryProps = {
  readonly flows: readonly FlowResponse[];
  readonly templates?: readonly FlowTemplate[];
  readonly onCreateFlow?: () => void;
  readonly isCreating?: boolean;
  readonly onOpenFlow?: (flowId: string) => void;
  readonly onAutomationToggle?: (flowId: string, activate: boolean) => void;
  readonly isTogglingAutomation?: boolean;
  readonly classNames?: FlowGalleryClassNames;
};

export type FlowGalleryClassNames = Readonly<Record<string, string>>;

export function FlowGallery({
  flows,
  templates = [],
  onCreateFlow,
  isCreating = false,
  onOpenFlow,
  onAutomationToggle,
  isTogglingAutomation = false,
  classNames
}: FlowGalleryProps) {
  const cards = flows.map((flow) => ({
    card: buildFlowGalleryCard(flow),
    isAutomationActive: flow.status === "active",
    canToggleAutomation: flow.publishedVersionId !== null && ["published", "active", "paused"].includes(flow.status)
  }));
  const templateCards = templates.map(buildFlowTemplateCard);
  const className = (name: keyof FlowGalleryClassNames) => classNames?.[name] ?? "";

  return (
    <div className={className("gallery")}>
      <header className={className("galleryHeader")}>
        <div className={className("titleGroup")}>
          <span className={className("titleIcon")} aria-hidden="true">
            <Icon iconName="flow" width={18} height={18} />
          </span>
          <h1 id="flows-title" className={className("title")}>
            Воронки <span className={className("count")}>{flows.length}</span>
          </h1>
        </div>
        <button
          className={className("createButton")}
          type="button"
          onClick={onCreateFlow}
          disabled={!onCreateFlow || isCreating}
          title={onCreateFlow ? undefined : "Создание воронки будет доступно в конструкторе"}
        >
          <Icon iconName="plus" width={15} height={15} aria-hidden="true" />
          Новая воронка
        </button>
      </header>

      <div className={className("galleryGrid")} aria-label="Воронки">
        {cards.map(({ card, isAutomationActive, canToggleAutomation }) => (
          <article key={card.id} className={className("flowCard")}>
            <button
              className={className("graphPreview")}
              type="button"
              aria-label={`Открыть схему: ${card.title}`}
              onClick={() => onOpenFlow?.(card.id)}
              disabled={!onOpenFlow}
              title={onOpenFlow ? undefined : "Конструктор воронки будет доступен в следующем шаге"}
            >
              {card.pathPreview.map((nodeTitle, index) => (
                <span key={nodeTitle} className={className("graphNode")} title={nodeTitle}>
                  {index > 0 ? <span className={className("graphConnector")} aria-hidden="true" /> : null}
                  <span>{nodeTitle}</span>
                </span>
              ))}
            </button>
            <div className={className("cardBody")}>
              <div className={className("cardHeading")}>
                <h2 className={className("cardTitle")}>{card.title}</h2>
              </div>
              <div className={className("chipRow")}>
                <span className={className("statusChip")}>{card.statusLabel}</span>
                <span className={className("approvalChip")}>{card.approvalModeLabel}</span>
              </div>
            </div>
            <footer className={className("cardFooter")}>
              <dl className={className("metrics")}>
                <Metric classNames={classNames} label="В работе" value={card.metrics.activeRuns} />
                <Metric classNames={classNames} label="Ожидают" value={card.metrics.waitingApprovals} />
                <Metric classNames={classNames} label="Завершено" value={card.metrics.completedRuns} />
                <Metric classNames={classNames} label="Конверсия" value={card.metrics.conversionRate} />
              </dl>
              <button
                className={className("automationToggle")}
                type="button"
                role="switch"
                aria-checked={isAutomationActive}
                aria-label={card.automationStateLabel}
                disabled={!onAutomationToggle || !canToggleAutomation || isTogglingAutomation}
                title={canToggleAutomation ? card.automationStateLabel : "Сначала опубликуйте воронку"}
                onClick={() => onAutomationToggle?.(card.id, !isAutomationActive)}
              >
                <span aria-hidden="true" />
              </button>
            </footer>
          </article>
        ))}

        <button
          className={className("newFlowCard")}
          type="button"
          onClick={onCreateFlow}
          disabled={!onCreateFlow || isCreating}
          title={onCreateFlow ? undefined : "Создание воронки будет доступно в конструкторе"}
        >
          <Icon iconName="plus" width={26} height={26} aria-hidden="true" />
          <span>Новая воронка</span>
          <small className={className("newFlowHint")}>
            {templateCards.length > 0 ? "С нуля или из готового сценария" : "Создайте первый сценарий"}
          </small>
        </button>
      </div>
    </div>
  );
}

function Metric({
  classNames,
  label,
  value
}: {
  readonly classNames: FlowGalleryClassNames | undefined;
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
