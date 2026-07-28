import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement
} from "react";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Card } from "@elevenhouse/design-system/components/Card";
import "@elevenhouse/design-system/components/Card.css";
import { Chip } from "@elevenhouse/design-system/components/Chip";
import "@elevenhouse/design-system/components/Chip.css";
import { Check } from "@elevenhouse/design-system/icons/Check";
import { LayoutGrid } from "@elevenhouse/design-system/icons/LayoutGrid";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { Refresh } from "@elevenhouse/design-system/icons/Refresh";
import { Settings } from "@elevenhouse/design-system/icons/Settings";
import { Wallet } from "@elevenhouse/design-system/icons/Wallet";
import type { FinancePolicyResponse, RiskTier } from "@elevenhouse/contracts/finance-policies";
import type { Money } from "@elevenhouse/contracts/money";
import type {
  AdminPaymentReversalCase,
  AdminPaymentReversalCaseReviewResolution,
  AdminPaymentReversalQueueResponse
} from "@elevenhouse/contracts/payments";
import type {
  AdminPayoutRequestResponse,
  AdminPayoutQueueResponse,
  AdminPayoutQueueStatusFilter,
  PayoutRequestResponse
} from "@elevenhouse/contracts/payouts";
import type {
  AdminReconciliationException,
  AdminReconciliationExceptionEvidenceFilter,
  AdminReconciliationExceptionQueueResponse,
  ReconciliationExceptionResolution
} from "@elevenhouse/contracts/reconciliation";
import {
  AdminFinancePoliciesApiError,
  type AdminFinancePoliciesApi
} from "../api/adminFinancePoliciesApi";
import { createAdminFinancePoliciesApi } from "../api/adminFinancePoliciesApi";
import {
  createInitialRiskProfileForm,
  financePolicyRiskTierOptions,
  formatBasisPoints,
  holdLabel,
  policyFormToRequest,
  policyToForm,
  riskProfileFormToRequest,
  type AstrologerRiskProfileFormState,
  type FinancePolicyFormState
} from "../model/financePolicyFormModel";
import "./FinancePoliciesPage.css";

export type FinancePoliciesPageProps = {
  readonly api?: AdminFinancePoliciesApi;
};

type AdminFinanceTab = "overview" | "payouts" | "disputes" | "reconciliation" | "policies" | "risk";

const payoutFilterOptions: readonly {
  readonly value: AdminPayoutQueueStatusFilter;
  readonly label: string;
}[] = [
  { value: "open", label: "Открытые" },
  { value: "ready", label: "К выплате" },
  { value: "processing", label: "В обработке" },
  { value: "failed", label: "Ошибки" },
  { value: "terminal", label: "Закрытые" }
];

const reconciliationEvidenceFilterOptions: readonly {
  readonly value: AdminReconciliationExceptionEvidenceFilter;
  readonly label: string;
}[] = [
  { value: "all", label: "Все" },
  { value: "payment", label: "Payment" },
  { value: "settlement", label: "Settlement" },
  { value: "payout", label: "Payout" },
  { value: "provider_event", label: "Event" }
];

const reversalResolutionOptions: readonly {
  readonly value: AdminPaymentReversalCaseReviewResolution;
  readonly label: string;
}[] = [
  { value: "ledger_verified", label: "Ledger verified" },
  { value: "provider_follow_up_required", label: "Provider follow-up" },
  { value: "evidence_sent", label: "Evidence sent" }
];

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly policies: readonly FinancePolicyResponse[];
      readonly payoutQueue: AdminPayoutQueueResponse;
      readonly reversalQueue: AdminPaymentReversalQueueResponse;
      readonly reconciliationQueue: AdminReconciliationExceptionQueueResponse;
    };

type PayoutActionForm = {
  readonly payoutRequestId: string;
  readonly externalReference: string;
  readonly transferredAt: string;
  readonly adminNote: string;
  readonly failureReason: string;
};

type ReconciliationActionForm = {
  readonly reconciliationRecordId: string;
  readonly resolution: ReconciliationExceptionResolution;
  readonly adminNote: string;
};

type ReversalActionForm = {
  readonly reversalCaseId: string;
  readonly resolution: AdminPaymentReversalCaseReviewResolution;
  readonly adminNote: string;
};

type AdminFinanceErrorContext =
  | "load"
  | "policy"
  | "risk"
  | "payout_paid"
  | "payout_rejected"
  | "reversal_review"
  | "reconciliation_resolution";

const emptyPayoutQueue: AdminPayoutQueueResponse = {
  summary: {
    requestedCount: 0,
    underReviewCount: 0,
    processingCount: 0,
    chargebackBlockedCount: 0,
    readyToPayAmount: { amountMinor: 0, currency: "RUB" },
    processingAmount: { amountMinor: 0, currency: "RUB" },
    chargebackBlockedAmount: { amountMinor: 0, currency: "RUB" }
  },
  requests: []
};

const emptyReversalQueue: AdminPaymentReversalQueueResponse = {
  summary: {
    refundCount: 0,
    chargebackCount: 0,
    criticalCount: 0,
    totalAmount: { amountMinor: 0, currency: "RUB" },
    negativeBalanceAmount: { amountMinor: 0, currency: "RUB" }
  },
  cases: []
};

const emptyReconciliationQueue: AdminReconciliationExceptionQueueResponse = {
  summary: {
    openCount: 0,
    oldestOpenAt: null
  },
  exceptions: []
};

const emptyPolicies: readonly FinancePolicyResponse[] = [];

export function FinancePoliciesPage({ api: providedApi }: FinancePoliciesPageProps) {
  const defaultApi = useMemo(() => createAdminFinancePoliciesApi(), []);
  const api = providedApi ?? defaultApi;
  const [tab, setTab] = useState<AdminFinanceTab>("overview");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [selectedRiskTier, setSelectedRiskTier] = useState<RiskTier>("standard");
  const [policyForm, setPolicyForm] = useState<FinancePolicyFormState>(() => policyToForm(null));
  const [riskForm, setRiskForm] = useState<AstrologerRiskProfileFormState>(() =>
    createInitialRiskProfileForm()
  );
  const [payoutAction, setPayoutAction] = useState<PayoutActionForm>(() => emptyPayoutAction());
  const [payoutStatusFilter, setPayoutStatusFilter] =
    useState<AdminPayoutQueueStatusFilter>("open");
  const [reconciliationAction, setReconciliationAction] = useState<ReconciliationActionForm>(() =>
    emptyReconciliationAction()
  );
  const [reversalAction, setReversalAction] = useState<ReversalActionForm>(() =>
    emptyReversalAction()
  );
  const [reconciliationEvidenceFilter, setReconciliationEvidenceFilter] =
    useState<AdminReconciliationExceptionEvidenceFilter>("all");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingRisk, setSavingRisk] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const [savingReversal, setSavingReversal] = useState(false);
  const [savingReconciliation, setSavingReconciliation] = useState(false);
  const selectedRiskTierRef = useRef<RiskTier>(selectedRiskTier);
  const payoutActionRef = useRef<PayoutActionForm>(payoutAction);
  const reversalActionRef = useRef<ReversalActionForm>(reversalAction);
  const reconciliationActionRef = useRef<ReconciliationActionForm>(reconciliationAction);
  const payoutStatusFilterRef = useRef<AdminPayoutQueueStatusFilter>(payoutStatusFilter);
  const reconciliationEvidenceFilterRef = useRef<AdminReconciliationExceptionEvidenceFilter>(
    reconciliationEvidenceFilter
  );

  const policies = loadState.status === "ready" ? loadState.policies : emptyPolicies;
  const payoutQueue = loadState.status === "ready" ? loadState.payoutQueue : emptyPayoutQueue;
  const reversalQueue = loadState.status === "ready" ? loadState.reversalQueue : emptyReversalQueue;
  const reconciliationQueue =
    loadState.status === "ready" ? loadState.reconciliationQueue : emptyReconciliationQueue;
  const selectedPolicy = useMemo(
    () => policies.find((policy) => policy.riskTier === selectedRiskTier) ?? null,
    [policies, selectedRiskTier]
  );
  const selectedPayout = useMemo(
    () =>
      payoutQueue.requests.find((request) => request.id === payoutAction.payoutRequestId) ??
      payoutQueue.requests[0] ??
      null,
    [payoutAction.payoutRequestId, payoutQueue.requests]
  );
  const selectedReconciliationException = useMemo(
    () =>
      reconciliationQueue.exceptions.find(
        (exception) => exception.id === reconciliationAction.reconciliationRecordId
      ) ??
      reconciliationQueue.exceptions[0] ??
      null,
    [reconciliationAction.reconciliationRecordId, reconciliationQueue.exceptions]
  );
  const selectedReversalCase = useMemo(
    () =>
      reversalQueue.cases.find(
        (paymentReversalCase) => paymentReversalCase.id === reversalAction.reversalCaseId
      ) ??
      reversalQueue.cases[0] ??
      null,
    [reversalAction.reversalCaseId, reversalQueue.cases]
  );

  const refreshFinance = useCallback(
    async (
      filters: {
        readonly payoutStatus?: AdminPayoutQueueStatusFilter;
        readonly reconciliationEvidence?: AdminReconciliationExceptionEvidenceFilter;
      } = {}
    ) => {
      setLoadState({ status: "loading" });
      setSubmitError(null);
      try {
        const nextPayoutStatus = filters.payoutStatus ?? payoutStatusFilterRef.current;
        const nextReconciliationEvidence =
          filters.reconciliationEvidence ?? reconciliationEvidenceFilterRef.current;
        const [policyResponse, payoutResponse, reversalResponse, reconciliationResponse] =
          await Promise.all([
            api.listPolicies(),
            api.listPayoutRequests({ status: nextPayoutStatus }),
            api.listPaymentReversalCases(),
            api.listReconciliationExceptions({ evidence: nextReconciliationEvidence })
          ]);
        setLoadState({
          status: "ready",
          policies: policyResponse.policies,
          payoutQueue: payoutResponse,
          reversalQueue: reversalResponse,
          reconciliationQueue: reconciliationResponse
        });
        const previousSelectedRiskTier = selectedRiskTierRef.current;
        const nextSelected = policyResponse.policies.find(
          (policy) => policy.riskTier === previousSelectedRiskTier
        )
          ? previousSelectedRiskTier
          : (policyResponse.policies[0]?.riskTier ?? "standard");
        selectedRiskTierRef.current = nextSelected;
        setSelectedRiskTier(nextSelected);
        setPolicyForm(
          policyToForm(
            policyResponse.policies.find((policy) => policy.riskTier === nextSelected) ?? null
          )
        );
        if (
          !payoutResponse.requests.some(
            (request) => request.id === payoutActionRef.current.payoutRequestId
          )
        ) {
          setPayoutAction((previous) => {
            const next = {
              ...previous,
              payoutRequestId: payoutResponse.requests[0]?.id ?? ""
            };
            payoutActionRef.current = next;
            return next;
          });
        }
        if (
          !reconciliationResponse.exceptions.some(
            (exception) => exception.id === reconciliationActionRef.current.reconciliationRecordId
          )
        ) {
          setReconciliationAction((previous) => {
            const next = {
              ...previous,
              reconciliationRecordId: reconciliationResponse.exceptions[0]?.id ?? ""
            };
            reconciliationActionRef.current = next;
            return next;
          });
        }
        if (
          !reversalResponse.cases.some(
            (paymentReversalCase) =>
              paymentReversalCase.id === reversalActionRef.current.reversalCaseId
          )
        ) {
          setReversalAction((previous) => {
            const next = {
              ...previous,
              reversalCaseId: reversalResponse.cases[0]?.id ?? ""
            };
            reversalActionRef.current = next;
            return next;
          });
        }
      } catch (error) {
        setLoadState({ status: "error", message: errorMessage(error, "load") });
      }
    },
    [api]
  );

  useEffect(() => {
    void refreshFinance();
  }, [refreshFinance]);

  useEffect(() => {
    selectedRiskTierRef.current = selectedRiskTier;
  }, [selectedRiskTier]);

  useEffect(() => {
    payoutActionRef.current = payoutAction;
  }, [payoutAction]);

  useEffect(() => {
    reversalActionRef.current = reversalAction;
  }, [reversalAction]);

  useEffect(() => {
    reconciliationActionRef.current = reconciliationAction;
  }, [reconciliationAction]);

  useEffect(() => {
    payoutStatusFilterRef.current = payoutStatusFilter;
  }, [payoutStatusFilter]);

  useEffect(() => {
    reconciliationEvidenceFilterRef.current = reconciliationEvidenceFilter;
  }, [reconciliationEvidenceFilter]);

  function selectRiskTier(riskTier: RiskTier) {
    selectedRiskTierRef.current = riskTier;
    setSelectedRiskTier(riskTier);
    setPolicyForm(policyToForm(policies.find((policy) => policy.riskTier === riskTier) ?? null));
    setStatusMessage(null);
    setSubmitError(null);
  }

  function selectPayoutStatusFilter(filter: AdminPayoutQueueStatusFilter) {
    payoutStatusFilterRef.current = filter;
    setPayoutStatusFilter(filter);
    void refreshFinance({ payoutStatus: filter });
  }

  function selectReconciliationEvidenceFilter(filter: AdminReconciliationExceptionEvidenceFilter) {
    reconciliationEvidenceFilterRef.current = filter;
    setReconciliationEvidenceFilter(filter);
    void refreshFinance({ reconciliationEvidence: filter });
  }

  async function handleEnsureDefault() {
    setSavingPolicy(true);
    setSubmitError(null);
    try {
      const policy = await api.ensureDefaultPolicy();
      setLoadState((previous) => mergePolicy(previous, policy));
      selectedRiskTierRef.current = policy.riskTier;
      setSelectedRiskTier(policy.riskTier);
      setPolicyForm(policyToForm(policy));
      setStatusMessage("Стандартная политика 48 часов подтверждена и записана в аудит.");
    } catch (error) {
      setSubmitError(errorMessage(error, "policy"));
    } finally {
      setSavingPolicy(false);
    }
  }

  async function handlePolicySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPolicy(true);
    setSubmitError(null);
    try {
      const policy = await api.updateDefaultPolicy(policyFormToRequest(policyForm));
      setLoadState((previous) => mergePolicy(previous, policy));
      selectedRiskTierRef.current = policy.riskTier;
      setSelectedRiskTier(policy.riskTier);
      setPolicyForm(policyToForm(policy));
      setStatusMessage("Политика риска сохранена. Новые заказы получат новый snapshot.");
    } catch (error) {
      setSubmitError(errorMessage(error, "policy"));
    } finally {
      setSavingPolicy(false);
    }
  }

  async function handleRiskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!riskForm.astrologerUserId.trim()) {
      setSubmitError("Укажите UUID астролога для ручного риска.");
      return;
    }
    setSavingRisk(true);
    setSubmitError(null);
    try {
      await api.updateAstrologerRiskProfile(
        riskForm.astrologerUserId.trim(),
        riskProfileFormToRequest(riskForm)
      );
      setStatusMessage("Ручной риск астролога сохранен с причиной и audit evidence.");
      setRiskForm(createInitialRiskProfileForm());
    } catch (error) {
      setSubmitError(errorMessage(error, "risk"));
    } finally {
      setSavingRisk(false);
    }
  }

  async function handlePayoutPaid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPayout) return;
    if (isPayoutActionBlocked(selectedPayout)) return;
    setSavingPayout(true);
    setSubmitError(null);
    try {
      await api.updatePayoutRequestStatus(selectedPayout.id, {
        status: "paid",
        externalReference: payoutAction.externalReference.trim(),
        transferredAt: payoutAction.transferredAt,
        adminNote: payoutAction.adminNote.trim() || null
      });
      setStatusMessage("Выплата отмечена оплаченной. Ledger списал payout pending.");
      const nextPayoutAction = emptyPayoutAction();
      payoutActionRef.current = nextPayoutAction;
      setPayoutAction(nextPayoutAction);
      await refreshFinance();
    } catch (error) {
      setSubmitError(errorMessage(error, "payout_paid"));
    } finally {
      setSavingPayout(false);
    }
  }

  async function handlePayoutRejected() {
    if (!selectedPayout) return;
    if (isPayoutActionBlocked(selectedPayout)) return;
    setSavingPayout(true);
    setSubmitError(null);
    try {
      await api.updatePayoutRequestStatus(selectedPayout.id, {
        status: "rejected",
        failureReason: payoutAction.failureReason.trim() || "Manual payout rejected by admin",
        adminNote: payoutAction.adminNote.trim() || null
      });
      setStatusMessage("Заявка отклонена. Ledger вернул сумму в доступный баланс.");
      const nextPayoutAction = emptyPayoutAction();
      payoutActionRef.current = nextPayoutAction;
      setPayoutAction(nextPayoutAction);
      await refreshFinance();
    } catch (error) {
      setSubmitError(errorMessage(error, "payout_rejected"));
    } finally {
      setSavingPayout(false);
    }
  }

  async function handleReconciliationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedReconciliationException) return;
    if (!reconciliationAction.adminNote.trim()) {
      setSubmitError("Добавьте admin note: почему exception можно закрыть или игнорировать.");
      return;
    }
    setSavingReconciliation(true);
    setSubmitError(null);
    try {
      await api.resolveReconciliationException(selectedReconciliationException.id, {
        resolution: reconciliationAction.resolution,
        adminNote: reconciliationAction.adminNote.trim()
      });
      setStatusMessage(
        reconciliationAction.resolution === "resolved"
          ? "Exception закрыт как resolved. Холды смогут релизиться после matched evidence."
          : "Exception помечен как waived с audit evidence."
      );
      const nextReconciliationAction = emptyReconciliationAction();
      reconciliationActionRef.current = nextReconciliationAction;
      setReconciliationAction(nextReconciliationAction);
      await refreshFinance();
    } catch (error) {
      setSubmitError(errorMessage(error, "reconciliation_resolution"));
    } finally {
      setSavingReconciliation(false);
    }
  }

  async function handleReversalReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedReversalCase) return;
    if (!reversalAction.adminNote.trim()) {
      setSubmitError("Добавьте комментарий оператора по refund/chargeback review.");
      return;
    }
    setSavingReversal(true);
    setSubmitError(null);
    try {
      await api.reviewPaymentReversalCase(selectedReversalCase.id, {
        resolution: reversalAction.resolution,
        adminNote: reversalAction.adminNote.trim()
      });
      setStatusMessage("Refund/chargeback review сохранен с audit evidence.");
      const nextReversalAction = emptyReversalAction();
      reversalActionRef.current = nextReversalAction;
      setReversalAction(nextReversalAction);
      await refreshFinance();
    } catch (error) {
      setSubmitError(errorMessage(error, "reversal_review"));
    } finally {
      setSavingReversal(false);
    }
  }

  return (
    <div className="adminFinanceShell">
      <aside className="adminFinanceRail" aria-label="Admin sections">
        <div className="adminFinanceBrand">
          <span className="adminFinanceBrandIcon">
            <Wallet />
          </span>
          <span>Админка</span>
        </div>
        <nav className="adminFinanceNav" aria-label="Finance admin navigation">
          <NavItem
            tab="overview"
            activeTab={tab}
            label="Обзор"
            badge={attentionCount(payoutQueue, reversalQueue, reconciliationQueue)}
            onClick={setTab}
            icon={<LayoutGrid />}
          />
          <NavItem
            tab="payouts"
            activeTab={tab}
            label="Выплаты"
            badge={payoutQueue.requests.length}
            onClick={setTab}
            icon={<Wallet />}
          />
          <NavItem
            tab="disputes"
            activeTab={tab}
            label="Споры"
            badge={reversalQueue.summary.criticalCount || reversalQueue.cases.length}
            onClick={setTab}
            icon={<Icon iconName="lightning" />}
          />
          <NavItem
            tab="reconciliation"
            activeTab={tab}
            label="Сверка"
            badge={reconciliationQueue.summary.openCount}
            onClick={setTab}
            icon={<Icon iconName="flow" />}
          />
          <NavItem
            tab="policies"
            activeTab={tab}
            label="Политики"
            onClick={setTab}
            icon={<Settings />}
          />
          <NavItem
            tab="risk"
            activeTab={tab}
            label="Риск"
            onClick={setTab}
            icon={<Icon iconName="users" />}
          />
        </nav>
        <div className="adminFinanceRailFooter">
          <span>Роль</span>
          <div>
            <button type="button" className="adminFinanceRoleButton adminFinanceRoleButtonActive">
              Админ
            </button>
            <button type="button" className="adminFinanceRoleButton" disabled>
              Модератор
            </button>
          </div>
        </div>
      </aside>

      <main className="adminFinanceMain">
        <header className="adminFinanceHeader">
          <div>
            <p className="adminFinanceKicker">Finance controls</p>
            <h1>{titleForTab(tab)}</h1>
          </div>
          <div className="adminFinanceHeaderMeta">
            <span>Все действия журналируются · audit trail</span>
            <Button
              title="Обновить"
              variant="default"
              size="medium"
              startIcon={<Refresh />}
              onClick={() => void refreshFinance()}
            />
          </div>
        </header>

        <section className="adminFinanceStatusGrid" aria-label="Finance summary">
          <StatusCard label="Default hold" value="48 ч" note="baseline, configurable" />
          <StatusCard
            label="Заявки выплат"
            value={String(payoutQueue.requests.length)}
            note="ручная обработка"
          />
          <StatusCard
            label="Споры"
            value={String(reversalQueue.cases.length)}
            note={`${reversalQueue.summary.criticalCount} critical`}
          />
          <StatusCard
            label="К выплате"
            value={formatMoney(payoutQueue.summary.readyToPayAmount)}
            note="reserved in ledger"
          />
          <StatusCard
            label="Chargeback hold"
            value={String(payoutQueue.summary.chargebackBlockedCount)}
            note={formatMoney(payoutQueue.summary.chargebackBlockedAmount)}
          />
          <StatusCard
            label="Shortfall"
            value={formatMoney(reversalQueue.summary.negativeBalanceAmount)}
            note="negative balance"
          />
          <StatusCard
            label="Сверка"
            value={String(reconciliationQueue.summary.openCount)}
            note={
              reconciliationQueue.summary.oldestOpenAt
                ? `oldest ${formatDate(reconciliationQueue.summary.oldestOpenAt)}`
                : "no exceptions"
            }
          />
        </section>

        {loadState.status === "loading" ? (
          <Card className="adminFinancePanel adminFinanceContentPanel" padding="medium">
            <p className="adminFinanceMuted">Загружаю финансы из admin-api...</p>
          </Card>
        ) : null}

        {loadState.status === "error" ? (
          <Card className="adminFinancePanel adminFinanceContentPanel" padding="medium">
            <p className="adminFinanceErrorInline" role="alert">
              {loadState.message}
            </p>
            <Button
              title="Повторить"
              variant="default"
              size="medium"
              startIcon={<Refresh />}
              onClick={() => void refreshFinance()}
            />
          </Card>
        ) : null}

        {loadState.status === "ready" ? (
          <>
            {tab === "overview" ? (
              <OverviewPanel
                policies={policies}
                payoutQueue={payoutQueue}
                reversalQueue={reversalQueue}
                reconciliationQueue={reconciliationQueue}
                onGo={setTab}
              />
            ) : null}
            {tab === "payouts" ? (
              <PayoutsPanel
                payoutQueue={payoutQueue}
                payoutStatusFilter={payoutStatusFilter}
                selectedPayout={selectedPayout}
                action={payoutAction}
                saving={savingPayout}
                onFilterChange={selectPayoutStatusFilter}
                onSelect={(request) =>
                  setPayoutAction((previous) => ({
                    ...previous,
                    payoutRequestId: request.id,
                    transferredAt: previous.transferredAt || new Date().toISOString()
                  }))
                }
                onChange={setPayoutAction}
                onPaid={handlePayoutPaid}
                onReject={() => void handlePayoutRejected()}
              />
            ) : null}
            {tab === "disputes" ? (
              <DisputesPanel
                reversalQueue={reversalQueue}
                selectedCase={selectedReversalCase}
                action={reversalAction}
                saving={savingReversal}
                onSelect={(paymentReversalCase) =>
                  setReversalAction((previous) => ({
                    ...previous,
                    reversalCaseId: paymentReversalCase.id
                  }))
                }
                onChange={setReversalAction}
                onSubmit={handleReversalReviewSubmit}
              />
            ) : null}
            {tab === "reconciliation" ? (
              <ReconciliationPanel
                reconciliationQueue={reconciliationQueue}
                evidenceFilter={reconciliationEvidenceFilter}
                selectedException={selectedReconciliationException}
                action={reconciliationAction}
                saving={savingReconciliation}
                onEvidenceFilterChange={selectReconciliationEvidenceFilter}
                onSelect={(exception) =>
                  setReconciliationAction((previous) => ({
                    ...previous,
                    reconciliationRecordId: exception.id
                  }))
                }
                onChange={setReconciliationAction}
                onSubmit={handleReconciliationSubmit}
              />
            ) : null}
            {tab === "policies" ? (
              <PoliciesPanel
                policies={policies}
                selectedRiskTier={selectedRiskTier}
                selectedPolicy={selectedPolicy}
                policyForm={policyForm}
                savingPolicy={savingPolicy}
                onSelectRiskTier={selectRiskTier}
                onEnsureDefault={() => void handleEnsureDefault()}
                onPolicyFormChange={setPolicyForm}
                onSubmit={handlePolicySubmit}
              />
            ) : null}
            {tab === "risk" ? (
              <RiskPanel
                riskForm={riskForm}
                savingRisk={savingRisk}
                onRiskFormChange={setRiskForm}
                onSubmit={handleRiskSubmit}
              />
            ) : null}
          </>
        ) : null}

        {statusMessage ? (
          <p className="adminFinanceNotice" role="status" aria-live="polite">
            {statusMessage}
          </p>
        ) : null}
        {submitError ? (
          <div className="adminFinanceError adminFinanceFeedback" role="alert">
            <p>{submitError}</p>
            <Button
              title="Обновить очередь"
              variant="default"
              size="small"
              startIcon={<Refresh />}
              onClick={() => void refreshFinance()}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}

function OverviewPanel(props: {
  readonly policies: readonly FinancePolicyResponse[];
  readonly payoutQueue: AdminPayoutQueueResponse;
  readonly reversalQueue: AdminPaymentReversalQueueResponse;
  readonly reconciliationQueue: AdminReconciliationExceptionQueueResponse;
  readonly onGo: (tab: AdminFinanceTab) => void;
}) {
  const policy =
    props.policies.find((item) => item.riskTier === "standard") ?? props.policies[0] ?? null;
  return (
    <div className="adminFinanceOverviewGrid">
      <Card className="adminFinancePanel adminFinanceActivityPanel" padding="medium">
        <div className="adminFinancePanelTitleRow">
          <h2>Активность финансов</h2>
          <span className="adminFinanceLiveDot">в реальном времени</span>
        </div>
        <ActivityRow
          tone="positive"
          title="Заявки на вывод"
          text={`${props.payoutQueue.requests.length} в очереди · ${formatMoney(props.payoutQueue.summary.readyToPayAmount)} к выплате`}
          time="сейчас"
        />
        <ActivityRow
          tone="warning"
          title="Споры и chargeback"
          text={`${props.reversalQueue.cases.length} cases · ${formatMoney(props.reversalQueue.summary.negativeBalanceAmount)} shortfall`}
          time="webhooks"
        />
        <ActivityRow
          tone={props.reconciliationQueue.summary.openCount > 0 ? "warning" : "positive"}
          title="Сверка provider"
          text={`${props.reconciliationQueue.summary.openCount} exceptions · settlement clearance gate`}
          time="reports"
        />
        <ActivityRow
          tone="warning"
          title="Ручная обработка"
          text={`${props.payoutQueue.summary.processingCount} ожидают банковского подтверждения`}
          time="сейчас"
        />
        <ActivityRow
          tone="neutral"
          title="Политика удержания"
          text={
            policy
              ? `${policy.riskTier} · ${holdLabel(policy.holdDurationHours)} · ${formatBasisPoints(policy.platformFeeBps)} fee`
              : "Политика не настроена"
          }
          time="policy"
        />
      </Card>

      <div className="adminFinanceSideStack">
        <Card className="adminFinancePanel" padding="medium">
          <h2>Требует внимания</h2>
          <AttentionButton
            label="Очередь выплат"
            value={String(props.payoutQueue.requests.length)}
            onClick={() => props.onGo("payouts")}
          />
          <AttentionButton
            label="Споры и возвраты"
            value={String(props.reversalQueue.cases.length)}
            onClick={() => props.onGo("disputes")}
          />
          <AttentionButton
            label="Сверка provider"
            value={String(props.reconciliationQueue.summary.openCount)}
            onClick={() => props.onGo("reconciliation")}
          />
          <AttentionButton
            label="Политики холда"
            value={policy ? holdLabel(policy.holdDurationHours) : "нет"}
            onClick={() => props.onGo("policies")}
          />
          <AttentionButton label="Ручной риск" value="admin" onClick={() => props.onGo("risk")} />
        </Card>
        <Card className="adminFinancePanel" padding="medium">
          <h2>Контур выплат</h2>
          <div className="adminFinanceFacts">
            <Fact label="Provider" value="Arc Pay pay-in" />
            <Fact label="Balance" value="ElevenHouse ledger" />
            <Fact label="Payouts" value="manual bank transfer" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function PayoutsPanel(props: {
  readonly payoutQueue: AdminPayoutQueueResponse;
  readonly payoutStatusFilter: AdminPayoutQueueStatusFilter;
  readonly selectedPayout: AdminPayoutRequestResponse | null;
  readonly action: PayoutActionForm;
  readonly saving: boolean;
  readonly onFilterChange: (filter: AdminPayoutQueueStatusFilter) => void;
  readonly onSelect: (request: AdminPayoutRequestResponse) => void;
  readonly onChange: (next: PayoutActionForm) => void;
  readonly onPaid: (event: FormEvent<HTMLFormElement>) => void;
  readonly onReject: () => void;
}) {
  const payoutActionDisabled =
    props.saving || !props.selectedPayout || isPayoutActionBlocked(props.selectedPayout);
  return (
    <div className="adminFinancePayoutGrid">
      <Card className="adminFinancePanel adminFinancePayoutListPanel" padding="medium">
        <div className="adminFinancePanelTitleRow">
          <div>
            <p className="adminFinanceKicker">Payout queue</p>
            <h2>Заявки на вывод</h2>
          </div>
          <Chip label={`${props.payoutQueue.requests.length} open`} active type="button" />
        </div>
        <SegmentFilter
          label="Фильтр заявок"
          options={payoutFilterOptions}
          value={props.payoutStatusFilter}
          onChange={props.onFilterChange}
        />
        <div
          className="adminFinanceTable adminFinancePayoutTable"
          role="table"
          aria-label="Payout requests"
        >
          <div className="adminFinanceTableRow adminFinanceTableHead" role="row">
            <span>Астролог</span>
            <span>Статус</span>
            <span>Сумма</span>
            <span>Метод</span>
            <span>Risk</span>
          </div>
          {props.payoutQueue.requests.length === 0 ? (
            <div className="adminFinanceEmpty">Нет заявок на вывод</div>
          ) : null}
          {props.payoutQueue.requests.map((request) => (
            <button
              key={request.id}
              type="button"
              className={
                props.selectedPayout?.id === request.id
                  ? "adminFinanceTableRow adminFinanceTableButton adminFinanceTableButtonActive"
                  : "adminFinanceTableRow adminFinanceTableButton"
              }
              onClick={() => props.onSelect(request)}
            >
              <span className="adminFinanceUserCell">
                <span className="adminFinanceAvatar">
                  {request.astrologerUserId.slice(0, 2).toUpperCase()}
                </span>
                <span>{shortId(request.astrologerUserId)}</span>
              </span>
              <span>
                <StatusPill status={request.status} />
              </span>
              <span className="adminFinanceMono">{formatMoney(request.amount)}</span>
              <span>{methodLabel(request.method)}</span>
              <span>
                {request.blockedByChargeback ? (
                  <span className="adminFinanceStatusPill adminFinanceStatusPill-danger">
                    Chargeback blocked
                  </span>
                ) : (
                  formatDate(request.requestedAt)
                )}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="adminFinancePanel" padding="medium">
        <div className="adminFinancePanelHead">
          <div>
            <p className="adminFinanceKicker">Manual payout</p>
            <h2>{props.selectedPayout ? shortId(props.selectedPayout.id) : "Заявка"}</h2>
          </div>
          {props.selectedPayout ? <StatusPill status={props.selectedPayout.status} /> : null}
        </div>
        {props.selectedPayout ? (
          <>
            <div className="adminFinanceFacts adminFinanceFactsCompact">
              <Fact label="Сумма" value={formatMoney(props.selectedPayout.amount)} />
              <Fact label="Астролог" value={shortId(props.selectedPayout.astrologerUserId)} />
              <Fact label="Метод" value={methodLabel(props.selectedPayout.method)} />
            </div>
            <OperationContext title="Операционный контекст">
              <Fact label="Request" value={shortId(props.selectedPayout.id)} />
              <Fact label="Idempotency" value="Terminal payout command" />
              <Fact label="Audit" value="Admin audit event" />
              <Fact label="Ledger" value={payoutLedgerContext(props.selectedPayout.status)} />
            </OperationContext>
            <PayoutDetail request={props.selectedPayout} />
            {props.selectedPayout.blockedByChargeback ? (
              <div className="adminFinancePayoutBlockNotice">
                <strong>Chargeback blocked</strong>
                <span>{props.selectedPayout.failureReason}</span>
                <small>{props.selectedPayout.adminNote}</small>
              </div>
            ) : null}
            <form className="adminFinanceForm adminFinancePayoutForm" onSubmit={props.onPaid}>
              <label className="adminFinanceField adminFinanceFieldWide">
                <span>External reference</span>
                <input
                  name="payoutExternalReference"
                  value={props.action.externalReference}
                  onChange={(event) =>
                    props.onChange({
                      ...props.action,
                      externalReference: event.currentTarget.value
                    })
                  }
                  placeholder="bank-transfer-1001"
                  required
                  disabled={payoutActionDisabled}
                />
              </label>
              <label className="adminFinanceField adminFinanceFieldWide">
                <span>Transferred at</span>
                <input
                  name="payoutTransferredAt"
                  value={props.action.transferredAt}
                  onChange={(event) =>
                    props.onChange({ ...props.action, transferredAt: event.currentTarget.value })
                  }
                  placeholder="2026-07-25T10:00:00.000Z"
                  required
                  disabled={payoutActionDisabled}
                />
              </label>
              <label className="adminFinanceField adminFinanceFieldWide">
                <span>Admin note</span>
                <textarea
                  name="payoutAdminNote"
                  value={props.action.adminNote}
                  onChange={(event) =>
                    props.onChange({ ...props.action, adminNote: event.currentTarget.value })
                  }
                  rows={2}
                  placeholder="Paid manually from bank cabinet"
                  disabled={payoutActionDisabled}
                />
              </label>
              <Button
                title="Отметить оплаченной"
                type="submit"
                size="medium"
                startIcon={<Check />}
                disabled={payoutActionDisabled}
              />
            </form>
            <div className="adminFinanceRejectBox">
              <label className="adminFinanceField">
                <span>Причина отказа</span>
                <input
                  name="payoutFailureReason"
                  value={props.action.failureReason}
                  onChange={(event) =>
                    props.onChange({ ...props.action, failureReason: event.currentTarget.value })
                  }
                  placeholder="Bank rejected recipient account"
                  disabled={payoutActionDisabled}
                />
              </label>
              <Button
                title="Отклонить"
                variant="default"
                size="medium"
                disabled={payoutActionDisabled}
                onClick={props.onReject}
              />
            </div>
          </>
        ) : (
          <p className="adminFinanceMuted">Нет выбранной заявки.</p>
        )}
      </Card>
    </div>
  );
}

function DisputesPanel(props: {
  readonly reversalQueue: AdminPaymentReversalQueueResponse;
  readonly selectedCase: AdminPaymentReversalCase | null;
  readonly action: ReversalActionForm;
  readonly saving: boolean;
  readonly onSelect: (paymentReversalCase: AdminPaymentReversalCase) => void;
  readonly onChange: (next: ReversalActionForm) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="adminFinanceDisputesStack">
      <section className="adminFinanceDisputeKpis" aria-label="Dispute summary">
        <StatusCard
          label="Возвраты"
          value={String(props.reversalQueue.summary.refundCount)}
          note={formatMoney(props.reversalQueue.summary.totalAmount)}
        />
        <StatusCard
          label="Chargeback"
          value={String(props.reversalQueue.summary.chargebackCount)}
          note="provider evidence"
        />
        <StatusCard
          label="Critical"
          value={String(props.reversalQueue.summary.criticalCount)}
          note="requires operator review"
        />
      </section>

      {props.reversalQueue.cases.length === 0 ? (
        <Card className="adminFinancePanel adminFinanceContentPanel" padding="medium">
          <p className="adminFinanceMuted">Открытых refund/chargeback cases нет.</p>
        </Card>
      ) : null}

      {props.reversalQueue.cases.map((paymentReversalCase) => {
        const isSelected = props.selectedCase?.id === paymentReversalCase.id;
        return (
          <Card
            className={`adminFinancePanel adminFinanceDisputeCard${
              isSelected ? " adminFinanceDisputeCardSelected" : ""
            }`}
            padding="medium"
            key={paymentReversalCase.id}
          >
            <div className="adminFinanceDisputeHead">
              <div>
                <p className="adminFinanceKicker">
                  {paymentReversalCase.type === "chargeback"
                    ? "Provider chargeback"
                    : "Provider refund"}
                </p>
                <h2>{shortId(paymentReversalCase.orderId)}</h2>
              </div>
              <strong className="adminFinanceDisputeAmount">
                {formatMoney(paymentReversalCase.amount)}
              </strong>
              <ReversalSeverityPill severity={paymentReversalCase.severity} />
            </div>

            <div className="adminFinanceDisputeParties">
              <span className="adminFinanceUserCell">
                <span className="adminFinanceAvatar">
                  {paymentReversalCase.clientUserId.slice(0, 2).toUpperCase()}
                </span>
                <span>{shortId(paymentReversalCase.clientUserId)}</span>
              </span>
              <span className="adminFinanceDisputeArrow">→</span>
              <span className="adminFinanceUserCell">
                <span className="adminFinanceAvatar">
                  {paymentReversalCase.astrologerUserId.slice(0, 2).toUpperCase()}
                </span>
                <span>{shortId(paymentReversalCase.astrologerUserId)}</span>
              </span>
              <span className="adminFinanceDisputeSpacer" />
              <ReversalTypePill paymentReversalCase={paymentReversalCase} />
            </div>

            <div className="adminFinanceDisputeFacts">
              <Fact
                label="Provider payment"
                value={paymentReversalCase.providerPaymentId ?? "missing"}
              />
              <Fact
                label="Webhook"
                value={`${paymentReversalCase.providerWebhookId} · ${formatDate(paymentReversalCase.receivedAt)}`}
              />
              <Fact
                label="Ledger"
                value={
                  paymentReversalCase.ledgerOperationType
                    ? `${paymentReversalCase.ledgerOperationType} · ${shortId(paymentReversalCase.ledgerTransactionId ?? "")}`
                    : "missing"
                }
              />
              <Fact
                label="Negative balance"
                value={formatMoney(
                  paymentReversalCase.walletBalance?.negativeBalance ?? {
                    amountMinor: 0,
                    currency: paymentReversalCase.amount.currency
                  }
                )}
              />
            </div>

            <div className="adminFinanceDisputeEvidence">
              <span>Evidence:</span>
              <Chip label={paymentReversalCase.provider} type="button" />
              <Chip label={paymentReversalCase.environment} type="button" />
              <Chip label={paymentReversalCase.orderStatus} type="button" />
              {paymentReversalCase.refundStatus ? (
                <Chip label={paymentReversalCase.refundStatus} type="button" />
              ) : null}
              {paymentReversalCase.providerRefundId ? (
                <Chip label={paymentReversalCase.providerRefundId} type="button" />
              ) : null}
            </div>

            <DisputeDetail paymentReversalCase={paymentReversalCase} />

            <div className="adminFinanceDisputeActions">
              <Button title="Открыть заказ" variant="default" size="small" disabled />
              <Button title="Ledger details" variant="default" size="small" disabled />
              <Button
                title={isSelected ? "Выбран" : "Review"}
                variant={isSelected ? "brand" : "default"}
                size="small"
                onClick={() => props.onSelect(paymentReversalCase)}
              />
              <span />
              <small>
                Review fixes operator evidence only; provider reversal remains webhook-owned.
              </small>
            </div>
            {isSelected ? (
              <form className="adminFinanceDisputeReviewForm" onSubmit={props.onSubmit}>
                <label className="adminFinanceField">
                  <span>Решение оператора</span>
                  <select
                    id={`reversal-review-resolution-${paymentReversalCase.id}`}
                    name="resolution"
                    value={props.action.resolution}
                    onChange={(event) =>
                      props.onChange({
                        ...props.action,
                        reversalCaseId: paymentReversalCase.id,
                        resolution: event.target.value as AdminPaymentReversalCaseReviewResolution
                      })
                    }
                  >
                    {reversalResolutionOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="adminFinanceField adminFinanceFieldWide">
                  <span>Комментарий оператора</span>
                  <textarea
                    id={`reversal-review-note-${paymentReversalCase.id}`}
                    name="adminNote"
                    rows={3}
                    value={props.action.adminNote}
                    onChange={(event) =>
                      props.onChange({
                        ...props.action,
                        reversalCaseId: paymentReversalCase.id,
                        adminNote: event.target.value
                      })
                    }
                    placeholder="Provider evidence, ledger check or chargeback follow-up"
                  />
                </label>
                <div className="adminFinanceFormActions">
                  <Button
                    title={props.saving ? "Сохраняем..." : "Зафиксировать review"}
                    variant="brand"
                    size="medium"
                    type="submit"
                    disabled={props.saving || !props.action.adminNote.trim()}
                  />
                </div>
              </form>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function ReconciliationPanel(props: {
  readonly reconciliationQueue: AdminReconciliationExceptionQueueResponse;
  readonly evidenceFilter: AdminReconciliationExceptionEvidenceFilter;
  readonly selectedException: AdminReconciliationException | null;
  readonly action: ReconciliationActionForm;
  readonly saving: boolean;
  readonly onEvidenceFilterChange: (filter: AdminReconciliationExceptionEvidenceFilter) => void;
  readonly onSelect: (exception: AdminReconciliationException) => void;
  readonly onChange: (next: ReconciliationActionForm) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="adminFinanceReconciliationGrid">
      <Card className="adminFinancePanel adminFinanceReconciliationListPanel" padding="medium">
        <div className="adminFinancePanelTitleRow">
          <div>
            <p className="adminFinanceKicker">Provider reconciliation</p>
            <h2>Exceptions сверки</h2>
          </div>
          <Chip
            label={`${props.reconciliationQueue.summary.openCount} open`}
            active={props.reconciliationQueue.summary.openCount > 0}
            type="button"
          />
        </div>

        <SegmentFilter
          label="Evidence"
          options={reconciliationEvidenceFilterOptions}
          value={props.evidenceFilter}
          onChange={props.onEvidenceFilterChange}
        />

        <section className="adminFinanceReconciliationKpis" aria-label="Reconciliation summary">
          <StatusCard
            label="Open"
            value={String(props.reconciliationQueue.summary.openCount)}
            note="blocks settlement-gated hold release"
          />
          <StatusCard
            label="Oldest"
            value={
              props.reconciliationQueue.summary.oldestOpenAt
                ? formatDate(props.reconciliationQueue.summary.oldestOpenAt)
                : "-"
            }
            note="operator SLA anchor"
          />
          <StatusCard label="Provider" value="Arc Pay" note="pay-in settlement evidence" />
        </section>

        {props.reconciliationQueue.exceptions.length === 0 ? (
          <div className="adminFinanceEmpty">Открытых reconciliation exceptions нет.</div>
        ) : null}

        <div className="adminFinanceReconciliationList" role="list">
          {props.reconciliationQueue.exceptions.map((exception) => (
            <button
              key={exception.id}
              type="button"
              className={
                props.selectedException?.id === exception.id
                  ? "adminFinanceReconciliationItem adminFinanceReconciliationItemActive"
                  : "adminFinanceReconciliationItem"
              }
              onClick={() => props.onSelect(exception)}
            >
              <span className="adminFinanceReconciliationItemHead">
                <strong>{exception.exceptionCode}</strong>
                <span>{formatDate(exception.checkedAt)}</span>
              </span>
              <span className="adminFinanceReconciliationMessage">
                {exception.exceptionMessage}
              </span>
              <span className="adminFinanceReconciliationEvidence">
                <span>{exception.provider}</span>
                <span>{providerEvidenceId(exception)}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="adminFinancePanel" padding="medium">
        <div className="adminFinancePanelHead">
          <div>
            <p className="adminFinanceKicker">Resolution</p>
            <h2>{props.selectedException ? shortId(props.selectedException.id) : "Exception"}</h2>
          </div>
          {props.selectedException ? (
            <span className="adminFinanceStatusPill adminFinanceStatusPill-danger">exception</span>
          ) : null}
        </div>

        {props.selectedException ? (
          <>
            <div className="adminFinanceFacts adminFinanceFactsCompact">
              <Fact
                label="Payment"
                value={props.selectedException.providerPaymentId ?? "missing"}
              />
              <Fact
                label="Settlement"
                value={props.selectedException.providerSettlementId ?? "missing"}
              />
              <Fact
                label="Provider event"
                value={
                  props.selectedException.providerEventId
                    ? shortId(props.selectedException.providerEventId)
                    : "missing"
                }
              />
            </div>

            <div className="adminFinanceReconciliationPayload">
              <span>Payload keys</span>
              <div>
                {Object.keys(props.selectedException.payload).length > 0 ? (
                  Object.keys(props.selectedException.payload).map((key) => (
                    <Chip key={key} label={key} type="button" />
                  ))
                ) : (
                  <Chip label="empty" type="button" />
                )}
              </div>
            </div>
            <ReconciliationDetail exception={props.selectedException} />
            <OperationContext title="Evidence context">
              <Fact label="Record" value={shortId(props.selectedException.id)} />
              <Fact label="Evidence" value={providerEvidenceId(props.selectedException)} />
              <Fact label="Clearance" value="Hold release gate" />
              <Fact label="Audit" value="Admin resolution audit" />
            </OperationContext>

            <form
              className="adminFinanceForm adminFinanceReconciliationForm"
              onSubmit={props.onSubmit}
            >
              <label className="adminFinanceField">
                <span>Resolution</span>
                <select
                  name="reconciliationResolution"
                  value={props.action.resolution}
                  onChange={(event) =>
                    props.onChange({
                      ...props.action,
                      resolution: event.currentTarget.value as ReconciliationExceptionResolution
                    })
                  }
                >
                  <option value="resolved">Resolved after evidence review</option>
                  <option value="waived">Waived by admin decision</option>
                </select>
              </label>
              <label className="adminFinanceField adminFinanceFieldWide">
                <span>Admin note</span>
                <textarea
                  name="reconciliationAdminNote"
                  value={props.action.adminNote}
                  onChange={(event) =>
                    props.onChange({ ...props.action, adminNote: event.currentTarget.value })
                  }
                  rows={3}
                  placeholder="Settlement report matched ledger row / provider false positive"
                  required
                />
              </label>
              <Button
                title="Закрыть exception"
                type="submit"
                size="medium"
                startIcon={<Check />}
                disabled={props.saving}
              />
            </form>
          </>
        ) : (
          <p className="adminFinanceMuted">Нет выбранного exception.</p>
        )}
      </Card>
    </div>
  );
}

function PoliciesPanel(props: {
  readonly policies: readonly FinancePolicyResponse[];
  readonly selectedRiskTier: RiskTier;
  readonly selectedPolicy: FinancePolicyResponse | null;
  readonly policyForm: FinancePolicyFormState;
  readonly savingPolicy: boolean;
  readonly onSelectRiskTier: (riskTier: RiskTier) => void;
  readonly onEnsureDefault: () => void;
  readonly onPolicyFormChange: (next: FinancePolicyFormState) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="adminFinanceWorkGrid">
      <Card className="adminFinancePanel" padding="medium">
        <div className="adminFinancePanelHead">
          <div>
            <p className="adminFinanceKicker">Risk tiers</p>
            <h2>Активные политики</h2>
          </div>
          <Button
            title="48 ч default"
            variant="default"
            size="small"
            startIcon={<Check />}
            disabled={props.savingPolicy}
            onClick={props.onEnsureDefault}
          />
        </div>

        <div className="adminFinanceTierList" role="list">
          {financePolicyRiskTierOptions.map((option) => {
            const policy = props.policies.find((item) => item.riskTier === option.value);
            return (
              <button
                key={option.value}
                className={
                  option.value === props.selectedRiskTier
                    ? "adminFinanceTier adminFinanceTierActive"
                    : "adminFinanceTier"
                }
                type="button"
                onClick={() => props.onSelectRiskTier(option.value)}
              >
                <span className={`adminFinanceRiskDot adminFinanceRiskDot-${option.tone}`} />
                <span className="adminFinanceTierName">{option.label}</span>
                <span className="adminFinanceTierMeta">
                  {policy
                    ? `${holdLabel(policy.holdDurationHours)} · ${formatBasisPoints(policy.reserveBps)} reserve`
                    : "not configured"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="adminFinanceTable" role="table" aria-label="Finance policies table">
          <div className="adminFinanceTableRow adminFinanceTableHead" role="row">
            <span>Tier</span>
            <span>Hold</span>
            <span>Reserve</span>
            <span>Fee</span>
            <span>Version</span>
          </div>
          {props.policies.map((policy) => (
            <div className="adminFinanceTableRow" role="row" key={policy.id}>
              <span>{policy.riskTier}</span>
              <span>{holdLabel(policy.holdDurationHours)}</span>
              <span>{formatBasisPoints(policy.reserveBps)}</span>
              <span>{formatBasisPoints(policy.platformFeeBps)}</span>
              <span>v{policy.policyVersion}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="adminFinancePanel" padding="medium">
        <div className="adminFinancePanelHead">
          <div>
            <p className="adminFinanceKicker">Policy editor</p>
            <h2>{props.selectedPolicy ? props.selectedPolicy.riskTier : props.selectedRiskTier}</h2>
          </div>
          <Chip
            label={props.selectedPolicy ? `v${props.selectedPolicy.policyVersion}` : "new"}
            active={Boolean(props.selectedPolicy)}
            type="button"
          />
        </div>

        <form className="adminFinanceForm" onSubmit={props.onSubmit}>
          <RiskTierSelect
            name="policyRiskTier"
            value={props.policyForm.riskTier}
            onChange={(riskTier) => props.onPolicyFormChange({ ...props.policyForm, riskTier })}
          />
          <NumberField
            label="Hold, hours"
            name="policyHoldDurationHours"
            value={props.policyForm.holdDurationHours}
            min={0}
            max={4320}
            onChange={(holdDurationHours) =>
              props.onPolicyFormChange({ ...props.policyForm, holdDurationHours })
            }
          />
          <NumberField
            label="Reserve, bps"
            name="policyReserveBps"
            value={props.policyForm.reserveBps}
            min={0}
            max={10000}
            onChange={(reserveBps) => props.onPolicyFormChange({ ...props.policyForm, reserveBps })}
          />
          <NumberField
            label="Reserve release, days"
            name="policyReserveReleaseDelayDays"
            value={props.policyForm.reserveReleaseDelayDays}
            min={0}
            max={540}
            onChange={(reserveReleaseDelayDays) =>
              props.onPolicyFormChange({ ...props.policyForm, reserveReleaseDelayDays })
            }
          />
          <NumberField
            label="Platform fee, bps"
            name="policyPlatformFeeBps"
            value={props.policyForm.platformFeeBps}
            min={0}
            max={10000}
            onChange={(platformFeeBps) =>
              props.onPolicyFormChange({ ...props.policyForm, platformFeeBps })
            }
          />
          <label className="adminFinanceToggle">
            <input
              name="policyProviderSettlementRequired"
              type="checkbox"
              checked={props.policyForm.providerSettlementRequired}
              onChange={(event) =>
                props.onPolicyFormChange({
                  ...props.policyForm,
                  providerSettlementRequired: event.currentTarget.checked
                })
              }
            />
            <span>Require provider settlement/reconciliation clearance</span>
          </label>
          <Button
            title="Сохранить политику"
            type="submit"
            size="medium"
            startIcon={<Check />}
            disabled={props.savingPolicy}
          />
        </form>
      </Card>
    </div>
  );
}

function RiskPanel(props: {
  readonly riskForm: AstrologerRiskProfileFormState;
  readonly savingRisk: boolean;
  readonly onRiskFormChange: (next: AstrologerRiskProfileFormState) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Card
      className="adminFinancePanel adminFinanceRiskPanel adminFinanceContentPanel"
      padding="medium"
    >
      <div className="adminFinancePanelHead">
        <div>
          <p className="adminFinanceKicker">Manual risk</p>
          <h2>Риск астролога</h2>
        </div>
      </div>
      <form className="adminFinanceForm" onSubmit={props.onSubmit}>
        <label className="adminFinanceField adminFinanceFieldWide">
          <span>Astrologer UUID</span>
          <input
            name="astrologerUserId"
            value={props.riskForm.astrologerUserId}
            onChange={(event) =>
              props.onRiskFormChange({
                ...props.riskForm,
                astrologerUserId: event.currentTarget.value
              })
            }
            placeholder="22222222-2222-4222-8222-222222222222"
          />
        </label>
        <RiskTierSelect
          label="Base tier"
          name="astrologerBaseRiskTier"
          value={props.riskForm.riskTier}
          onChange={(riskTier) => props.onRiskFormChange({ ...props.riskForm, riskTier })}
        />
        <RiskTierSelect
          label="Manual tier"
          name="astrologerManualRiskTier"
          value={props.riskForm.manualRiskTier}
          onChange={(manualRiskTier) =>
            props.onRiskFormChange({ ...props.riskForm, manualRiskTier })
          }
        />
        <NumberField
          label="Hold override, hours"
          name="astrologerHoldDurationHoursOverride"
          value={props.riskForm.holdDurationHoursOverride}
          min={0}
          max={4320}
          onChange={(holdDurationHoursOverride) =>
            props.onRiskFormChange({ ...props.riskForm, holdDurationHoursOverride })
          }
        />
        <NumberField
          label="Reserve override, bps"
          name="astrologerReserveBpsOverride"
          value={props.riskForm.reserveBpsOverride}
          min={0}
          max={10000}
          onChange={(reserveBpsOverride) =>
            props.onRiskFormChange({ ...props.riskForm, reserveBpsOverride })
          }
        />
        <NumberField
          label="Reserve release override, days"
          name="astrologerReserveReleaseDelayDaysOverride"
          value={props.riskForm.reserveReleaseDelayDaysOverride}
          min={0}
          max={540}
          onChange={(reserveReleaseDelayDaysOverride) =>
            props.onRiskFormChange({ ...props.riskForm, reserveReleaseDelayDaysOverride })
          }
        />
        <label className="adminFinanceField adminFinanceFieldWide">
          <span>Manual reason</span>
          <textarea
            name="astrologerManualOverrideReason"
            value={props.riskForm.manualOverrideReason}
            onChange={(event) =>
              props.onRiskFormChange({
                ...props.riskForm,
                manualOverrideReason: event.currentTarget.value
              })
            }
            placeholder="Chargeback, refund or quality risk evidence"
            rows={3}
          />
        </label>
        <label className="adminFinanceToggle adminFinanceFieldWide">
          <input
            name="astrologerProviderSettlementRequiredOverride"
            type="checkbox"
            checked={props.riskForm.providerSettlementRequiredOverride}
            onChange={(event) =>
              props.onRiskFormChange({
                ...props.riskForm,
                providerSettlementRequiredOverride: event.currentTarget.checked
              })
            }
          />
          <span>Require provider clearance for this astrologer</span>
        </label>
        <Button
          title="Сохранить риск"
          type="submit"
          size="medium"
          startIcon={<Check />}
          disabled={props.savingRisk}
        />
      </form>
    </Card>
  );
}

function NavItem(props: {
  readonly tab: AdminFinanceTab;
  readonly activeTab: AdminFinanceTab;
  readonly label: string;
  readonly badge?: number;
  readonly icon: ReactElement;
  readonly onClick: (tab: AdminFinanceTab) => void;
}) {
  const active = props.tab === props.activeTab;
  return (
    <button
      className={active ? "adminFinanceNavItem adminFinanceNavItemActive" : "adminFinanceNavItem"}
      type="button"
      onClick={() => props.onClick(props.tab)}
    >
      {props.icon}
      <span>{props.label}</span>
      {props.badge ? <span className="adminFinanceNavBadge">{props.badge}</span> : null}
    </button>
  );
}

function StatusCard(props: {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}) {
  return (
    <Card className="adminFinanceStatusCard" padding="medium">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.note}</small>
    </Card>
  );
}

function RiskTierSelect(props: {
  readonly label?: string;
  readonly name: string;
  readonly value: RiskTier;
  readonly onChange: (riskTier: RiskTier) => void;
}) {
  return (
    <label className="adminFinanceField">
      <span>{props.label ?? "Risk tier"}</span>
      <select
        name={props.name}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value as RiskTier)}
      >
        {financePolicyRiskTierOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField(props: {
  readonly label: string;
  readonly name: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="adminFinanceField">
      <span>{props.label}</span>
      <input
        name={props.name}
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function ActivityRow(props: {
  readonly tone: "positive" | "warning" | "neutral";
  readonly title: string;
  readonly text: string;
  readonly time: string;
}) {
  return (
    <div className="adminFinanceActivityRow">
      <span className={`adminFinanceActivityIcon adminFinanceActivityIcon-${props.tone}`}>
        <Wallet />
      </span>
      <span>
        <strong>{props.title}</strong>
        <small>{props.text}</small>
      </span>
      <em>{props.time}</em>
    </div>
  );
}

function AttentionButton(props: {
  readonly label: string;
  readonly value: string;
  readonly onClick: () => void;
}) {
  return (
    <button className="adminFinanceAttentionButton" type="button" onClick={props.onClick}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </button>
  );
}

function SegmentFilter<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="adminFinanceFilterBar" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={
            option.value === props.value
              ? "adminFinanceSegmentButton adminFinanceSegmentButtonActive"
              : "adminFinanceSegmentButton"
          }
          aria-pressed={option.value === props.value}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Fact(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="adminFinanceFact">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function PayoutDetail(props: { readonly request: AdminPayoutRequestResponse }) {
  return (
    <DetailSection title="Payout detail">
      <div className="adminFinanceDetailGrid">
        <Fact label="Provider payout" value={props.request.providerPayoutId ?? "not created"} />
        <Fact
          label="External reference"
          value={props.request.externalReference ?? "manual evidence missing"}
        />
        <Fact label="Transferred" value={nullableDateTime(props.request.transferredAt)} />
        <Fact label="Requested" value={formatDateTime(props.request.requestedAt)} />
        <Fact label="Reviewed" value={nullableDateTime(props.request.reviewedAt)} />
        <Fact label="Completed" value={nullableDateTime(props.request.completedAt)} />
        <Fact
          label="Admin actor"
          value={props.request.adminUserId ? shortId(props.request.adminUserId) : "not assigned"}
        />
        <Fact label="Failure reason" value={props.request.failureReason ?? "no failure evidence"} />
      </div>
      <EvidenceNote label="Admin note" value={props.request.adminNote ?? "No admin note yet"} />
    </DetailSection>
  );
}

function DisputeDetail(props: { readonly paymentReversalCase: AdminPaymentReversalCase }) {
  const review = props.paymentReversalCase.review;
  return (
    <DetailSection title="Dispute detail">
      <div className="adminFinanceDetailGrid">
        <Fact label="Payment attempt" value={shortId(props.paymentReversalCase.paymentAttemptId)} />
        <Fact label="Order" value={shortId(props.paymentReversalCase.orderId)} />
        <Fact label="Client" value={shortId(props.paymentReversalCase.clientUserId)} />
        <Fact label="Astrologer" value={shortId(props.paymentReversalCase.astrologerUserId)} />
        <Fact
          label="Provider payment"
          value={props.paymentReversalCase.providerPaymentId ?? "missing"}
        />
        <Fact
          label="Provider refund"
          value={props.paymentReversalCase.providerRefundId ?? "not a refund"}
        />
        <Fact
          label="Wallet shortfall"
          value={formatMoney(
            props.paymentReversalCase.walletBalance?.negativeBalance ?? {
              amountMinor: 0,
              currency: props.paymentReversalCase.amount.currency
            }
          )}
        />
        <Fact label="Existing review" value={review?.resolution ?? "not reviewed"} />
        <Fact label="Occurred" value={formatDateTime(props.paymentReversalCase.occurredAt)} />
        <Fact label="Received" value={formatDateTime(props.paymentReversalCase.receivedAt)} />
        <Fact
          label="Wallet updated"
          value={nullableDateTime(props.paymentReversalCase.walletBalance?.updatedAt ?? null)}
        />
        <Fact label="Reviewed" value={nullableDateTime(review?.reviewedAt ?? null)} />
      </div>
      <EvidenceNote label="Review note" value={review?.adminNote ?? "No operator review yet"} />
    </DetailSection>
  );
}

function ReconciliationDetail(props: { readonly exception: AdminReconciliationException }) {
  return (
    <DetailSection title="Reconciliation detail">
      <div className="adminFinanceDetailGrid">
        <Fact label="Provider payment" value={props.exception.providerPaymentId ?? "missing"} />
        <Fact label="Provider payout" value={props.exception.providerPayoutId ?? "missing"} />
        <Fact
          label="Provider settlement"
          value={props.exception.providerSettlementId ?? "missing"}
        />
        <Fact
          label="Provider event"
          value={
            props.exception.providerEventId ? shortId(props.exception.providerEventId) : "missing"
          }
        />
        <Fact
          label="Provider occurred"
          value={nullableDateTime(props.exception.providerOccurredAt)}
        />
        <Fact label="Checked" value={formatDateTime(props.exception.checkedAt)} />
      </div>
      <EvidenceNote label="Exception message" value={props.exception.exceptionMessage} />
    </DetailSection>
  );
}

function DetailSection(props: {
  readonly title: string;
  readonly children: ReactElement | readonly ReactElement[];
}) {
  return (
    <section className="adminFinanceDetailSection" aria-label={props.title}>
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

function EvidenceNote(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="adminFinanceEvidenceNote">
      <span>{props.label}</span>
      <p>{props.value}</p>
    </div>
  );
}

function OperationContext(props: {
  readonly title: string;
  readonly children: ReactElement | readonly ReactElement[];
}) {
  return (
    <section className="adminFinanceOperationContext" aria-label={props.title}>
      <h3>{props.title}</h3>
      <div className="adminFinanceFacts adminFinanceOperationFacts">{props.children}</div>
    </section>
  );
}

function StatusPill(props: { readonly status: PayoutRequestResponse["status"] }) {
  return (
    <span className={`adminFinanceStatusPill adminFinanceStatusPill-${statusTone(props.status)}`}>
      {statusLabel(props.status)}
    </span>
  );
}

function ReversalSeverityPill(props: { readonly severity: AdminPaymentReversalCase["severity"] }) {
  return (
    <span
      className={`adminFinanceStatusPill adminFinanceStatusPill-${reversalSeverityTone(props.severity)}`}
    >
      {props.severity}
    </span>
  );
}

function ReversalTypePill(props: { readonly paymentReversalCase: AdminPaymentReversalCase }) {
  const label = props.paymentReversalCase.type === "chargeback" ? "Chargeback" : "Refund";
  return (
    <span
      className={`adminFinanceStatusPill adminFinanceStatusPill-${
        props.paymentReversalCase.type === "chargeback" ? "danger" : "warning"
      }`}
    >
      {label}
    </span>
  );
}

function mergePolicy(
  previous: LoadState,
  policy: FinancePolicyResponse
): Extract<LoadState, { status: "ready" }> {
  if (previous.status !== "ready") {
    return {
      status: "ready",
      policies: [policy],
      payoutQueue: emptyPayoutQueue,
      reversalQueue: emptyReversalQueue,
      reconciliationQueue: emptyReconciliationQueue
    };
  }
  const withoutTier = previous.policies.filter((item) => item.riskTier !== policy.riskTier);
  return {
    status: "ready",
    policies: [...withoutTier, policy].sort((left, right) =>
      left.riskTier.localeCompare(right.riskTier)
    ),
    payoutQueue: previous.payoutQueue,
    reversalQueue: previous.reversalQueue,
    reconciliationQueue: previous.reconciliationQueue
  };
}

function emptyPayoutAction(): PayoutActionForm {
  return {
    payoutRequestId: "",
    externalReference: "",
    transferredAt: new Date().toISOString(),
    adminNote: "",
    failureReason: ""
  };
}

function emptyReconciliationAction(): ReconciliationActionForm {
  return {
    reconciliationRecordId: "",
    resolution: "resolved",
    adminNote: ""
  };
}

function emptyReversalAction(): ReversalActionForm {
  return {
    reversalCaseId: "",
    resolution: "ledger_verified",
    adminNote: ""
  };
}

function titleForTab(tab: AdminFinanceTab): string {
  switch (tab) {
    case "overview":
      return "Финансы";
    case "payouts":
      return "Выплаты";
    case "disputes":
      return "Споры и возвраты";
    case "reconciliation":
      return "Сверка provider";
    case "policies":
      return "Политики удержаний и риска";
    case "risk":
      return "Ручной риск";
  }
}

function attentionCount(
  queue: AdminPayoutQueueResponse,
  reversalQueue: AdminPaymentReversalQueueResponse,
  reconciliationQueue: AdminReconciliationExceptionQueueResponse
): number {
  return (
    queue.summary.requestedCount +
    queue.summary.underReviewCount +
    queue.summary.processingCount +
    queue.summary.chargebackBlockedCount +
    reversalQueue.summary.criticalCount +
    reconciliationQueue.summary.openCount
  );
}

function formatMoney(money: Money): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: money.currency,
    maximumFractionDigits: 0
  }).format(money.amountMinor / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(
    new Date(value)
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function nullableDateTime(value: string | null): string {
  return value ? formatDateTime(value) : "not recorded";
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function methodLabel(method: PayoutRequestResponse["method"]): string {
  return method === "manual_bank_transfer" ? "банк вручную" : "Arc Pay";
}

function providerEvidenceId(exception: AdminReconciliationException): string {
  return (
    exception.providerPaymentId ??
    exception.providerPayoutId ??
    exception.providerSettlementId ??
    shortId(exception.id)
  );
}

function statusLabel(status: PayoutRequestResponse["status"]): string {
  const labels: Record<PayoutRequestResponse["status"], string> = {
    requested: "Новая",
    under_review: "Проверка",
    approved: "Одобрена",
    processing_manual: "Банк",
    processing_provider: "Provider",
    paid: "Оплачена",
    failed: "Ошибка",
    rejected: "Отклонена",
    cancelled: "Отменена"
  };
  return labels[status];
}

function statusTone(
  status: PayoutRequestResponse["status"]
): "neutral" | "positive" | "warning" | "danger" {
  if (status === "paid") return "positive";
  if (status === "failed" || status === "rejected" || status === "cancelled") return "danger";
  if (status === "processing_manual" || status === "processing_provider") return "warning";
  return "neutral";
}

function isTerminalPayoutStatus(status: PayoutRequestResponse["status"]): boolean {
  return (
    status === "paid" || status === "failed" || status === "rejected" || status === "cancelled"
  );
}

function isPayoutActionBlocked(request: AdminPayoutRequestResponse): boolean {
  return request.blockedByChargeback || isTerminalPayoutStatus(request.status);
}

function payoutLedgerContext(status: PayoutRequestResponse["status"]): string {
  if (status === "paid") return "payout_paid posted";
  if (status === "failed" || status === "rejected" || status === "cancelled") {
    return "payout_failed posted";
  }
  if (status === "processing_manual" || status === "processing_provider") {
    return "payout pending reserved";
  }
  return "available to pending";
}

function reversalSeverityTone(
  severity: AdminPaymentReversalCase["severity"]
): "neutral" | "positive" | "warning" | "danger" {
  if (severity === "critical") return "danger";
  if (severity === "attention") return "warning";
  return "neutral";
}

function errorMessage(error: unknown, context: AdminFinanceErrorContext): string {
  if (error instanceof AdminFinancePoliciesApiError) {
    const providerMessage = backendMessage(error.responseBody);
    const backendHint = backendCodeHint(providerMessage);
    const suffix = backendHint ? ` ${backendHint}` : "";
    if (error.status === 400) {
      return `${actionLabel(context)} отклонено: проверьте подтверждение выплаты, обязательные поля и формат evidence. Для выплаты нужны External reference и Transferred at; для отказа нужна причина.${suffix}`;
    }
    if (error.status === 401 || error.status === 403) {
      return `${actionLabel(context)} не выполнено: сессия администратора или CSRF-token недействительны. Обновите страницу, войдите заново при необходимости и повторите действие.`;
    }
    if (error.status === 404) {
      return `${actionLabel(context)} не выполнено: запись больше не найдена в admin-api. Обновите очередь перед повторной операцией.${suffix}`;
    }
    if (error.status === 409) {
      return `${actionLabel(context)} не выполнено: Состояние уже изменилось или команда уже выполняется. Обновите очередь и повторите действие только после сверки ledger/provider evidence.${suffix}`;
    }
    return `${actionLabel(context)} не выполнено: admin-api вернул ${error.status}. Обновите очередь и проверьте операционный лог.${suffix}`;
  }
  if (isClientValidationError(error)) {
    return `${actionLabel(context)} не выполнено: проверьте обязательные поля и формат evidence перед отправкой. Для выплаты нужны External reference и Transferred at; для отказа нужна причина.`;
  }
  return error instanceof Error ? error.message : "Unknown admin finance error";
}

function actionLabel(context: AdminFinanceErrorContext): string {
  const labels: Record<AdminFinanceErrorContext, string> = {
    load: "Загрузка финансов",
    policy: "Сохранение политики",
    risk: "Сохранение риска",
    payout_paid: "Подтверждение ручной выплаты",
    payout_rejected: "Отклонение заявки на вывод",
    reversal_review: "Review refund/chargeback",
    reconciliation_resolution: "Закрытие reconciliation exception"
  };
  return labels[context];
}

function backendMessage(responseBody: unknown): string | null {
  if (typeof responseBody === "string") return responseBody;
  if (!responseBody || typeof responseBody !== "object") return null;
  const body = responseBody as { readonly message?: unknown; readonly error?: unknown };
  if (Array.isArray(body.message)) {
    const messages = body.message.filter((item): item is string => typeof item === "string");
    return messages.length > 0 ? messages.join("; ") : null;
  }
  if (typeof body.message === "string") return body.message;
  if (typeof body.error === "string") return body.error;
  return null;
}

function backendCodeHint(message: string | null): string | null {
  if (!message) return null;
  const hints: Record<string, string> = {
    payout_status_evidence_invalid:
      "Backend отклонил payout evidence: проверьте банковский reference, дату перевода и причину отказа.",
    payout_status_transition_invalid:
      "Backend запретил переход статуса выплаты: локальный экран мог устареть.",
    finance_idempotency_conflict:
      "Idempotency-key уже связан с другой командой; не повторяйте операцию без проверки audit trail.",
    finance_idempotency_key_reused_with_different_request:
      "Idempotency-key уже связан с другой командой; обновите очередь и проверьте audit trail перед повтором.",
    finance_idempotency_in_progress:
      "Похожая финансовая команда уже выполняется; дождитесь результата и обновите очередь.",
    finance_idempotency_failed:
      "Предыдущая команда завершилась ошибкой; нужен ручной разбор перед повтором."
  };
  return hints[message] ?? message;
}

function isClientValidationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const issues = (error as { readonly issues?: unknown }).issues;
  return Array.isArray(issues);
}
