import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChartHoraryQuestionSnapshot,
  ChartSettings,
  ChartTransitMoment,
  StoredChartCalculationPayload
} from "@elevenhouse/contracts";
import { useI18n } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { getAstrologerClient, updateClientBirthData } from "../../features/clients/api/clientsApi";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import {
  astrologerClientsQueryKeys,
  toClientSelectOptions
} from "../../features/clients/model/clientSelectorModel";
import {
  createHoraryChartJob,
  createCompositeChartJob,
  createNatalChartJob,
  createProgressionChartJob,
  createSolarReturnChartJob,
  createSynastryChartJob,
  createTransitChartJob,
  downloadChartPdf,
  enqueueChartPdf,
  getChartCalculation,
  getChartJob,
  getLatestChartPdf,
  recalculateChart
} from "../../features/charts/api/chartsApi";
import {
  getChartBirthDataReadiness,
  isChartResultStale,
  toChartHoraryQuestionSnapshot
} from "../../features/charts/model/chartEngineState";
import {
  buildChartPdfAction,
  executeChartPdfAction
} from "../../features/charts/model/chartPdfModel";
import type {
  ChartEngineMode,
  ChartEnginePageJobState,
  ChartHoraryQuestionInput,
  ChartTransitMomentInput
} from "../../features/charts/components/ChartEnginePage";
import { getChartResultMethodForMode } from "../../features/charts/components/ChartEnginePage";

const defaultSettings: ChartSettings = {
  zodiac: "tropical",
  houseSystem: "placidus",
  nodeType: "true",
  aspectPreset: "major",
  orbMultiplier: 1
};

export function useChartEngineController() {
  useDocumentTitle("ElevenHouse | Движок карт");
  const { locale } = useI18n();
  const pdfLocale = locale === "en" ? "en" : "ru";
  const queryClient = useQueryClient();
  const initialUrlState = useMemo(() => readChartEngineUrlState(), []);
  const [selectedClient, setSelectedClient] = useState<ClientSelectOption | null>(null);
  const [selectedPartnerClient, setSelectedPartnerClient] = useState<ClientSelectOption | null>(
    null
  );
  const [restoredPartnerClientId, setRestoredPartnerClientId] = useState<string | null>(
    initialUrlState.partnerClientId ?? null
  );
  const [settings, setSettings] = useState<ChartSettings>(defaultSettings);
  const [mode, setMode] = useState<ChartEngineMode>(initialUrlState.mode ?? "natal");
  const [transitMoment, setTransitMoment] = useState<ChartTransitMomentInput>(() =>
    getDefaultTransitMoment()
  );
  const [solarReturnYear, setSolarReturnYear] = useState(() => new Date().getFullYear());
  const [progressionTargetDate, setProgressionTargetDate] = useState(() =>
    getDefaultProgressionTargetDate()
  );
  const [horaryQuestion, setHoraryQuestion] = useState<ChartHoraryQuestionInput>(() =>
    getDefaultHoraryQuestion()
  );
  const [jobId, setJobId] = useState<string | null>(null);
  const [calculationId, setCalculationId] = useState<string | null>(initialUrlState.calculationId);
  const [immediateResult, setImmediateResult] = useState<StoredChartCalculationPayload | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasResultStaleIntent, setHasResultStaleIntent] = useState(false);

  const restoredClientQuery = useQuery({
    queryKey: ["clients", "detail", initialUrlState.clientId],
    queryFn: () => getAstrologerClient(initialUrlState.clientId ?? ""),
    enabled: Boolean(initialUrlState.clientId && !selectedClient)
  });
  const partnerClientIdToRestore = restoredPartnerClientId;
  const restoredPartnerClientQuery = useQuery({
    queryKey: ["clients", "detail", partnerClientIdToRestore],
    queryFn: () => getAstrologerClient(partnerClientIdToRestore ?? ""),
    enabled: Boolean(partnerClientIdToRestore && !selectedPartnerClient)
  });

  const calculationMutation = useMutation({
    mutationFn: ({
      clientId,
      isResultStale,
      settings
    }: {
      readonly clientId: string;
      readonly isResultStale: boolean;
      readonly settings: ChartSettings;
    }) =>
      submitChartCalculation({
        clientId,
        calculationId,
        isResultStale,
        settings,
        create: createNatalChartJob,
        recalculate: recalculateChart
      }),
    onSuccess: (response, variables) => {
      setErrorMessage(null);
      setHasResultStaleIntent(false);
      if (response.status === "succeeded") {
        setJobId(null);
        setCalculationId(response.calculationId);
        setImmediateResult(response.result as StoredChartCalculationPayload);
        writeChartEngineUrlState({
          mode: mode === "child_chart" ? "child_chart" : "natal",
          clientId: variables.clientId,
          calculationId: response.calculationId
        });
        return;
      }
      setImmediateResult(null);
      setCalculationId(null);
      setJobId(response.jobId);
      writeChartEngineUrlState({
        mode: mode === "child_chart" ? "child_chart" : "natal",
        clientId: variables.clientId,
        calculationId: null
      });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось запустить расчёт карты");
    }
  });
  const transitCalculationMutation = useMutation({
    mutationFn: ({
      clientId,
      settings,
      transit
    }: {
      readonly clientId: string;
      readonly settings: ChartSettings;
      readonly transit: ChartTransitMoment;
    }) =>
      submitTransitCalculation({
        clientId,
        settings,
        transit,
        create: createTransitChartJob
      }),
    onSuccess: (response, variables) => {
      setErrorMessage(null);
      setHasResultStaleIntent(false);
      if (response.status === "succeeded") {
        setJobId(null);
        setCalculationId(response.calculationId);
        setImmediateResult(response.result as StoredChartCalculationPayload);
        writeChartEngineUrlState({
          mode: "transit",
          clientId: variables.clientId,
          calculationId: response.calculationId
        });
        return;
      }
      setImmediateResult(null);
      setCalculationId(null);
      setJobId(response.jobId);
      writeChartEngineUrlState({
        mode: "transit",
        clientId: variables.clientId,
        calculationId: null
      });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось запустить транзиты");
    }
  });
  const synastryCalculationMutation = useMutation({
    mutationFn: ({
      clientId,
      partnerClientId,
      settings
    }: {
      readonly clientId: string;
      readonly partnerClientId: string;
      readonly settings: ChartSettings;
    }) =>
      submitSynastryCalculation({
        clientId,
        partnerClientId,
        settings,
        create: createSynastryChartJob
      }),
    onSuccess: (response, variables) => {
      setErrorMessage(null);
      setHasResultStaleIntent(false);
      if (response.status === "succeeded") {
        setJobId(null);
        setCalculationId(response.calculationId);
        setImmediateResult(response.result as StoredChartCalculationPayload);
        writeChartEngineUrlState({
          mode: "synastry",
          clientId: variables.clientId,
          partnerClientId: variables.partnerClientId,
          calculationId: response.calculationId
        });
        return;
      }
      setImmediateResult(null);
      setCalculationId(null);
      setJobId(response.jobId);
      writeChartEngineUrlState({
        mode: "synastry",
        clientId: variables.clientId,
        partnerClientId: variables.partnerClientId,
        calculationId: null
      });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось запустить синстрию");
    }
  });
  const compositeCalculationMutation = useMutation({
    mutationFn: ({
      clientId,
      partnerClientId,
      settings
    }: {
      readonly clientId: string;
      readonly partnerClientId: string;
      readonly settings: ChartSettings;
    }) =>
      submitCompositeCalculation({
        clientId,
        partnerClientId,
        settings,
        create: createCompositeChartJob
      }),
    onSuccess: (response, variables) => {
      setErrorMessage(null);
      setHasResultStaleIntent(false);
      if (response.status === "succeeded") {
        setJobId(null);
        setCalculationId(response.calculationId);
        setImmediateResult(response.result as StoredChartCalculationPayload);
        writeChartEngineUrlState({
          mode: "composite",
          clientId: variables.clientId,
          partnerClientId: variables.partnerClientId,
          calculationId: response.calculationId
        });
        return;
      }
      setImmediateResult(null);
      setCalculationId(null);
      setJobId(response.jobId);
      writeChartEngineUrlState({
        mode: "composite",
        clientId: variables.clientId,
        partnerClientId: variables.partnerClientId,
        calculationId: null
      });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось запустить композит");
    }
  });
  const solarReturnCalculationMutation = useMutation({
    mutationFn: ({
      clientId,
      settings,
      year
    }: {
      readonly clientId: string;
      readonly settings: ChartSettings;
      readonly year: number;
    }) =>
      submitSolarReturnCalculation({
        clientId,
        settings,
        year,
        create: createSolarReturnChartJob
      }),
    onSuccess: (response, variables) => {
      setErrorMessage(null);
      setHasResultStaleIntent(false);
      if (response.status === "succeeded") {
        setJobId(null);
        setCalculationId(response.calculationId);
        setImmediateResult(response.result as StoredChartCalculationPayload);
        writeChartEngineUrlState({
          mode: "solar_return",
          clientId: variables.clientId,
          calculationId: response.calculationId
        });
        return;
      }
      setImmediateResult(null);
      setCalculationId(null);
      setJobId(response.jobId);
      writeChartEngineUrlState({
        mode: "solar_return",
        clientId: variables.clientId,
        calculationId: null
      });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось запустить соляр");
    }
  });
  const progressionCalculationMutation = useMutation({
    mutationFn: ({
      clientId,
      settings,
      targetDate
    }: {
      readonly clientId: string;
      readonly settings: ChartSettings;
      readonly targetDate: string;
    }) =>
      submitProgressionCalculation({
        clientId,
        settings,
        targetDate,
        create: createProgressionChartJob
      }),
    onSuccess: (response, variables) => {
      setErrorMessage(null);
      setHasResultStaleIntent(false);
      if (response.status === "succeeded") {
        setJobId(null);
        setCalculationId(response.calculationId);
        setImmediateResult(response.result as StoredChartCalculationPayload);
        writeChartEngineUrlState({
          mode: "progression",
          clientId: variables.clientId,
          calculationId: response.calculationId
        });
        return;
      }
      setImmediateResult(null);
      setCalculationId(null);
      setJobId(response.jobId);
      writeChartEngineUrlState({
        mode: "progression",
        clientId: variables.clientId,
        calculationId: null
      });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось запустить прогрессии");
    }
  });
  const horaryCalculationMutation = useMutation({
    mutationFn: ({
      clientId,
      question,
      settings
    }: {
      readonly clientId: string;
      readonly question: ChartHoraryQuestionSnapshot;
      readonly settings: ChartSettings;
    }) =>
      submitHoraryCalculation({
        clientId,
        settings,
        question,
        create: createHoraryChartJob
      }),
    onSuccess: (response, variables) => {
      setErrorMessage(null);
      setHasResultStaleIntent(false);
      if (response.status === "succeeded") {
        setJobId(null);
        setCalculationId(response.calculationId);
        setImmediateResult(response.result as StoredChartCalculationPayload);
        writeChartEngineUrlState({
          mode: "horary",
          clientId: variables.clientId,
          calculationId: response.calculationId
        });
        return;
      }
      setImmediateResult(null);
      setCalculationId(null);
      setJobId(response.jobId);
      writeChartEngineUrlState({
        mode: "horary",
        clientId: variables.clientId,
        calculationId: null
      });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось запустить хорар");
    }
  });

  const birthDataMutation = useMutation({
    mutationFn: async (data: Parameters<typeof updateClientBirthData>[1]) => {
      if (!selectedClient) {
        throw new Error("Выберите клиента из CRM");
      }

      return updateClientBirthData(selectedClient.value, data);
    },
    onSuccess: async (response) => {
      const [updatedClient] = toClientSelectOptions([response.client]);
      if (updatedClient) {
        setSelectedClient(updatedClient);
      }
      setErrorMessage(null);
      if (result) {
        setHasResultStaleIntent(true);
      }
      await queryClient.invalidateQueries({ queryKey: astrologerClientsQueryKeys.all() });
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Не удалось сохранить данные рождения"
      );
    }
  });

  const jobQuery = useQuery({
    queryKey: ["charts", "jobs", jobId],
    queryFn: () => getChartJob(jobId ?? ""),
    enabled: Boolean(jobId),
    refetchInterval: (query: { state: { data?: { status: string } } }) =>
      query.state.data?.status === "calculating" || !query.state.data ? 1800 : false
  });

  useEffect(() => {
    const job = jobQuery.data;
    if (!job) return;
    if (job.status === "succeeded" && job.calculationId) {
      setCalculationId(job.calculationId);
      setJobId(null);
      setErrorMessage(null);
      setHasResultStaleIntent(false);
      writeChartEngineUrlState({
        mode,
        clientId: selectedClient?.value ?? initialUrlState.clientId,
        partnerClientId: selectedPartnerClient?.value ?? initialUrlState.partnerClientId,
        calculationId: job.calculationId
      });
    }
    if (job.status === "failed") {
      setJobId(null);
      setErrorMessage(job.failureMessage ?? "Не удалось рассчитать карту");
    }
  }, [
    initialUrlState.clientId,
    initialUrlState.partnerClientId,
    jobQuery.data,
    mode,
    selectedClient?.value,
    selectedPartnerClient?.value
  ]);

  const calculationQuery = useQuery({
    queryKey: ["charts", "calculations", calculationId],
    queryFn: () => getChartCalculation(calculationId ?? ""),
    enabled: Boolean(calculationId && !immediateResult)
  });

  useEffect(() => {
    const response = restoredClientQuery.data;
    if (!response || selectedClient) return;
    const [client] = toClientSelectOptions([response.client]);
    if (client) {
      setSelectedClient(client);
    }
  }, [restoredClientQuery.data, selectedClient]);

  useEffect(() => {
    const response = restoredPartnerClientQuery.data;
    if (!response || selectedPartnerClient) return;
    const [client] = toClientSelectOptions([response.client]);
    if (client) {
      setSelectedPartnerClient(client);
    }
  }, [restoredPartnerClientQuery.data, selectedPartnerClient]);

  useEffect(() => {
    if (!calculationQuery.data) return;
    const restoredState = restoreChartEngineViewState(calculationQuery.data, { mode });
    setSettings(restoredState.settings);
    setMode(restoredState.mode);
    if (restoredState.transitMoment) {
      setTransitMoment(restoredState.transitMoment);
    }
    if (restoredState.partnerClientId) {
      setRestoredPartnerClientId(restoredState.partnerClientId);
    }
    if (restoredState.solarReturnYear) {
      setSolarReturnYear(restoredState.solarReturnYear);
    }
    if (restoredState.progressionTargetDate) {
      setProgressionTargetDate(restoredState.progressionTargetDate);
    }
    if (restoredState.horaryQuestion) {
      setHoraryQuestion(restoredState.horaryQuestion);
    }
    setHasResultStaleIntent(false);
  }, [calculationQuery.data, mode]);

  const result = immediateResult ?? calculationQuery.data ?? null;
  const isResultStale = Boolean(
    result &&
    (hasResultStaleIntent ||
      isChartResultStale(
        result,
        selectedClient?.birthData,
        settings,
        getChartResultMethodForMode(mode),
        transitMoment,
        selectedPartnerClient?.birthData,
        solarReturnYear,
        progressionTargetDate,
        horaryQuestion
      ))
  );
  const pdfQuery = useQuery({
    queryKey: ["charts", "pdf", calculationId, pdfLocale],
    queryFn: () => getLatestChartPdf({ calculationId: calculationId ?? "", locale: pdfLocale }),
    enabled: Boolean(calculationId && mode === "natal" && result?.method === "natal" && !isResultStale),
    refetchInterval: (query: { state: { data?: { job: { status: string } | null } } }) => {
      const status = query.state.data?.job?.status;
      return status === "queued" || status === "processing" ? 1500 : false;
    }
  });
  const enqueuePdfMutation = useMutation({
    mutationFn: enqueueChartPdf,
    onSuccess: async (_data, input) => {
      await queryClient.invalidateQueries({
        queryKey: ["charts", "pdf", input.calculationId, input.body.locale]
      });
    }
  });
  const downloadPdfMutation = useMutation({ mutationFn: downloadChartPdf });
  const jobState: ChartEnginePageJobState = useMemo(() => {
    if (
      calculationMutation.isPending ||
      transitCalculationMutation.isPending ||
      synastryCalculationMutation.isPending ||
      compositeCalculationMutation.isPending ||
      solarReturnCalculationMutation.isPending ||
      progressionCalculationMutation.isPending ||
      horaryCalculationMutation.isPending ||
      jobId ||
      jobQuery.data?.status === "calculating"
    ) {
      return "calculating";
    }
    if (errorMessage || jobQuery.data?.status === "failed") {
      return "failed";
    }
    if (result) {
      return "succeeded";
    }

    return "idle";
  }, [
    calculationMutation.isPending,
    errorMessage,
    jobId,
    jobQuery.data?.status,
    result,
    transitCalculationMutation.isPending,
    synastryCalculationMutation.isPending,
    compositeCalculationMutation.isPending,
    solarReturnCalculationMutation.isPending,
    progressionCalculationMutation.isPending,
    horaryCalculationMutation.isPending
  ]);
  const isBusy =
    calculationMutation.isPending ||
    transitCalculationMutation.isPending ||
    synastryCalculationMutation.isPending ||
    compositeCalculationMutation.isPending ||
    solarReturnCalculationMutation.isPending ||
    progressionCalculationMutation.isPending ||
    horaryCalculationMutation.isPending ||
    birthDataMutation.isPending ||
    enqueuePdfMutation.isPending ||
    downloadPdfMutation.isPending ||
    Boolean(jobId) ||
    jobQuery.isFetching ||
    calculationQuery.isFetching;
  const pdfAction = buildChartPdfAction({
    calculationId,
    currentResultChecksum: pdfQuery.data?.currentResultChecksum ?? null,
    job: pdfQuery.data?.job ?? null,
    isBusy,
    isResultStale: isResultStale || mode !== "natal" || (result != null && result.method !== "natal")
  });

  return {
    selectedClient,
    selectedPartnerClient,
    jobState,
    result,
    isResultStale,
    errorMessage:
      errorMessage ??
      (calculationQuery.error instanceof Error ? calculationQuery.error.message : null) ??
      (jobQuery.error instanceof Error ? jobQuery.error.message : null),
    isBusy,
    pdfLabel: pdfAction.label,
    pdfDisabled: pdfAction.disabled,
    pdfTitle: pdfAction.title,
    pdfErrorMessage: pdfAction.errorMessage,
    settings,
    mode,
    transitMoment,
    solarReturnYear,
    progressionTargetDate,
    horaryQuestion,
    onModeChange: (nextMode: ChartEngineMode) => {
      setMode(nextMode);
      setJobId(null);
      setCalculationId(null);
      setImmediateResult(null);
      setErrorMessage(null);
      setHasResultStaleIntent(false);
      writeChartEngineUrlState(
        buildChartEngineModeChangeUrlState({
          nextMode,
          clientId: selectedClient?.value ?? initialUrlState.clientId,
          partnerClientId: selectedPartnerClient?.value ?? initialUrlState.partnerClientId,
          calculationId
        })
      );
    },
    onTransitMomentChange: (nextMoment: ChartTransitMomentInput) => {
      setTransitMoment(nextMoment);
      if (result?.method === "transit") {
        setHasResultStaleIntent(true);
      }
    },
    onSolarReturnYearChange: (year: number) => {
      setSolarReturnYear(year);
      if (result?.method === "solar_return") {
        setHasResultStaleIntent(true);
      }
    },
    onProgressionTargetDateChange: (targetDate: string) => {
      setProgressionTargetDate(targetDate);
      if (result?.method === "progression") {
        setHasResultStaleIntent(true);
      }
    },
    onHoraryQuestionChange: (nextQuestion: ChartHoraryQuestionInput) => {
      setHoraryQuestion(nextQuestion);
      if (result?.method === "horary") {
        setHasResultStaleIntent(true);
      }
    },
    onSettingsChange: (nextSettings: ChartSettings) => {
      setSettings(nextSettings);
      if (result) {
        setHasResultStaleIntent(true);
      }
    },
    isSavingBirthData: birthDataMutation.isPending,
    birthDataError:
      birthDataMutation.error instanceof Error ? birthDataMutation.error.message : null,
    onSaveBirthData: async (data: Parameters<typeof updateClientBirthData>[1]) => {
      await birthDataMutation.mutateAsync(data);
    },
    onSelectClient: (client: ClientSelectOption) => {
      setSelectedClient(client);
      setJobId(null);
      setCalculationId(null);
      setImmediateResult(null);
      setErrorMessage(null);
      setHasResultStaleIntent(false);
      writeChartEngineUrlState({
        mode,
        clientId: client.value,
        partnerClientId: selectedPartnerClient?.value ?? null,
        calculationId: null
      });
    },
    onSelectPartnerClient: (client: ClientSelectOption) => {
      setSelectedPartnerClient(client);
      setRestoredPartnerClientId(client.value);
      setJobId(null);
      setCalculationId(null);
      setImmediateResult(null);
      setErrorMessage(null);
      setHasResultStaleIntent(false);
      writeChartEngineUrlState({
        mode: mode === "composite" ? "composite" : "synastry",
        clientId: selectedClient?.value ?? null,
        partnerClientId: client.value,
        calculationId: null
      });
    },
    onCreateNatalJob: async () => {
      if (!selectedClient) {
        setErrorMessage("Выберите клиента из CRM");
        return;
      }
      const readiness = getChartBirthDataReadiness(selectedClient.birthData);
      if (!readiness.ready) {
        setErrorMessage(`Не хватает данных рождения: ${readiness.missing.join(", ")}`);
        return;
      }
      await calculationMutation.mutateAsync({
        clientId: selectedClient.value,
        isResultStale,
        settings
      });
    },
    onCreateTransitJob: async () => {
      if (!selectedClient) {
        setErrorMessage("Выберите клиента из CRM");
        return;
      }
      const readiness = getChartBirthDataReadiness(selectedClient.birthData);
      if (!readiness.ready) {
        setErrorMessage(`Не хватает данных рождения: ${readiness.missing.join(", ")}`);
        return;
      }
      if (!transitMoment.date || !transitMoment.time) {
        setErrorMessage("Укажите дату и время транзита");
        return;
      }
      await transitCalculationMutation.mutateAsync({
        clientId: selectedClient.value,
        settings,
        transit: transitMoment
      });
    },
    onCreateSynastryJob: async () => {
      if (!selectedClient) {
        setErrorMessage("Выберите клиента из CRM");
        return;
      }
      if (!selectedPartnerClient) {
        setErrorMessage("Выберите партнёра из CRM");
        return;
      }
      if (selectedClient.value === selectedPartnerClient.value) {
        setErrorMessage("Для синстрии выберите другого клиента");
        return;
      }
      const readiness = getChartBirthDataReadiness(selectedClient.birthData);
      if (!readiness.ready) {
        setErrorMessage(`Не хватает данных рождения: ${readiness.missing.join(", ")}`);
        return;
      }
      const partnerReadiness = getChartBirthDataReadiness(selectedPartnerClient.birthData);
      if (!partnerReadiness.ready) {
        setErrorMessage(
          `Не хватает данных рождения партнёра: ${partnerReadiness.missing.join(", ")}`
        );
        return;
      }
      await synastryCalculationMutation.mutateAsync({
        clientId: selectedClient.value,
        partnerClientId: selectedPartnerClient.value,
        settings
      });
    },
    onCreateCompositeJob: async () => {
      if (!selectedClient) {
        setErrorMessage("Выберите клиента из CRM");
        return;
      }
      if (!selectedPartnerClient) {
        setErrorMessage("Выберите партнёра из CRM");
        return;
      }
      if (selectedClient.value === selectedPartnerClient.value) {
        setErrorMessage("Для композита выберите другого клиента");
        return;
      }
      const readiness = getChartBirthDataReadiness(selectedClient.birthData);
      if (!readiness.ready) {
        setErrorMessage(`Не хватает данных рождения: ${readiness.missing.join(", ")}`);
        return;
      }
      const partnerReadiness = getChartBirthDataReadiness(selectedPartnerClient.birthData);
      if (!partnerReadiness.ready) {
        setErrorMessage(
          `Не хватает данных рождения партнёра: ${partnerReadiness.missing.join(", ")}`
        );
        return;
      }
      await compositeCalculationMutation.mutateAsync({
        clientId: selectedClient.value,
        partnerClientId: selectedPartnerClient.value,
        settings
      });
    },
    onCreateSolarReturnJob: async () => {
      if (!selectedClient) {
        setErrorMessage("Выберите клиента из CRM");
        return;
      }
      const readiness = getChartBirthDataReadiness(selectedClient.birthData);
      if (!readiness.ready) {
        setErrorMessage(`Не хватает данных рождения: ${readiness.missing.join(", ")}`);
        return;
      }
      await solarReturnCalculationMutation.mutateAsync({
        clientId: selectedClient.value,
        settings,
        year: solarReturnYear
      });
    },
    onCreateProgressionJob: async () => {
      if (!selectedClient) {
        setErrorMessage("Выберите клиента из CRM");
        return;
      }
      const readiness = getChartBirthDataReadiness(selectedClient.birthData);
      if (!readiness.ready) {
        setErrorMessage(`Не хватает данных рождения: ${readiness.missing.join(", ")}`);
        return;
      }
      if (!progressionTargetDate) {
        setErrorMessage("Укажите дату прогрессии");
        return;
      }
      await progressionCalculationMutation.mutateAsync({
        clientId: selectedClient.value,
        settings,
        targetDate: progressionTargetDate
      });
    },
    onCreateHoraryJob: async () => {
      if (!selectedClient) {
        setErrorMessage("Выберите клиента из CRM");
        return;
      }
      let questionSnapshot: ChartHoraryQuestionSnapshot;
      try {
        questionSnapshot = toChartHoraryQuestionSnapshot(horaryQuestion);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Заполните хорар");
        return;
      }
      await horaryCalculationMutation.mutateAsync({
        clientId: selectedClient.value,
        settings,
        question: questionSnapshot
      });
    },
    onPdf: async () => {
      try {
        setErrorMessage(null);
        await executeChartPdfAction({
          calculationId,
          locale: pdfLocale,
          currentResultChecksum: pdfQuery.data?.currentResultChecksum ?? null,
          kind: pdfAction.kind,
          job: pdfQuery.data?.job ?? null,
          enqueue: (input) => enqueuePdfMutation.mutateAsync(input),
          download: (input) => downloadPdfMutation.mutateAsync(input),
          openUrl: (url) => window.open(url, "_blank", "noopener,noreferrer")
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Не удалось выполнить PDF-действие"
        );
      }
    }
  };
}

export async function submitChartCalculation({
  clientId,
  calculationId,
  create,
  isResultStale,
  recalculate,
  settings
}: {
  readonly clientId: string;
  readonly calculationId: string | null;
  readonly isResultStale: boolean;
  readonly settings: ChartSettings;
  readonly create: typeof createNatalChartJob;
  readonly recalculate: typeof recalculateChart;
}) {
  if (calculationId && isResultStale) {
    return recalculate({ calculationId, clientId, settings });
  }

  return create({ clientId, settings });
}

export async function submitTransitCalculation({
  clientId,
  create,
  settings,
  transit
}: {
  readonly clientId: string;
  readonly settings: ChartSettings;
  readonly transit: ChartTransitMoment;
  readonly create: typeof createTransitChartJob;
}) {
  return create({ clientId, settings, transit });
}

export async function submitSynastryCalculation({
  clientId,
  create,
  partnerClientId,
  settings
}: {
  readonly clientId: string;
  readonly partnerClientId: string;
  readonly settings: ChartSettings;
  readonly create: typeof createSynastryChartJob;
}) {
  return create({ clientId, partnerClientId, settings });
}

export async function submitCompositeCalculation({
  clientId,
  create,
  partnerClientId,
  settings
}: {
  readonly clientId: string;
  readonly partnerClientId: string;
  readonly settings: ChartSettings;
  readonly create: typeof createCompositeChartJob;
}) {
  return create({ clientId, partnerClientId, settings });
}

export async function submitSolarReturnCalculation({
  clientId,
  create,
  settings,
  year
}: {
  readonly clientId: string;
  readonly settings: ChartSettings;
  readonly year: number;
  readonly create: typeof createSolarReturnChartJob;
}) {
  return create({ clientId, settings, year });
}

export async function submitProgressionCalculation({
  clientId,
  create,
  settings,
  targetDate
}: {
  readonly clientId: string;
  readonly settings: ChartSettings;
  readonly targetDate: string;
  readonly create: typeof createProgressionChartJob;
}) {
  return create({ clientId, settings, targetDate });
}

export async function submitHoraryCalculation({
  clientId,
  create,
  question,
  settings
}: {
  readonly clientId: string;
  readonly question: ChartHoraryQuestionSnapshot;
  readonly settings: ChartSettings;
  readonly create: typeof createHoraryChartJob;
}) {
  return create({ clientId, settings, question });
}

export function restoreChartEngineViewState(
  result: StoredChartCalculationPayload,
  options: { readonly mode?: ChartEngineMode } = {}
): {
  readonly mode: ChartEngineMode;
  readonly settings: ChartSettings;
  readonly transitMoment?: ChartTransitMomentInput;
  readonly partnerClientId?: string;
  readonly solarReturnYear?: number;
  readonly progressionTargetDate?: string;
  readonly horaryQuestion?: ChartHoraryQuestionInput;
} {
  if (result.method === "horary") {
    return {
      mode: "horary",
      settings: result.settings,
      horaryQuestion: result.questionSnapshot
    };
  }

  if (result.method === "synastry") {
    return {
      mode: "synastry",
      settings: result.settings,
      partnerClientId: result.relationshipSnapshot.partnerClientId
    };
  }

  if (result.method === "composite") {
    return {
      mode: "composite",
      settings: result.settings,
      partnerClientId: result.relationshipSnapshot.partnerClientId
    };
  }

  if (result.method !== "transit") {
    if (result.method === "solar_return") {
      return {
        mode: "solar_return",
        settings: result.settings,
        solarReturnYear: result.solarReturnSnapshot.year
      };
    }
    if (result.method === "progression") {
      return {
        mode: "progression",
        settings: result.settings,
        progressionTargetDate: result.progressionSnapshot.targetDate
      };
    }
    return {
      mode: options.mode === "child_chart" ? "child_chart" : "natal",
      settings: result.settings
    };
  }

  return {
    mode: "transit",
    settings: result.settings,
    transitMoment: {
      date: result.transitSnapshot.date,
      time: result.transitSnapshot.time
    }
  };
}

export type ChartEngineUrlState = {
  readonly mode?: ChartEngineMode;
  readonly clientId: string | null;
  readonly partnerClientId?: string | null;
  readonly calculationId: string | null;
};

export function buildChartEngineModeChangeUrlState({
  clientId,
  nextMode,
  partnerClientId
}: {
  readonly nextMode: ChartEngineMode;
  readonly clientId: string | null;
  readonly partnerClientId?: string | null;
  readonly calculationId: string | null;
}): ChartEngineUrlState {
  return {
    mode: nextMode,
    clientId,
    partnerClientId,
    calculationId: null
  };
}

export function readChartEngineUrlState(
  search = getCurrentChartEngineSearch()
): ChartEngineUrlState {
  const params = new URLSearchParams(search);

  return {
    mode: readChartEngineMode(params.get("mode")),
    clientId: normalizeUrlParam(params.get("clientId")),
    partnerClientId: normalizeUrlParam(params.get("partnerClientId")),
    calculationId: normalizeUrlParam(params.get("calculationId"))
  };
}

export function buildChartEngineSearch(search: string, state: ChartEngineUrlState): string {
  const params = new URLSearchParams(search);
  const shouldKeepPartnerClientId =
    Boolean(state.partnerClientId) &&
    (state.mode == null || state.mode === "synastry" || state.mode === "composite");

  if (state.clientId) {
    params.set("clientId", state.clientId);
  } else {
    params.delete("clientId");
  }
  if (shouldKeepPartnerClientId && state.partnerClientId) {
    params.set("partnerClientId", state.partnerClientId);
  } else {
    params.delete("partnerClientId");
  }
  if (state.calculationId) {
    params.set("calculationId", state.calculationId);
  } else {
    params.delete("calculationId");
  }
  if (state.mode === "child_chart" || state.mode === "horary") {
    params.set("mode", state.mode);
  } else {
    params.delete("mode");
  }

  const next = params.toString();
  return next ? `?${next}` : "";
}

function writeChartEngineUrlState(state: ChartEngineUrlState) {
  if (typeof window === "undefined") return;
  const search = buildChartEngineSearch(window.location.search, state);
  const nextUrl = `${window.location.pathname}${search}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function getCurrentChartEngineSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function normalizeUrlParam(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function readChartEngineMode(value: string | null): ChartEngineMode | undefined {
  return value === "child_chart" || value === "horary" ? value : undefined;
}

function getDefaultTransitMoment(): ChartTransitMomentInput {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return { date, time };
}

function getDefaultProgressionTargetDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDefaultHoraryQuestion(): ChartHoraryQuestionInput {
  const moment = getDefaultTransitMoment();

  return {
    question: "",
    category: "other",
    date: moment.date,
    time: moment.time,
    timezone: getBrowserTimezone(),
    latitude: "",
    longitude: ""
  };
}

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
