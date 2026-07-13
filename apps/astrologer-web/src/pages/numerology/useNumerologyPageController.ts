import { useEffect, useMemo, useState } from "react";
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
  useCreateNumerologyMutation,
  useLinkCalculationClientMutation,
  useNumerologyCalculationListQuery,
  usePreviewNumerologyMutation,
  usePublishCalculationMutation,
  useSaveCalculationInterpretationMutation
} from "../../features/numerology/model/numerologyHooks";
import {
  getCalculationTitle,
  getCurrentInterpretation,
  toNumerologyFormState,
  toNumerologyResponse
} from "../../features/numerology/model/numerologyPageModel";
import { getLatestInterpretationText } from "../../features/numerology/model/numerologyResultModel";
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
  const calculations = useMemo(
    () => listQuery.data?.calculations ?? [],
    [listQuery.data?.calculations]
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
  const [isYearMode, setIsYearMode] = useState(false);
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [selectedDetailSelector, setSelectedDetailSelector] = useState<string | null>(null);
  const [interpretationText, setInterpretationText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isBusy =
    createMutation.isPending ||
    previewMutation.isPending ||
    linkMutation.isPending ||
    saveInterpretationMutation.isPending ||
    approveInterpretationMutation.isPending ||
    publishMutation.isPending;

  useDocumentTitle("ElevenHouse | Нумерология");

  useEffect(() => {
    if (selectedResponse || previewResult || calculations.length === 0) return;
    selectCalculation(calculations[0]!);
  }, [calculations, previewResult, selectedResponse]);

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
    isYearMode,
    isPresentationOpen,
    selectedDetailSelector,
    interpretationText,
    errorMessage,
    isBusy,
    onSelectSubjectClient: (client) => selectPlatformClient("subject", client),
    onSelectPartnerClient: (client) => selectPlatformClient("partner", client),
    onSelectSaved: (calculation) => {
      selectCalculation(calculation);
      setErrorMessage(null);
    },
    onSelectDetail: setSelectedDetailSelector,
    onToggleYearMode: () => setIsYearMode((value) => !value),
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
          body: { text: interpretationText }
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
    const response = toNumerologyResponse(calculation);
    setPreviewResult(null);
    setSelectedResponse(response);
    setFormState(toNumerologyFormState(response));
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
      setErrorMessage(
        nextState.mode === "compatibility"
          ? "Выберите второго клиента с датой рождения для совместимости"
          : "Заполните данные расчета"
      );
      return;
    }

    selectOrPreviewCalculation(nextState);
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

    setIsYearMode(false);
    setSelectedDetailSelector(null);
    setFormState(nextState);

    if (!partner) {
      setErrorMessage("Выберите второго клиента с датой рождения для совместимости");
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
    selectOrPreviewCalculation(nextState);
  }

  function selectOrPreviewCalculation(nextState: NumerologyFormState): void {
    const errors = getNumerologyFormErrors(nextState);
    if (errors.length > 0) {
      setErrorMessage(errors[0] ?? "Заполните данные расчета");
      return;
    }

    const existing = findExistingCalculationForParticipants(calculations, {
      mode: nextState.mode,
      subjectClientId: nextState.subject.clientId,
      ...(nextState.mode === "compatibility" ? { partnerClientId: nextState.partner.clientId } : {})
    });

    if (existing) {
      selectCalculation(existing);
      setErrorMessage(null);
      return;
    }

    run(async () => {
      const response = await previewMutation.mutateAsync(toPreviewNumerologyRequest(nextState));
      setSelectedResponse(null);
      setPreviewResult(response.result);
    }, setErrorMessage);
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
