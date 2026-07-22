import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
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
  createNatalChartJob,
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
  isChartResultStale
} from "../../features/charts/model/chartEngineState";
import {
  buildChartPdfAction,
  executeChartPdfAction
} from "../../features/charts/model/chartPdfModel";
import type {
  ChartEngineMode,
  ChartEnginePageJobState,
  ChartTransitMomentInput
} from "../../features/charts/components/ChartEnginePage";

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
  const [settings, setSettings] = useState<ChartSettings>(defaultSettings);
  const [mode, setMode] = useState<ChartEngineMode>("natal");
  const [transitMoment, setTransitMoment] = useState<ChartTransitMomentInput>(() =>
    getDefaultTransitMoment()
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
          clientId: variables.clientId,
          calculationId: response.calculationId
        });
        return;
      }
      setImmediateResult(null);
      setCalculationId(null);
      setJobId(response.jobId);
      writeChartEngineUrlState({ clientId: variables.clientId, calculationId: null });
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
          clientId: variables.clientId,
          calculationId: response.calculationId
        });
        return;
      }
      setImmediateResult(null);
      setCalculationId(null);
      setJobId(response.jobId);
      writeChartEngineUrlState({ clientId: variables.clientId, calculationId: null });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось запустить транзиты");
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
        clientId: selectedClient?.value ?? initialUrlState.clientId,
        calculationId: job.calculationId
      });
    }
    if (job.status === "failed") {
      setJobId(null);
      setErrorMessage(job.failureMessage ?? "Не удалось рассчитать карту");
    }
  }, [initialUrlState.clientId, jobQuery.data, selectedClient?.value]);

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
    if (!calculationQuery.data) return;
    setSettings(calculationQuery.data.settings);
    setHasResultStaleIntent(false);
  }, [calculationQuery.data]);

  const result = immediateResult ?? calculationQuery.data ?? null;
  const isResultStale = Boolean(
    result &&
    (hasResultStaleIntent ||
      isChartResultStale(result, selectedClient?.birthData, settings, mode, transitMoment))
  );
  const pdfQuery = useQuery({
    queryKey: ["charts", "pdf", calculationId, pdfLocale],
    queryFn: () => getLatestChartPdf({ calculationId: calculationId ?? "", locale: pdfLocale }),
    enabled: Boolean(calculationId && result?.method === "natal" && !isResultStale),
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
    transitCalculationMutation.isPending
  ]);
  const isBusy =
    calculationMutation.isPending ||
    transitCalculationMutation.isPending ||
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
    isResultStale: isResultStale || result?.method === "transit"
  });

  return {
    selectedClient,
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
    onModeChange: (nextMode: ChartEngineMode) => setMode(nextMode),
    onTransitMomentChange: (nextMoment: ChartTransitMomentInput) => {
      setTransitMoment(nextMoment);
      if (result?.method === "transit") {
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
      writeChartEngineUrlState({ clientId: client.value, calculationId: null });
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
        setErrorMessage(error instanceof Error ? error.message : "Не удалось выполнить PDF-действие");
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

export type ChartEngineUrlState = {
  readonly clientId: string | null;
  readonly calculationId: string | null;
};

export function readChartEngineUrlState(
  search = getCurrentChartEngineSearch()
): ChartEngineUrlState {
  const params = new URLSearchParams(search);

  return {
    clientId: normalizeUrlParam(params.get("clientId")),
    calculationId: normalizeUrlParam(params.get("calculationId"))
  };
}

export function buildChartEngineSearch(search: string, state: ChartEngineUrlState): string {
  const params = new URLSearchParams(search);
  if (state.clientId) {
    params.set("clientId", state.clientId);
  } else {
    params.delete("clientId");
  }
  if (state.calculationId) {
    params.set("calculationId", state.calculationId);
  } else {
    params.delete("calculationId");
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
