import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
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
import type {
  FinancePolicyResponse,
  RiskTier
} from "@elevenhouse/contracts/finance-policies";
import type { Money } from "@elevenhouse/contracts/money";
import type {
  AdminPayoutQueueResponse,
  PayoutRequestResponse
} from "@elevenhouse/contracts/payouts";
import type { AdminFinancePoliciesApi } from "../api/adminFinancePoliciesApi";
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

type AdminFinanceTab = "overview" | "payouts" | "policies" | "risk";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly policies: readonly FinancePolicyResponse[];
      readonly payoutQueue: AdminPayoutQueueResponse;
    };

type PayoutActionForm = {
  readonly payoutRequestId: string;
  readonly externalReference: string;
  readonly transferredAt: string;
  readonly adminNote: string;
  readonly failureReason: string;
};

const emptyPayoutQueue: AdminPayoutQueueResponse = {
  summary: {
    requestedCount: 0,
    underReviewCount: 0,
    processingCount: 0,
    readyToPayAmount: { amountMinor: 0, currency: "RUB" },
    processingAmount: { amountMinor: 0, currency: "RUB" }
  },
  requests: []
};

export function FinancePoliciesPage({ api = createAdminFinancePoliciesApi() }: FinancePoliciesPageProps) {
  const [tab, setTab] = useState<AdminFinanceTab>("overview");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [selectedRiskTier, setSelectedRiskTier] = useState<RiskTier>("standard");
  const [policyForm, setPolicyForm] = useState<FinancePolicyFormState>(() => policyToForm(null));
  const [riskForm, setRiskForm] = useState<AstrologerRiskProfileFormState>(() =>
    createInitialRiskProfileForm()
  );
  const [payoutAction, setPayoutAction] = useState<PayoutActionForm>(() => emptyPayoutAction());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingRisk, setSavingRisk] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);

  const policies = loadState.status === "ready" ? loadState.policies : [];
  const payoutQueue = loadState.status === "ready" ? loadState.payoutQueue : emptyPayoutQueue;
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

  async function refreshFinance() {
    setLoadState({ status: "loading" });
    setSubmitError(null);
    try {
      const [policyResponse, payoutResponse] = await Promise.all([
        api.listPolicies(),
        api.listPayoutRequests()
      ]);
      setLoadState({
        status: "ready",
        policies: policyResponse.policies,
        payoutQueue: payoutResponse
      });
      const nextSelected = policyResponse.policies.find((policy) => policy.riskTier === selectedRiskTier)
        ? selectedRiskTier
        : policyResponse.policies[0]?.riskTier ?? "standard";
      setSelectedRiskTier(nextSelected);
      setPolicyForm(
        policyToForm(policyResponse.policies.find((policy) => policy.riskTier === nextSelected) ?? null)
      );
      if (!payoutAction.payoutRequestId && payoutResponse.requests[0]) {
        setPayoutAction((previous) => ({
          ...previous,
          payoutRequestId: payoutResponse.requests[0]?.id ?? ""
        }));
      }
    } catch (error) {
      setLoadState({ status: "error", message: errorMessage(error) });
    }
  }

  useEffect(() => {
    void refreshFinance();
  }, []);

  function selectRiskTier(riskTier: RiskTier) {
    setSelectedRiskTier(riskTier);
    setPolicyForm(policyToForm(policies.find((policy) => policy.riskTier === riskTier) ?? null));
    setStatusMessage(null);
    setSubmitError(null);
  }

  async function handleEnsureDefault() {
    setSavingPolicy(true);
    setSubmitError(null);
    try {
      const policy = await api.ensureDefaultPolicy();
      setLoadState((previous) => mergePolicy(previous, policy));
      setSelectedRiskTier(policy.riskTier);
      setPolicyForm(policyToForm(policy));
      setStatusMessage("Стандартная политика 48 часов подтверждена и записана в аудит.");
    } catch (error) {
      setSubmitError(errorMessage(error));
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
      setSelectedRiskTier(policy.riskTier);
      setPolicyForm(policyToForm(policy));
      setStatusMessage("Политика риска сохранена. Новые заказы получат новый snapshot.");
    } catch (error) {
      setSubmitError(errorMessage(error));
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
      setSubmitError(errorMessage(error));
    } finally {
      setSavingRisk(false);
    }
  }

  async function handlePayoutPaid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPayout) return;
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
      setPayoutAction(emptyPayoutAction());
      await refreshFinance();
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSavingPayout(false);
    }
  }

  async function handlePayoutRejected() {
    if (!selectedPayout) return;
    setSavingPayout(true);
    setSubmitError(null);
    try {
      await api.updatePayoutRequestStatus(selectedPayout.id, {
        status: "rejected",
        failureReason: payoutAction.failureReason.trim() || "Manual payout rejected by admin",
        adminNote: payoutAction.adminNote.trim() || null
      });
      setStatusMessage("Заявка отклонена. Ledger вернул сумму в доступный баланс.");
      setPayoutAction(emptyPayoutAction());
      await refreshFinance();
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSavingPayout(false);
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
          <NavItem tab="overview" activeTab={tab} label="Обзор" badge={attentionCount(payoutQueue)} onClick={setTab} icon={<LayoutGrid />} />
          <NavItem tab="payouts" activeTab={tab} label="Выплаты" badge={payoutQueue.requests.length} onClick={setTab} icon={<Wallet />} />
          <NavItem tab="policies" activeTab={tab} label="Политики" onClick={setTab} icon={<Settings />} />
          <NavItem tab="risk" activeTab={tab} label="Риск" onClick={setTab} icon={<Icon iconName="users" />} />
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
          <StatusCard label="Заявки выплат" value={String(payoutQueue.requests.length)} note="ручная обработка" />
          <StatusCard label="К выплате" value={formatMoney(payoutQueue.summary.readyToPayAmount)} note="reserved in ledger" />
          <StatusCard label="В процессе" value={formatMoney(payoutQueue.summary.processingAmount)} note="payout pending" />
        </section>

        {loadState.status === "loading" ? (
          <Card className="adminFinancePanel adminFinanceContentPanel" padding="medium">
            <p className="adminFinanceMuted">Загружаю финансы из admin-api...</p>
          </Card>
        ) : null}

        {loadState.status === "error" ? (
          <Card className="adminFinancePanel adminFinanceContentPanel" padding="medium">
            <p className="adminFinanceErrorInline">{loadState.message}</p>
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
                onGo={setTab}
              />
            ) : null}
            {tab === "payouts" ? (
              <PayoutsPanel
                payoutQueue={payoutQueue}
                selectedPayout={selectedPayout}
                action={payoutAction}
                saving={savingPayout}
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

        {statusMessage ? <p className="adminFinanceNotice">{statusMessage}</p> : null}
        {submitError ? <p className="adminFinanceError">{submitError}</p> : null}
      </main>
    </div>
  );
}

function OverviewPanel(props: {
  readonly policies: readonly FinancePolicyResponse[];
  readonly payoutQueue: AdminPayoutQueueResponse;
  readonly onGo: (tab: AdminFinanceTab) => void;
}) {
  const policy = props.policies.find((item) => item.riskTier === "standard") ?? props.policies[0] ?? null;
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
          title="Ручная обработка"
          text={`${props.payoutQueue.summary.processingCount} ожидают банковского подтверждения`}
          time="сейчас"
        />
        <ActivityRow
          tone="neutral"
          title="Политика удержания"
          text={policy ? `${policy.riskTier} · ${holdLabel(policy.holdDurationHours)} · ${formatBasisPoints(policy.platformFeeBps)} fee` : "Политика не настроена"}
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
            label="Политики холда"
            value={policy ? holdLabel(policy.holdDurationHours) : "нет"}
            onClick={() => props.onGo("policies")}
          />
          <AttentionButton
            label="Ручной риск"
            value="admin"
            onClick={() => props.onGo("risk")}
          />
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
  readonly selectedPayout: PayoutRequestResponse | null;
  readonly action: PayoutActionForm;
  readonly saving: boolean;
  readonly onSelect: (request: PayoutRequestResponse) => void;
  readonly onChange: (next: PayoutActionForm) => void;
  readonly onPaid: (event: FormEvent<HTMLFormElement>) => void;
  readonly onReject: () => void;
}) {
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
        <div className="adminFinanceTable adminFinancePayoutTable" role="table" aria-label="Payout requests">
          <div className="adminFinanceTableRow adminFinanceTableHead" role="row">
            <span>Астролог</span>
            <span>Статус</span>
            <span>Сумма</span>
            <span>Метод</span>
            <span>Дата</span>
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
                <span className="adminFinanceAvatar">{request.astrologerUserId.slice(0, 2).toUpperCase()}</span>
                <span>{shortId(request.astrologerUserId)}</span>
              </span>
              <span>
                <StatusPill status={request.status} />
              </span>
              <span className="adminFinanceMono">{formatMoney(request.amount)}</span>
              <span>{methodLabel(request.method)}</span>
              <span>{formatDate(request.requestedAt)}</span>
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
            <form className="adminFinanceForm adminFinancePayoutForm" onSubmit={props.onPaid}>
              <label className="adminFinanceField adminFinanceFieldWide">
                <span>External reference</span>
                <input
                  name="payoutExternalReference"
                  value={props.action.externalReference}
                  onChange={(event) =>
                    props.onChange({ ...props.action, externalReference: event.currentTarget.value })
                  }
                  placeholder="bank-transfer-1001"
                  required
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
                />
              </label>
              <Button
                title="Отметить оплаченной"
                type="submit"
                size="medium"
                startIcon={<Check />}
                disabled={props.saving}
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
                />
              </label>
              <Button
                title="Отклонить"
                variant="default"
                size="medium"
                disabled={props.saving}
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
    <Card className="adminFinancePanel adminFinanceRiskPanel adminFinanceContentPanel" padding="medium">
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
              props.onRiskFormChange({ ...props.riskForm, astrologerUserId: event.currentTarget.value })
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
              props.onRiskFormChange({ ...props.riskForm, manualOverrideReason: event.currentTarget.value })
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

function StatusCard(props: { readonly label: string; readonly value: string; readonly note: string }) {
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

function AttentionButton(props: { readonly label: string; readonly value: string; readonly onClick: () => void }) {
  return (
    <button className="adminFinanceAttentionButton" type="button" onClick={props.onClick}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </button>
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

function StatusPill(props: { readonly status: PayoutRequestResponse["status"] }) {
  return <span className={`adminFinanceStatusPill adminFinanceStatusPill-${statusTone(props.status)}`}>{statusLabel(props.status)}</span>;
}

function mergePolicy(
  previous: LoadState,
  policy: FinancePolicyResponse
): Extract<LoadState, { status: "ready" }> {
  if (previous.status !== "ready") {
    return { status: "ready", policies: [policy], payoutQueue: emptyPayoutQueue };
  }
  const withoutTier = previous.policies.filter((item) => item.riskTier !== policy.riskTier);
  return {
    status: "ready",
    policies: [...withoutTier, policy].sort((left, right) =>
      left.riskTier.localeCompare(right.riskTier)
    ),
    payoutQueue: previous.payoutQueue
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

function titleForTab(tab: AdminFinanceTab): string {
  switch (tab) {
    case "overview":
      return "Финансы";
    case "payouts":
      return "Выплаты";
    case "policies":
      return "Политики удержаний и риска";
    case "risk":
      return "Ручной риск";
  }
}

function attentionCount(queue: AdminPayoutQueueResponse): number {
  return queue.summary.requestedCount + queue.summary.underReviewCount + queue.summary.processingCount;
}

function formatMoney(money: Money): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: money.currency,
    maximumFractionDigits: 0
  }).format(money.amountMinor / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(value));
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function methodLabel(method: PayoutRequestResponse["method"]): string {
  return method === "manual_bank_transfer" ? "банк вручную" : "Arc Pay";
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

function statusTone(status: PayoutRequestResponse["status"]): "neutral" | "positive" | "warning" | "danger" {
  if (status === "paid") return "positive";
  if (status === "failed" || status === "rejected" || status === "cancelled") return "danger";
  if (status === "processing_manual" || status === "processing_provider") return "warning";
  return "neutral";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown admin finance error";
}
