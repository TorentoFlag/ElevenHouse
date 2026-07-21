import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChartSettings, StoredChartCalculationPayload } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { getAstrologerClient, updateClientBirthData } from "../../features/clients/api/clientsApi";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import {
  astrologerClientsQueryKeys,
  toClientSelectOptions
} from "../../features/clients/model/clientSelectorModel";
import {
  createNatalChartJob,
  getChartCalculation,
  getChartJob,
  recalculateChart
} from "../../features/charts/api/chartsApi";
import { getChartBirthDataReadiness } from "../../features/charts/model/chartEngineState";
import type { ChartEnginePageJobState } from "../../features/charts/components/ChartEnginePage";

const defaultSettings: ChartSettings = {
  zodiac: "tropical",
  houseSystem: "placidus",
  nodeType: "true",
  aspectPreset: "major",
  orbMultiplier: 1
};

export function useChartEngineController() {
  useDocumentTitle("ElevenHouse | Движок карт");
  const queryClient = useQueryClient();
  const initialUrlState = useMemo(() => readChartEngineUrlState(), []);
  const [selectedClient, setSelectedClient] = useState<ClientSelectOption | null>(null);
  const [settings, setSettings] = useState<ChartSettings>(defaultSettings);
  const [jobId, setJobId] = useState<string | null>(null);
  const [calculationId, setCalculationId] = useState<string | null>(
    initialUrlState.calculationId
  );
  const [immediateResult, setImmediateResult] = useState<StoredChartCalculationPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResultStale, setIsResultStale] = useState(false);

  const restoredClientQuery = useQuery({
    queryKey: ["clients", "detail", initialUrlState.clientId],
    queryFn: () => getAstrologerClient(initialUrlState.clientId ?? ""),
    enabled: Boolean(initialUrlState.clientId && !selectedClient)
  });

  const calculationMutation = useMutation({
    mutationFn: ({ clientId, settings }: { readonly clientId: string; readonly settings: ChartSettings }) =>
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
      setIsResultStale(false);
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
        setIsResultStale(true);
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
      setIsResultStale(false);
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
    setIsResultStale(false);
  }, [calculationQuery.data]);

  const result = immediateResult ?? calculationQuery.data ?? null;
  const jobState: ChartEnginePageJobState = useMemo(() => {
    if (calculationMutation.isPending || jobId || jobQuery.data?.status === "calculating") {
      return "calculating";
    }
    if (errorMessage || jobQuery.data?.status === "failed") {
      return "failed";
    }
    if (result) {
      return "succeeded";
    }

    return "idle";
  }, [calculationMutation.isPending, errorMessage, jobId, jobQuery.data?.status, result]);

  return {
    selectedClient,
    jobState,
    result,
    isResultStale,
    errorMessage:
      errorMessage ??
      (calculationQuery.error instanceof Error ? calculationQuery.error.message : null) ??
      (jobQuery.error instanceof Error ? jobQuery.error.message : null),
    isBusy:
      calculationMutation.isPending ||
      birthDataMutation.isPending ||
      Boolean(jobId) ||
      jobQuery.isFetching ||
      calculationQuery.isFetching,
    settings,
    onSettingsChange: (nextSettings: ChartSettings) => {
      setSettings(nextSettings);
      if (result) {
        setIsResultStale(true);
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
      setIsResultStale(false);
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
      await calculationMutation.mutateAsync({ clientId: selectedClient.value, settings });
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

export function buildChartEngineSearch(
  search: string,
  state: ChartEngineUrlState
): string {
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
