import { useMemo, useRef, useState } from "react";
import type {
  FlowDefinitionTemplateDescriptorV2,
  ValidateFlowDefinitionResponse
} from "@elevenhouse/contracts";
import { useI18n } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  buildCreateFlowDefinitionRequest,
  createFlowCommandAttemptRegistry,
  describeFlowDefinitionError,
  getFlowDefinitionMigrationIssues,
  getFlowDefinitionRevisionConflict,
  getFlowDefinitionValidationIssues,
  parseAstroCalendarFlowHandoff
} from "../../features/flows/model/flowsPageModel";
import { buildLegacyFlowDefinitionExport } from "../../features/flows/model/flowDefinitionExport";
import { useActivateFlowMutation } from "../../features/flows/model/useActivateFlowMutation";
import { useCreateFlowMutation } from "../../features/flows/model/useCreateFlowMutation";
import { useCreateNextFlowDraftMutation } from "../../features/flows/model/useCreateNextFlowDraftMutation";
import { useFlowDefinitionQuery } from "../../features/flows/model/useFlowDefinitionQuery";
import { useFlowListQuery } from "../../features/flows/model/useFlowListQuery";
import { useFlowTemplatesQuery } from "../../features/flows/model/useFlowTemplatesQuery";
import { useMigrateFlowDefinitionMutation } from "../../features/flows/model/useMigrateFlowDefinitionMutation";
import { usePauseFlowMutation } from "../../features/flows/model/usePauseFlowMutation";
import { usePublishFlowMutation } from "../../features/flows/model/usePublishFlowMutation";
import { useUpdateFlowDraftMutation } from "../../features/flows/model/useUpdateFlowDraftMutation";
import { useValidateFlowDefinitionMutation } from "../../features/flows/model/useValidateFlowDefinitionMutation";
import type {
  FlowDraftCommandPayload,
  FlowNextDraftCommandPayload,
  FlowPublishCommandPayload
} from "../../features/flows/ui/FlowBuilder";
import { FlowsPageView } from "./FlowsPageView";

export function FlowsPage() {
  const i18n = useI18n();
  const locale = i18n.locale === "en" ? "en" : "ru";
  useDocumentTitle(locale === "ru" ? "Воронки" : "Flows");

  const handoff = useMemo(() => parseAstroCalendarFlowHandoff(getCurrentLocationSearch()), []);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(handoff !== null);
  const [validationResult, setValidationResult] = useState<ValidateFlowDefinitionResponse | null>(
    null
  );
  const commandAttempts = useRef(createFlowCommandAttemptRegistry()).current;

  const flowsQuery = useFlowListQuery({
    state: "all",
    runtimeStatus: "all",
    limit: 50,
    offset: 0
  });
  const templatesQuery = useFlowTemplatesQuery(locale);
  const selectedFlowQuery = useFlowDefinitionQuery(selectedFlowId);
  const createMutation = useCreateFlowMutation();
  const updateMutation = useUpdateFlowDraftMutation();
  const publishMutation = usePublishFlowMutation();
  const nextDraftMutation = useCreateNextFlowDraftMutation();
  const migrationMutation = useMigrateFlowDefinitionMutation();
  const activateMutation = useActivateFlowMutation();
  const pauseMutation = usePauseFlowMutation();
  const validationMutation = useValidateFlowDefinitionMutation();
  const saveConflict = getFlowDefinitionRevisionConflict(updateMutation.error);
  const publishConflict = getFlowDefinitionRevisionConflict(publishMutation.error);
  const revisionConflict = saveConflict
    ? { ...saveConflict, operation: "save" as const }
    : publishConflict
      ? { ...publishConflict, operation: "publish" as const }
      : null;

  const createDefinition = (template: FlowDefinitionTemplateDescriptorV2 | null) => {
    const body = buildCreateFlowDefinitionRequest({ locale, template });
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
        { onSuccess: () => commandAttempts.acknowledge("publish", idempotencyKey) }
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

  const migrateDefinition = (flowId: string, expectedRevision: number) => {
    const body = {
      schemaVersion: "flow-definition-migrate.v2" as const,
      expectedRevision,
      targetGraphSchemaVersion: "flow-graph.v2" as const
    };
    const idempotencyKey = commandAttempts.acquire("migrate", { flowId, body });
    migrationMutation.mutate(
      { flowId, body, idempotencyKey },
      {
        onSuccess: () => commandAttempts.acknowledge("migrate", idempotencyKey)
      }
    );
  };

  const toggleAutomation = (flowId: string, activate: boolean) => {
    if (activate) {
      if (flowsQuery.data?.runtime.executionAvailable === true) activateMutation.mutate(flowId);
      return;
    }
    pauseMutation.mutate(flowId);
  };

  return (
    <FlowsPageView
      locale={locale}
      flows={flowsQuery.data?.flows ?? []}
      templates={templatesQuery.data?.templates ?? []}
      isLoading={flowsQuery.isLoading}
      isError={flowsQuery.isError}
      listError={asLocalizedError(flowsQuery.error, locale)}
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
      onCreateTemplate={(template) => createDefinition(template)}
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
      onMigrate={migrateDefinition}
      onExportLegacyFlow={downloadLegacyFlowDefinition}
      onAutomationToggle={toggleAutomation}
      runtimeAvailability={flowsQuery.data?.runtime ?? null}
      isCreating={createMutation.isPending}
      isSaving={updateMutation.isPending}
      isPublishing={publishMutation.isPending}
      isValidating={validationMutation.isPending}
      isCreatingNextDraft={nextDraftMutation.isPending}
      isMigrating={migrationMutation.isPending}
      isTogglingAutomation={activateMutation.isPending || pauseMutation.isPending}
      createError={asLocalizedError(createMutation.error, locale)}
      saveError={asLocalizedError(updateMutation.error, locale)}
      publishError={asLocalizedError(publishMutation.error, locale)}
      nextDraftError={asLocalizedError(nextDraftMutation.error, locale)}
      migrationError={asLocalizedError(migrationMutation.error, locale)}
      migrationIssues={getFlowDefinitionMigrationIssues(migrationMutation.error)}
      revisionConflict={revisionConflict}
      validationIssues={
        getFlowDefinitionValidationIssues(publishMutation.error).length > 0
          ? getFlowDefinitionValidationIssues(publishMutation.error)
          : (validationResult?.issues ?? [])
      }
      validationError={asLocalizedError(validationMutation.error, locale)}
    />
  );
}

function asLocalizedError(error: unknown, locale: "ru" | "en"): Error | null {
  return error ? describeFlowDefinitionError(error, locale) : null;
}

function getCurrentLocationSearch(): string {
  return typeof globalThis.location?.search === "string" ? globalThis.location.search : "";
}

function downloadLegacyFlowDefinition(
  flow: Parameters<typeof buildLegacyFlowDefinitionExport>[0]
): void {
  const artifact = buildLegacyFlowDefinitionExport(flow);
  const objectUrl = URL.createObjectURL(new Blob([artifact.contents], { type: artifact.mimeType }));
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = artifact.filename;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
