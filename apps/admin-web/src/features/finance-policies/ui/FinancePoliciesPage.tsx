import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import { Card } from "@elevenhouse/design-system/components/Card";
import "@elevenhouse/design-system/components/Card.css";
import { Chip } from "@elevenhouse/design-system/components/Chip";
import "@elevenhouse/design-system/components/Chip.css";
import { Check } from "@elevenhouse/design-system/icons/Check";
import { Refresh } from "@elevenhouse/design-system/icons/Refresh";
import { Settings } from "@elevenhouse/design-system/icons/Settings";
import { Wallet } from "@elevenhouse/design-system/icons/Wallet";
import type { FinancePolicyResponse, RiskTier } from "@elevenhouse/contracts/finance-policies";
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

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly policies: readonly FinancePolicyResponse[] };

export function FinancePoliciesPage({ api = createAdminFinancePoliciesApi() }: FinancePoliciesPageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [selectedRiskTier, setSelectedRiskTier] = useState<RiskTier>("standard");
  const [policyForm, setPolicyForm] = useState<FinancePolicyFormState>(() => policyToForm(null));
  const [riskForm, setRiskForm] = useState<AstrologerRiskProfileFormState>(() =>
    createInitialRiskProfileForm()
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingRisk, setSavingRisk] = useState(false);

  const policies = loadState.status === "ready" ? loadState.policies : [];
  const selectedPolicy = useMemo(
    () => policies.find((policy) => policy.riskTier === selectedRiskTier) ?? null,
    [policies, selectedRiskTier]
  );

  async function refreshPolicies() {
    setLoadState({ status: "loading" });
    setSubmitError(null);
    try {
      const response = await api.listPolicies();
      setLoadState({ status: "ready", policies: response.policies });
      const nextSelected = response.policies.find((policy) => policy.riskTier === selectedRiskTier)
        ? selectedRiskTier
        : response.policies[0]?.riskTier ?? "standard";
      setSelectedRiskTier(nextSelected);
      setPolicyForm(policyToForm(response.policies.find((policy) => policy.riskTier === nextSelected) ?? null));
    } catch (error) {
      setLoadState({ status: "error", message: errorMessage(error) });
    }
  }

  useEffect(() => {
    void refreshPolicies();
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
          <button className="adminFinanceNavItem adminFinanceNavItemActive" type="button">
            <Settings />
            <span>Финансы</span>
          </button>
          <button className="adminFinanceNavItem" type="button" disabled>
            <Wallet />
            <span>Выплаты</span>
          </button>
        </nav>
      </aside>

      <main className="adminFinanceMain">
        <header className="adminFinanceHeader">
          <div>
            <p className="adminFinanceKicker">Finance controls</p>
            <h1>Политики удержаний и риска</h1>
          </div>
          <Button
            title="Обновить"
            variant="default"
            size="medium"
            startIcon={<Refresh />}
            onClick={() => void refreshPolicies()}
          />
        </header>

        <section className="adminFinanceStatusGrid" aria-label="Finance policy summary">
          <StatusCard label="Default hold" value="48 ч" note="baseline, configurable" />
          <StatusCard label="Provider clearance" value="Required" note="settlement/reconciliation gate" />
          <StatusCard label="Audit mode" value="Durable" note="admin action log" />
          <StatusCard label="Payouts" value="Manual" note="provider adapter later" />
        </section>

        {loadState.status === "loading" ? (
          <Card className="adminFinancePanel" padding="medium">
            <p className="adminFinanceMuted">Загружаю политики из admin-api...</p>
          </Card>
        ) : null}

        {loadState.status === "error" ? (
          <Card className="adminFinancePanel" padding="medium">
            <p className="adminFinanceError">{loadState.message}</p>
            <Button
              title="Повторить"
              variant="default"
              size="medium"
              startIcon={<Refresh />}
              onClick={() => void refreshPolicies()}
            />
          </Card>
        ) : null}

        {loadState.status === "ready" ? (
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
                  disabled={savingPolicy}
                  onClick={() => void handleEnsureDefault()}
                />
              </div>

              <div className="adminFinanceTierList" role="list">
                {financePolicyRiskTierOptions.map((option) => {
                  const policy = policies.find((item) => item.riskTier === option.value);
                  return (
                    <button
                      key={option.value}
                      className={
                        option.value === selectedRiskTier
                          ? "adminFinanceTier adminFinanceTierActive"
                          : "adminFinanceTier"
                      }
                      type="button"
                      onClick={() => selectRiskTier(option.value)}
                    >
                      <span className={`adminFinanceRiskDot adminFinanceRiskDot-${option.tone}`} />
                      <span className="adminFinanceTierName">{option.label}</span>
                      <span className="adminFinanceTierMeta">
                        {policy ? `${holdLabel(policy.holdDurationHours)} · ${formatBasisPoints(policy.reserveBps)} reserve` : "not configured"}
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
                {policies.map((policy) => (
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
                  <h2>{selectedPolicy ? selectedPolicy.riskTier : selectedRiskTier}</h2>
                </div>
                <Chip
                  label={selectedPolicy ? `v${selectedPolicy.policyVersion}` : "new"}
                  active={Boolean(selectedPolicy)}
                  type="button"
                />
              </div>

              <form className="adminFinanceForm" onSubmit={(event) => void handlePolicySubmit(event)}>
                <RiskTierSelect
                  name="policyRiskTier"
                  value={policyForm.riskTier}
                  onChange={(riskTier) =>
                    setPolicyForm((previous) => ({ ...previous, riskTier }))
                  }
                />
                <NumberField
                  label="Hold, hours"
                  name="policyHoldDurationHours"
                  value={policyForm.holdDurationHours}
                  min={0}
                  max={4320}
                  onChange={(holdDurationHours) =>
                    setPolicyForm((previous) => ({ ...previous, holdDurationHours }))
                  }
                />
                <NumberField
                  label="Reserve, bps"
                  name="policyReserveBps"
                  value={policyForm.reserveBps}
                  min={0}
                  max={10000}
                  onChange={(reserveBps) => setPolicyForm((previous) => ({ ...previous, reserveBps }))}
                />
                <NumberField
                  label="Reserve release, days"
                  name="policyReserveReleaseDelayDays"
                  value={policyForm.reserveReleaseDelayDays}
                  min={0}
                  max={540}
                  onChange={(reserveReleaseDelayDays) =>
                    setPolicyForm((previous) => ({ ...previous, reserveReleaseDelayDays }))
                  }
                />
                <NumberField
                  label="Platform fee, bps"
                  name="policyPlatformFeeBps"
                  value={policyForm.platformFeeBps}
                  min={0}
                  max={10000}
                  onChange={(platformFeeBps) =>
                    setPolicyForm((previous) => ({ ...previous, platformFeeBps }))
                  }
                />
                <label className="adminFinanceToggle">
                  <input
                    name="policyProviderSettlementRequired"
                    type="checkbox"
                    checked={policyForm.providerSettlementRequired}
                    onChange={(event) => {
                      const providerSettlementRequired = event.currentTarget.checked;
                      setPolicyForm((previous) => ({
                        ...previous,
                        providerSettlementRequired
                      }));
                    }}
                  />
                  <span>Require provider settlement/reconciliation clearance</span>
                </label>
                <Button
                  title="Сохранить политику"
                  type="submit"
                  size="medium"
                  startIcon={<Check />}
                  disabled={savingPolicy}
                />
              </form>
            </Card>

            <Card className="adminFinancePanel adminFinanceRiskPanel" padding="medium">
              <div className="adminFinancePanelHead">
                <div>
                  <p className="adminFinanceKicker">Manual risk</p>
                  <h2>Риск астролога</h2>
                </div>
              </div>
              <form className="adminFinanceForm" onSubmit={(event) => void handleRiskSubmit(event)}>
                <label className="adminFinanceField adminFinanceFieldWide">
                  <span>Astrologer UUID</span>
                  <input
                    name="astrologerUserId"
                    value={riskForm.astrologerUserId}
                    onChange={(event) => {
                      const astrologerUserId = event.currentTarget.value;
                      setRiskForm((previous) => ({
                        ...previous,
                        astrologerUserId
                      }));
                    }}
                    placeholder="22222222-2222-4222-8222-222222222222"
                  />
                </label>
                <RiskTierSelect
                  label="Base tier"
                  name="astrologerBaseRiskTier"
                  value={riskForm.riskTier}
                  onChange={(riskTier) => setRiskForm((previous) => ({ ...previous, riskTier }))}
                />
                <RiskTierSelect
                  label="Manual tier"
                  name="astrologerManualRiskTier"
                  value={riskForm.manualRiskTier}
                  onChange={(manualRiskTier) =>
                    setRiskForm((previous) => ({ ...previous, manualRiskTier }))
                  }
                />
                <NumberField
                  label="Hold override, hours"
                  name="astrologerHoldDurationHoursOverride"
                  value={riskForm.holdDurationHoursOverride}
                  min={0}
                  max={4320}
                  onChange={(holdDurationHoursOverride) =>
                    setRiskForm((previous) => ({ ...previous, holdDurationHoursOverride }))
                  }
                />
                <NumberField
                  label="Reserve override, bps"
                  name="astrologerReserveBpsOverride"
                  value={riskForm.reserveBpsOverride}
                  min={0}
                  max={10000}
                  onChange={(reserveBpsOverride) =>
                    setRiskForm((previous) => ({ ...previous, reserveBpsOverride }))
                  }
                />
                <NumberField
                  label="Reserve release override, days"
                  name="astrologerReserveReleaseDelayDaysOverride"
                  value={riskForm.reserveReleaseDelayDaysOverride}
                  min={0}
                  max={540}
                  onChange={(reserveReleaseDelayDaysOverride) =>
                    setRiskForm((previous) => ({
                      ...previous,
                      reserveReleaseDelayDaysOverride
                    }))
                  }
                />
                <label className="adminFinanceField adminFinanceFieldWide">
                  <span>Manual reason</span>
                  <textarea
                    name="astrologerManualOverrideReason"
                    value={riskForm.manualOverrideReason}
                    onChange={(event) => {
                      const manualOverrideReason = event.currentTarget.value;
                      setRiskForm((previous) => ({
                        ...previous,
                        manualOverrideReason
                      }));
                    }}
                    placeholder="Chargeback, refund or quality risk evidence"
                    rows={3}
                  />
                </label>
                <label className="adminFinanceToggle adminFinanceFieldWide">
                  <input
                    name="astrologerProviderSettlementRequiredOverride"
                    type="checkbox"
                    checked={riskForm.providerSettlementRequiredOverride}
                    onChange={(event) => {
                      const providerSettlementRequiredOverride = event.currentTarget.checked;
                      setRiskForm((previous) => ({
                        ...previous,
                        providerSettlementRequiredOverride
                      }));
                    }}
                  />
                  <span>Require provider clearance for this astrologer</span>
                </label>
                <Button
                  title="Сохранить риск"
                  type="submit"
                  size="medium"
                  startIcon={<Check />}
                  disabled={savingRisk}
                />
              </form>
            </Card>
          </div>
        ) : null}

        {statusMessage ? <p className="adminFinanceNotice">{statusMessage}</p> : null}
        {submitError ? <p className="adminFinanceError">{submitError}</p> : null}
      </main>
    </div>
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
        onChange={(event) => {
          const riskTier = event.currentTarget.value as RiskTier;
          props.onChange(riskTier);
        }}
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
        onChange={(event) => {
          const value = Number(event.currentTarget.value);
          props.onChange(value);
        }}
      />
    </label>
  );
}

function mergePolicy(
  previous: LoadState,
  policy: FinancePolicyResponse
): Extract<LoadState, { status: "ready" }> {
  if (previous.status !== "ready") {
    return { status: "ready", policies: [policy] };
  }
  const withoutTier = previous.policies.filter((item) => item.riskTier !== policy.riskTier);
  return {
    status: "ready",
    policies: [...withoutTier, policy].sort((left, right) =>
      left.riskTier.localeCompare(right.riskTier)
    )
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown admin finance error";
}
