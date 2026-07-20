import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ChartSettings, StoredChartCalculationPayload } from "@elevenhouse/contracts";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import {
  createNatalChartJob,
  getChartCalculation,
  getChartJob
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
  const [selectedClient, setSelectedClient] = useState<ClientSelectOption | null>(null);
  const [settings, setSettings] = useState<ChartSettings>(defaultSettings);
  const [jobId, setJobId] = useState<string | null>(null);
  const [calculationId, setCalculationId] = useState<string | null>(null);
  const [immediateResult, setImmediateResult] = useState<StoredChartCalculationPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createNatalChartJob,
    onSuccess: (response) => {
      setErrorMessage(null);
      if (response.status === "succeeded") {
        setJobId(null);
        setCalculationId(response.calculationId);
        setImmediateResult(response.result as StoredChartCalculationPayload);
        return;
      }
      setImmediateResult(null);
      setCalculationId(null);
      setJobId(response.jobId);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось запустить расчёт карты");
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
    }
    if (job.status === "failed") {
      setJobId(null);
      setErrorMessage(job.failureMessage ?? "Не удалось рассчитать карту");
    }
  }, [jobQuery.data]);

  const calculationQuery = useQuery({
    queryKey: ["charts", "calculations", calculationId],
    queryFn: () => getChartCalculation(calculationId ?? ""),
    enabled: Boolean(calculationId && !immediateResult)
  });

  const result = immediateResult ?? calculationQuery.data ?? null;
  const jobState: ChartEnginePageJobState = useMemo(() => {
    if (createMutation.isPending || jobId || jobQuery.data?.status === "calculating") {
      return "calculating";
    }
    if (errorMessage || jobQuery.data?.status === "failed") {
      return "failed";
    }
    if (result) {
      return "succeeded";
    }

    return "idle";
  }, [createMutation.isPending, errorMessage, jobId, jobQuery.data?.status, result]);

  return {
    selectedClient,
    jobState,
    result,
    errorMessage:
      errorMessage ??
      (calculationQuery.error instanceof Error ? calculationQuery.error.message : null) ??
      (jobQuery.error instanceof Error ? jobQuery.error.message : null),
    isBusy:
      createMutation.isPending ||
      Boolean(jobId) ||
      jobQuery.isFetching ||
      calculationQuery.isFetching,
    settings,
    onSettingsChange: setSettings,
    onSelectClient: (client: ClientSelectOption) => {
      setSelectedClient(client);
      setJobId(null);
      setCalculationId(null);
      setImmediateResult(null);
      setErrorMessage(null);
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
      await createMutation.mutateAsync({ clientId: selectedClient.value, settings });
    }
  };
}
