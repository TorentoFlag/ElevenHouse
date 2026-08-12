import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FlowDefinitionTemplateDescriptorV2,
  PauseFlowEnrollmentRequest,
  ValidateFlowDefinitionResponse
} from "@elevenhouse/contracts";
import { useI18n } from "@elevenhouse/i18n";
import { useLocation } from "react-router";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  buildCreateFlowDefinitionRequest,
  createFlowCommandAttemptRegistry,
  describeFlowDefinitionError,
  getFlowDefinitionRevisionConflict,
  getFlowDefinitionValidationIssues,
  parseAstroCalendarFlowHandoff,
  parseFlowDefinitionSelection
} from "../../features/flows/model/flowsPageModel";
import {
  filterFlowDefinitionsForGallery,
  type FlowDefinitionGalleryTab
} from "../../features/flows/model/flowDisplay";
import {
  buildActivateFlowVersionRequest,
  buildPauseFlowEnrollmentRequest,
  classifyFlowEnrollmentCommandError,
  createFlowEnrollmentCommandAttemptRegistry,
  type FlowEnrollmentCommandErrorClassification
} from "../../features/flows/model/flowEnrollmentCommandModel";
import { useActivateFlowMutation } from "../../features/flows/model/useActivateFlowMutation";
import { useArchiveFlowDefinitionMutation } from "../../features/flows/model/useArchiveFlowDefinitionMutation";
import { useCreateFlowMutation } from "../../features/flows/model/useCreateFlowMutation";
import { useCreateManualFlowRunMutation } from "../../features/flows/model/useCreateManualFlowRunMutation";
import { useCreateNextFlowDraftMutation } from "../../features/flows/model/useCreateNextFlowDraftMutation";
import { useDeleteFlowDefinitionMutation } from "../../features/flows/model/useDeleteFlowDefinitionMutation";
import { useDuplicateFlowDefinitionMutation } from "../../features/flows/model/useDuplicateFlowDefinitionMutation";
import { useFlowDefinitionQuery } from "../../features/flows/model/useFlowDefinitionQuery";
import { useFlowActivationReviewQuery } from "../../features/flows/model/useFlowActivationReviewQuery";
import { useFlowEnrollmentQuery } from "../../features/flows/model/useFlowEnrollmentQuery";
import { useFlowListQuery } from "../../features/flows/model/useFlowListQuery";
import { useFlowTemplatesQuery } from "../../features/flows/model/useFlowTemplatesQuery";
import { useProductListQuery } from "../../features/products/model/useProductListQuery";
import { useAstrologerTariffEntitlementsQuery } from "../../features/platform-tariffs/model/useAstrologerTariffEntitlementsQuery";
import { usePauseFlowEnrollmentMutation } from "../../features/flows/model/usePauseFlowEnrollmentMutation";
import { usePublishFlowMutation } from "../../features/flows/model/usePublishFlowMutation";
import { useRestoreFlowDefinitionMutation } from "../../features/flows/model/useRestoreFlowDefinitionMutation";
import { useUpdateFlowDraftMutation } from "../../features/flows/model/useUpdateFlowDraftMutation";
import { useValidateFlowDefinitionMutation } from "../../features/flows/model/useValidateFlowDefinitionMutation";
import type {
  FlowDraftCommandPayload,
  FlowNextDraftCommandPayload,
  FlowPublishCommandPayload
} from "../../features/flows/ui/FlowBuilder";
import { FlowActivationReviewDialog } from "../../features/flows/ui/FlowActivationReviewDialog";
import { FlowApprovalQueuePanel } from "../../features/flows/ui/FlowApprovalQueuePanel";
import { FlowManualClientRunDialog } from "../../features/flows/ui/FlowManualClientRunDialog";
import { FlowPauseConfirmationDialog } from "../../features/flows/ui/FlowPauseConfirmationDialog";
import { FlowRunHistoryPanel } from "../../features/flows/ui/FlowRunHistoryPanel";
import { FlowWorkItemQueuePanel } from "../../features/flows/ui/FlowWorkItemQueuePanel";
import type { FlowDefinitionLifecycleAction } from "../../features/flows/ui/FlowGallery";
import { FlowsPageView } from "./FlowsPageView";
import styles from "./FlowsPage.module.css";

type FlowAutomationTarget =
  | {
      readonly action: "review_activation";
      readonly flowId: string;
      readonly flowName: string;
      readonly versionId: string;
      readonly versionNumber: number;
    }
  | {
      readonly action: "pause_enrollment";
      readonly flowId: string;
      readonly flowName: string;
    };

type FlowAutomationCommandFeedback = {
  readonly error: Error;
  readonly classification: FlowEnrollmentCommandErrorClassification;
};

type FlowManualRunTarget = {
  readonly flowId: string;
  readonly flowName: string;
};

export function FlowsPage() {
  const i18n = useI18n();
  const location = useLocation();
  const locale = i18n.locale === "en" ? "en" : "ru";
  useDocumentTitle(locale === "ru" ? "Воронки" : "Flows");

  const handoff = useMemo(() => parseAstroCalendarFlowHandoff(location.search), [location.search]);
  const flowSelection = useMemo(
    () => parseFlowDefinitionSelection(location.search),
    [location.search]
  );
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(
    flowSelection?.flowId ?? null
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(
    handoff !== null && flowSelection === null
  );
  const [validationResult, setValidationResult] = useState<ValidateFlowDefinitionResponse | null>(
    null
  );
  const [automationTarget, setAutomationTarget] = useState<FlowAutomationTarget | null>(null);
  const [automationFeedback, setAutomationFeedback] =
    useState<FlowAutomationCommandFeedback | null>(null);
  const [manualRunTarget, setManualRunTarget] = useState<FlowManualRunTarget | null>(null);
  const [flowFilterTab, setFlowFilterTab] = useState<FlowDefinitionGalleryTab>("all");
  const [flowSearch, setFlowSearch] = useState("");
  const commandAttempts = useRef(createFlowCommandAttemptRegistry()).current;
  const enrollmentCommandAttempts = useRef(createFlowEnrollmentCommandAttemptRegistry()).current;

  const flowsQuery = useFlowListQuery({
    state: "all",
    enrollmentState: "all",
    limit: 50,
    offset: 0
  });
  const templatesQuery = useFlowTemplatesQuery(locale);
  const entitlementsQuery = useAstrologerTariffEntitlementsQuery();
  const productsQuery = useProductListQuery(
    { status: "active", limit: 100, offset: 0 },
    { enabled: entitlementsQuery.data?.products.read === "allow" }
  );
  const selectedFlowQuery = useFlowDefinitionQuery(selectedFlowId);
  const activationReviewQuery = useFlowActivationReviewQuery(
    automationTarget?.action === "review_activation" ? automationTarget.flowId : null,
    automationTarget?.action === "review_activation" ? automationTarget.versionId : null
  );
  const enrollmentQuery = useFlowEnrollmentQuery(
    automationTarget?.action === "pause_enrollment" ? automationTarget.flowId : null
  );
  const createMutation = useCreateFlowMutation();
  const updateMutation = useUpdateFlowDraftMutation();
  const publishMutation = usePublishFlowMutation();
  const nextDraftMutation = useCreateNextFlowDraftMutation();
  const activateMutation = useActivateFlowMutation();
  const pauseEnrollmentMutation = usePauseFlowEnrollmentMutation();
  const archiveMutation = useArchiveFlowDefinitionMutation();
  const restoreMutation = useRestoreFlowDefinitionMutation();
  const duplicateMutation = useDuplicateFlowDefinitionMutation();
  const deleteMutation = useDeleteFlowDefinitionMutation();
  const manualRunMutation = useCreateManualFlowRunMutation();
  const validationMutation = useValidateFlowDefinitionMutation();
  const saveConflict = getFlowDefinitionRevisionConflict(updateMutation.error);
  const publishConflict = getFlowDefinitionRevisionConflict(publishMutation.error);
  const revisionConflict = saveConflict
    ? { ...saveConflict, operation: "save" as const }
    : publishConflict
      ? { ...publishConflict, operation: "publish" as const }
      : null;
  const allFlows = flowsQuery.data?.flows ?? [];
  const visibleFlows = useMemo(
    () => filterFlowDefinitionsForGallery(allFlows, { tab: flowFilterTab, search: flowSearch }),
    [allFlows, flowFilterTab, flowSearch]
  );
  const emptyMessage =
    allFlows.length === 0 && flowFilterTab === "all" && flowSearch.trim().length === 0
      ? undefined
      : locale === "ru"
        ? "Ничего не найдено"
        : "Nothing found";

  useEffect(() => {
    if (!flowSelection) return;
    setCreateDialogOpen(false);
    setSelectedFlowId(flowSelection.flowId);
  }, [flowSelection]);

  const createDefinition = (
    template: FlowDefinitionTemplateDescriptorV2 | null,
    parameters: Record<string, string[]> = {}
  ) => {
    const body = buildCreateFlowDefinitionRequest({ locale, template, parameters });
    const idempotencyKey = commandAttempts.acquire("create", body);

    createMutation.mutate(
      { body, idempotencyKey },
      {
        onSuccess: (definition) => {
          commandAttempts.acknowledge("create", idempotencyKey);
          setCreateDialogOpen(false);
          setSelectedFlowId(definition.id);
        }
      }
    );
  };

  const saveDraft = (input: FlowDraftCommandPayload) => {
    validationMutation.reset();
    setValidationResult(null);
    const body = {
      expectedRevision: input.expectedRevision,
      graph: input.graph,
      presentation: input.presentation
    };
    const idempotencyKey = commandAttempts.acquire("update", {
      flowId: input.flowId,
      body
    });
    updateMutation.mutate(
      {
        flowId: input.flowId,
        body,
        idempotencyKey
      },
      { onSuccess: () => commandAttempts.acknowledge("update", idempotencyKey) }
    );
  };

  const executePublishDraft = (input: FlowPublishCommandPayload) => {
    const publishRevision = (expectedRevision: number) => {
      const body = { expectedRevision };
      const idempotencyKey = commandAttempts.acquire("publish", {
        flowId: input.flowId,
        body
      });
      publishMutation.mutate(
        {
          flowId: input.flowId,
          body,
          idempotencyKey
        },
        {
          onSuccess: (publication) => {
            commandAttempts.acknowledge("publish", idempotencyKey);
            setAutomationFeedback(null);
            setAutomationTarget({
              action: "review_activation",
              flowId: publication.flow.id,
              flowName: publication.flow.name,
              versionId: publication.version.id,
              versionNumber: publication.version.version
            });
          }
        }
      );
    };

    if (!input.saveBeforePublish) {
      publishRevision(input.expectedRevision);
      return;
    }

    const body = {
      expectedRevision: input.expectedRevision,
      graph: input.graph,
      presentation: input.presentation
    };
    const idempotencyKey = commandAttempts.acquire("update", {
      flowId: input.flowId,
      body
    });
    updateMutation.mutate(
      {
        flowId: input.flowId,
        body,
        idempotencyKey
      },
      {
        onSuccess: (saved) => {
          commandAttempts.acknowledge("update", idempotencyKey);
          publishRevision(saved.revision);
        }
      }
    );
  };

  const publishDraft = (input: FlowPublishCommandPayload) => {
    setValidationResult(null);
    validationMutation.mutate(
      { flowId: input.flowId, graph: input.graph },
      {
        onSuccess: (result) => {
          setValidationResult(result);
          if (result.publishable) executePublishDraft(input);
        }
      }
    );
  };

  const createNextDraft = (input: FlowNextDraftCommandPayload) => {
    const body = {
      expectedRevision: input.expectedRevision,
      baseVersionId: input.baseVersionId
    };
    const idempotencyKey = commandAttempts.acquire("next-draft", {
      flowId: input.flowId,
      body
    });
    nextDraftMutation.mutate(
      { flowId: input.flowId, body, idempotencyKey },
      {
        onSuccess: () => commandAttempts.acknowledge("next-draft", idempotencyKey)
      }
    );
  };

  const requestAutomationAction = (
    flowId: string,
    action: "review_activation" | "pause_enrollment"
  ) => {
    const flow = flowsQuery.data?.flows.find((candidate) => candidate.id === flowId);
    if (!flow) return;

    activateMutation.reset();
    pauseEnrollmentMutation.reset();
    setAutomationFeedback(null);

    if (action === "review_activation") {
      if (flow.latestPublishedVersionId === null || flow.latestPublishedVersion === null) return;
      setAutomationTarget({
        action,
        flowId,
        flowName: flow.name,
        versionId: flow.latestPublishedVersionId,
        versionNumber: flow.latestPublishedVersion
      });
      if (enrollmentCommandAttempts.needsRefetch("activate", flowId)) {
        setAutomationFeedback(refetchRequiredFeedback(locale));
      }
      return;
    }

    setAutomationTarget({ action, flowId, flowName: flow.name });
    if (
      action === "pause_enrollment" &&
      enrollmentCommandAttempts.needsRefetch("pause-enrollment", flowId)
    ) {
      setAutomationFeedback(refetchRequiredFeedback(locale));
    }
  };

  const closeAutomationDialog = () => {
    if (activateMutation.isPending || pauseEnrollmentMutation.isPending) {
      return;
    }
    setAutomationTarget(null);
    setAutomationFeedback(null);
  };

  const confirmActivation = () => {
    if (automationTarget?.action !== "review_activation" || !activationReviewQuery.data) return;

    const body = buildActivateFlowVersionRequest(activationReviewQuery.data);
    let idempotencyKey: string;
    try {
      idempotencyKey = enrollmentCommandAttempts.acquire("activate", automationTarget.flowId, body);
    } catch {
      setAutomationFeedback(refetchRequiredFeedback(locale));
      return;
    }

    activateMutation.mutate(
      { flowId: automationTarget.flowId, body, idempotencyKey },
      {
        onSuccess: () => {
          enrollmentCommandAttempts.acknowledge(
            "activate",
            automationTarget.flowId,
            idempotencyKey
          );
          setAutomationTarget(null);
          setAutomationFeedback(null);
        },
        onError: (error) => {
          const classification = classifyFlowEnrollmentCommandError(error);
          if (classification.kind === "refetch_required") {
            enrollmentCommandAttempts.markConflict(
              "activate",
              automationTarget.flowId,
              idempotencyKey
            );
          }
          setAutomationFeedback({
            error: describeFlowAutomationCommandError(classification, locale),
            classification
          });
        }
      }
    );
  };

  const confirmPause = () => {
    if (!automationTarget || automationTarget.action === "review_activation") return;

    if (!enrollmentQuery.data) return;
    let body: PauseFlowEnrollmentRequest;
    try {
      body = buildPauseFlowEnrollmentRequest(enrollmentQuery.data.enrollment);
    } catch {
      setAutomationFeedback(refetchRequiredFeedback(locale));
      return;
    }

    let idempotencyKey: string;
    try {
      idempotencyKey = enrollmentCommandAttempts.acquire(
        "pause-enrollment",
        automationTarget.flowId,
        body
      );
    } catch {
      setAutomationFeedback(refetchRequiredFeedback(locale));
      return;
    }

    pauseEnrollmentMutation.mutate(
      { flowId: automationTarget.flowId, body, idempotencyKey },
      {
        onSuccess: () => {
          enrollmentCommandAttempts.acknowledge(
            "pause-enrollment",
            automationTarget.flowId,
            idempotencyKey
          );
          setAutomationTarget(null);
          setAutomationFeedback(null);
        },
        onError: (error) => {
          const classification = classifyFlowEnrollmentCommandError(error);
          if (classification.kind === "refetch_required") {
            enrollmentCommandAttempts.markConflict(
              "pause-enrollment",
              automationTarget.flowId,
              idempotencyKey
            );
          }
          setAutomationFeedback({
            error: describeFlowAutomationCommandError(classification, locale),
            classification
          });
        }
      }
    );
  };

  const requestLifecycleAction = (flowId: string, action: FlowDefinitionLifecycleAction) => {
    const flow = flowsQuery.data?.flows.find((candidate) => candidate.id === flowId);
    if (!flow) return;
    const body = { expectedRevision: flow.revision };

    if (action === "archive") {
      archiveMutation.mutate({ flowId, body });
      return;
    }
    if (action === "restore") {
      restoreMutation.mutate({ flowId, body });
      return;
    }
    if (action === "duplicate") {
      duplicateMutation.mutate({
        flowId,
        body: { ...body, name: `${flow.name} (копия)` }
      });
      return;
    }
    if (!window.confirm(lifecycleCopy[locale].deleteConfirm(flow.name))) return;
    deleteMutation.mutate({ flowId, body });
  };

  const refetchAutomationAuthority = async () => {
    if (!automationTarget) return;
    try {
      const listResult = await flowsQuery.refetch();
      if (listResult.error) throw listResult.error;

      if (automationTarget.action === "review_activation") {
        const reviewResult = await activationReviewQuery.refetch();
        if (reviewResult.error) throw reviewResult.error;
        enrollmentCommandAttempts.resetAfterRefetch("activate", automationTarget.flowId);
      } else if (automationTarget.action === "pause_enrollment") {
        const enrollmentResult = await enrollmentQuery.refetch();
        if (enrollmentResult.error) throw enrollmentResult.error;
        enrollmentCommandAttempts.resetAfterRefetch("pause-enrollment", automationTarget.flowId);
      }
      setAutomationFeedback(null);
    } catch (error) {
      setAutomationFeedback({
        error: asError(error, locale),
        classification: { kind: "rejected" }
      });
    }
  };

  return (
    <>
      <FlowsPageView
        locale={locale}
        flows={visibleFlows}
        totalFlowCount={allFlows.length}
        activeFlowFilter={flowFilterTab}
        flowSearch={flowSearch}
        emptyMessage={emptyMessage}
        onFlowFilterChange={setFlowFilterTab}
        onFlowSearchChange={setFlowSearch}
        templates={templatesQuery.data?.templates ?? []}
        products={productsQuery.data?.products ?? []}
        creationAllowed={entitlementsQuery.data?.funnels?.mutation === "allow"}
        isLoading={flowsQuery.isLoading}
        isError={flowsQuery.isError}
        templateError={asLocalizedError(templatesQuery.error, locale)}
        templatesLoading={templatesQuery.isLoading}
        onRetryList={() => void flowsQuery.refetch()}
        onRetryTemplates={() => void templatesQuery.refetch()}
        selectedFlowId={selectedFlowId}
        selectedFlow={selectedFlowQuery.data ?? null}
        isLoadingSelectedFlow={selectedFlowQuery.isLoading}
        selectedFlowError={asLocalizedError(selectedFlowQuery.error, locale)}
        createDialogOpen={createDialogOpen}
        requestedTemplateKey={handoff?.suggestedTemplateKey ?? null}
        onRequestCreate={() => setCreateDialogOpen(true)}
        onCloseCreate={() => setCreateDialogOpen(false)}
        onCreateTemplate={(template, parameters) => createDefinition(template, parameters)}
        onCreateBlank={() => createDefinition(null)}
        onOpenFlow={(flowId) => {
          validationMutation.reset();
          setValidationResult(null);
          setCreateDialogOpen(false);
          setSelectedFlowId(flowId);
        }}
        onCloseBuilder={() => {
          validationMutation.reset();
          setValidationResult(null);
          setSelectedFlowId(null);
        }}
        onReloadSelectedFlow={async () => {
          const result = await selectedFlowQuery.refetch();
          if (result.error) throw result.error;
          updateMutation.reset();
          publishMutation.reset();
          return result.data?.graphSchemaVersion === "flow-graph.v2" ? result.data : null;
        }}
        onSaveDraft={saveDraft}
        onPublish={publishDraft}
        onCreateNextDraft={createNextDraft}
        onAutomationAction={requestAutomationAction}
        onLifecycleAction={requestLifecycleAction}
        onCreateManualRun={(flowId) => {
          const flow = selectedFlowQuery.data;
          if (!flow || flow.id !== flowId) return;
          manualRunMutation.reset();
          setManualRunTarget({ flowId, flowName: flow.name });
        }}
        runtimeAvailability={flowsQuery.data?.runtime ?? null}
        isCreating={createMutation.isPending}
        isSaving={updateMutation.isPending}
        isPublishing={publishMutation.isPending}
        isValidating={validationMutation.isPending}
        isCreatingNextDraft={nextDraftMutation.isPending}
        isTogglingAutomation={activateMutation.isPending || pauseEnrollmentMutation.isPending}
        isLifecycleActionPending={
          archiveMutation.isPending ||
          restoreMutation.isPending ||
          duplicateMutation.isPending ||
          deleteMutation.isPending
        }
        isCreatingManualRun={manualRunMutation.isPending}
        createError={asLocalizedError(createMutation.error, locale)}
        saveError={asLocalizedError(updateMutation.error, locale)}
        publishError={asLocalizedError(publishMutation.error, locale)}
        nextDraftError={asLocalizedError(nextDraftMutation.error, locale)}
        revisionConflict={revisionConflict}
        validationIssues={
          getFlowDefinitionValidationIssues(publishMutation.error).length > 0
            ? getFlowDefinitionValidationIssues(publishMutation.error)
            : (validationResult?.issues ?? [])
        }
        validationError={asLocalizedError(validationMutation.error, locale)}
        runHistory={
          selectedFlowId ? (
            <FlowRunHistoryPanel flowId={selectedFlowId} locale={locale} classNames={styles} />
          ) : null
        }
        approvalQueue={<FlowApprovalQueuePanel locale={locale} classNames={styles} hideWhenEmpty />}
        workItemQueue={<FlowWorkItemQueuePanel locale={locale} hideWhenEmpty />}
      />
      {manualRunTarget ? (
        <FlowManualClientRunDialog
          flowName={manualRunTarget.flowName}
          locale={locale}
          pending={manualRunMutation.isPending}
          error={asLocalizedError(manualRunMutation.error, locale)}
          onClose={() => {
            if (manualRunMutation.isPending) return;
            manualRunMutation.reset();
            setManualRunTarget(null);
          }}
          onSubmit={({ clientUserId, idempotencyKey }) =>
            manualRunMutation.mutateAsync({
              flowId: manualRunTarget.flowId,
              body: { clientUserId },
              idempotencyKey
            })
          }
        />
      ) : null}
      <FlowActivationReviewDialog
        open={automationTarget?.action === "review_activation"}
        locale={locale}
        flowName={automationTarget?.action === "review_activation" ? automationTarget.flowName : ""}
        versionNumber={
          automationTarget?.action === "review_activation" ? automationTarget.versionNumber : 1
        }
        review={
          automationTarget?.action === "review_activation"
            ? (activationReviewQuery.data ?? null)
            : null
        }
        loading={
          automationTarget?.action === "review_activation" && activationReviewQuery.isLoading
        }
        pending={activateMutation.isPending}
        reviewError={
          automationTarget?.action === "review_activation" && activationReviewQuery.error
            ? asError(activationReviewQuery.error, locale)
            : null
        }
        commandError={automationFeedback?.error ?? null}
        refetchRequired={automationFeedback?.classification.kind === "refetch_required"}
        retrySameAttempt={automationFeedback?.classification.kind === "retry_same_attempt"}
        onClose={closeAutomationDialog}
        onRetryReview={() => {
          setAutomationFeedback(null);
          void activationReviewQuery.refetch();
        }}
        onRefetch={() => void refetchAutomationAuthority()}
        onConfirm={confirmActivation}
        classNames={styles}
      />
      {automationTarget && automationTarget.action !== "review_activation" ? (
        <FlowPauseConfirmationDialog
          open
          locale={locale}
          mode={automationTarget.action}
          flowName={automationTarget.flowName}
          loading={automationTarget.action === "pause_enrollment" && enrollmentQuery.isLoading}
          pending={pauseEnrollmentMutation.isPending}
          error={
            automationFeedback?.error ??
            (automationTarget.action === "pause_enrollment" && enrollmentQuery.error
              ? asError(enrollmentQuery.error, locale)
              : null)
          }
          refetchRequired={automationFeedback?.classification.kind === "refetch_required"}
          retrySameAttempt={automationFeedback?.classification.kind === "retry_same_attempt"}
          onClose={closeAutomationDialog}
          onRefetch={() => void refetchAutomationAuthority()}
          onConfirm={confirmPause}
          classNames={styles}
        />
      ) : null}
    </>
  );
}

const lifecycleCopy = {
  ru: {
    deleteConfirm: (name: string) =>
      `Удалить воронку «${name}»? Это возможно только если она ни разу не запускалась.`
  },
  en: {
    deleteConfirm: (name: string) =>
      `Delete “${name}”? This is allowed only if the flow has never run.`
  }
} as const;

function asLocalizedError(error: unknown, locale: "ru" | "en"): Error | null {
  return error ? describeFlowDefinitionError(error, locale) : null;
}

function asError(error: unknown, locale: "ru" | "en"): Error {
  return error instanceof Error
    ? error
    : new Error(locale === "ru" ? "Неизвестная ошибка воронки" : "Unknown flow error");
}

function refetchRequiredFeedback(locale: "ru" | "en"): FlowAutomationCommandFeedback {
  return {
    error: new Error(
      locale === "ru"
        ? "Состояние автоматизации изменилось. Обновите данные и подтвердите команду снова."
        : "The automation state changed. Refresh it and confirm the command again."
    ),
    classification: { kind: "refetch_required", rejection: null }
  };
}

function describeFlowAutomationCommandError(
  classification: FlowEnrollmentCommandErrorClassification,
  locale: "ru" | "en"
): Error {
  if (classification.kind === "refetch_required") return refetchRequiredFeedback(locale).error;
  if (classification.kind === "retry_same_attempt") {
    return new Error(
      locale === "ru"
        ? "Результат команды не подтверждён. Повторите её вручную: будет использована та же попытка."
        : "The command result is unknown. Retry manually using the same attempt."
    );
  }
  return new Error(
    locale === "ru"
      ? "Команда автоматизации отклонена. Обновите данные перед новой попыткой."
      : "The automation command was rejected. Refresh the state before trying again."
  );
}
