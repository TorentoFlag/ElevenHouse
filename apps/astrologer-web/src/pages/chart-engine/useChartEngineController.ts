import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ChartSettings, type ClientBirthPlaceCandidate } from "@elevenhouse/contracts";
import { useI18n } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  getAstrologerClient,
  resolveClientBirthPlaceReference,
  searchClientBirthPlaces,
  updateClientBirthData
} from "../../features/clients/api/clientsApi";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import {
  astrologerClientsQueryKeys,
  toClientSelectOptions
} from "../../features/clients/model/clientSelectorModel";
import {
  downloadChartPdf,
  enqueueChartPdf,
  getChartCalculation,
  getChartJob,
  getLatestChartPdf
} from "../../features/charts/api/chartsApi";
import { resolveChartCalculationIdentity } from "../../features/charts/model/chartCalculationIdentity";
import {
  createChartBirthDataDraft,
  toBirthDataUpsertRequest,
  updateChartBirthDataDraft
} from "../../features/charts/model/chartBirthDataDraft";
import { chartEngineCopyByLocale } from "../../features/charts/model/chartEngineCopy";
import {
  createInitialChartEngineControllerState,
  defaultChartEngineSettings,
  deriveChartEngineJobState,
  errorMessageFrom,
  getChartIdentityErrorMessage,
  getDefaultHoraryQuestion,
  getDefaultProgressionTargetDate,
  getDefaultTransitMoment,
  getHoraryPlaceReferenceErrorMessage,
  restoreChartEngineViewState,
  resolveChartEngineCalculationState,
  resolveChartEngineSubmissionAuthority,
  shouldCommitTerminalJobRecovery
} from "../../features/charts/model/chartEngineControllerState";
import type {
  ChartHoraryQuestionInput,
  ChartTransitMomentInput
} from "../../features/charts/model/chartEngineInput";
import type { ChartEngineMode } from "../../features/charts/model/chartEngineMode";
import {
  buildSubmissionUrlState,
  getChartJobRecalculationTarget,
  getExactChartCalculationRefreshKeys,
  resolveChartRecalculationTarget,
  type ChartRecalculationTarget
} from "../../features/charts/model/chartEngineRecovery";
import { submitChartEngineMode } from "../../features/charts/model/chartEngineSubmission";
import {
  attachChartEngineSubmissionTarget,
  prepareChartEngineSubmission
} from "../../features/charts/model/chartEngineSubmissionRequest";
import {
  buildChartEngineSearch as buildSafeChartEngineSearch,
  transitionChartEngineUrlState,
  type ChartEngineUrlState as SafeChartEngineUrlState
} from "../../features/charts/model/chartEngineUrlState";
import { isChartResultStale } from "../../features/charts/model/chartEngineState";
import { updateChartCivilMoment } from "../../features/charts/model/chartCivilTimeOccurrence";
import {
  buildChartPdfAction,
  closeReservedChartPdfWindow,
  executeChartPdfAction,
  openChartPdfDownloadUrl,
  reserveChartPdfDownloadWindow
} from "../../features/charts/model/chartPdfModel";
import {
  getCalculation as getSavedCalculation,
  linkCalculationClient
} from "../../features/calculations/api/calculationsApi";
import { isCalculationLinked } from "../../features/calculations/model/calculationStatus";
import { getChartResultMethodForMode } from "../../features/charts/model/chartEngineMode";

export {
  createInitialChartEngineControllerState,
  deriveChartEngineJobState,
  getBrowserTimezone,
  getChartLinkableClientId,
  getDefaultProgressionTargetDate,
  restoreChartEngineViewState,
  resolveChartEngineCalculationState,
  resolveChartEngineSubmissionAuthority,
  shouldCommitTerminalJobRecovery
} from "../../features/charts/model/chartEngineControllerState";
export {
  submitAstrocartographyCalculation,
  submitChartCalculation,
  submitChartEngineMode,
  submitCompositeCalculation,
  submitHoraryCalculation,
  submitProgressionCalculation,
  submitSolarReturnCalculation,
  submitSynastryCalculation,
  submitTargetedOrNewChart,
  submitTransitCalculation
} from "../../features/charts/model/chartEngineSubmission";
export type { ChartEngineSubmission } from "../../features/charts/model/chartEngineSubmission";

async function refreshExactChartCalculation(queryClient: QueryClient, calculationId: string) {
  await Promise.all(
    getExactChartCalculationRefreshKeys(calculationId).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "active" })
    )
  );
}

export function useChartEngineController() {
  const { locale } = useI18n();
  const chartCopy = chartEngineCopyByLocale[locale];
  const controllerCopy = chartCopy.controller;
  useDocumentTitle(chartCopy.documentTitle);
  const pdfLocale = locale === "en" ? "en" : "ru";
  const queryClient = useQueryClient();
  const initialControllerState = useMemo(
    () => createInitialChartEngineControllerState(getCurrentChartEngineSearch()),
    []
  );
  const initialUrlState = initialControllerState.urlState;
  const [urlState, setUrlState] = useState(initialUrlState);
  const [selectedClient, setSelectedClient] = useState<ClientSelectOption | null>(null);
  const [selectedPartnerClient, setSelectedPartnerClient] = useState<ClientSelectOption | null>(
    null
  );
  const [restoredClientId, setRestoredClientId] = useState<string | null>(initialUrlState.clientId);
  const [restoredPartnerClientId, setRestoredPartnerClientId] = useState<string | null>(
    initialUrlState.partnerClientId
  );
  const [settings, setSettings] = useState<ChartSettings>(defaultChartEngineSettings);
  const [mode, setMode] = useState<ChartEngineMode>(initialControllerState.mode);
  const [transitMoment, setTransitMoment] = useState<ChartTransitMomentInput>(
    initialControllerState.transitMoment
  );
  const [solarReturnYear, setSolarReturnYear] = useState(initialControllerState.solarReturnYear);
  const [progressionTargetDate, setProgressionTargetDate] = useState(
    initialControllerState.progressionTargetDate
  );
  const [horaryQuestion, setHoraryQuestion] = useState<ChartHoraryQuestionInput>(
    initialControllerState.horaryQuestion
  );
  const [horaryPlaceText, setHoraryPlaceText] = useState("");
  const [jobId, setJobId] = useState<string | null>(initialControllerState.jobId);
  const [calculationId, setCalculationId] = useState<string | null>(
    initialControllerState.calculationId
  );
  const [calculationErrorMessage, setCalculationErrorMessage] = useState<string | null>(null);
  const [pdfActionErrorMessage, setPdfActionErrorMessage] = useState<string | null>(null);
  const [hasResultStaleIntent, setHasResultStaleIntent] = useState(false);
  const [pendingRecalculationTarget, setPendingRecalculationTarget] =
    useState<ChartRecalculationTarget | null>(null);
  const submissionEpochRef = useRef(0);
  const terminalRecoveryRef = useRef<string | null>(null);

  const invalidateActiveSubmission = () => {
    submissionEpochRef.current += 1;
  };

  const commitUrlState = (next: SafeChartEngineUrlState) => {
    setUrlState(next);
    writeChartEngineUrlState(next);
  };

  const restoredClientQuery = useQuery({
    queryKey: ["clients", "detail", restoredClientId],
    queryFn: () => getAstrologerClient(restoredClientId ?? ""),
    enabled: Boolean(restoredClientId && !selectedClient),
    retry: false
  });
  const partnerClientIdToRestore = restoredPartnerClientId;
  const restoredPartnerClientQuery = useQuery({
    queryKey: ["clients", "detail", partnerClientIdToRestore],
    queryFn: () => getAstrologerClient(partnerClientIdToRestore ?? ""),
    enabled: Boolean(partnerClientIdToRestore && !selectedPartnerClient),
    retry: false
  });
  const horaryPlaceReferenceQuery = useQuery({
    queryKey: [
      "clients",
      "birth-place-reference",
      urlState.horaryPlaceProvider,
      urlState.horaryPlaceId
    ],
    queryFn: () => resolveClientBirthPlaceReference(urlState.horaryPlaceId ?? ""),
    enabled: Boolean(
      mode === "horary" && urlState.horaryPlaceProvider === "geoapify" && urlState.horaryPlaceId
    ),
    retry: false
  });

  useEffect(() => {
    const candidate = horaryPlaceReferenceQuery.data;
    if (!candidate || mode !== "horary") return;
    setHoraryPlaceText(candidate.placeName);
    setHoraryQuestion((current) => ({
      ...updateChartCivilMoment(current, { timezone: candidate.timezone }),
      latitude: candidate.latitude,
      longitude: candidate.longitude
    }));
  }, [horaryPlaceReferenceQuery.data, mode]);

  const calculationMutation = useMutation({
    mutationFn: submitChartEngineMode,
    onMutate: () => {
      submissionEpochRef.current += 1;
      return { epoch: submissionEpochRef.current };
    },
    onSuccess: async (response, variables, submissionContext) => {
      if (submissionContext?.epoch !== submissionEpochRef.current) return;
      setCalculationErrorMessage(null);
      if (response.status === "succeeded") {
        if (
          variables.calculationId !== null &&
          variables.calculationId === response.calculationId
        ) {
          await refreshExactChartCalculation(queryClient, response.calculationId);
          if (submissionContext?.epoch !== submissionEpochRef.current) return;
        }
        setJobId(null);
        setCalculationId(response.calculationId);
        setPendingRecalculationTarget(null);
        setHasResultStaleIntent(false);
      } else {
        setCalculationId(null);
        setJobId(response.jobId);
        setPendingRecalculationTarget(
          variables.calculationId && variables.expectedResultChecksum
            ? {
                calculationId: variables.calculationId,
                expectedResultChecksum: variables.expectedResultChecksum
              }
            : null
        );
        setHasResultStaleIntent(false);
      }
      commitUrlState(
        buildSubmissionUrlState({ current: urlState, submission: variables, response })
      );
    },
    onError: (error, _variables, submissionContext) => {
      if (submissionContext?.epoch !== submissionEpochRef.current) return;
      setCalculationErrorMessage(
        errorMessageFrom(error, controllerCopy.startFailed) ?? controllerCopy.startFailed
      );
    }
  });

  const birthDataMutation = useMutation({
    mutationFn: async (input: {
      readonly clientId: string;
      readonly data: Parameters<typeof updateClientBirthData>[1];
      readonly sourceBirthData: ClientSelectOption["birthData"];
    }) => {
      const draft = updateChartBirthDataDraft(
        createChartBirthDataDraft(input.clientId, input.sourceBirthData),
        input.data
      );
      return updateClientBirthData(input.clientId, toBirthDataUpsertRequest(draft, input.clientId));
    },
    onSuccess: async (response) => {
      const [updatedClient] = toClientSelectOptions([response.client]);
      if (updatedClient) {
        setSelectedClient((current) =>
          current?.value === updatedClient.value ? updatedClient : current
        );
      }
      if (result) {
        setHasResultStaleIntent(true);
      }
      await queryClient.invalidateQueries({ queryKey: astrologerClientsQueryKeys.all() });
    }
  });
  const birthPlaceSearchMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await searchClientBirthPlaces({ query, limit: 5 });

      return response.candidates;
    }
  });

  const jobQuery = useQuery({
    queryKey: ["charts", "jobs", jobId],
    queryFn: () => getChartJob(jobId ?? ""),
    enabled: Boolean(jobId),
    retry: false,
    refetchInterval: (query) => {
      if (query.state.error) return false;
      return query.state.data?.status === "calculating" || !query.state.data ? 1800 : false;
    }
  });
  const ownerScopedJobTarget = useMemo(
    () => getChartJobRecalculationTarget(jobQuery.data, jobId),
    [jobId, jobQuery.data]
  );
  const recalculationTargetState = useMemo(
    () =>
      resolveChartRecalculationTarget(
        pendingRecalculationTarget,
        ownerScopedJobTarget,
        controllerCopy
      ),
    [controllerCopy, ownerScopedJobTarget, pendingRecalculationTarget]
  );
  const effectiveCalculationId =
    calculationId ?? recalculationTargetState.target?.calculationId ?? null;

  useEffect(() => {
    const job = jobQuery.data;
    if (!job || !jobId || job.id !== jobId) return;
    const authoritativeJobMode =
      job.interpretationMode === "child"
        ? "child_chart"
        : job.interpretationMode === "adult_natal"
          ? "natal"
          : null;
    if (
      authoritativeJobMode &&
      (mode !== authoritativeJobMode || urlState.mode !== authoritativeJobMode)
    ) {
      setMode(authoritativeJobMode);
      commitUrlState({ ...urlState, mode: authoritativeJobMode });
    }
    if (job.status === "succeeded") {
      if (
        !shouldCommitTerminalJobRecovery({
          localJobId: jobId,
          localCalculationId: calculationId,
          urlJobId: urlState.jobId,
          urlCalculationId: urlState.calculationId,
          terminalCalculationId: job.calculationId
        })
      ) {
        return;
      }
      const recoveryKey = `${job.id}:${job.calculationId}`;
      if (terminalRecoveryRef.current === recoveryKey) return;
      terminalRecoveryRef.current = recoveryKey;
      const recoveryEpoch = submissionEpochRef.current;
      void (async () => {
        if (job.targetCalculationId === job.calculationId) {
          await refreshExactChartCalculation(queryClient, job.calculationId);
        }
        if (
          recoveryEpoch !== submissionEpochRef.current ||
          terminalRecoveryRef.current !== recoveryKey
        ) {
          return;
        }
        setCalculationId(job.calculationId);
        setJobId(null);
        setPendingRecalculationTarget(null);
        setCalculationErrorMessage(null);
        setHasResultStaleIntent(false);
        commitUrlState({
          ...urlState,
          ...(authoritativeJobMode ? { mode: authoritativeJobMode } : {}),
          jobId: null,
          calculationId: job.calculationId
        });
        terminalRecoveryRef.current = null;
      })();
    }
  }, [calculationId, jobId, jobQuery.data, mode, queryClient, urlState]);

  const calculationQuery = useQuery({
    queryKey: ["charts", "calculations", effectiveCalculationId],
    queryFn: () => getChartCalculation(effectiveCalculationId ?? ""),
    enabled: Boolean(effectiveCalculationId),
    retry: false
  });
  const savedCalculationQuery = useQuery({
    queryKey: ["calculations", effectiveCalculationId],
    queryFn: () => getSavedCalculation(effectiveCalculationId ?? ""),
    enabled: Boolean(effectiveCalculationId),
    retry: false
  });
  const calculationState = useMemo(
    () =>
      resolveChartEngineCalculationState({
        mode,
        selectedClientId: selectedClient?.value ?? urlState.clientId,
        selectedPartnerClientId: selectedPartnerClient?.value ?? urlState.partnerClientId,
        chartCalculation: effectiveCalculationId ? calculationQuery.data : undefined,
        savedCalculation: effectiveCalculationId ? savedCalculationQuery.data : undefined
      }),
    [
      effectiveCalculationId,
      calculationQuery.data,
      mode,
      savedCalculationQuery.data,
      selectedClient?.value,
      selectedPartnerClient?.value,
      urlState.clientId,
      urlState.partnerClientId
    ]
  );
  const authoritativeMode = calculationState.mode ?? mode;
  const linkCalculationMutation = useMutation({
    mutationFn: linkCalculationClient,
    onSuccess: async (calculation) => {
      queryClient.setQueryData(["calculations", calculation.id], calculation);
      await queryClient.invalidateQueries({ queryKey: ["calculations"] });
    }
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
    if (calculationState.identity.kind !== "ready") return;
    const { subjectClientId, partnerClientId } = calculationState.identity;
    if (!selectedClient && !restoredClientId) {
      setRestoredClientId(subjectClientId);
    }
    if (partnerClientId && !selectedPartnerClient && !restoredPartnerClientId) {
      setRestoredPartnerClientId(partnerClientId);
    }
    if (urlState.clientId === null || urlState.partnerClientId !== partnerClientId) {
      commitUrlState({
        ...urlState,
        clientId: subjectClientId,
        partnerClientId
      });
    }
  }, [
    calculationState.identity,
    restoredClientId,
    restoredPartnerClientId,
    selectedClient,
    selectedPartnerClient,
    urlState
  ]);

  useEffect(() => {
    if (!calculationState.result || !calculationState.interpretationMode) return;
    const restoredState = restoreChartEngineViewState(calculationState.result, {
      interpretationMode: calculationState.interpretationMode,
      partnerClientId:
        calculationState.identity.kind === "ready"
          ? calculationState.identity.partnerClientId
          : null
    });
    setSettings(restoredState.settings);
    setMode(restoredState.mode);
    if (urlState.mode !== restoredState.mode) {
      commitUrlState({ ...urlState, mode: restoredState.mode });
    }
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
  }, [
    calculationState.identity,
    calculationState.interpretationMode,
    calculationState.result,
    urlState
  ]);

  const result = calculationState.result;
  const savedCalculation = savedCalculationQuery.data ?? null;
  const authoritativeCalculationIdentity = savedCalculation
    ? resolveChartCalculationIdentity({
        calculation: savedCalculation,
        mode: authoritativeMode,
        selectedClientId: null,
        selectedPartnerClientId: null
      })
    : ({ kind: "pending" } as const);
  const canRecoverCalculationIdentity = Boolean(
    (calculationState.identity.kind === "client_mismatch" ||
      calculationState.identity.kind === "partner_mismatch") &&
    authoritativeCalculationIdentity.kind === "ready"
  );
  const recoveredTargetChecksumMismatch = Boolean(
    recalculationTargetState.target &&
    savedCalculation &&
    savedCalculation.resultChecksum !== recalculationTargetState.target.expectedResultChecksum
  );
  const submissionAuthority = resolveChartEngineSubmissionAuthority({
    calculationId: effectiveCalculationId,
    expectedResultChecksum: recalculationTargetState.target
      ? recoveredTargetChecksumMismatch
        ? null
        : recalculationTargetState.target.expectedResultChecksum
      : (savedCalculation?.resultChecksum ?? null),
    canRecalculate:
      calculationState.capabilities.canRecalculate &&
      recalculationTargetState.errorMessage === null &&
      !recoveredTargetChecksumMismatch,
    locale
  });
  const getSubmissionTarget = () => {
    if (submissionAuthority.kind === "blocked") {
      setCalculationErrorMessage(submissionAuthority.message);
      return null;
    }
    return submissionAuthority;
  };
  const isCurrentCalculationLinked =
    calculationState.identity.kind === "ready" && isCalculationLinked(savedCalculation);
  const linkableClientId = calculationState.linkableClientId;
  const isResultStale = Boolean(
    result &&
    (result.schemaVersion === "chart-result.v1" ||
      hasResultStaleIntent ||
      isChartResultStale(
        result,
        selectedClient?.birthData,
        settings,
        getChartResultMethodForMode(authoritativeMode),
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
    enabled: Boolean(
      calculationId && calculationState.capabilities.canRequestPdf && !isResultStale
    ),
    retry: false,
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
  const restoredClientError = restoredClientQuery.error ?? restoredPartnerClientQuery.error;
  const recalculationRecoveryErrorMessage = recoveredTargetChecksumMismatch
    ? controllerCopy.recalculationChanged
    : recalculationTargetState.errorMessage;
  const pollErrorMessage =
    errorMessageFrom(jobQuery.error, controllerCopy.calculationFailed) ?? recalculationRecoveryErrorMessage;
  const resultErrorMessage = errorMessageFrom(calculationQuery.error, controllerCopy.calculationFailed);
  const savedCalculationErrorMessage = errorMessageFrom(
    savedCalculationQuery.error,
    controllerCopy.calculationFailed
  );
  const clientErrorMessage = errorMessageFrom(restoredClientError, controllerCopy.calculationFailed);
  const identityErrorMessage = getChartIdentityErrorMessage(
    calculationState.identity,
    controllerCopy
  );
  const linkErrorMessage = errorMessageFrom(linkCalculationMutation.error, controllerCopy.calculationFailed);
  const horaryPlaceErrorMessage = getHoraryPlaceReferenceErrorMessage(
    horaryPlaceReferenceQuery.error,
    chartCopy
  );
  const jobState = deriveChartEngineJobState({
    isSubmitting: calculationMutation.isPending,
    jobId,
    jobStatus: jobQuery.data?.status,
    pollError: jobQuery.error ?? recalculationRecoveryErrorMessage,
    calculationId: effectiveCalculationId,
    isResultLoading: calculationQuery.isLoading,
    resultError: calculationQuery.error,
    isSavedCalculationLoading: savedCalculationQuery.isLoading,
    savedCalculationError: savedCalculationQuery.error ?? restoredClientError,
    identityKind: calculationState.identity.kind,
    result
  });
  const isBusy =
    calculationMutation.isPending ||
    birthDataMutation.isPending ||
    linkCalculationMutation.isPending ||
    enqueuePdfMutation.isPending ||
    downloadPdfMutation.isPending ||
    jobState === "calculating" ||
    jobQuery.isFetching ||
    calculationQuery.isFetching ||
    savedCalculationQuery.isFetching;
  const pdfAction = buildChartPdfAction({
    calculationId: calculationState.capabilities.canRequestPdf ? calculationId : null,
    currentResultChecksum: pdfQuery.data?.currentResultChecksum ?? null,
    job: pdfQuery.data?.job ?? null,
    isBusy,
    isResultStale: isResultStale || !calculationState.capabilities.canRequestPdf,
    locale: pdfLocale
  });
  const pdfErrorMessage =
    pdfActionErrorMessage ??
    errorMessageFrom(pdfQuery.error, controllerCopy.pdfFailed) ??
    pdfAction.errorMessage;
  const jobFailureMessage =
    jobQuery.data?.status === "failed"
      ? controllerCopy.calculationFailed
      : null;
  const handlePdfAction = async () => {
    if (pdfQuery.error) {
      setPdfActionErrorMessage(null);
      await pdfQuery.refetch();
      return;
    }
    const downloadWindow = reserveChartPdfDownloadWindow({
      kind: pdfAction.kind,
      openWindow: (url, target) => window.open(url, target)
    });
    try {
      setPdfActionErrorMessage(null);
      await executeChartPdfAction({
        calculationId: calculationState.capabilities.canRequestPdf ? calculationId : null,
        locale: pdfLocale,
        currentResultChecksum: pdfQuery.data?.currentResultChecksum ?? null,
        kind: pdfAction.kind,
        job: pdfQuery.data?.job ?? null,
        enqueue: (input) => enqueuePdfMutation.mutateAsync(input),
        download: (input) => downloadPdfMutation.mutateAsync(input),
        openUrl: (url) =>
          openChartPdfDownloadUrl({
            url,
            downloadWindow,
            navigateCurrentWindow: (nextUrl) => window.location.assign(nextUrl)
          })
      });
    } catch (error) {
      closeReservedChartPdfWindow({ downloadWindow });
      setPdfActionErrorMessage(
        errorMessageFrom(error, controllerCopy.pdfFailed) ?? controllerCopy.pdfFailed
      );
    }
  };
  const submitPreparedCalculation = async (requestedMode: ChartEngineMode) => {
    const preparation = prepareChartEngineSubmission({
      mode: requestedMode,
      selectedClient,
      selectedPartnerClient,
      settings,
      transitMoment,
      solarReturnYear,
      progressionTargetDate,
      horaryQuestion,
      locale,
      copy: controllerCopy
    });
    if (preparation.kind === "blocked") {
      setCalculationErrorMessage(preparation.message);
      return;
    }
    const target = getSubmissionTarget();
    if (!target) return;
    await calculationMutation.mutateAsync(
      attachChartEngineSubmissionTarget(preparation.draft, target)
    );
  };

  return {
    selectedClient,
    selectedPartnerClient,
    jobState,
    calculationId,
    result,
    capabilities: calculationState.capabilities,
    canRequestAi: calculationState.capabilities.canRequestAi,
    calculationIdentity: calculationState.identity,
    canRecoverCalculationIdentity,
    isResultStale,
    isCalculationLinked: isCurrentCalculationLinked,
    linkDisabled:
      isBusy ||
      !calculationId ||
      !result ||
      !calculationState.capabilities.canLink ||
      isResultStale ||
      isCurrentCalculationLinked ||
      !linkableClientId,
    errorMessage:
      calculationErrorMessage ??
      jobFailureMessage ??
      pollErrorMessage ??
      resultErrorMessage ??
      savedCalculationErrorMessage ??
      clientErrorMessage ??
      identityErrorMessage ??
      recalculationRecoveryErrorMessage ??
      horaryPlaceErrorMessage,
    calculationErrorMessage,
    pollErrorMessage,
    resultErrorMessage,
    savedCalculationErrorMessage: savedCalculationErrorMessage ?? clientErrorMessage,
    clientErrorMessage,
    identityErrorMessage,
    linkErrorMessage,
    horaryPlaceErrorMessage,
    isBusy,
    pdfLabel: pdfAction.label,
    pdfDisabled: pdfAction.disabled,
    pdfTitle: pdfAction.title,
    pdfErrorMessage,
    onRetryPoll: async () => {
      if (!jobId) return;
      await jobQuery.refetch();
    },
    onRetryResult: async () => {
      if (!effectiveCalculationId) return;
      await calculationQuery.refetch();
    },
    onRetrySavedCalculation: async () => {
      const retries: Array<Promise<unknown>> = [];
      if (effectiveCalculationId) retries.push(savedCalculationQuery.refetch());
      if (restoredClientId && !selectedClient) retries.push(restoredClientQuery.refetch());
      if (restoredPartnerClientId && !selectedPartnerClient) {
        retries.push(restoredPartnerClientQuery.refetch());
      }
      await Promise.all(retries);
    },
    onRecoverCalculationIdentity: () => {
      if (!canRecoverCalculationIdentity || authoritativeCalculationIdentity.kind !== "ready") {
        return;
      }
      invalidateActiveSubmission();
      setSelectedClient(null);
      setSelectedPartnerClient(null);
      setRestoredClientId(authoritativeCalculationIdentity.subjectClientId);
      setRestoredPartnerClientId(authoritativeCalculationIdentity.partnerClientId);
      setCalculationErrorMessage(null);
      commitUrlState({
        ...urlState,
        clientId: authoritativeCalculationIdentity.subjectClientId,
        partnerClientId: authoritativeCalculationIdentity.partnerClientId
      });
    },
    settings,
    mode: authoritativeMode,
    interpretationMode: calculationState.interpretationMode,
    transitMoment,
    solarReturnYear,
    progressionTargetDate,
    horaryQuestion,
    horaryPlaceText,
    onModeChange: (nextMode: ChartEngineMode) => {
      invalidateActiveSubmission();
      const nextUrlState = transitionChartEngineUrlState(urlState, { mode: nextMode });
      setMode(nextMode);
      setSelectedPartnerClient(null);
      setRestoredPartnerClientId(null);
      setJobId(null);
      setCalculationId(null);
      setPendingRecalculationTarget(null);
      setCalculationErrorMessage(null);
      setTransitMoment(getDefaultTransitMoment());
      setSolarReturnYear(new Date().getFullYear());
      setProgressionTargetDate(getDefaultProgressionTargetDate());
      setHoraryQuestion(getDefaultHoraryQuestion());
      setHoraryPlaceText("");
      setHasResultStaleIntent(false);
      commitUrlState(nextUrlState);
    },
    onTransitMomentChange: (nextMoment: ChartTransitMomentInput) => {
      invalidateActiveSubmission();
      const normalizedMoment = updateChartCivilMoment(transitMoment, nextMoment);
      setTransitMoment(normalizedMoment);
      setJobId(null);
      setCalculationId(null);
      setPendingRecalculationTarget(null);
      setHasResultStaleIntent(false);
      commitUrlState({
        ...urlState,
        jobId: null,
        calculationId: null,
        transitDate: normalizedMoment.date,
        transitTime: normalizedMoment.time
      });
    },
    onSolarReturnYearChange: (year: number) => {
      invalidateActiveSubmission();
      setSolarReturnYear(year);
      setJobId(null);
      setCalculationId(null);
      setPendingRecalculationTarget(null);
      setHasResultStaleIntent(false);
      commitUrlState({
        ...urlState,
        jobId: null,
        calculationId: null,
        solarReturnYear: year
      });
    },
    onProgressionTargetDateChange: (targetDate: string) => {
      invalidateActiveSubmission();
      setProgressionTargetDate(targetDate);
      setJobId(null);
      setCalculationId(null);
      setPendingRecalculationTarget(null);
      setHasResultStaleIntent(false);
      commitUrlState({
        ...urlState,
        jobId: null,
        calculationId: null,
        progressionTargetDate: targetDate
      });
    },
    onHoraryQuestionChange: (nextQuestion: ChartHoraryQuestionInput) => {
      invalidateActiveSubmission();
      setHoraryQuestion(updateChartCivilMoment(horaryQuestion, nextQuestion));
      setJobId(null);
      setCalculationId(null);
      setPendingRecalculationTarget(null);
      setHasResultStaleIntent(false);
      const changedResolvedPlace =
        nextQuestion.timezone !== horaryQuestion.timezone ||
        nextQuestion.latitude !== horaryQuestion.latitude ||
        nextQuestion.longitude !== horaryQuestion.longitude;
      if (changedResolvedPlace) setHoraryPlaceText("");
      commitUrlState({
        ...urlState,
        jobId: null,
        calculationId: null,
        ...(changedResolvedPlace ? { horaryPlaceProvider: null, horaryPlaceId: null } : {})
      });
    },
    onSelectHoraryPlace: (candidate: ClientBirthPlaceCandidate) => {
      invalidateActiveSubmission();
      setHoraryPlaceText(candidate.placeName);
      setHoraryQuestion((current) => ({
        ...updateChartCivilMoment(current, { timezone: candidate.timezone }),
        latitude: candidate.latitude,
        longitude: candidate.longitude
      }));
      setJobId(null);
      setCalculationId(null);
      setPendingRecalculationTarget(null);
      setHasResultStaleIntent(false);
      commitUrlState({
        ...urlState,
        mode: "horary",
        jobId: null,
        calculationId: null,
        horaryPlaceProvider: candidate.provider,
        horaryPlaceId: candidate.providerPlaceId
      });
    },
    onClearHoraryPlace: () => {
      invalidateActiveSubmission();
      setHoraryPlaceText("");
      setHoraryQuestion((current) => ({
        ...current,
        timezone: "",
        latitude: "",
        longitude: ""
      }));
      commitUrlState({
        ...urlState,
        jobId: null,
        calculationId: null,
        horaryPlaceProvider: null,
        horaryPlaceId: null
      });
    },
    onSettingsChange: (nextSettings: ChartSettings) => {
      invalidateActiveSubmission();
      setSettings(nextSettings);
      if (result) {
        setHasResultStaleIntent(true);
      }
    },
    isSavingBirthData: birthDataMutation.isPending,
    birthDataError: errorMessageFrom(birthDataMutation.error, controllerCopy.calculationFailed),
    onSearchBirthPlaces: async (query: string) => birthPlaceSearchMutation.mutateAsync(query),
    onSaveBirthData: async (data: Parameters<typeof updateClientBirthData>[1]) => {
      if (!selectedClient) {
        throw new Error(controllerCopy.chooseClient);
      }
      await birthDataMutation.mutateAsync({
        clientId: selectedClient.value,
        data,
        sourceBirthData: selectedClient.birthData
      });
    },
    onLink: async () => {
      if (!calculationId || !linkableClientId || isCurrentCalculationLinked) return;
      try {
        await linkCalculationMutation.mutateAsync({
          calculationId,
          body: { clientId: linkableClientId }
        });
      } catch {
        // The link mutation owns its local retry/error state.
      }
    },
    onRetryLink: async () => {
      if (!calculationId || !linkableClientId || isCurrentCalculationLinked) return;
      try {
        await linkCalculationMutation.mutateAsync({
          calculationId,
          body: { clientId: linkableClientId }
        });
      } catch {
        // The link mutation owns its local retry/error state.
      }
    },
    onSelectClient: (client: ClientSelectOption) => {
      invalidateActiveSubmission();
      const nextUrlState = transitionChartEngineUrlState(urlState, { clientId: client.value });
      setSelectedClient(client);
      setRestoredClientId(client.value);
      setSelectedPartnerClient(null);
      setRestoredPartnerClientId(null);
      setJobId(null);
      setCalculationId(null);
      setPendingRecalculationTarget(null);
      setCalculationErrorMessage(null);
      setHasResultStaleIntent(false);
      commitUrlState(nextUrlState);
    },
    onSelectPartnerClient: (client: ClientSelectOption) => {
      invalidateActiveSubmission();
      const relationshipMode = mode === "composite" ? "composite" : "synastry";
      const modeUrlState = transitionChartEngineUrlState(urlState, { mode: relationshipMode });
      const nextUrlState = transitionChartEngineUrlState(modeUrlState, {
        partnerClientId: client.value
      });
      setMode(relationshipMode);
      setSelectedPartnerClient(client);
      setRestoredPartnerClientId(client.value);
      setJobId(null);
      setCalculationId(null);
      setPendingRecalculationTarget(null);
      setCalculationErrorMessage(null);
      setHasResultStaleIntent(false);
      commitUrlState(nextUrlState);
    },
    onCreateNatalJob: async () =>
      submitPreparedCalculation(authoritativeMode === "child_chart" ? "child_chart" : "natal"),
    onCreateTransitJob: async () => submitPreparedCalculation("transit"),
    onCreateSynastryJob: async () => submitPreparedCalculation("synastry"),
    onCreateCompositeJob: async () => submitPreparedCalculation("composite"),
    onCreateSolarReturnJob: async () => submitPreparedCalculation("solar_return"),
    onCreateProgressionJob: async () => submitPreparedCalculation("progression"),
    onCreateHoraryJob: async () => submitPreparedCalculation("horary"),
    onCreateAstrocartographyJob: async () => submitPreparedCalculation("astrocartography"),
    onPdf: handlePdfAction,
    onRetryPdf: handlePdfAction
  };
}

function writeChartEngineUrlState(state: SafeChartEngineUrlState) {
  if (typeof window === "undefined") return;
  const search = buildSafeChartEngineSearch(window.location.search, state);
  const nextUrl = `${window.location.pathname}${search}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function getCurrentChartEngineSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}
