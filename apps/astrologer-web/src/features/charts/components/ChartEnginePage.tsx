import { useEffect, useState } from "react";
import type {
  ChartInterpretationMode,
  ChartResult,
  ChartSettings,
  ClientBirthDataUpsertRequest,
  ClientBirthPlaceCandidate,
  ClientRelatedBirthProfileResponse,
  ClientRelatedBirthProfileUpsertRequest,
  DictionaryLocale
} from "@elevenhouse/contracts";
import type { ClientSelectOption } from "../../clients/model/clientSelectorModel";
import { chartEngineCopyByLocale, type ChartEngineCopy } from "../model/chartEngineCopy";
import {
  getChartResultMethodForMode,
  type ChartEngineMode,
  type ChartEnginePageJobState
} from "../model/chartEngineMode";
import {
  getChartBirthDataReadiness,
  getChartHoraryQuestionReadiness,
  type ChartBirthDataReadiness
} from "../model/chartEngineState";
import { ChartEngineActionBar } from "./ChartEngineActionBar";
import { ChartEngineHeader } from "./ChartEngineHeader";
import { ChartEnginePresentation } from "./ChartEnginePresentation";
import { ChartHorarySetup } from "./ChartHorarySetup";
import { ChartMomentControls } from "./ChartMomentControls";
import type { ChartHoraryQuestionInput, ChartTransitMomentInput } from "../model/chartEngineInput";
import { ChartEngineWorkspace } from "./ChartEngineWorkspace";
import { ChartRelatedBirthProfileEditor } from "./ChartRelatedBirthProfileEditor";
import styles from "./ChartEnginePage.module.css";

export type { ChartEngineMode, ChartEnginePageJobState } from "../model/chartEngineMode";
export { getChartResultMethodForMode } from "../model/chartEngineMode";
export type { ChartHoraryQuestionInput, ChartTransitMomentInput } from "../model/chartEngineInput";

export type ChartEnginePageProps = {
  readonly selectedClient: ClientSelectOption | null;
  readonly selectedPartnerClient?: ClientSelectOption | null;
  readonly selectedPartnerRelatedProfile?: ClientRelatedBirthProfileResponse | null;
  readonly jobState: ChartEnginePageJobState;
  readonly calculationId?: string | null;
  readonly result: ChartResult | null;
  readonly errorMessage: string | null;
  readonly pollErrorMessage?: string | null;
  readonly resultErrorMessage?: string | null;
  readonly savedCalculationErrorMessage?: string | null;
  readonly linkErrorMessage?: string | null;
  readonly identityErrorMessage?: string | null;
  readonly canRecoverCalculationIdentity?: boolean;
  readonly isBusy: boolean;
  readonly isCalculationLinked?: boolean;
  readonly linkDisabled?: boolean;
  readonly isResultStale?: boolean;
  readonly canRequestAi?: boolean;
  readonly interpretationMode?: ChartInterpretationMode | null;
  readonly locale?: DictionaryLocale;
  readonly settings: ChartSettings;
  readonly mode?: ChartEngineMode;
  readonly transitMoment?: ChartTransitMomentInput;
  readonly solarReturnYear?: number;
  readonly progressionTargetDate?: string;
  readonly horaryQuestion?: ChartHoraryQuestionInput;
  readonly horaryPlaceText?: string;
  readonly horaryPlaceErrorMessage?: string | null;
  readonly onSettingsChange: (settings: ChartSettings) => void;
  readonly onCreateNatalJob: () => void | Promise<void>;
  readonly onCreateTransitJob?: () => void | Promise<void>;
  readonly onCreateSynastryJob?: () => void | Promise<void>;
  readonly onCreateCompositeJob?: () => void | Promise<void>;
  readonly onCreateSolarReturnJob?: () => void | Promise<void>;
  readonly onCreateProgressionJob?: () => void | Promise<void>;
  readonly onCreateHoraryJob?: () => void | Promise<void>;
  readonly onCreateAstrocartographyJob?: () => void | Promise<void>;
  readonly onTransitMomentChange?: (moment: ChartTransitMomentInput) => void;
  readonly onSolarReturnYearChange?: (year: number) => void;
  readonly onProgressionTargetDateChange?: (targetDate: string) => void;
  readonly onHoraryQuestionChange?: (question: ChartHoraryQuestionInput) => void;
  readonly onSelectHoraryPlace?: (candidate: ClientBirthPlaceCandidate) => void;
  readonly onClearHoraryPlace?: () => void;
  readonly onModeChange?: (mode: ChartEngineMode) => void;
  readonly onSelectClient?: (client: ClientSelectOption) => void;
  readonly onSelectPartnerClient?: (client: ClientSelectOption) => void;
  readonly onSelectPartnerRelatedProfile?: (profile: ClientRelatedBirthProfileResponse) => void;
  readonly onCreateRelatedBirthProfile?: (
    data: ClientRelatedBirthProfileUpsertRequest
  ) => void | Promise<void>;
  readonly onSaveBirthData?: (data: ClientBirthDataUpsertRequest) => void | Promise<void>;
  readonly onSearchBirthPlaces?: (query: string) => Promise<readonly ClientBirthPlaceCandidate[]>;
  readonly onRetryPoll?: () => void | Promise<void>;
  readonly onRetryResult?: () => void | Promise<void>;
  readonly onRetrySavedCalculation?: () => void | Promise<void>;
  readonly onRetryLink?: () => void | Promise<void>;
  readonly onRecoverCalculationIdentity?: () => void;
  readonly isSavingBirthData?: boolean;
  readonly isCreatingRelatedBirthProfile?: boolean;
  readonly birthDataError?: string | null;
  readonly relatedBirthProfileError?: string | null;
  readonly pdfLabel?: string;
  readonly pdfDisabled?: boolean;
  readonly pdfTitle?: string;
  readonly pdfErrorMessage?: string | null;
  readonly onLink?: () => void | Promise<void>;
  readonly onPdf?: () => void | Promise<void>;
};

export function ChartEnginePage({
  birthDataError = null,
  calculationId = null,
  canRecoverCalculationIdentity = false,
  canRequestAi = true,
  errorMessage,
  horaryQuestion,
  horaryPlaceErrorMessage = null,
  horaryPlaceText = "",
  identityErrorMessage = null,
  interpretationMode = null,
  isBusy,
  isCalculationLinked = false,
  isCreatingRelatedBirthProfile = false,
  isResultStale = false,
  isSavingBirthData = false,
  jobState,
  linkDisabled = true,
  linkErrorMessage = null,
  locale = "ru",
  mode = "natal",
  onCreateAstrocartographyJob,
  onCreateCompositeJob,
  onCreateHoraryJob,
  onCreateNatalJob,
  onCreateProgressionJob,
  onCreateSolarReturnJob,
  onCreateSynastryJob,
  onCreateTransitJob,
  onHoraryQuestionChange,
  onClearHoraryPlace,
  onLink,
  onModeChange,
  onPdf,
  onProgressionTargetDateChange,
  onRecoverCalculationIdentity,
  onRetryLink,
  onRetryPoll,
  onRetryResult,
  onRetrySavedCalculation,
  onSaveBirthData,
  onSearchBirthPlaces,
  onSelectClient,
  onSelectHoraryPlace,
  onSelectPartnerClient,
  onSelectPartnerRelatedProfile,
  onCreateRelatedBirthProfile,
  onSettingsChange,
  onSolarReturnYearChange,
  onTransitMomentChange,
  pdfDisabled = true,
  pdfErrorMessage = null,
  pdfLabel = "PDF",
  pdfTitle,
  pollErrorMessage = null,
  progressionTargetDate,
  relatedBirthProfileError = null,
  result,
  resultErrorMessage = null,
  savedCalculationErrorMessage = null,
  selectedClient,
  selectedPartnerClient = null,
  selectedPartnerRelatedProfile = null,
  settings,
  solarReturnYear,
  transitMoment
}: ChartEnginePageProps) {
  const copy = chartEngineCopyByLocale[locale];
  const readiness = getChartBirthDataReadiness(selectedClient?.birthData, locale);
  const partnerReadiness = getChartBirthDataReadiness(
    selectedPartnerRelatedProfile ?? selectedPartnerClient?.birthData,
    locale
  );
  const [localMode, setLocalMode] = useState<ChartEngineMode>(mode);
  const [localTransitMoment, setLocalTransitMoment] = useState<ChartTransitMomentInput>(
    transitMoment ?? { date: "", time: "" }
  );
  const [localProgressionTargetDate, setLocalProgressionTargetDate] = useState(
    progressionTargetDate ?? formatLocalCalendarDate(new Date())
  );
  const [localHoraryQuestion, setLocalHoraryQuestion] = useState<ChartHoraryQuestionInput>(
    horaryQuestion ?? getEmptyHoraryQuestion()
  );
  const [isBirthDataEditorOpen, setIsBirthDataEditorOpen] = useState(false);
  const [isBirthDataEditorDismissed, setIsBirthDataEditorDismissed] = useState(false);
  const [isHoraryContextEditorOpen, setIsHoraryContextEditorOpen] = useState(false);
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [isRelatedProfileEditorOpen, setIsRelatedProfileEditorOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const activeMode = onModeChange ? mode : localMode;
  const activeTransitMoment = transitMoment ?? localTransitMoment;
  const activeSolarReturnYear = solarReturnYear ?? new Date().getFullYear();
  const activeProgressionTargetDate = progressionTargetDate ?? localProgressionTargetDate;

  useEffect(() => {
    if (horaryQuestion) setLocalHoraryQuestion(horaryQuestion);
  }, [horaryQuestion]);
  useEffect(() => {
    setIsBirthDataEditorOpen(false);
    setIsBirthDataEditorDismissed(false);
    setIsRelatedProfileEditorOpen(false);
  }, [selectedClient?.value]);
  useEffect(() => setIsHoraryContextEditorOpen(false), [activeMode, calculationId]);

  const activeHoraryQuestion = localHoraryQuestion;
  const isHoraryMode = activeMode === "horary";
  const needsBirthData = activeMode !== "horary";
  const isPartnerMode = activeMode === "synastry" || activeMode === "composite";
  const expectedResultMethod = getChartResultMethodForMode(activeMode);
  const horaryReadiness = getChartHoraryQuestionReadiness(activeHoraryQuestion, locale);
  const isBirthDataBlocked = Boolean(needsBirthData && selectedClient && !readiness.ready);
  const hasSelectedPartner = Boolean(selectedPartnerClient || selectedPartnerRelatedProfile);
  const isPartnerBirthDataBlocked = Boolean(
    needsBirthData && isPartnerMode && hasSelectedPartner && !partnerReadiness.ready
  );
  const displayResult =
    isBirthDataBlocked || isPartnerBirthDataBlocked || result?.method !== expectedResultMethod
      ? null
      : result;
  const isCurrentResultCalculated = Boolean(
    displayResult && !isResultStale && jobState === "succeeded"
  );
  const presentationDisabled = !isCurrentResultCalculated;
  useEffect(() => {
    if (presentationDisabled) setIsPresentationOpen(false);
  }, [presentationDisabled]);
  const isHorarySetup = isHoraryMode && !displayResult;
  const shouldShowHoraryContextSummary = Boolean(isHoraryMode && displayResult);
  const horaryContextPlaceText =
    horaryPlaceText || getHoraryPlaceTextFallback(activeHoraryQuestion, selectedClient);
  const birthDataEditorAvailable = Boolean(needsBirthData && selectedClient && onSaveBirthData);
  const shouldShowBirthDataEditor = Boolean(
    birthDataEditorAvailable &&
    (isBirthDataEditorOpen || (!readiness.ready && !isBirthDataEditorDismissed))
  );
  const closeBirthDataEditor = () => {
    setIsBirthDataEditorOpen(false);
    setIsBirthDataEditorDismissed(true);
  };
  const viewState = getChartViewState({
    copy,
    displayResult,
    errorMessage,
    horaryReadiness,
    isBusy,
    isCurrentResultCalculated,
    isResultStale,
    jobState,
    mode: activeMode,
    partnerReadiness,
    readiness,
    selectedClient,
    selectedPartnerClient,
    selectedPartnerRelatedProfile
  });
  const selectMode = (nextMode: ChartEngineMode) => {
    if (onModeChange) onModeChange(nextMode);
    else setLocalMode(nextMode);
  };
  const momentControls = (
    <ChartMomentControls
      activeMode={activeMode}
      copy={copy}
      disabled={isBusy}
      horaryLayout={isHorarySetup ? "setup" : "toolbar"}
      horaryQuestion={activeHoraryQuestion}
      horaryPlaceErrorMessage={horaryPlaceErrorMessage}
      horaryPlaceText={horaryPlaceText}
      locale={locale}
      progressionTargetDate={activeProgressionTargetDate}
      solarReturnYear={activeSolarReturnYear}
      transitMoment={activeTransitMoment}
      onHoraryQuestionChange={(nextQuestion) => {
        setLocalHoraryQuestion(nextQuestion);
        onHoraryQuestionChange?.(nextQuestion);
      }}
      onClearHoraryPlace={onClearHoraryPlace}
      onProgressionTargetDateChange={(date) => {
        if (onProgressionTargetDateChange) onProgressionTargetDateChange(date);
        else setLocalProgressionTargetDate(date);
      }}
      onSolarReturnYearChange={onSolarReturnYearChange}
      onSearchBirthPlaces={onSearchBirthPlaces}
      onSelectHoraryPlace={onSelectHoraryPlace}
      onTransitMomentChange={(nextMoment) => {
        if (onTransitMomentChange) onTransitMomentChange(nextMoment);
        else setLocalTransitMoment(nextMoment);
      }}
    />
  );
  const actionBarProps = {
    birthDataEditorAvailable,
    calculateLabel: viewState.actionLabel,
    canCalculate: viewState.canCalculate,
    copy,
    isBirthDataEditorOpen: shouldShowBirthDataEditor,
    isCalculationLinked,
    isSettingsPanelOpen,
    linkDisabled,
    pdfDisabled,
    pdfErrorMessage,
    pdfLabel,
    pdfTitle: pdfTitle ?? copy.actionBar.defaultPdfUnavailable,
    onCalculate: () =>
      void runChartCalculationAction({
        activeMode,
        onCreateAstrocartographyJob,
        onCreateCompositeJob,
        onCreateHoraryJob,
        onCreateNatalJob,
        onCreateProgressionJob,
        onCreateSolarReturnJob,
        onCreateSynastryJob,
        onCreateTransitJob
      }),
    onLink,
    onPdf,
    onPresentation: () => setIsPresentationOpen(true),
    onToggleBirthDataEditor: () => {
      if (shouldShowBirthDataEditor) {
        closeBirthDataEditor();
        return;
      }
      setIsBirthDataEditorOpen(true);
      setIsBirthDataEditorDismissed(false);
    },
    onToggleSettings: () => setIsSettingsPanelOpen((open) => !open),
    presentationDisabled
  };
  const horarySetup = isHorarySetup ? (
    <ChartHorarySetup
      calculateAction={<ChartEngineActionBar {...actionBarProps} />}
      copy={copy}
      readinessMessage={copy.horary.calculateHint}
    >
      {momentControls}
    </ChartHorarySetup>
  ) : undefined;

  return (
    <main className={styles.page}>
      <ChartEngineHeader
        actionBar={
          isHorarySetup ? null : <ChartEngineActionBar {...actionBarProps} showCalculate />
        }
        activeMode={activeMode}
        copy={copy}
        isHorarySetup={isHorarySetup}
        isBusy={isBusy}
        momentControls={
          isHorarySetup || shouldShowHoraryContextSummary ? undefined : momentControls
        }
        selectedClient={selectedClient}
        selectedPartnerClient={selectedPartnerClient}
        selectedPartnerRelatedProfile={selectedPartnerRelatedProfile}
        onSelectClient={onSelectClient}
        onSelectMode={selectMode}
        onOpenRelatedProfileEditor={
          onCreateRelatedBirthProfile ? () => setIsRelatedProfileEditorOpen(true) : undefined
        }
        onSelectPartnerClient={onSelectPartnerClient}
        onSelectPartnerRelatedProfile={onSelectPartnerRelatedProfile}
      />
      <ChartEngineRecoveryNotices
        canRecoverCalculationIdentity={canRecoverCalculationIdentity}
        copy={copy}
        identityErrorMessage={identityErrorMessage}
        isBusy={isBusy}
        linkErrorMessage={linkErrorMessage}
        pollErrorMessage={pollErrorMessage}
        resultErrorMessage={resultErrorMessage}
        savedCalculationErrorMessage={savedCalculationErrorMessage}
        onRecoverCalculationIdentity={onRecoverCalculationIdentity}
        onRetryLink={onRetryLink}
        onRetryPoll={onRetryPoll}
        onRetryResult={onRetryResult}
        onRetrySavedCalculation={onRetrySavedCalculation}
      />
      {isRelatedProfileEditorOpen && selectedClient && onCreateRelatedBirthProfile ? (
        <ChartRelatedBirthProfileEditor
          copy={copy}
          disabled={isBusy}
          errorMessage={relatedBirthProfileError ?? null}
          isSaving={isCreatingRelatedBirthProfile}
          locale={locale}
          onCancel={() => setIsRelatedProfileEditorOpen(false)}
          onCreate={async (data) => {
            await onCreateRelatedBirthProfile(data);
            setIsRelatedProfileEditorOpen(false);
          }}
          onSearchBirthPlaces={onSearchBirthPlaces}
        />
      ) : null}
      <ChartEngineWorkspace
        activeMode={activeMode}
        birthDataError={birthDataError}
        calculationId={calculationId}
        canRequestAi={canRequestAi}
        copy={copy}
        displayResult={displayResult}
        errorMessage={errorMessage}
        interpretationMode={interpretationMode}
        isBusy={isBusy}
        isResultStale={isResultStale}
        isSavingBirthData={isSavingBirthData}
        isSettingsPanelOpen={isSettingsPanelOpen}
        jobState={jobState}
        horaryContextEditor={isHoraryContextEditorOpen ? momentControls : undefined}
        horaryPlaceText={horaryContextPlaceText}
        horaryQuestion={shouldShowHoraryContextSummary ? activeHoraryQuestion : undefined}
        horaryReadiness={horaryReadiness}
        horarySetup={horarySetup}
        isHoraryContextEditorOpen={isHoraryContextEditorOpen}
        locale={locale}
        onCloseBirthDataEditor={closeBirthDataEditor}
        partnerReadiness={partnerReadiness}
        readiness={readiness}
        selectedClient={selectedClient}
        selectedPartnerClient={selectedPartnerClient}
        selectedPartnerRelatedProfile={selectedPartnerRelatedProfile}
        settings={settings}
        shouldShowBirthDataEditor={shouldShowBirthDataEditor}
        onCloseSettings={() => setIsSettingsPanelOpen(false)}
        onToggleHoraryContextEditor={() => setIsHoraryContextEditorOpen((open) => !open)}
        onSaveBirthData={onSaveBirthData}
        onSearchBirthPlaces={onSearchBirthPlaces}
        onSettingsChange={onSettingsChange}
      />
      {isPresentationOpen && displayResult && selectedClient ? (
        <ChartEnginePresentation
          copy={copy}
          locale={locale}
          mode={activeMode}
          result={displayResult}
          selectedClient={selectedClient}
          selectedPartnerClient={selectedPartnerClient}
          onClose={() => setIsPresentationOpen(false)}
        />
      ) : null}
    </main>
  );
}

function ChartEngineRecoveryNotices({
  canRecoverCalculationIdentity,
  copy,
  identityErrorMessage,
  isBusy,
  linkErrorMessage,
  onRecoverCalculationIdentity,
  onRetryLink,
  onRetryPoll,
  onRetryResult,
  onRetrySavedCalculation,
  pollErrorMessage,
  resultErrorMessage,
  savedCalculationErrorMessage
}: {
  readonly canRecoverCalculationIdentity: boolean;
  readonly copy: ChartEngineCopy;
  readonly identityErrorMessage: string | null;
  readonly isBusy: boolean;
  readonly linkErrorMessage: string | null;
  readonly onRecoverCalculationIdentity?: () => void;
  readonly onRetryLink?: () => void | Promise<void>;
  readonly onRetryPoll?: () => void | Promise<void>;
  readonly onRetryResult?: () => void | Promise<void>;
  readonly onRetrySavedCalculation?: () => void | Promise<void>;
  readonly pollErrorMessage: string | null;
  readonly resultErrorMessage: string | null;
  readonly savedCalculationErrorMessage: string | null;
}) {
  const notices = [
    { id: "poll", message: pollErrorMessage, action: copy.recovery.retryPoll, retry: onRetryPoll },
    {
      id: "result",
      message: resultErrorMessage,
      action: copy.recovery.retryResult,
      retry: onRetryResult
    },
    {
      id: "saved",
      message: savedCalculationErrorMessage,
      action: copy.recovery.retrySaved,
      retry: onRetrySavedCalculation
    },
    { id: "link", message: linkErrorMessage, action: copy.recovery.retryLink, retry: onRetryLink },
    {
      id: "identity",
      message: identityErrorMessage,
      action: copy.recovery.recoverIdentity,
      retry: canRecoverCalculationIdentity ? onRecoverCalculationIdentity : undefined
    }
  ].filter((notice) => notice.message !== null);
  if (notices.length === 0) return null;
  return (
    <section className={styles.recoveryNotices} aria-label={copy.recovery.regionLabel}>
      {notices.map((notice) => (
        <div className={styles.recoveryNotice} key={notice.id} role="alert">
          <span>{notice.message}</span>
          {notice.retry ? (
            <button type="button" disabled={isBusy} onClick={() => void notice.retry?.()}>
              {notice.action}
            </button>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function getChartViewState({
  copy,
  displayResult,
  errorMessage,
  horaryReadiness,
  isBusy,
  isCurrentResultCalculated,
  isResultStale,
  jobState,
  mode,
  partnerReadiness,
  readiness,
  selectedClient,
  selectedPartnerClient,
  selectedPartnerRelatedProfile
}: {
  copy: ChartEngineCopy;
  displayResult: ChartResult | null;
  errorMessage: string | null;
  horaryReadiness: ChartBirthDataReadiness;
  isBusy: boolean;
  isCurrentResultCalculated: boolean;
  isResultStale: boolean;
  jobState: ChartEnginePageJobState;
  mode: ChartEngineMode;
  partnerReadiness: ChartBirthDataReadiness;
  readiness: ChartBirthDataReadiness;
  selectedClient: ClientSelectOption | null;
  selectedPartnerClient: ClientSelectOption | null;
  selectedPartnerRelatedProfile: ClientRelatedBirthProfileResponse | null;
}) {
  const modeCopy = copy.modes[mode];
  if (!selectedClient) return { actionLabel: copy.view.selectClientStatus, canCalculate: false };
  if (jobState === "calculating")
    return { actionLabel: copy.view.calculatingAction, canCalculate: false };
  if (jobState === "failed")
    return {
      actionLabel: copy.view.retryCalculation,
      canCalculate: (mode === "horary" ? horaryReadiness.ready : readiness.ready) && !isBusy,
      errorMessage
    };
  if (mode === "horary") {
    if (displayResult && isResultStale)
      return { actionLabel: modeCopy.staleAction, canCalculate: horaryReadiness.ready && !isBusy };
    if (isCurrentResultCalculated)
      return { actionLabel: copy.view.currentAction, canCalculate: false };
    if (!horaryReadiness.ready)
      return { actionLabel: copy.view.fillHoraryAction, canCalculate: false };
    return { actionLabel: modeCopy.calculateAction, canCalculate: !isBusy };
  }
  if (!readiness.ready) {
    if (readiness.missing.includes(copy.missing.birthDate))
      return { actionLabel: copy.view.addDateAction, canCalculate: false };
    if (readiness.missing.includes(copy.missing.birthTime))
      return { actionLabel: copy.view.addTimeAction, canCalculate: false };
    return { actionLabel: copy.view.fillDataAction, canCalculate: false };
  }
  if (mode === "synastry" || mode === "composite") {
    if (!selectedPartnerClient && !selectedPartnerRelatedProfile)
      return { actionLabel: copy.view.choosePartnerStatus, canCalculate: false };
    if (selectedPartnerClient?.value === selectedClient.value)
      return { actionLabel: copy.view.chooseOtherAction, canCalculate: false };
    if (!partnerReadiness.ready)
      return { actionLabel: copy.view.fillPartnerAction, canCalculate: false };
  }
  if (displayResult && isResultStale)
    return { actionLabel: modeCopy.staleAction, canCalculate: !isBusy };
  if (isCurrentResultCalculated)
    return { actionLabel: copy.view.currentAction, canCalculate: false };
  if (selectedClient.birthData?.birthTimePrecision === "approximate")
    return { actionLabel: copy.view.approximateAction, canCalculate: !isBusy };
  return { actionLabel: modeCopy.calculateAction, canCalculate: !isBusy };
}

function runChartCalculationAction({
  activeMode,
  onCreateAstrocartographyJob,
  onCreateCompositeJob,
  onCreateHoraryJob,
  onCreateNatalJob,
  onCreateProgressionJob,
  onCreateSolarReturnJob,
  onCreateSynastryJob,
  onCreateTransitJob
}: {
  activeMode: ChartEngineMode;
  onCreateAstrocartographyJob?: () => void | Promise<void>;
  onCreateCompositeJob?: () => void | Promise<void>;
  onCreateHoraryJob?: () => void | Promise<void>;
  onCreateNatalJob: () => void | Promise<void>;
  onCreateProgressionJob?: () => void | Promise<void>;
  onCreateSolarReturnJob?: () => void | Promise<void>;
  onCreateSynastryJob?: () => void | Promise<void>;
  onCreateTransitJob?: () => void | Promise<void>;
}) {
  if (activeMode === "transit") return onCreateTransitJob?.();
  if (activeMode === "progression") return onCreateProgressionJob?.();
  if (activeMode === "synastry") return onCreateSynastryJob?.();
  if (activeMode === "composite") return onCreateCompositeJob?.();
  if (activeMode === "solar_return") return onCreateSolarReturnJob?.();
  if (activeMode === "horary") return onCreateHoraryJob?.();
  if (activeMode === "astrocartography") return onCreateAstrocartographyJob?.();
  return onCreateNatalJob();
}

function getEmptyHoraryQuestion(): ChartHoraryQuestionInput {
  return {
    question: "",
    category: "other",
    date: "",
    time: "",
    timezone: "",
    latitude: "",
    longitude: ""
  };
}

function getHoraryPlaceTextFallback(
  question: ChartHoraryQuestionInput,
  selectedClient: ClientSelectOption | null
): string {
  const birthData = selectedClient?.birthData;
  if (!birthData?.birthPlaceText) return "";
  if (birthData.birthLatitude === null || birthData.birthLongitude === null) return "";
  const latitude =
    typeof question.latitude === "number" ? question.latitude : Number(question.latitude);
  const longitude =
    typeof question.longitude === "number" ? question.longitude : Number(question.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  const sameLatitude = Math.abs(latitude - birthData.birthLatitude) < 0.0001;
  const sameLongitude = Math.abs(longitude - birthData.birthLongitude) < 0.0001;
  return sameLatitude && sameLongitude ? birthData.birthPlaceText : "";
}

function formatLocalCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
