import type { FlowDefinitionSummary } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { buildFlowAutomationControl } from "../model/flowRuntimePresentation";
import { FlowGraphPreview } from "./FlowGraphPreview";
import { buildFlowGalleryCard } from "./flowsVisualModel";

export type FlowGalleryProps = {
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
  readonly classNames?: FlowGalleryClassNames;
};

export type FlowGalleryClassNames = Readonly<Record<string, string>>;

export function FlowGallery({
  flows,
  locale,
  onCreateFlow,
  isCreating = false,
  emptyMessage,
  onOpenFlow,
  onAutomationAction,
  isTogglingAutomation = false,
  classNames
}: FlowGalleryProps) {
  const cards = flows.map((flow) => ({
    card: buildFlowGalleryCard(flow, locale),
    automation: buildFlowAutomationControl(flow, locale)
  }));
  const className = (name: keyof FlowGalleryClassNames) => classNames?.[name] ?? "";
  const copy = galleryCopy[locale];

  return (
    <div className={className("gallery")}>
      <header className={className("galleryHeader")}>
        <div className={className("titleGroup")}>
          <span className={className("titleIcon")} aria-hidden="true">
            <Icon iconName="flow" width={18} height={18} />
          </span>
          <h1 id="flows-title" className={className("title")}>
            {copy.title} <span className={className("count")}>{flows.length}</span>
          </h1>
        </div>
        <button
          className={className("createButton")}
          type="button"
          onClick={onCreateFlow}
          disabled={!onCreateFlow || isCreating}
        >
          <Icon iconName="plus" width={15} height={15} aria-hidden="true" />
          {copy.create}
        </button>
      </header>

      <div className={className("galleryGrid")} aria-label={copy.title}>
        {cards.length === 0 && emptyMessage ? (
          <p className={className("emptyState")} role="status">
            {emptyMessage}
          </p>
        ) : null}
        {cards.map(({ card, automation }) => (
          <article key={card.id} className={className("flowCard")}>
            <button
              className={className("cardOpenButton")}
              type="button"
              aria-label={`${copy.open}: ${card.title}`}
              onClick={() => onOpenFlow?.(card.id)}
              disabled={!onOpenFlow}
            />
            <div className={className("graphPreview")}>
              {card.graphNodeKinds.length > 0 ? (
                <FlowGraphPreview
                  nodeKinds={card.graphNodeKinds}
                  locale={locale}
                  classNames={{
                    node: className("graphNode"),
                    connector: className("graphConnector"),
                    overflow: className("graphOverflow")
                  }}
                />
              ) : (
                <>
                  <span className={className("graphNode")}>{card.graphSchemaLabel}</span>
                  <span className={className("graphNode")}>{card.originLabel}</span>
                </>
              )}
            </div>
            <div className={className("cardBody")}>
              <div className={className("cardHeading")}>
                <h2 className={className("cardTitle")}>{card.title}</h2>
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
              <dl className={className("metrics")}>
                <Metric
                  classNames={classNames}
                  label={copy.definition}
                  value={card.definitionStateLabel}
                />
                <Metric
                  classNames={classNames}
                  label={copy.version}
                  value={card.publishedVersionLabel}
                />
                <Metric
                  classNames={classNames}
                  label={copy.clientsInside}
                  value={String(card.activeRunCountLabel.replace(`${copy.clientsInside}: `, ""))}
                />
              </dl>
              <AutomationToggle
                automation={automation}
                disabled={!onAutomationAction || !automation.canToggle || isTogglingAutomation}
                onToggle={() => {
                  if (automation.nextAction !== "none") {
                    onAutomationAction?.(card.id, automation.nextAction);
                  }
                }}
                className={className("automationToggle")}
                labelClassName={className("automationToggleLabel")}
                knobClassName={className("automationToggleKnob")}
                statusLabel={card.automationControlLabel}
              />
            </footer>
          </article>
        ))}

        <button
          className={className("newFlowCard")}
          type="button"
          onClick={onCreateFlow}
          disabled={!onCreateFlow || isCreating}
          aria-label={copy.create}
        >
          <Icon iconName="plus" width={26} height={26} aria-hidden="true" />
          <span>{copy.create}</span>
          <small className={className("newFlowHint")}>{copy.createHint}</small>
        </button>
      </div>
    </div>
  );
}

function AutomationToggle({
  automation,
  disabled,
  onToggle,
  className,
  labelClassName,
  knobClassName,
  statusLabel
}: {
  readonly automation: ReturnType<typeof buildFlowAutomationControl>;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly className: string;
  readonly labelClassName: string;
  readonly knobClassName: string;
  readonly statusLabel: string;
}) {
  return (
    <button
      className={className}
      type="button"
      role="switch"
      aria-checked={automation.checked}
      aria-label={automation.accessibleLabel}
      disabled={disabled}
      title={automation.title}
      onClick={() => {
        if (automation.canToggle) onToggle();
      }}
    >
      <span className={knobClassName} aria-hidden="true" />
      <span className={labelClassName}>{statusLabel}</span>
    </button>
  );
}

function Metric({
  classNames,
  label,
  value
}: {
  readonly classNames: FlowGalleryClassNames | undefined;
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

const galleryCopy = {
  ru: {
    title: "Воронки",
    create: "Новая воронка",
    open: "Открыть схему",
    createHint: "С нуля или из доступного сценария",
    definition: "Состояние",
    revision: "Редакция",
    version: "Версия",
    clientsInside: "Клиентов внутри"
  },
  en: {
    title: "Flows",
    create: "New flow",
    open: "Open flow",
    createHint: "Start blank or use an available template",
    definition: "Definition",
    revision: "Revision",
    version: "Version",
    clientsInside: "Clients inside"
  }
} as const;
