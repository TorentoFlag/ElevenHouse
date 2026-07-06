import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createNumerologyCalculationRequestSchema,
  numerologyCalculationResponseSchema,
  type CalculationRecordResponse,
  type CreateNumerologyCalculationRequest,
  type NumerologyCalculationResponse
} from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  getFirstLinkableClientId,
  getLatestCalculationVersion
} from "../../features/calculations/model/calculationStatus";
import {
  astrologerClientListQueryOptions,
  toClientSelectOptions
} from "../../features/clients/model/clientSelectorModel";
import {
  createInitialNumerologyForm,
  createParticipantFormState,
  toCreateNumerologyRequest,
  type NumerologyFormState
} from "../../features/numerology/model/numerologyFormModel";
import {
  useApproveCalculationInterpretationMutation,
  useCreateNumerologyMutation,
  useLinkCalculationClientMutation,
  useNumerologyCalculationListQuery,
  usePublishCalculationMutation,
  useRecalculateNumerologyMutation,
  useSaveCalculationInterpretationMutation
} from "../../features/numerology/model/numerologyHooks";
import { getLatestInterpretationText } from "../../features/numerology/model/numerologyResultModel";
import { NumerologyPageView } from "./NumerologyPageView";

export function NumerologyPage() {
  const listQuery = useNumerologyCalculationListQuery();
  const clientsQuery = useQuery(astrologerClientListQueryOptions());
  const createMutation = useCreateNumerologyMutation();
  const recalculateMutation = useRecalculateNumerologyMutation();
  const linkMutation = useLinkCalculationClientMutation();
  const saveInterpretationMutation = useSaveCalculationInterpretationMutation();
  const approveInterpretationMutation = useApproveCalculationInterpretationMutation();
  const publishMutation = usePublishCalculationMutation();
  const calculations = listQuery.data?.calculations ?? [];
  const clientOptions = useMemo(
    () => toClientSelectOptions(clientsQuery.data?.clients ?? []),
    [clientsQuery.data?.clients]
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
    recalculateMutation.isPending ||
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

  return (
    <NumerologyPageView
      calculations={calculations}
      selectedResponse={selectedResponse}
      clientOptions={clientOptions}
      formState={formState}
      isSetupOpen={isSetupOpen}
      isYearMode={isYearMode}
      isPresentationOpen={isPresentationOpen}
      selectedDetailSelector={selectedDetailSelector}
      interpretationText={interpretationText}
      errorMessage={errorMessage}
      isBusy={isBusy}
      onOpenSetup={() => setIsSetupOpen(true)}
      onCloseSetup={() => setIsSetupOpen(false)}
      onFormChange={setFormState}
      onCreate={() => {
        run(async () => {
          const response = await createMutation.mutateAsync(toCreateNumerologyRequest(formState));
          setSelectedResponse(response);
          setIsSetupOpen(false);
        }, setErrorMessage);
      }}
      onRecalculate={() => {
        if (!selectedCalculation) return;
        run(async () => {
          const response = await recalculateMutation.mutateAsync({
            calculationId: selectedCalculation.id,
            body: toCreateNumerologyRequest(formState)
          });
          setSelectedResponse(response);
        }, setErrorMessage);
      }}
      onSelectSaved={(calculation) => {
        selectCalculation(calculation);
        setErrorMessage(null);
      }}
      onSelectDetail={setSelectedDetailSelector}
      onToggleYearMode={() => setIsYearMode((value) => !value)}
      onToggleCompatibilityMode={() => {
        if (formState.mode === "compatibility") return;
        setFormState((state) => ({ ...state, mode: "compatibility" }));
        setIsSetupOpen(true);
      }}
      onOpenPresentation={() => {
        setIsPresentationOpen(true);
      }}
      onClosePresentation={() => setIsPresentationOpen(false)}
      onLink={() => {
        const clientId = getFirstLinkableClientId(selectedCalculation);
        if (!selectedCalculation || !clientId) return;
        run(async () => {
          const calculation = await linkMutation.mutateAsync({
            calculationId: selectedCalculation.id,
            body: { clientId }
          });
          setSelectedResponse(toNumerologyResponse(calculation));
        }, setErrorMessage);
      }}
      onPublish={() => {
        const clientId = getFirstLinkableClientId(selectedCalculation);
        if (!selectedCalculation || !clientId) return;
        run(async () => {
          const calculation = await publishMutation.mutateAsync({
            calculationId: selectedCalculation.id,
            body: { clientId }
          });
          setSelectedResponse(toNumerologyResponse(calculation));
        }, setErrorMessage);
      }}
      onInterpretationChange={setInterpretationText}
      onSaveInterpretation={() => {
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
      }}
      onApproveInterpretation={() => {
        const latestInterpretation = selectedCalculation?.interpretations.at(-1);
        if (!selectedCalculation || !latestInterpretation) return;
        run(async () => {
          const calculation = await approveInterpretationMutation.mutateAsync({
            calculationId: selectedCalculation.id,
            interpretationId: latestInterpretation.id
          });
          setSelectedResponse(toNumerologyResponse(calculation));
        }, setErrorMessage);
      }}
    />
  );

  function selectCalculation(calculation: CalculationRecordResponse): void {
    const response = toNumerologyResponse(calculation);
    setSelectedResponse(response);
    setFormState(toFormState(response));
  }
}

function toNumerologyResponse(
  calculation: CalculationRecordResponse
): NumerologyCalculationResponse {
  const currentVersion = getLatestCalculationVersion(calculation);
  if (!currentVersion) {
    throw new Error("Calculation has no versions");
  }

  return numerologyCalculationResponseSchema.parse({
    calculation,
    currentVersion,
    resultSnapshot: currentVersion.resultSnapshot,
    settingsSnapshot: currentVersion.settingsSnapshot,
    inputSnapshot: currentVersion.inputSnapshot
  });
}

async function run(operation: () => Promise<void>, setError: (message: string | null) => void) {
  try {
    setError(null);
    await operation();
  } catch (error) {
    setError(error instanceof Error ? error.message : "Не удалось выполнить действие");
  }
}

function toFormState(response: NumerologyCalculationResponse): NumerologyFormState {
  const parsed = createNumerologyCalculationRequestSchema.safeParse(response.inputSnapshot);
  if (!parsed.success) return createInitialNumerologyForm();

  const subject = parsed.data.participants.find((participant) => participant.role === "subject");
  const partner = parsed.data.participants.find((participant) => participant.role === "partner");

  return {
    mode: parsed.data.mode,
    title: parsed.data.title,
    subject: subject ? toParticipantFormState(subject) : createParticipantFormState("manual"),
    partner: partner ? toParticipantFormState(partner) : createParticipantFormState("manual"),
    includeNameNumbers: parsed.data.settings.includeNameNumbers,
    includePsychomatrix: parsed.data.settings.includePsychomatrix,
    includeStrengthLines: parsed.data.settings.includeStrengthLines,
    forecastDate: parsed.data.settings.forecastDate ?? ""
  };
}

function toParticipantFormState(
  participant: CreateNumerologyCalculationRequest["participants"][number]
) {
  return {
    source: participant.source,
    clientId: participant.clientId ?? "",
    displayName: participant.displayName ?? "",
    fullName: participant.fullName ?? "",
    birthDate: participant.birthDate ?? "",
    birthTime: participant.birthTime ?? "",
    birthTimePrecision: participant.birthTimePrecision ?? "unknown",
    birthPlaceText: participant.birthPlaceText ?? "",
    birthCountryCode: participant.birthCountryCode ?? "",
    birthCity: participant.birthCity ?? "",
    birthRegion: participant.birthRegion ?? "",
    birthTimezone: participant.birthTimezone ?? "",
    birthLatitude: participant.birthLatitude ?? null,
    birthLongitude: participant.birthLongitude ?? null
  };
}
