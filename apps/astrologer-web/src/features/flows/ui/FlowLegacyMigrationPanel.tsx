import type { FlowDefinitionDetailV2, FlowDefinitionMigrationIssue } from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";

type LegacyFlowDefinitionDetail = Extract<
  FlowDefinitionDetailV2,
  { graphSchemaVersion: "flow-graph.v1" }
>;

export type FlowLegacyMigrationPanelProps = {
  readonly flow: LegacyFlowDefinitionDetail;
  readonly locale: "ru" | "en";
  readonly onBack: () => void;
  readonly onMigrate: (flowId: string, expectedRevision: number) => void;
  readonly onExport?: (flow: LegacyFlowDefinitionDetail) => void;
  readonly pending?: boolean;
  readonly error?: Error | null;
  readonly issues?: readonly FlowDefinitionMigrationIssue[];
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowLegacyMigrationPanel({
  flow,
  locale,
  onBack,
  onMigrate,
  onExport,
  pending = false,
  error = null,
  issues = [],
  classNames
}: FlowLegacyMigrationPanelProps) {
  const copy = migrationCopy[locale];
  const canMigrate = flow.state !== "archived";

  return (
    <section className={`${classNames?.page ?? ""} ${classNames?.builderPage ?? ""}`.trim()}>
      <header className={classNames?.builderHeader ?? ""}>
        <button className={classNames?.builderBackButton ?? ""} type="button" onClick={onBack}>
          {copy.back}
        </button>
        <div className={classNames?.builderTitleGroup ?? ""}>
          <p>
            Legacy V1 · {copy.revision} {flow.revision}
          </p>
          <h1>{flow.name}</h1>
        </div>
      </header>
      <div className={classNames?.legacyMigrationPanel ?? ""}>
        <div className={classNames?.legacyMigrationCopy ?? ""}>
          <span className={classNames?.statusChip ?? ""}>{copy.readOnly}</span>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
          {flow.latestPublishedVersion ? (
            <p>
              {copy.publishedVersion} {flow.latestPublishedVersion}. {copy.historyPreserved}
            </p>
          ) : null}
          {!canMigrate ? <p role="status">{copy.archived}</p> : null}
          {error ? (
            <p role="alert" className={classNames?.error ?? ""}>
              {error.message}
            </p>
          ) : null}
          {issues.length > 0 ? (
            <section
              className={classNames?.legacyMigrationIssues ?? ""}
              role="alert"
              aria-label={copy.migrationIssues}
            >
              <h3>{copy.migrationIssues}</h3>
              <ul>
                {issues.map((issue) => (
                  <li key={`${issue.code}:${issue.path}`}>
                    <p>{migrationIssueMessage(issue, locale)}</p>
                    <code>
                      {issue.code} · {issue.path}
                    </code>
                    {locale === "ru" ? <small>{issue.message}</small> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className={classNames?.legacyGraph ?? ""} aria-labelledby="legacy-v1-nodes">
            <h3 id="legacy-v1-nodes">{copy.nodes}</h3>
            <ul className={classNames?.legacyGraphList ?? ""}>
              {flow.draftGraph.nodes.map((node) => (
                <li key={node.id}>
                  <strong>{node.title}</strong>
                  <span>
                    {node.category} · {node.kind}
                  </span>
                  <code>{node.id}</code>
                  <details className={classNames?.legacyNodeRaw ?? ""}>
                    <summary>{copy.sourceNodePayload}</summary>
                    <pre>{JSON.stringify(node, null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ul>
            <h3>{copy.edges}</h3>
            {flow.draftGraph.edges.length === 0 ? (
              <p>{copy.noEdges}</p>
            ) : (
              <ul className={classNames?.legacyGraphList ?? ""}>
                {flow.draftGraph.edges.map((edge) => (
                  <li key={edge.id}>
                    <strong>
                      {legacyNodeTitle(flow, edge.fromNodeId)} →{" "}
                      {legacyNodeTitle(flow, edge.toNodeId)}
                    </strong>
                    <span>{edge.label ?? edge.branchKey ?? copy.unlabeledEdge}</span>
                    <code>{edge.id}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className={classNames?.legacyMigrationActions ?? ""}>
          <button
            className={classNames?.legacyExportButton ?? ""}
            type="button"
            disabled={!onExport}
            onClick={() => onExport?.(flow)}
          >
            <Icon iconName="fileDown" width={15} height={15} aria-hidden="true" />
            {copy.exportJson}
          </button>
          <button
            className={classNames?.builderPublishButton ?? ""}
            type="button"
            disabled={!canMigrate || pending}
            onClick={() => onMigrate(flow.id, flow.revision)}
          >
            {pending ? copy.migrating : copy.migrate}
          </button>
        </div>
      </div>
    </section>
  );
}

function legacyNodeTitle(flow: LegacyFlowDefinitionDetail, nodeId: string): string {
  return flow.draftGraph.nodes.find((node) => node.id === nodeId)?.title ?? nodeId;
}

function migrationIssueMessage(issue: FlowDefinitionMigrationIssue, locale: "ru" | "en"): string {
  if (locale === "en") return issue.message;
  if (issue.code === "unsupported_node") {
    return "Этот legacy-узел нельзя перенести в V2 без изменения бизнес-смысла.";
  }
  if (issue.code === "unsupported_edge") {
    return "Эту legacy-связь нельзя однозначно перенести в V2.";
  }
  return "Исходная legacy-схема нарушает обязательные ограничения.";
}

const migrationCopy = {
  ru: {
    back: "Все воронки",
    revision: "редакция",
    readOnly: "Только чтение",
    title: "Эту схему нужно мигрировать в V2",
    description:
      "Миграция выполняется на сервере и остановится, если хотя бы один узел нельзя преобразовать без потери смысла.",
    publishedVersion: "Опубликована версия",
    historyPreserved: "Она и существующие запуски останутся неизменными.",
    archived: "Архивное определение нельзя мигрировать.",
    migrate: "Мигрировать в V2",
    migrating: "Мигрируем",
    exportJson: "Скачать JSON",
    sourceNodePayload: "Исходные параметры узла",
    nodes: "Узлы V1",
    edges: "Связи V1",
    noEdges: "В исходной схеме нет связей.",
    unlabeledEdge: "Связь без подписи",
    migrationIssues: "Почему миграция остановлена"
  },
  en: {
    back: "All flows",
    revision: "revision",
    readOnly: "Read-only",
    title: "This graph must be migrated to V2",
    description:
      "Migration runs on the server and stops if any node cannot be converted without changing its meaning.",
    publishedVersion: "Published version",
    historyPreserved: "It and existing runs remain unchanged.",
    archived: "An archived definition cannot be migrated.",
    migrate: "Migrate to V2",
    migrating: "Migrating",
    exportJson: "Download JSON",
    sourceNodePayload: "Source node payload",
    nodes: "V1 nodes",
    edges: "V1 connections",
    noEdges: "The source graph has no connections.",
    unlabeledEdge: "Unlabelled connection",
    migrationIssues: "Why migration stopped"
  }
} as const;
