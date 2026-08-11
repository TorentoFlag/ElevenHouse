import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal } from "@elevenhouse/design-system/components/Modal";
import "@elevenhouse/design-system/components/Modal.css";
import {
  updateFlowDefinitionDraftV2RequestSchema,
  type FlowDefinitionDetail,
  type FlowDefinitionValidationIssue,
  type FlowGraphV2,
  type FlowPresentationV1
} from "@elevenhouse/contracts";
import {
  appendFlowNodeFromPalette,
  getAvailableSourceHandles,
  moveFlowNodePresentation,
  replaceFlowNode,
  type FlowPaletteNodeId
} from "../model/flowDraftEditor";
import { flowDefinitionStateLabel, flowSourceHandleLabel } from "../model/flowDisplay";
import { describeFlowDefinitionError } from "../model/flowsPageModel";
import { buildFlowRuntimePresentation } from "../model/flowRuntimePresentation";
import { buildFlowValidationIssuePresentation } from "../model/flowValidationPresentation";
import { FlowBuilderCanvas, type FlowConnectionSource } from "./FlowBuilderCanvas";
import { FlowBuilderInspector } from "./FlowBuilderInspector";
import { FlowMobileDagProjection } from "./FlowMobileDagProjection";
import { FlowNodePalette } from "./FlowNodePalette";

export type CurrentFlowDefinitionDetail = Extract<
  FlowDefinitionDetail,
  { graphSchemaVersion: "flow-graph.v2" }
>;

export type FlowDraftCommandPayload = {
  readonly flowId: string;
  readonly expectedRevision: number;
  readonly graph: FlowGraphV2;
  readonly presentation: FlowPresentationV1;
};

export type FlowPublishCommandPayload = FlowDraftCommandPayload & {
  readonly saveBeforePublish: boolean;
};

export type FlowNextDraftCommandPayload = {
  readonly flowId: string;
  readonly expectedRevision: number;
  readonly baseVersionId: string;
};

export type FlowRevisionConflict = {
  readonly operation: "save" | "publish";
  readonly expectedRevision: number;
  readonly currentRevision: number;
};

export type FlowBuilderProps = {
  readonly flow: CurrentFlowDefinitionDetail;
  readonly locale: "ru" | "en";
  readonly onBack: () => void;
  readonly onSaveDraft: (input: FlowDraftCommandPayload) => void;
  readonly onPublish: (input: FlowPublishCommandPayload) => void;
  readonly onCreateNextDraft?: (input: FlowNextDraftCommandPayload) => void;
  readonly runtimeAvailability?: Parameters<typeof buildFlowRuntimePresentation>[0];
  readonly onCreateManualRun?: (flowId: string) => void;
  readonly isSaving?: boolean;
  readonly isPublishing?: boolean;
  readonly isCreatingNextDraft?: boolean;
  readonly isCreatingManualRun?: boolean;
  readonly isValidating?: boolean;
  readonly saveError?: Error | null;
  readonly publishError?: Error | null;
  readonly nextDraftError?: Error | null;
  readonly revisionConflict?: FlowRevisionConflict | null;
  readonly onReloadServer?: () => Promise<CurrentFlowDefinitionDetail | null>;
  readonly validationIssues?: readonly FlowDefinitionValidationIssue[];
  readonly validationError?: Error | null;
  readonly runHistory?: ReactNode;
  readonly classNames?: Readonly<Record<string, string>>;
};

export function FlowBuilder({
  flow,
  locale,
  onBack,
  onSaveDraft,
  onPublish,
  onCreateNextDraft,
  runtimeAvailability = null,
  onCreateManualRun,
  isSaving = false,
  isPublishing = false,
  isCreatingNextDraft = false,
  isCreatingManualRun = false,
  isValidating = false,
  saveError = null,
  publishError = null,
  nextDraftError = null,
  revisionConflict = null,
  onReloadServer,
  validationIssues = emptyValidationIssues,
  validationError = null,
  runHistory = null,
  classNames
}: FlowBuilderProps) {
  const initialPresentation = useMemo(
    () => ensurePresentation(flow.draftGraph, flow.draftPresentation),
    [flow.draftGraph, flow.draftPresentation]
  );
  const [draftGraph, setDraftGraph] = useState(flow.draftGraph);
  const [draftPresentation, setDraftPresentation] = useState(initialPresentation);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    flow.state === "draft" ? (flow.draftGraph.nodes[0]?.id ?? null) : null
  );
  const [connectionSource, setConnectionSource] = useState<FlowConnectionSource | null>(() =>
    firstAvailableConnection(flow.draftGraph, flow.draftGraph.nodes[0]?.id ?? null)
  );
  const [dirty, setDirty] = useState(false);
  const [draftBaseRevision, setDraftBaseRevision] = useState(flow.revision);
  const [observedServerRevision, setObservedServerRevision] = useState<number | null>(null);
  const [isReloadingServer, setIsReloadingServer] = useState(false);
  const [reloadError, setReloadError] = useState<Error | null>(null);
  const [exitConfirmationVisible, setExitConfirmationVisible] = useState(false);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [visibleValidationIssues, setVisibleValidationIssues] = useState(validationIssues);
  const currentFlowId = useRef(flow.id);
  const isMobileViewport = useIsMobileFlowViewport();
  const editable = flow.state === "draft";
  const interactionLocked =
    isSaving || isPublishing || isCreatingNextDraft || isReloadingServer || isValidating;
  const selectedNode = draftGraph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const runtime = buildFlowRuntimePresentation(runtimeAvailability, locale);
  const hasActiveManualClientTrigger =
    flow.state === "versioned" &&
    flow.latestPublishedVersionId !== null &&
    flow.enrollment.control.state === "active" &&
    flow.enrollment.control.activeVersionId === flow.latestPublishedVersionId &&
    flow.draftGraph.nodes.some((node) => node.kind === "manual_client");
  const canCreateManualRun =
    hasActiveManualClientTrigger && runtime.executionAvailable && Boolean(onCreateManualRun);
  const transportValidation = updateFlowDefinitionDraftV2RequestSchema.safeParse({
    expectedRevision: draftBaseRevision,
    graph: draftGraph,
    presentation: draftPresentation
  });
  const copy = builderCopy[locale];
  const effectiveConflict =
    revisionConflict ??
    (observedServerRevision === null
      ? null
      : {
          operation: "save" as const,
          expectedRevision: draftBaseRevision,
          currentRevision: observedServerRevision
        });
  const structuralEditingEnabled = editable && !interactionLocked && !effectiveConflict;
  const presentedValidationIssues = buildFlowValidationIssuePresentation(
    visibleValidationIssues,
    locale
  );

  useEffect(() => {
    setVisibleValidationIssues(validationIssues);
  }, [flow.id, validationIssues]);

  useEffect(() => {
    setReloadError(null);
    setExitConfirmationVisible(false);
    setMobilePaletteOpen(false);
    setMobileInspectorOpen(false);
  }, [flow.id]);

  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    const preventUnsavedExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnsavedExit);
    return () => window.removeEventListener("beforeunload", preventUnsavedExit);
  }, [dirty]);

  useEffect(() => {
    const flowChanged = currentFlowId.current !== flow.id;
    if (!flowChanged && draftBaseRevision === flow.revision) return;

    const nextPresentation = ensurePresentation(flow.draftGraph, flow.draftPresentation);
    if (
      !flowChanged &&
      dirty &&
      !sameDraft(flow.draftGraph, nextPresentation, draftGraph, draftPresentation)
    ) {
      setObservedServerRevision(flow.revision);
      return;
    }

    currentFlowId.current = flow.id;
    setDraftGraph(flow.draftGraph);
    setDraftPresentation(nextPresentation);
    setDraftBaseRevision(flow.revision);
    setObservedServerRevision(null);
    setDirty(false);
    setExitConfirmationVisible(false);
    setSelectedNodeId((current) =>
      flow.state !== "draft"
        ? null
        : current && flow.draftGraph.nodes.some((node) => node.id === current)
        ? current
        : (flow.draftGraph.nodes[0]?.id ?? null)
    );
    setConnectionSource(
      firstAvailableConnection(flow.draftGraph, flow.draftGraph.nodes[0]?.id ?? null)
    );
  }, [
    draftBaseRevision,
    draftGraph,
    draftPresentation,
    dirty,
    flow.draftGraph,
    flow.draftPresentation,
    flow.id,
    flow.revision,
    flow.state
  ]);

  const selectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setConnectionSource(firstAvailableConnection(draftGraph, nodeId));
  };

  const addPaletteNode = (paletteNodeId: FlowPaletteNodeId) => {
    if (!editable || !connectionSource) return;
    const updated = appendFlowNodeFromPalette(draftGraph, draftPresentation, {
      sourceNodeId: connectionSource.nodeId,
      sourceHandle: connectionSource.handle,
      paletteNodeId,
      locale
    });
    setDraftGraph(updated.graph);
    setDraftPresentation(updated.presentation);
    setSelectedNodeId(updated.addedNodeId);
    setConnectionSource(firstAvailableConnection(updated.graph, updated.addedNodeId));
    markDraftDirty();
  };

  const markDraftDirty = () => {
    setDirty(true);
    setVisibleValidationIssues(emptyValidationIssues);
  };

  const commandPayload = (expectedRevision = draftBaseRevision): FlowDraftCommandPayload => ({
    flowId: flow.id,
    expectedRevision,
    graph: draftGraph,
    presentation: draftPresentation
  });

  const reloadServerDraft = async () => {
    if (!onReloadServer) return;
    setReloadError(null);
    setIsReloadingServer(true);
    try {
      const refreshed = await onReloadServer();
      if (!refreshed) {
        setReloadError(new Error(copy.serverRevisionUnavailable));
        return;
      }
      const nextPresentation = ensurePresentation(
        refreshed.draftGraph,
        refreshed.draftPresentation
      );
      currentFlowId.current = refreshed.id;
      setDraftGraph(refreshed.draftGraph);
      setDraftPresentation(nextPresentation);
      setDraftBaseRevision(refreshed.revision);
      setObservedServerRevision(null);
      setDirty(false);
      setExitConfirmationVisible(false);
      setSelectedNodeId(refreshed.state === "draft" ? (refreshed.draftGraph.nodes[0]?.id ?? null) : null);
      setConnectionSource(
        firstAvailableConnection(refreshed.draftGraph, refreshed.draftGraph.nodes[0]?.id ?? null)
      );
    } catch (error) {
      setReloadError(describeFlowDefinitionError(error, locale));
    } finally {
      setIsReloadingServer(false);
    }
  };

  return (
    <section
      className={`${classNames?.page ?? ""} ${classNames?.builderPage ?? ""}`.trim()}
      aria-label={copy.builder}
    >
      <header className={classNames?.builderHeader ?? ""}>
        <button
          className={classNames?.builderBackButton ?? ""}
          type="button"
          disabled={interactionLocked}
          onClick={() => {
            if (dirty) {
              setExitConfirmationVisible(true);
              return;
            }
            onBack();
          }}
        >
          {copy.allFlows}
        </button>
        <div className={classNames?.builderTitleGroup ?? ""}>
          <p>
            {flowDefinitionStateLabel(flow.state, locale)} · {copy.revision} {flow.revision}
            {flow.latestPublishedVersion ? ` · ${copy.version} ${flow.latestPublishedVersion}` : ""}
          </p>
          <h1>{flow.name}</h1>
        </div>
        <div className={classNames?.builderActions ?? ""}>
          {hasActiveManualClientTrigger ? (
            <button
              className={classNames?.builderTestRunButton ?? ""}
              type="button"
              disabled={!canCreateManualRun || isCreatingManualRun}
              title={runtime.unavailableReason ?? undefined}
              onClick={() => {
                if (canCreateManualRun) onCreateManualRun?.(flow.id);
              }}
            >
              {isCreatingManualRun ? copy.creatingManualRun : copy.createManualRun}
            </button>
          ) : null}
          {editable ? (
            <>
              <button
                className={classNames?.builderSaveButton ?? classNames?.builderBackButton ?? ""}
                type="button"
                disabled={
                  !dirty ||
                  !transportValidation.success ||
                  interactionLocked ||
                  Boolean(effectiveConflict)
                }
                onClick={() => onSaveDraft(commandPayload())}
              >
                {isSaving ? copy.saving : copy.save}
              </button>
              <button
                className={classNames?.builderPublishButton ?? ""}
                type="button"
                disabled={
                  !transportValidation.success || interactionLocked || Boolean(effectiveConflict)
                }
                onClick={() => onPublish({ ...commandPayload(), saveBeforePublish: dirty })}
              >
                {isValidating ? copy.validating : isPublishing ? copy.publishing : copy.publish}
              </button>
            </>
          ) : flow.state === "versioned" && flow.latestPublishedVersionId && onCreateNextDraft ? (
            <button
              className={classNames?.builderPublishButton ?? ""}
              type="button"
              disabled={isCreatingNextDraft}
              onClick={() => {
                const baseVersionId = flow.latestPublishedVersionId;
                if (!baseVersionId) return;
                onCreateNextDraft({
                  flowId: flow.id,
                  expectedRevision: flow.revision,
                  baseVersionId
                });
              }}
            >
              {isCreatingNextDraft ? copy.creatingVersion : copy.createVersion}
            </button>
          ) : null}
        </div>
      </header>

      <div className={classNames?.builderSaveState ?? ""} role="status">
        {editable ? (dirty ? copy.unsaved : copy.saved) : copy.readOnly}
      </div>
      {exitConfirmationVisible ? (
        <section
          className={classNames?.builderExitConfirmation ?? ""}
          role="group"
          aria-label={copy.unsavedExitTitle}
        >
          <p>{copy.unsavedExitMessage}</p>
          <div className={classNames?.builderExitActions ?? ""}>
            <button type="button" onClick={() => setExitConfirmationVisible(false)}>
              {copy.stay}
            </button>
            <button type="button" onClick={onBack}>
              {copy.discardAndExit}
            </button>
          </div>
        </section>
      ) : null}
      {!transportValidation.success ? (
        <div className={classNames?.builderMutationError ?? ""} role="alert">
          {copy.invalidFields}
        </div>
      ) : null}
      {effectiveConflict ? (
        <div className={classNames?.builderMutationError ?? ""} role="alert">
          <p>
            {copy.revisionConflict.replace("{revision}", String(effectiveConflict.currentRevision))}
          </p>
          <div className={classNames?.builderConflictActions ?? ""}>
            {onReloadServer ? (
              <button type="button" disabled={interactionLocked} onClick={reloadServerDraft}>
                {isReloadingServer ? copy.reloadingServer : copy.loadServerRevision}
              </button>
            ) : null}
            {effectiveConflict.operation === "save" ? (
              <button
                type="button"
                disabled={interactionLocked || !transportValidation.success}
                onClick={() => onSaveDraft(commandPayload(effectiveConflict.currentRevision))}
              >
                {copy.retryOverRevision.replace(
                  "{revision}",
                  String(effectiveConflict.currentRevision)
                )}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {presentedValidationIssues.length > 0 ? (
        <section
          className={classNames?.builderValidationIssues ?? classNames?.builderMutationError ?? ""}
          role="alert"
          aria-label={copy.validation}
        >
          <h2>{copy.validation}</h2>
          <ul>
            {presentedValidationIssues.map((issue) => (
              <li key={`${issue.code}:${issue.path}`}>
                <p>{issue.message}</p>
                <code>
                  {issue.code} · {issue.path}
                </code>
                {issue.nodeId && draftGraph.nodes.some((node) => node.id === issue.nodeId) ? (
                  <button type="button" onClick={() => selectNode(issue.nodeId!)}>
                    {copy.showIssueNode}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {[
        effectiveConflict?.operation === "save" ? null : saveError,
        effectiveConflict?.operation === "publish" || presentedValidationIssues.length > 0
          ? null
          : publishError,
        reloadError,
        nextDraftError,
        validationError
      ]
        .filter(Boolean)
        .map((error, index) => (
          <div
            key={`${error?.message}:${index}`}
            className={classNames?.builderMutationError ?? ""}
            role="alert"
          >
            {error?.message}
          </div>
        ))}

      <section
        className={`${classNames?.builder ?? ""} ${
          isMobileViewport ? (classNames?.builderMobile ?? "") : ""
        }`.trim()}
      >
        {isMobileViewport ? (
          <>
            <div className={classNames?.builderMobileActions ?? ""}>
              <button
                type="button"
                disabled={!structuralEditingEnabled || connectionSource === null}
                onClick={() => setMobilePaletteOpen(true)}
              >
                {copy.addStep}
              </button>
              {selectedNode ? (
                <button type="button" onClick={() => setMobileInspectorOpen(true)}>
                  {copy.configureStep}
                </button>
              ) : null}
            </div>
            <FlowMobileDagProjection
              graph={draftGraph}
              locale={locale}
              selectedNodeId={selectedNodeId}
              connectionSource={connectionSource}
              editable={structuralEditingEnabled}
              onEditNode={(nodeId) => {
                selectNode(nodeId);
                setMobileInspectorOpen(true);
              }}
              onSelectSourceHandle={(nodeId, handle) => {
                setSelectedNodeId(nodeId);
                setConnectionSource({ nodeId, handle });
              }}
            />
            {!runtime.executionAvailable ? (
              <div className={classNames?.runtimeNotice ?? ""}>{runtime.unavailableReason}</div>
            ) : null}
            <Modal
              title={copy.addStep}
              closeLabel={copy.closeSheet}
              open={mobilePaletteOpen}
              className={classNames?.builderMobileDialog}
              contentClassName={classNames?.builderMobileDialogContent}
              onClose={() => setMobilePaletteOpen(false)}
            >
              <FlowNodePalette
                locale={locale}
                connectionLabel={connectionLabel(draftGraph, connectionSource, locale)}
                onAddNode={(nodeId) => {
                  addPaletteNode(nodeId);
                  setMobilePaletteOpen(false);
                }}
                isDisabled={!structuralEditingEnabled}
                classNames={classNames}
              />
            </Modal>
            <Modal
              title={copy.configureStep}
              closeLabel={copy.closeSheet}
              open={mobileInspectorOpen}
              className={classNames?.builderMobileDialog}
              contentClassName={classNames?.builderMobileDialogContent}
              onClose={() => setMobileInspectorOpen(false)}
            >
              <FlowBuilderInspector
                graph={draftGraph}
                selectedNode={selectedNode}
                locale={locale}
                editable={structuralEditingEnabled}
                onChangeNode={(node) => {
                  setDraftGraph((current) => replaceFlowNode(current, node));
                  markDraftDirty();
                }}
                classNames={classNames}
              />
            </Modal>
          </>
        ) : (
          <FlowNodePalette
            locale={locale}
            connectionLabel={connectionLabel(draftGraph, connectionSource, locale)}
            onAddNode={addPaletteNode}
            isDisabled={!structuralEditingEnabled}
            classNames={classNames}
          />
        )}
        {!isMobileViewport ? (
          <FlowBuilderCanvas
            graph={draftGraph}
            presentation={draftPresentation}
            locale={locale}
            editable={structuralEditingEnabled}
            selectedNodeId={selectedNodeId}
            connectionSource={connectionSource}
            onSelectNode={selectNode}
            onSelectSourceHandle={(nodeId, handle) => {
              setSelectedNodeId(nodeId);
              setConnectionSource({ nodeId, handle });
            }}
            onMoveNode={(nodeId, position) => {
              setDraftPresentation((current) => moveFlowNodePresentation(current, nodeId, position));
              markDraftDirty();
            }}
            classNames={classNames}
          />
        ) : null}
        {!isMobileViewport ? (
          <aside className={classNames?.builderInspector ?? ""}>
            <FlowBuilderInspector
              graph={draftGraph}
              selectedNode={selectedNode}
              locale={locale}
              editable={structuralEditingEnabled}
              onChangeNode={(node) => {
                setDraftGraph((current) => replaceFlowNode(current, node));
                markDraftDirty();
              }}
              classNames={classNames}
            />
            {!runtime.executionAvailable ? (
              <div className={classNames?.runtimeNotice ?? ""}>{runtime.unavailableReason}</div>
            ) : null}
            {runHistory}
          </aside>
        ) : null}
      </section>
      {isMobileViewport && runHistory ? (
        <div className={classNames?.builderMobileHistory ?? ""}>{runHistory}</div>
      ) : null}
    </section>
  );
}

function ensurePresentation(
  graph: FlowGraphV2,
  presentation: FlowPresentationV1 | null
): FlowPresentationV1 {
  if (presentation) return presentation;
  return {
    schemaVersion: "flow-presentation.v1",
    nodes: graph.nodes.map((node, index) => ({
      nodeId: node.id,
      position: { x: 80 + index * 320, y: 120 }
    })),
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

function sameDraft(
  serverGraph: FlowGraphV2,
  serverPresentation: FlowPresentationV1,
  localGraph: FlowGraphV2,
  localPresentation: FlowPresentationV1
): boolean {
  return (
    JSON.stringify(serverGraph) === JSON.stringify(localGraph) &&
    JSON.stringify(serverPresentation) === JSON.stringify(localPresentation)
  );
}

const emptyValidationIssues: readonly FlowDefinitionValidationIssue[] = [];

function useIsMobileFlowViewport(): boolean {
  const mediaQuery = "(max-width: 760px)";
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(mediaQuery).matches === true
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(mediaQuery);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return matches;
}

function firstAvailableConnection(
  graph: FlowGraphV2,
  nodeId: string | null
): FlowConnectionSource | null {
  if (!nodeId) return null;
  const handle = getAvailableSourceHandles(graph, nodeId)[0];
  return handle ? { nodeId, handle } : null;
}

function connectionLabel(
  graph: FlowGraphV2,
  source: FlowConnectionSource | null,
  locale: "ru" | "en"
): string | null {
  if (!source) return null;
  const node = graph.nodes.find((candidate) => candidate.id === source.nodeId);
  return node ? `${node.displayTitle} · ${flowSourceHandleLabel(source.handle, locale)}` : null;
}

const builderCopy = {
  ru: {
    builder: "Конструктор воронки",
    allFlows: "Все воронки",
    revision: "редакция",
    version: "версия",
    createManualRun: "Запустить для клиента",
    creatingManualRun: "Создаём…",
    save: "Сохранить",
    saving: "Сохраняем",
    publish: "Опубликовать",
    publishing: "Публикуем",
    validating: "Проверяем",
    createVersion: "Создать новую версию",
    creatingVersion: "Создаём версию",
    saved: "Изменения сохранены",
    unsaved: "Есть несохранённые изменения",
    unsavedExitTitle: "Несохранённые изменения",
    unsavedExitMessage: "Если выйти сейчас, изменения схемы в этой вкладке будут потеряны.",
    stay: "Остаться",
    discardAndExit: "Выйти без сохранения",
    readOnly: "Опубликованная версия доступна только для чтения",
    invalidFields: "Исправьте обязательные поля перед сохранением.",
    revisionConflict:
      "На сервере уже есть редакция {revision}. Локальные изменения сохранены только в этой вкладке.",
    loadServerRevision: "Загрузить серверную версию",
    reloadingServer: "Загружаем серверную версию",
    serverRevisionUnavailable: "Серверная версия воронки недоступна.",
    retryOverRevision: "Повторить поверх редакции {revision}",
    validation: "Проверка схемы",
    showIssueNode: "Показать узел с проблемой",
    addStep: "Добавить шаг",
    configureStep: "Настроить узел",
    closeSheet: "Закрыть"
  },
  en: {
    builder: "Flow builder",
    allFlows: "All flows",
    revision: "revision",
    version: "version",
    createManualRun: "Run for client",
    creatingManualRun: "Creating…",
    save: "Save",
    saving: "Saving",
    publish: "Publish",
    publishing: "Publishing",
    validating: "Validating",
    createVersion: "Create new version",
    creatingVersion: "Creating version",
    saved: "Changes saved",
    unsaved: "Unsaved changes",
    unsavedExitTitle: "Unsaved changes",
    unsavedExitMessage: "Leaving now will discard the graph changes in this tab.",
    stay: "Stay",
    discardAndExit: "Leave without saving",
    readOnly: "The published version is read-only",
    invalidFields: "Fix required fields before saving.",
    revisionConflict:
      "Server revision {revision} is newer. Your local changes remain in this tab only.",
    loadServerRevision: "Load server version",
    reloadingServer: "Loading server version",
    serverRevisionUnavailable: "The server flow version is unavailable.",
    retryOverRevision: "Retry over revision {revision}",
    validation: "Graph validation",
    showIssueNode: "Show affected node",
    addStep: "Add step",
    configureStep: "Configure node",
    closeSheet: "Close"
  }
} as const;
