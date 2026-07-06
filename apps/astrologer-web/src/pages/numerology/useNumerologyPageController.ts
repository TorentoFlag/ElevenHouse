import { useEffect, useMemo, useState } from "react";
import type {
  CalculationRecordResponse,
  NumerologyCalculationResponse
} from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  getFirstLinkableClientId,
  getLatestCalculationVersion
} from "../../features/calculations/model/calculationStatus";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import {
  createInitialNumerologyForm,
  getNumerologyFormErrors,
  toClientParticipantFormState,
  toCreateNumerologyRequest,
  type NumerologyFormState
} from "../../features/numerology/model/numerologyFormModel";
import {
  useApproveCalculationInterpretationMutation,
  useCreateNumerologyMutation,
  useLinkCalculationClientMutation,
  useNumerologyCalculationListQuery,
  usePublishCalculationMutation,
  useSaveCalculationInterpretationMutation
} from "../../features/numerology/model/numerologyHooks";
import {
  getCalculationTitle,
  getCurrentVersionInterpretation,
  toNumerologyFormState,
  toNumerologyResponse
} from "../../features/numerology/model/numerologyPageModel";
import { getLatestInterpretationText } from "../../features/numerology/model/numerologyResultModel";
import type { NumerologyPageViewProps } from "./NumerologyPageView";

export function useNumerologyPageController(): NumerologyPageViewProps {
  const listQuery = useNumerologyCalculationListQuery();
  const createMutation = useCreateNumerologyMutation();
  const linkMutation = useLinkCalculationClientMutation();
  const saveInterpretationMutation = useSaveCalculationInterpretationMutation();
  const approveInterpretationMutation = useApproveCalculationInterpretationMutation();
  const publishMutation = usePublishCalculationMutation();
  const calculations = useMemo(
    () => listQuery.data?.calculations ?? [],
    [listQuery.data?.calculations]
  );
  const [selectedResponse, setSelectedResponse] = useState<NumerologyCalculationResponse | null>(
    null
  );
  const [formState, setFormState] = useState<NumerologyFormState>(createInitialNumerologyForm);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isYearMode, setIsYearMode] = useState(false);
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [selectedDetailSelector, setSelectedDetailSelector] = useState<string | null>(null);
  const [interpretationText, setInterpretationText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isBusy =
    createMutation.isPending ||
    linkMutation.isPending ||
    saveInterpretationMutation.isPending ||
    approveInterpretationMutation.isPending ||
    publishMutation.isPending;

  useDocumentTitle("ElevenHouse | Нумерология");

  useEffect(() => {
    if (selectedResponse || calculations.length === 0) return;
    selectCalculation(calculations[0]!);
  }, [calculations, selectedResponse]);

  useEffect(() => {
    setInterpretationText(getLatestInterpretationText(selectedResponse));
    setSelectedDetailSelector(null);
  }, [selectedResponse]);

  const selectedCalculation = selectedResponse?.calculation ?? null;
  const currentVersion = useMemo(
    () => (selectedCalculation ? getLatestCalculationVersion(selectedCalculation) : null),
    [selectedCalculation]
  );

  return {
    calculations,
    selectedResponse,
    formState,
    isSetupOpen,
    isYearMode,
    isPresentationOpen,
    selectedDetailSelector,
    interpretationText,
    errorMessage,
    isBusy,
    onOpenSetup: () => setIsSetupOpen(true),
    onCloseSetup: () => setIsSetupOpen(false),
    onFormChange: setFormState,
    onSelectSubjectClient: (client) => selectPlatformClient("subject", client),
    onSelectPartnerClient: (client) => selectPlatformClient("partner", client),
    onCreate: () => {
      run(async () => {
        const response = await createMutation.mutateAsync(toCreateNumerologyRequest(formState));
        setSelectedResponse(response);
        setIsSetupOpen(false);
      }, setErrorMessage);
    },
    onSelectSaved: (calculation) => {
      selectCalculation(calculation);
      setErrorMessage(null);
    },
    onSelectDetail: setSelectedDetailSelector,
    onToggleYearMode: () => setIsYearMode((value) => !value),
    onToggleCompatibilityMode: () => {
      if (formState.mode === "compatibility") return;
      setFormState((state) => ({ ...state, mode: "compatibility" }));
      setIsSetupOpen(true);
    },
    onOpenPresentation: () => setIsPresentationOpen(true),
    onClosePresentation: () => setIsPresentationOpen(false),
    onLink: () => {
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
          body: { clientId }
        });
        setSelectedResponse(toNumerologyResponse(calculation));
      }, setErrorMessage);
    },
    onInterpretationChange: setInterpretationText,
    onSaveInterpretation: () => {
      if (!selectedCalculation || !currentVersion) return;
      run(async () => {
        const calculation = await saveInterpretationMutation.mutateAsync({
          calculationId: selectedCalculation.id,
          body: {
            versionId: currentVersion.id,
            text: interpretationText
          }
        });
        setSelectedResponse(toNumerologyResponse(calculation));
      }, setErrorMessage);
    },
    onApproveInterpretation: () => {
      const latestInterpretation = getCurrentVersionInterpretation(selectedCalculation);
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
      setIsSetupOpen(true);
      return;
    }

    run(async () => {
      const response = await createMutation.mutateAsync(toCreateNumerologyRequest(nextState));
      setSelectedResponse(response);
      setIsSetupOpen(false);
    }, setErrorMessage);
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
