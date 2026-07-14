import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CalculationRecordResponse,
  NumerologyCalculationResponse,
  NumerologyResult
} from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { getFirstLinkableClientId } from "../../features/calculations/model/calculationStatus";
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
  toClientParticipantFormState,
  toCreateNumerologyRequest,
  toPreviewNumerologyRequest,
  type NumerologyFormState
} from "../../features/numerology/model/numerologyFormModel";
import {
  useApproveCalculationInterpretationMutation,
  useArchiveNumerologyMutation,
  useCreateNumerologyMutation,
  useLinkCalculationClientMutation,
  useNumerologyCalculationListQuery,
  usePreviewNumerologyMutation,
  usePublishCalculationMutation,
  useRecalculateNumerologyMutation,
  useSaveCalculationInterpretationMutation
} from "../../features/numerology/model/numerologyHooks";
import {
  getCalculationTitle,
  getCurrentInterpretation,
  toNumerologyFormState,
  toNumerologyResponse
} from "../../features/numerology/model/numerologyPageModel";
import { getLatestInterpretationText } from "../../features/numerology/model/numerologyResultModel";
import {
  createNewNumerologyEditorState,
  createRecalculationEditorState,
  getActiveNumerologyCalculations,
  getNumerologyEditorErrors,
  toNumerologyCreateRequest,
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
  const [editorState, setEditorState] = useState<NumerologyEditorState | null>(null);
  const [editorErrors, setEditorErrors] = useState<readonly string[]>([]);
  const [archiveTarget, setArchiveTarget] = useState<CalculationRecordResponse | null>(null);
  const previewGuardRef = useRef(createLatestPreviewGuard());
  const isPreviewPending = previewMutation.isPending;
  const isBusy =
    createMutation.isPending ||
    isPreviewPending ||
    linkMutation.isPending ||
    saveInterpretationMutation.isPending ||
    approveInterpretationMutation.isPending ||
    publishMutation.isPending ||
    recalculateMutation.isPending ||
    archiveMutation.isPending;

  useDocumentTitle("ElevenHouse | Нумерология");

  useEffect(() => {
    if (selectedResponse || previewResult || activeCalculations.length === 0) return;
    selectCalculation(activeCalculations[0]!);
  }, [activeCalculations, previewResult, selectedResponse]);

  useEffect(() => {
    setInterpretationText(getLatestInterpretationText(selectedResponse));
    setSelectedDetailSelector(null);
  }, [selectedResponse]);

  const selectedCalculation = selectedResponse?.calculation ?? null;

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
    isBusy,
    isPreviewPending,
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
    onInterpretationChange: setInterpretationText,
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
    }
  };

  function selectCalculation(calculation: CalculationRecordResponse): void {
    previewGuardRef.current.invalidate();
    const response = toNumerologyResponse(calculation);
    setPreviewResult(null);
    setSelectedResponse(response);
    setFormState(toNumerologyFormState(response));
    setEditorState(null);
    setEditorErrors([]);
    setArchiveTarget(null);
  }

  function openCreateEditor(): void {
    previewGuardRef.current.invalidate();
    setEditorState(createNewNumerologyEditorState());
    setEditorErrors([]);
    setArchiveTarget(null);
    setErrorMessage(null);
  }

  function openRecalculationEditor(): void {
    if (!selectedCalculation || selectedCalculation.status === "archived") return;
    previewGuardRef.current.invalidate();
    setEditorState(createRecalculationEditorState(selectedCalculation));
    setEditorErrors([]);
    setArchiveTarget(null);
    setErrorMessage(null);
  }

  function submitEditor(): void {
    if (!editorState) return;
    const errors = getNumerologyEditorErrors(editorState);
    if (errors.length > 0) {
      setEditorErrors(errors);
      return;
    }

    run(async () => {
      const response =
        editorState.kind === "recalculate" && editorState.calculationId
          ? await recalculateMutation.mutateAsync({
              calculationId: editorState.calculationId,
              body: toNumerologyRecalculateRequest(editorState)
            })
          : await createMutation.mutateAsync(toNumerologyCreateRequest(editorState));
      setPreviewResult(null);
      setSelectedResponse(response);
      setFormState(toNumerologyFormState(response));
      setEditorState(null);
      setEditorErrors([]);
    }, setErrorMessage);
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
        setSelectedResponse(null);
        setPreviewResult(response.result);
      } catch (error) {
        if (!previewGuardRef.current.isCurrent(requestId)) return;
        setPreviewError(error instanceof Error ? error.message : "Не удалось обновить расчет");
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

async function run(operation: () => Promise<void>, setError: (message: string | null) => void) {
  try {
    setError(null);
    await operation();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Не удалось выполнить действие");
  }
}
