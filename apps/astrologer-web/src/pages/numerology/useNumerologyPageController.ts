import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@elevenhouse/i18n";
import type {
  CalculationPdfDownloadResponse,
  CalculationPdfJob,
  CalculationPdfLocale,
  CalculationRecordResponse,
  NumerologyCalculationResponse,
  NumerologyPreviewResponse,
  PreviewNumerologyRequest,
  RecalculateNumerologyCalculationRequest,
  NumerologyResult
} from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { HttpError } from "../../common/http/HttpError";
import { getFirstLinkableClientId } from "../../features/calculations/model/calculationStatus";
import { getNumerologyActionErrorMessage } from "../../features/numerology/model/numerologyActionErrorModel";
import {
  astrologerClientListQueryOptions,
  findClientSelectOption,
  toClientSelectOptions,
  type ClientSelectOption
} from "../../features/clients/model/clientSelectorModel";
import {
  buildCompatibilityFormState,
  buildIndividualFormState,
  findExistingCalculationForParticipants,
  getFirstCompatibilityPartner,
  toClientOptionFromNumerologyParticipant
} from "../../features/numerology/model/numerologyCompatibilityFlowModel";
import {
  createInitialNumerologyForm,
  getNumerologyFormErrors,
  hasNumerologyCrmParticipant,
  toClientParticipantFormState,
  toCreateNumerologyRequest,
  toPreviewNumerologyRequest,
  type NumerologyFormState
} from "../../features/numerology/model/numerologyFormModel";
import {
  useApproveCalculationInterpretationMutation,
  useArchiveNumerologyMutation,
  useCreateNumerologyAiDraftMutation,
  useCreateNumerologyMutation,
  useDownloadNumerologyPdfMutation,
  useEnqueueNumerologyPdfMutation,
  useLinkCalculationClientMutation,
  useNumerologyCalculationListQuery,
  useNumerologyPdfQuery,
  usePreviewNumerologyMutation,
  usePublishCalculationMutation,
  useRecalculateNumerologyMutation,
  useSaveCalculationInterpretationMutation
} from "../../features/numerology/model/numerologyHooks";
import {
  buildNumerologyPdfAction,
  type NumerologyPdfAction
} from "../../features/numerology/model/numerologyPdfModel";
import {
  getCalculationTitle,
  getCurrentInterpretation,
  toNumerologyFormState,
  toNumerologyResponse
} from "../../features/numerology/model/numerologyPageModel";
import {
  getNumerologyAiDraftErrorMessage,
  getNumerologyInterpretationState
} from "../../features/numerology/model/numerologyInterpretationModel";
import { getLatestInterpretationText } from "../../features/numerology/model/numerologyResultModel";
import {
  createNewNumerologyEditorState,
  createRecalculationEditorState,
  getActiveNumerologyCalculations,
  getNumerologyEditorErrors,
  toNumerologyRecalculateRequest,
  updateNumerologyEditorForm,
  updateNumerologyEditorParticipant,
  type NumerologyEditorState
} from "../../features/numerology/model/numerologySavedWorkspaceModel";
import {
  createLatestPreviewGuard,
  toNumerologyPreviewPeriodRequest,
  type NumerologyPeriodSelection
} from "../../features/numerology/model/numerologyPeriodModel";
import type { NumerologyPageViewProps } from "./NumerologyPageView";

export function useNumerologyPageController(): NumerologyPageViewProps {
  const { locale } = useI18n();
  const listQuery = useNumerologyCalculationListQuery();
  const clientsQuery = useQuery(astrologerClientListQueryOptions({ limit: 100, offset: 0 }));
  const createMutation = useCreateNumerologyMutation();
  const previewMutation = usePreviewNumerologyMutation();
  const linkMutation = useLinkCalculationClientMutation();
  const saveInterpretationMutation = useSaveCalculationInterpretationMutation();
  const approveInterpretationMutation = useApproveCalculationInterpretationMutation();
  const publishMutation = usePublishCalculationMutation();
  const recalculateMutation = useRecalculateNumerologyMutation();
  const archiveMutation = useArchiveNumerologyMutation();
  const createAiDraftMutation = useCreateNumerologyAiDraftMutation();
  const enqueuePdfMutation = useEnqueueNumerologyPdfMutation();
  const downloadPdfMutation = useDownloadNumerologyPdfMutation();
  const calculations = useMemo(
    () => listQuery.data?.calculations ?? [],
    [listQuery.data?.calculations]
  );
  const activeCalculations = useMemo(
    () => getActiveNumerologyCalculations(calculations),
    [calculations]
  );
  const clientOptions = useMemo(
    () => toClientSelectOptions(clientsQuery.data?.clients ?? []),
    [clientsQuery.data?.clients]
  );
  const [selectedResponse, setSelectedResponse] = useState<NumerologyCalculationResponse | null>(
    null
  );
  const [previewResult, setPreviewResult] = useState<NumerologyResult | null>(null);
  const [formState, setFormState] = useState<NumerologyFormState>(createInitialNumerologyForm);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [isPeriodVisible, setIsPeriodVisible] = useState(false);
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [selectedDetailSelector, setSelectedDetailSelector] = useState<string | null>(null);
  const [interpretationText, setInterpretationText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [periodErrorMessage, setPeriodErrorMessage] = useState<string | null>(null);
  const [aiDraftErrorMessage, setAiDraftErrorMessage] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<NumerologyEditorState | null>(null);
  const [editorErrors, setEditorErrors] = useState<readonly string[]>([]);
  const [archiveTarget, setArchiveTarget] = useState<CalculationRecordResponse | null>(null);
  const previewGuardRef = useRef(createLatestPreviewGuard());
  const aiDraftGuardRef = useRef(createLatestPreviewGuard());
  const aiDraftInFlightRef = useRef(false);
  const selectedCalculation = selectedResponse?.calculation ?? null;
  const pdfQuery = useNumerologyPdfQuery({
    calculationId: selectedCalculation?.id ?? "",
    locale,
    resultChecksum: selectedCalculation?.resultChecksum ?? ""
  });
  const pdfJob = pdfQuery.data?.job ?? null;
  const isPreviewPending = previewMutation.isPending;
  const isBusy =
    createMutation.isPending ||
    isPreviewPending ||
    linkMutation.isPending ||
    saveInterpretationMutation.isPending ||
    approveInterpretationMutation.isPending ||
    publishMutation.isPending ||
    recalculateMutation.isPending ||
    archiveMutation.isPending ||
    createAiDraftMutation.isPending ||
    enqueuePdfMutation.isPending ||
    downloadPdfMutation.isPending;
  const pdfAction = buildNumerologyPdfAction({
    calculationId: selectedCalculation?.id ?? "",
    resultChecksum: selectedCalculation?.resultChecksum ?? "",
    currentResultChecksum: pdfQuery.data?.currentResultChecksum ?? null,
    job: pdfJob,
    editorOpen: Boolean(editorState),
    isBusy
  });

  useDocumentTitle("ElevenHouse | Нумерология");

  useEffect(() => {
    if (selectedResponse || previewResult || activeCalculations.length === 0) return;
    selectCalculation(activeCalculations[0]!);
  }, [activeCalculations, previewResult, selectedResponse]);

  useEffect(() => {
    setInterpretationText(getLatestInterpretationText(selectedResponse));
    setSelectedDetailSelector(null);
  }, [selectedResponse]);

  return {
    calculations,
    selectedResponse,
    previewResult,
    formState,
    selectedYear,
    isPeriodVisible,
    isYearPickerOpen,
    isPresentationOpen,
    selectedDetailSelector,
    interpretationText,
    errorMessage,
    periodErrorMessage,
    aiDraftErrorMessage,
    pdfLabel: pdfAction.label,
    pdfDisabled: pdfAction.disabled,
    pdfTitle: pdfAction.title,
    pdfErrorMessage: pdfAction.errorMessage,
    isBusy,
    isPreviewPending,
    isCreatingAiDraft: createAiDraftMutation.isPending,
    editorState,
    editorErrors,
    archiveTarget,
    onSelectSubjectClient: (client) => selectPlatformClient("subject", client),
    onSelectPartnerClient: (client) => selectPlatformClient("partner", client),
    onSelectSaved: (calculation) => {
      selectCalculation(calculation);
      setErrorMessage(null);
    },
    onOpenCreate: openCreateEditor,
    onOpenRecalculate: openRecalculationEditor,
    onEditorFormChange: (patch) => {
      setEditorState((current) => (current ? updateNumerologyEditorForm(current, patch) : current));
      setEditorErrors([]);
    },
    onEditorParticipantChange: (participantKey, patch) => {
      setEditorState((current) =>
        current ? updateNumerologyEditorParticipant(current, participantKey, patch) : current
      );
      setEditorErrors([]);
    },
    onEditorSelectClient: (participantKey, client) => {
      setEditorState((current) => {
        if (!current) return current;
        return updateNumerologyEditorParticipant(current, participantKey, {
          ...toClientParticipantFormState(client, current.form[participantKey])
        });
      });
      setEditorErrors([]);
    },
    onSubmitEditor: submitEditor,
    onCancelEditor: () => {
      setEditorState(null);
      setEditorErrors([]);
      setErrorMessage(null);
      setAiDraftErrorMessage(null);
    },
    onRequestArchive: () => {
      if (selectedCalculation?.status === "archived") return;
      setArchiveTarget(selectedCalculation);
    },
    onCloseArchive: () => {
      if (archiveMutation.isPending) return;
      setArchiveTarget(null);
    },
    onConfirmArchive: confirmArchive,
    onSelectDetail: setSelectedDetailSelector,
    onToggleYearPicker: () => setIsYearPickerOpen((value) => !value),
    onApplyYear: (year) => {
      if (formState.mode !== "individual") return;
      const selection = { selectedYear: year, isVisible: true } as const;
      setSelectedYear(year);
      setIsPeriodVisible(true);
      setIsYearPickerOpen(false);
      selectOrPreviewCalculation(formState, {
        periodSelection: selection,
        forcePreview: true,
        errorTarget: "period"
      });
    },
    onHidePeriod: () => {
      setIsPeriodVisible(false);
      setIsYearPickerOpen(false);
      setPeriodErrorMessage(null);
    },
    onRetryPeriod: () => {
      if (formState.mode !== "individual") return;
      selectOrPreviewCalculation(formState, {
        periodSelection: { selectedYear, isVisible: true },
        forcePreview: true,
        errorTarget: "period"
      });
    },
    onToggleCompatibilityMode: toggleCompatibilityMode,
    onOpenPresentation: () => setIsPresentationOpen(true),
    onClosePresentation: () => setIsPresentationOpen(false),
    onLink: () => {
      if (!selectedCalculation && previewResult) {
        if (!hasNumerologyCrmParticipant(formState)) return;
        run(async () => {
          const response = await createMutation.mutateAsync(toCreateNumerologyRequest(formState));
          setPreviewResult(null);
          setSelectedResponse(response);
        }, setErrorMessage);
        return;
      }
      const clientId = getFirstLinkableClientId(selectedCalculation);
      if (!selectedCalculation || !clientId) return;
      run(async () => {
        const calculation = await linkMutation.mutateAsync({
          calculationId: selectedCalculation.id,
          body: { clientId }
        });
        setSelectedResponse(toNumerologyResponse(calculation));
      }, setErrorMessage);
    },
    onPublish: () => {
      const clientId = getFirstLinkableClientId(selectedCalculation);
      if (!selectedCalculation || !clientId) return;
      run(async () => {
        const calculation = await publishMutation.mutateAsync({
          calculationId: selectedCalculation.id,
          body: { clientId, expectedResultChecksum: selectedCalculation.resultChecksum }
        });
        setSelectedResponse(toNumerologyResponse(calculation));
      }, setErrorMessage);
    },
    onInterpretationChange: (value) => {
      setInterpretationText(value);
      setAiDraftErrorMessage(null);
    },
    onCreateAiDraft: createAiDraft,
    onSaveInterpretation: () => {
      if (!selectedCalculation) return;
      run(async () => {
        const calculation = await saveInterpretationMutation.mutateAsync({
          calculationId: selectedCalculation.id,
          body: {
            text: interpretationText,
            expectedResultChecksum: selectedCalculation.resultChecksum
          }
        });
        setSelectedResponse(toNumerologyResponse(calculation));
      }, setErrorMessage);
    },
    onApproveInterpretation: () => {
      const latestInterpretation = getCurrentInterpretation(selectedCalculation);
      if (!selectedCalculation || !latestInterpretation) return;
      run(async () => {
        const calculation = await approveInterpretationMutation.mutateAsync({
          calculationId: selectedCalculation.id,
          interpretationId: latestInterpretation.id
        });
        setSelectedResponse(toNumerologyResponse(calculation));
      }, setErrorMessage);
    },
    onPdf: () => {
      void run(
        () =>
          executeNumerologyPdfAction({
            calculation: selectedCalculation,
            locale,
            kind: pdfAction.kind,
            job: pdfJob,
            enqueue: (input) => enqueuePdfMutation.mutateAsync(input),
            download: (input) => downloadPdfMutation.mutateAsync(input),
            openUrl: (url) => window.open(url, "_blank", "noopener,noreferrer")
          }).then(() => undefined),
        setErrorMessage
      );
    }
  };

  function selectCalculation(calculation: CalculationRecordResponse): void {
    previewGuardRef.current.invalidate();
    aiDraftGuardRef.current.invalidate();
    const response = toNumerologyResponse(calculation);
    setPreviewResult(null);
    setSelectedResponse(response);
    setFormState(toNumerologyFormState(response));
    setEditorState(null);
    setEditorErrors([]);
    setArchiveTarget(null);
    setAiDraftErrorMessage(null);
  }

  function openCreateEditor(): void {
    previewGuardRef.current.invalidate();
    aiDraftGuardRef.current.invalidate();
    setEditorState(
      createNewNumerologyEditorState(
        formState.subject.source === "crm_client" ? formState.subject : undefined
      )
    );
    setEditorErrors([]);
    setArchiveTarget(null);
    setErrorMessage(null);
    setAiDraftErrorMessage(null);
  }

  function openRecalculationEditor(): void {
    if (!selectedCalculation || selectedCalculation.status === "archived") return;
    previewGuardRef.current.invalidate();
    aiDraftGuardRef.current.invalidate();
    setEditorState(createRecalculationEditorState(selectedCalculation));
    setEditorErrors([]);
    setArchiveTarget(null);
    setErrorMessage(null);
    setAiDraftErrorMessage(null);
  }

  function submitEditor(): void {
    if (!editorState) return;
    const errors = getNumerologyEditorErrors(editorState);
    if (errors.length > 0) {
      setEditorErrors(errors);
      return;
    }

    const submittedEditor = editorState;
    run(
      async () => {
        const outcome = await executeNumerologyEditorSubmission({
          editor: submittedEditor,
          preview: (body) => previewMutation.mutateAsync(body),
          recalculate: (input) => recalculateMutation.mutateAsync(input)
        });

        if (outcome.kind === "preview") {
          setSelectedResponse(null);
          setPreviewResult(outcome.response.result);
          setFormState(outcome.form);
        } else {
          setPreviewResult(null);
          setSelectedResponse(outcome.response);
          setFormState(toNumerologyFormState(outcome.response));
        }
        setEditorState(null);
        setEditorErrors([]);
      },
      (message) => {
        setErrorMessage(null);
        setEditorErrors(message ? [message] : []);
      },
      submittedEditor.kind === "create"
        ? "Не удалось выполнить расчёт"
        : "Не удалось сохранить расчёт"
    );
  }

  function createAiDraft(): void {
    if (aiDraftInFlightRef.current) return;
    const requestId = aiDraftGuardRef.current.begin();
    setAiDraftErrorMessage(null);
    aiDraftInFlightRef.current = true;

    void (async () => {
      const outcome = await requestNumerologyAiDraft({
        calculation: selectedCalculation,
        editorText: interpretationText,
        isBusy,
        mutate: (input) => createAiDraftMutation.mutateAsync(input)
      });
      aiDraftInFlightRef.current = false;
      if (!aiDraftGuardRef.current.isCurrent(requestId)) return;

      if (outcome.kind === "success") {
        setSelectedResponse(outcome.response);
      } else if (outcome.kind === "error") {
        setAiDraftErrorMessage(outcome.message);
      }
    })();
  }

  function confirmArchive(): void {
    if (!archiveTarget) return;
    const archivedId = archiveTarget.id;
    run(async () => {
      await archiveMutation.mutateAsync(archivedId);
      setArchiveTarget(null);
      setEditorState(null);
      setEditorErrors([]);

      if (selectedCalculation?.id !== archivedId) return;
      const nextCalculation = activeCalculations.find(
        (calculation) => calculation.id !== archivedId
      );
      if (nextCalculation) {
        selectCalculation(nextCalculation);
        return;
      }
      previewGuardRef.current.invalidate();
      aiDraftGuardRef.current.invalidate();
      setSelectedResponse(null);
      setPreviewResult(null);
      setFormState(createInitialNumerologyForm());
      setSelectedDetailSelector(null);
      setInterpretationText("");
    }, setErrorMessage);
  }

  function selectPlatformClient(
    participantKey: "subject" | "partner",
    client: ClientSelectOption
  ): void {
    const participant = toClientParticipantFormState(client, formState[participantKey]);
    const nextStateBase = {
      ...formState,
      [participantKey]: participant
    };
    const nextState = {
      ...nextStateBase,
      title: getCalculationTitle(nextStateBase)
    };
    setFormState(nextState);

    if (getNumerologyFormErrors(nextState).length > 0) {
      setErrorMessage(null);
      return;
    }

    selectOrPreviewCalculation(nextState, {
      periodSelection: { selectedYear, isVisible: isPeriodVisible },
      forcePreview: isPeriodVisible,
      errorTarget: isPeriodVisible ? "period" : "page"
    });
  }

  function toggleCompatibilityMode(): void {
    if (formState.mode === "compatibility") {
      activateIndividualMode();
      return;
    }

    activateCompatibilityMode();
  }

  function activateCompatibilityMode(): void {
    const subject = getCurrentSubjectClient();
    if (!subject?.hasBirthDate) {
      setErrorMessage("Сначала выберите клиента с датой рождения");
      return;
    }

    const currentPartner = getCurrentPartnerClient();
    const partner =
      currentPartner?.hasBirthDate && currentPartner.value !== subject.value
        ? currentPartner
        : getFirstCompatibilityPartner(clientOptions, subject.value);
    const nextState = partner
      ? buildCompatibilityFormState(formState, subject, partner)
      : {
          ...formState,
          mode: "compatibility" as const,
          title: `${subject.label}, совместимость`,
          subject: toClientParticipantFormState(subject, formState.subject)
        };

    setIsYearPickerOpen(false);
    setSelectedDetailSelector(null);
    setFormState(nextState);

    if (!partner) {
      setErrorMessage(null);
      return;
    }

    selectOrPreviewCalculation(nextState);
  }

  function activateIndividualMode(): void {
    const subject = getCurrentSubjectClient();
    if (!subject?.hasBirthDate) {
      setErrorMessage("Сначала выберите клиента с датой рождения");
      return;
    }

    const nextState = buildIndividualFormState(formState, subject);
    setSelectedDetailSelector(null);
    setFormState(nextState);
    selectOrPreviewCalculation(nextState, {
      periodSelection: { selectedYear, isVisible: isPeriodVisible },
      forcePreview: isPeriodVisible,
      errorTarget: isPeriodVisible ? "period" : "page"
    });
  }

  function selectOrPreviewCalculation(
    nextState: NumerologyFormState,
    options: {
      readonly periodSelection?: NumerologyPeriodSelection;
      readonly forcePreview?: boolean;
      readonly errorTarget?: "page" | "period";
    } = {}
  ): void {
    const errors = getNumerologyFormErrors(nextState);
    if (errors.length > 0) {
      setErrorMessage(errors[0] ?? "Заполните данные расчета");
      return;
    }

    const existing = findExistingCalculationForParticipants(activeCalculations, {
      mode: nextState.mode,
      subjectClientId: nextState.subject.clientId,
      ...(nextState.mode === "compatibility" ? { partnerClientId: nextState.partner.clientId } : {})
    });

    if (existing && !options.forcePreview) {
      selectCalculation(existing);
      setErrorMessage(null);
      return;
    }

    const periodSelection = options.periodSelection ?? {
      selectedYear,
      isVisible: isPeriodVisible
    };
    const errorTarget = options.errorTarget ?? "page";
    const requestId = previewGuardRef.current.begin();
    const setPreviewError = errorTarget === "period" ? setPeriodErrorMessage : setErrorMessage;
    setPreviewError(null);

    void (async () => {
      try {
        const response = await previewMutation.mutateAsync(
          toPreviewNumerologyRequest(
            nextState,
            toNumerologyPreviewPeriodRequest(nextState.mode, periodSelection)
          )
        );
        if (!previewGuardRef.current.isCurrent(requestId)) return;
        setPeriodErrorMessage(null);
        setErrorMessage(null);
        aiDraftGuardRef.current.invalidate();
        setSelectedResponse(null);
        setPreviewResult(response.result);
      } catch (error) {
        if (!previewGuardRef.current.isCurrent(requestId)) return;
        setPreviewError(getNumerologyActionErrorMessage(error, "Не удалось обновить расчёт"));
      }
    })();
  }

  function getCurrentSubjectClient(): ClientSelectOption | null {
    return getCurrentClient(formState.subject.clientId, formState.subject);
  }

  function getCurrentPartnerClient(): ClientSelectOption | null {
    return getCurrentClient(formState.partner.clientId, formState.partner);
  }

  function getCurrentClient(
    clientId: string,
    participant: NumerologyFormState["subject"]
  ): ClientSelectOption | null {
    return (
      findClientSelectOption(clientOptions, clientId) ??
      toClientOptionFromNumerologyParticipant(participant)
    );
  }
}

export type NumerologyEditorSubmissionOutcome =
  | {
      readonly kind: "preview";
      readonly response: NumerologyPreviewResponse;
      readonly form: NumerologyFormState;
    }
  | { readonly kind: "recalculated"; readonly response: NumerologyCalculationResponse };

export async function executeNumerologyEditorSubmission(input: {
  readonly editor: NumerologyEditorState;
  readonly preview: (body: PreviewNumerologyRequest) => Promise<NumerologyPreviewResponse>;
  readonly recalculate: (request: {
    readonly calculationId: string;
    readonly body: RecalculateNumerologyCalculationRequest;
  }) => Promise<NumerologyCalculationResponse>;
}): Promise<NumerologyEditorSubmissionOutcome> {
  if (input.editor.kind === "recalculate" && input.editor.calculationId) {
    const response = await input.recalculate({
      calculationId: input.editor.calculationId,
      body: toNumerologyRecalculateRequest(input.editor)
    });
    return { kind: "recalculated", response };
  }

  const response = await input.preview(toPreviewNumerologyRequest(input.editor.form));
  return { kind: "preview", response, form: input.editor.form };
}

export type NumerologyAiDraftRequestOutcome =
  | { readonly kind: "skipped" }
  | { readonly kind: "success"; readonly response: NumerologyCalculationResponse }
  | { readonly kind: "error"; readonly message: string };

export async function requestNumerologyAiDraft(input: {
  readonly calculation: CalculationRecordResponse | null;
  readonly editorText: string;
  readonly isBusy: boolean;
  readonly mutate: (request: {
    readonly calculationId: string;
    readonly body: { readonly expectedResultChecksum: string };
  }) => Promise<NumerologyCalculationResponse>;
}): Promise<NumerologyAiDraftRequestOutcome> {
  const state = getNumerologyInterpretationState(input.calculation, input.editorText, input.isBusy);
  if (!input.calculation || state.aiDisabled) return { kind: "skipped" };

  try {
    const response = await input.mutate({
      calculationId: input.calculation.id,
      body: { expectedResultChecksum: input.calculation.resultChecksum }
    });
    return { kind: "success", response };
  } catch (error) {
    return { kind: "error", message: getNumerologyAiDraftErrorMessage(error) };
  }
}

export async function executeNumerologyPdfAction(input: {
  readonly calculation: CalculationRecordResponse | null;
  readonly locale: CalculationPdfLocale;
  readonly kind: NumerologyPdfAction["kind"];
  readonly job: CalculationPdfJob | null;
  readonly enqueue: (request: {
    readonly calculationId: string;
    readonly body: {
      readonly expectedResultChecksum: string;
      readonly locale: CalculationPdfLocale;
    };
  }) => Promise<unknown>;
  readonly download: (request: {
    readonly calculationId: string;
    readonly jobId: string;
  }) => Promise<CalculationPdfDownloadResponse>;
  readonly openUrl: (url: string) => unknown;
}): Promise<"skipped" | "enqueued" | "downloaded"> {
  if (!input.calculation) return "skipped";

  try {
    if (input.kind === "download" && input.job?.status === "ready") {
      const response = await input.download({
        calculationId: input.calculation.id,
        jobId: input.job.id
      });
      input.openUrl(response.url);
      return "downloaded";
    }

    if (input.kind === "request" || input.kind === "retry") {
      await input.enqueue({
        calculationId: input.calculation.id,
        body: {
          expectedResultChecksum: input.calculation.resultChecksum,
          locale: input.locale
        }
      });
      return "enqueued";
    }
  } catch (error) {
    throw new Error(getNumerologyPdfActionErrorMessage(error), { cause: error });
  }

  return "skipped";
}

function getNumerologyPdfActionErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 409) {
      return "Расчёт изменился. Обновите страницу и сформируйте PDF заново";
    }
    if (error.status === 404) {
      return "PDF-экспорт временно недоступен. Повторите позже";
    }
  }

  return "Не удалось выполнить действие с PDF. Повторите позже";
}

async function run(
  operation: () => Promise<void>,
  setError: (message: string | null) => void,
  fallback = "Не удалось выполнить действие"
) {
  try {
    setError(null);
    await operation();
  } catch (error) {
    setError(getNumerologyActionErrorMessage(error, fallback));
  }
}
