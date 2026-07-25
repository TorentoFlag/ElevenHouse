import { useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import {
  createHumanDesignViewModel,
  createHumanDesignTransitViewModel,
  type HumanDesignDetailKey
} from "../../features/human-design/model/humanDesignViewModel";
import {
  buildHumanDesignPdfAction,
  executeHumanDesignPdfAction
} from "../../features/human-design/model/humanDesignPdfModel";
import {
  getCurrentHumanDesignInterpretation,
  getHumanDesignAiDraftErrorMessage,
  getHumanDesignInterpretationState
} from "../../features/human-design/model/humanDesignInterpretationModel";
import {
  useApproveHumanDesignInterpretationMutation,
  useCreateHumanDesignAiDraftMutation,
  useCreateHumanDesignCalculationMutation,
  useDownloadHumanDesignPdfMutation,
  useEnqueueHumanDesignPdfMutation,
  useGetHumanDesignTransitMutation,
  useHumanDesignCalculationListQuery,
  useHumanDesignPdfQuery,
  usePreviewHumanDesignMutation,
  useRecalculateHumanDesignCalculationMutation,
  useSaveHumanDesignInterpretationMutation
} from "../../features/human-design/model/humanDesignHooks";
import {
  getActiveHumanDesignCalculations,
  toClientOptionFromHumanDesignCalculation,
  toHumanDesignCalculationResponse
} from "../../features/human-design/model/humanDesignSavedCalculationModel";
import type {
  HumanDesignPageViewProps,
  HumanDesignToolbarOverlay,
  HumanDesignWorkspaceMode
} from "./HumanDesignPageView";

export function useHumanDesignPageController(): HumanDesignPageViewProps {
  useDocumentTitle("ElevenHouse | Дизайн человека");
  const listQuery = useHumanDesignCalculationListQuery();
  const previewMutation = usePreviewHumanDesignMutation();
  const createMutation = useCreateHumanDesignCalculationMutation();
  const recalculateMutation = useRecalculateHumanDesignCalculationMutation();
  const transitMutation = useGetHumanDesignTransitMutation();
  const aiDraftMutation = useCreateHumanDesignAiDraftMutation();
  const saveInterpretationMutation = useSaveHumanDesignInterpretationMutation();
  const approveInterpretationMutation = useApproveHumanDesignInterpretationMutation();
  const enqueuePdfMutation = useEnqueueHumanDesignPdfMutation();
  const downloadPdfMutation = useDownloadHumanDesignPdfMutation();
  const [mode, setMode] = useState<HumanDesignWorkspaceMode>("individual");
  const [selectedClient, setSelectedClient] = useState<ClientSelectOption | null>(null);
  const [selectedPartnerClient, setSelectedPartnerClient] =
    useState<ClientSelectOption | null>(null);
  const [savedResponse, setSavedResponse] = useState<
    ReturnType<typeof toHumanDesignCalculationResponse> | null
  >(null);
  const [transitInstantValue, setTransitInstantValue] = useState(() =>
    toDatetimeLocalValue(new Date())
  );
  const [selectedDetailKey, setSelectedDetailKey] = useState<HumanDesignDetailKey>("type");
  const [openToolbarOverlay, setOpenToolbarOverlay] =
    useState<HumanDesignToolbarOverlay>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [aiDraftErrorMessage, setAiDraftErrorMessage] = useState<string | null>(null);
  const [pdfErrorMessage, setPdfErrorMessage] = useState<string | null>(null);
  const [interpretationText, setInterpretationText] = useState("");
  const pdfLocale = "ru";
  const calculations = useMemo(
    () =>
      getActiveHumanDesignCalculations(
        listQuery.data?.calculations ?? [],
        mode === "compatibility" ? "compatibility" : "individual"
      ),
    [listQuery.data?.calculations, mode]
  );
  const model = useMemo(
    () =>
      savedResponse
        ? createHumanDesignViewModel(savedResponse.result)
      : previewMutation.data
          ? createHumanDesignViewModel(previewMutation.data.result)
          : null,
    [previewMutation.data, savedResponse]
  );
  const transitModel = useMemo(
    () =>
      transitMutation.data
        ? createHumanDesignTransitViewModel(transitMutation.data.result)
        : null,
    [transitMutation.data]
  );
  const pdfQuery = useHumanDesignPdfQuery({
    calculationId: savedResponse?.calculation.id ?? "",
    locale: pdfLocale,
    resultChecksum: savedResponse?.calculation.resultChecksum ?? ""
  });
  const isBusy =
    previewMutation.isPending ||
    createMutation.isPending ||
    recalculateMutation.isPending ||
    transitMutation.isPending ||
    aiDraftMutation.isPending ||
    saveInterpretationMutation.isPending ||
    approveInterpretationMutation.isPending ||
    enqueuePdfMutation.isPending ||
    downloadPdfMutation.isPending;
  const canOpenTransitMode = savedResponse?.result.mode === "individual";
  const interpretationState = getHumanDesignInterpretationState(
    savedResponse?.calculation ?? null,
    interpretationText,
    isBusy
  );
  const latestInterpretationText = savedResponse?.calculation.interpretations.at(-1)?.text ?? "";
  const pdfAction = buildHumanDesignPdfAction({
    calculationId: savedResponse?.calculation.id ?? null,
    resultChecksum: savedResponse?.calculation.resultChecksum ?? null,
    currentResultChecksum: pdfQuery.data?.currentResultChecksum ?? null,
    job: pdfQuery.data?.job ?? null,
    isBusy,
    isTransitMode: mode === "transit"
  });
  useEffect(() => {
    setInterpretationText(latestInterpretationText);
  }, [savedResponse?.calculation.id, latestInterpretationText]);
  return {
    mode,
    selectedClient,
    selectedPartnerClient,
    model,
    transitModel,
    transitInstantValue,
    canOpenTransitMode,
    selectedDetailKey,
    calculations,
    selectedCalculationId: savedResponse?.calculation.id ?? null,
    errorMessage,
    aiDraftText: interpretationText,
    aiDraftStatus: interpretationState.latestStatus,
    aiDraftErrorMessage,
    aiDraftDisabledReason: interpretationState.aiDisabledReason,
    aiDraftSaveDisabled: interpretationState.saveDisabled,
    aiDraftApproveDisabled: interpretationState.approveDisabled,
    pdfLabel: pdfAction.label,
    pdfDisabled: pdfAction.disabled,
    pdfTitle: pdfAction.title,
    pdfErrorMessage: pdfErrorMessage ?? pdfAction.errorMessage,
    isBusy,
    isLinked: mode !== "transit" && Boolean(savedResponse),
    openToolbarOverlay,
    onOpenToolbarOverlayChange: setOpenToolbarOverlay,
    onSelectMode: (nextMode) => {
      setOpenToolbarOverlay(null);
      if (nextMode === "transit") {
        if (!canOpenTransitMode) {
          setErrorMessage("Откройте сохранённый individual расчёт Human Design.");
          return;
        }
        setMode("transit");
        setSelectedPartnerClient(null);
        setSelectedDetailKey("type");
        setErrorMessage(null);
        setAiDraftErrorMessage(null);
        setPdfErrorMessage(null);
        previewMutation.reset();
        createMutation.reset();
        recalculateMutation.reset();
        transitMutation.reset();
        aiDraftMutation.reset();
        saveInterpretationMutation.reset();
        approveInterpretationMutation.reset();
        void fetchTransit();
        return;
      }
      setMode(nextMode);
      clearResultState(nextMode);
    },
    onSelectClient: (client) => {
      setOpenToolbarOverlay(null);
      setSelectedClient(client);
      clearResultState(mode);
      if (mode === "individual" && client.hasBirthDate) void previewIndividual(client);
      if (mode === "compatibility" && client.hasBirthDate && selectedPartnerClient?.hasBirthDate) {
        void previewCompatibility(client, selectedPartnerClient);
      }
    },
    onSelectPartnerClient: (client) => {
      setOpenToolbarOverlay(null);
      setSelectedPartnerClient(client);
      clearResultState("compatibility");
      if (mode === "compatibility" && selectedClient?.hasBirthDate && client.hasBirthDate) {
        void previewCompatibility(selectedClient, client);
      }
    },
    onChangeTransitInstant: (value) => {
      setTransitInstantValue(value);
      transitMutation.reset();
      aiDraftMutation.reset();
      saveInterpretationMutation.reset();
      approveInterpretationMutation.reset();
      setErrorMessage(null);
      setAiDraftErrorMessage(null);
      setPdfErrorMessage(null);
    },
    onSelectDetail: setSelectedDetailKey,
    onChangeAiDraftText: (value) => {
      setInterpretationText(value);
      setAiDraftErrorMessage(null);
    },
    onSelectSaved: (calculation) => {
      setOpenToolbarOverlay(null);
      try {
        const response = toHumanDesignCalculationResponse(calculation);
        setMode(mode === "transit" && response.result.mode === "individual" ? "transit" : calculation.mode);
        setSavedResponse(response);
        setSelectedClient(toClientOptionFromHumanDesignCalculation(calculation, "subject"));
        setSelectedPartnerClient(toClientOptionFromHumanDesignCalculation(calculation, "partner"));
        setSelectedDetailKey(defaultDetailKey(mode === "transit" ? "transit" : calculation.mode));
        setErrorMessage(null);
        previewMutation.reset();
        createMutation.reset();
        recalculateMutation.reset();
        transitMutation.reset();
        aiDraftMutation.reset();
        saveInterpretationMutation.reset();
        approveInterpretationMutation.reset();
        setAiDraftErrorMessage(null);
      } catch {
        setErrorMessage("Сохранённый расчёт Human Design повреждён или устарел.");
      }
    },
    onPreview: () => {
      if (mode === "individual" && selectedClient) void previewIndividual(selectedClient);
      if (mode === "compatibility" && selectedClient && selectedPartnerClient) {
        void previewCompatibility(selectedClient, selectedPartnerClient);
      }
    },
    onFetchTransit: () => {
      void fetchTransit();
    },
    onCreateAiDraft: () => {
      void createAiDraft();
    },
    onPdf: () => {
      void executePdf();
    },
    onSaveAiDraft: () => {
      void saveAiDraft();
    },
    onApproveAiDraft: () => {
      void approveAiDraft();
    },
    onPersist: () => {
      if (mode === "individual" && selectedClient && model) void persistIndividual(selectedClient);
      if (mode === "compatibility" && selectedClient && selectedPartnerClient && model) {
        void persistCompatibility(selectedClient, selectedPartnerClient);
      }
    },
    onRecalculate: () => {
      if (savedResponse) void recalculate(savedResponse.calculation.id);
    }
  };

  function clearResultState(nextMode: HumanDesignWorkspaceMode) {
    setSavedResponse(null);
    setSelectedDetailKey(defaultDetailKey(nextMode));
    setErrorMessage(null);
    previewMutation.reset();
    createMutation.reset();
    recalculateMutation.reset();
    transitMutation.reset();
    aiDraftMutation.reset();
    saveInterpretationMutation.reset();
    approveInterpretationMutation.reset();
    setAiDraftErrorMessage(null);
    setPdfErrorMessage(null);
    setInterpretationText("");
  }

  async function previewIndividual(client: ClientSelectOption) {
    if (!client.hasBirthDate) {
      setErrorMessage("В карточке клиента не заполнена дата рождения.");
      return;
    }
    setErrorMessage(null);
    try {
      await previewMutation.mutateAsync({
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: client.value
      });
      setSavedResponse(null);
      createMutation.reset();
      recalculateMutation.reset();
      transitMutation.reset();
      aiDraftMutation.reset();
      saveInterpretationMutation.reset();
      approveInterpretationMutation.reset();
      setPdfErrorMessage(null);
      setSelectedDetailKey("type");
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }

  async function previewCompatibility(subject: ClientSelectOption, partner: ClientSelectOption) {
    const validationError = validateCompatibilityClients(subject, partner);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    setErrorMessage(null);
    try {
      await previewMutation.mutateAsync({
        mode: "compatibility",
        methodCode: "human_design_classic",
        source: "client_pair",
        subjectClientId: subject.value,
        partnerClientId: partner.value
      });
      setSavedResponse(null);
      createMutation.reset();
      recalculateMutation.reset();
      transitMutation.reset();
      aiDraftMutation.reset();
      saveInterpretationMutation.reset();
      approveInterpretationMutation.reset();
      setPdfErrorMessage(null);
      setSelectedDetailKey("compatibility:summary");
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }

  async function persistIndividual(client: ClientSelectOption) {
    if (!model) return;
    setErrorMessage(null);
    try {
      const response = await createMutation.mutateAsync({
        mode: "individual",
        methodCode: "human_design_classic",
        source: "client",
        clientId: client.value
      });
      setSavedResponse(response);
      previewMutation.reset();
      recalculateMutation.reset();
      transitMutation.reset();
      aiDraftMutation.reset();
      saveInterpretationMutation.reset();
      approveInterpretationMutation.reset();
      setPdfErrorMessage(null);
      setSelectedDetailKey("type");
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }

  async function persistCompatibility(subject: ClientSelectOption, partner: ClientSelectOption) {
    if (!model) return;
    const validationError = validateCompatibilityClients(subject, partner);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    setErrorMessage(null);
    try {
      const response = await createMutation.mutateAsync({
        mode: "compatibility",
        methodCode: "human_design_classic",
        source: "client_pair",
        subjectClientId: subject.value,
        partnerClientId: partner.value
      });
      setSavedResponse(response);
      previewMutation.reset();
      recalculateMutation.reset();
      transitMutation.reset();
      aiDraftMutation.reset();
      saveInterpretationMutation.reset();
      approveInterpretationMutation.reset();
      setPdfErrorMessage(null);
      setSelectedDetailKey("compatibility:summary");
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }

  async function recalculate(calculationId: string) {
    setErrorMessage(null);
    try {
      const response = await recalculateMutation.mutateAsync({ calculationId });
      setMode(response.calculation.mode);
      setSavedResponse(response);
      setSelectedClient(toClientOptionFromHumanDesignCalculation(response.calculation, "subject"));
      setSelectedPartnerClient(
        toClientOptionFromHumanDesignCalculation(response.calculation, "partner")
      );
      previewMutation.reset();
      createMutation.reset();
      transitMutation.reset();
      aiDraftMutation.reset();
      saveInterpretationMutation.reset();
      approveInterpretationMutation.reset();
      setPdfErrorMessage(null);
      setSelectedDetailKey(defaultDetailKey(response.calculation.mode));
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }

  async function fetchTransit() {
    if (!savedResponse || savedResponse.result.mode !== "individual") {
      setErrorMessage("Откройте сохранённый individual расчёт Human Design.");
      return;
    }
    const instant = toTransitInstant(transitInstantValue);
    if (!instant) {
      setErrorMessage("Укажите корректный момент транзита.");
      return;
    }
    setErrorMessage(null);
    try {
      await transitMutation.mutateAsync({
        calculationId: savedResponse.calculation.id,
        query: { instant }
      });
    } catch (error) {
      setErrorMessage(getHumanDesignErrorMessage(error));
    }
  }

  async function createAiDraft() {
    if (!savedResponse) {
      setAiDraftErrorMessage("Сначала сохраните расчёт.");
      return;
    }
    const interpretationState = getHumanDesignInterpretationState(
      savedResponse.calculation,
      interpretationText,
      false
    );
    if (interpretationState.aiDisabled) {
      setAiDraftErrorMessage(interpretationState.aiDisabledReason);
      return;
    }
    const transitInstant = mode === "transit" ? toTransitInstant(transitInstantValue) : null;
    if (mode === "transit" && !transitInstant) {
      setAiDraftErrorMessage("Укажите корректный момент транзита.");
      return;
    }
    setErrorMessage(null);
    setAiDraftErrorMessage(null);
    try {
      const response = await aiDraftMutation.mutateAsync({
        calculationId: savedResponse.calculation.id,
        body: {
          expectedResultChecksum: savedResponse.calculation.resultChecksum,
          ...(transitInstant ? { transitInstant } : {})
        }
      });
      setSavedResponse(response);
      previewMutation.reset();
      createMutation.reset();
      recalculateMutation.reset();
      transitMutation.reset();
    } catch (error) {
      setAiDraftErrorMessage(getHumanDesignAiDraftErrorMessage(error));
    }
  }

  async function saveAiDraft() {
    if (!savedResponse || interpretationState.saveDisabled) return;
    setErrorMessage(null);
    setAiDraftErrorMessage(null);
    try {
      const calculation = await saveInterpretationMutation.mutateAsync({
        calculationId: savedResponse.calculation.id,
        body: {
          text: interpretationText,
          expectedResultChecksum: savedResponse.calculation.resultChecksum
        }
      });
      setSavedResponse(toHumanDesignCalculationResponse(calculation));
    } catch (error) {
      setAiDraftErrorMessage(getHumanDesignAiDraftErrorMessage(error));
    }
  }

  async function approveAiDraft() {
    const latestInterpretation = getCurrentHumanDesignInterpretation(
      savedResponse?.calculation ?? null
    );
    if (!savedResponse || !latestInterpretation || interpretationState.approveDisabled) return;
    setErrorMessage(null);
    setAiDraftErrorMessage(null);
    try {
      const calculation = await approveInterpretationMutation.mutateAsync({
        calculationId: savedResponse.calculation.id,
        interpretationId: latestInterpretation.id
      });
      setSavedResponse(toHumanDesignCalculationResponse(calculation));
    } catch (error) {
      setAiDraftErrorMessage(getHumanDesignAiDraftErrorMessage(error));
    }
  }

  async function executePdf() {
    setErrorMessage(null);
    setPdfErrorMessage(null);
    try {
      await executeHumanDesignPdfAction({
        calculationId: savedResponse?.calculation.id ?? null,
        resultChecksum: savedResponse?.calculation.resultChecksum ?? null,
        locale: pdfLocale,
        kind: pdfAction.kind,
        job: pdfQuery.data?.job ?? null,
        enqueue: (input) => enqueuePdfMutation.mutateAsync(input),
        download: (input) => downloadPdfMutation.mutateAsync(input),
        openUrl: (url) => window.open(url, "_blank", "noopener,noreferrer")
      });
    } catch (error) {
      setPdfErrorMessage(error instanceof Error ? error.message : "Не удалось выполнить PDF");
    }
  }
}

function validateCompatibilityClients(
  subject: ClientSelectOption,
  partner: ClientSelectOption
): string | null {
  if (!subject.hasBirthDate) return "В карточке клиента не заполнена дата рождения.";
  if (!partner.hasBirthDate) return "В карточке партнёра не заполнена дата рождения.";
  if (subject.value === partner.value) {
    return "Для партнёрского разбора выберите двух разных клиентов.";
  }
  return null;
}

function defaultDetailKey(mode: HumanDesignWorkspaceMode): HumanDesignDetailKey {
  return mode === "compatibility" ? "compatibility:summary" : "type";
}

function getHumanDesignErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Не удалось рассчитать Human Design.";
}

function toDatetimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toTransitInstant(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
