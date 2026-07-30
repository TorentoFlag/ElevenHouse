import { FormEvent, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AstrologerFinanceOverviewResponse,
  CreateManualBankTransferPayoutMethod,
  CreatePayoutRequest,
  LedgerOperation,
  PayoutRequestResponse
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useI18n } from "@elevenhouse/i18n";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { formatMoneyMinor } from "../../features/products/model/productFormatting";
import { useCreateManualPayoutMethodMutation } from "../../features/finance/model/useCreateManualPayoutMethodMutation";
import { useCreatePayoutRequestMutation } from "../../features/finance/model/useCreatePayoutRequestMutation";
import { useCurrentFinanceOverviewQuery } from "../../features/finance/model/useCurrentFinanceOverviewQuery";
import { useFinanceOperationsQuery } from "../../features/finance/model/useFinanceOperationsQuery";
import styles from "./FinancePage.module.css";

type PayoutMethodForm = {
  readonly displayName: string;
  readonly recipientName: string;
  readonly bankName: string;
  readonly accountNumberLast4: string;
  readonly bik: string;
};

type OperationFilter = "all" | LedgerOperation["kind"];
type BalanceMetricTone = "positive" | "warning" | "neutral" | "accent" | "danger";
type BalanceMetricViewModel = {
  readonly label: string;
  readonly value: number | null;
  readonly tone: BalanceMetricTone;
  readonly note: string;
};

const operationFilters: readonly { readonly value: OperationFilter; readonly label: string }[] = [
  { value: "all", label: "Все" },
  { value: "sale", label: "Продажи" },
  { value: "payout", label: "Выплаты" },
  { value: "refund", label: "Возвраты" },
  { value: "adjustment", label: "Корректировки" }
];

export function FinancePage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const financeQuery = useCurrentFinanceOverviewQuery();
  const operationsQuery = useFinanceOperationsQuery({ limit: 50 });
  const payoutMethodMutation = useCreateManualPayoutMethodMutation();
  const payoutRequestMutation = useCreatePayoutRequestMutation();
  const payoutPanelRef = useRef<HTMLElement | null>(null);
  const [methodForm, setMethodForm] = useState<PayoutMethodForm>({
    displayName: "",
    recipientName: "",
    bankName: "",
    accountNumberLast4: "",
    bik: ""
  });
  const [payoutAmount, setPayoutAmount] = useState("");
  const [operationFilter, setOperationFilter] = useState<OperationFilter>("all");
  const [operationSearch, setOperationSearch] = useState("");
  const overview = financeQuery.data ?? null;
  const payoutAmountMinor = toAmountMinor(payoutAmount);
  const availablePayoutMinor = overview?.balance.available.amountMinor ?? 0;
  const isPayoutAmountAboveAvailable = payoutAmountMinor > availablePayoutMinor;
  const canSubmitPayout =
    Boolean(overview?.canRequestPayout) &&
    payoutAmountMinor > 0 &&
    !isPayoutAmountAboveAvailable &&
    !payoutRequestMutation.isPending;
  const isMethodFormComplete = Object.values(methodForm).every((value) => value.trim().length > 0);
  const operationPages = operationsQuery.data?.pages ?? [];
  const operations = operationPages.flatMap((page) => page.operations);
  const canDownloadReport = Boolean(overview) || operations.length > 0;

  useDocumentTitle(dictionary.finance.documentTitle);

  const handleMethodSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isMethodFormComplete || payoutMethodMutation.isPending) return;

    const body: CreateManualBankTransferPayoutMethod = {
      displayName: methodForm.displayName.trim(),
      recipientName: methodForm.recipientName.trim(),
      bankName: methodForm.bankName.trim(),
      accountNumberLast4: methodForm.accountNumberLast4.trim(),
      details: { bik: methodForm.bik.trim() },
      idempotencyKey: createIdempotencyKey("payout-method")
    };
    payoutMethodMutation.mutate(body);
  };

  const handlePayoutSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!overview || !canSubmitPayout || payoutAmountMinor <= 0) return;

    const body: CreatePayoutRequest = {
      amount: { amountMinor: payoutAmountMinor, currency: "RUB" },
      method: overview.defaultPayoutMethod?.method ?? "manual_bank_transfer",
      idempotencyKey: createIdempotencyKey("payout-request")
    };
    payoutRequestMutation.mutate(body, {
      onSuccess: () => setPayoutAmount("")
    });
  };

  const focusPayoutRequest = () => {
    payoutPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    payoutPanelRef.current?.querySelector<HTMLInputElement>("input[name='amount']")?.focus();
  };

  const downloadReport = () => {
    if (!canDownloadReport) return;
    downloadFinanceReportCsv({
      overview,
      operations,
      locale
    });
  };

  return (
    <section className={styles.financePage} aria-labelledby="finance-page-title">
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <h1 id="finance-page-title" className={styles.title}>
            {dictionary.finance.title}
          </h1>
        </div>
        <div className={styles.toolbarMeta}>
          <span>{formatFinanceToolbarMeta(overview)}</span>
          <button
            className={styles.ghostButton}
            type="button"
            disabled={!canDownloadReport}
            onClick={downloadReport}
          >
            <Icon iconName="doc" width={15} height={15} aria-hidden="true" />
            Отчёт
          </button>
          <button
            className={styles.ghostButton}
            type="button"
            onClick={() => {
              void financeQuery.refetch();
              void operationsQuery.refetch();
            }}
          >
            <Icon iconName="refresh" width={15} height={15} aria-hidden="true" />
            Обновить
          </button>
          <button className={styles.primaryButton} type="button" onClick={focusPayoutRequest}>
            <Icon iconName="wallet" width={15} height={15} aria-hidden="true" />
            Вывести средства
          </button>
        </div>
      </header>

      <main className={styles.content}>
        {financeQuery.isLoading ? (
          <StatusBanner tone="neutral">Загружаем финансы</StatusBanner>
        ) : null}
        {financeQuery.isError ? (
          <StatusBanner tone="danger">Не удалось загрузить финансовые данные</StatusBanner>
        ) : null}
        {operationsQuery.isLoading ? (
          <StatusBanner tone="neutral">Загружаем операции</StatusBanner>
        ) : null}
        {operationsQuery.isError ? (
          <StatusBanner tone="danger">Не удалось загрузить историю операций</StatusBanner>
        ) : null}
        {payoutMethodMutation.isError ? (
          <StatusBanner tone="danger">Не удалось сохранить реквизиты вывода</StatusBanner>
        ) : null}
        {payoutRequestMutation.isError ? (
          <StatusBanner tone="danger">Не удалось создать заявку на вывод</StatusBanner>
        ) : null}
        {payoutMethodMutation.isSuccess ? (
          <StatusBanner tone="success">Реквизиты вывода сохранены</StatusBanner>
        ) : null}
        {payoutRequestMutation.isSuccess ? (
          <StatusBanner tone="success">Заявка на вывод отправлена в админку</StatusBanner>
        ) : null}

        <BalanceStrip overview={overview} locale={locale} />

        <div className={styles.workspace}>
          <OperationsPanel
            operations={operations}
            filter={operationFilter}
            search={operationSearch}
            locale={locale}
            isLoading={operationsQuery.isLoading}
            hasNextPage={Boolean(operationsQuery.hasNextPage)}
            isFetchingNextPage={operationsQuery.isFetchingNextPage}
            onFilterChange={setOperationFilter}
            onSearchChange={setOperationSearch}
            onLoadMore={() => {
              void operationsQuery.fetchNextPage();
            }}
          />

          <aside className={styles.sideStack}>
            <section className={styles.panel} aria-label="Выплаты" ref={payoutPanelRef}>
              <div className={styles.panelHeader}>
                <h2>Выплаты</h2>
              </div>
              <div className={styles.payoutFacts}>
                <PayoutFact
                  icon="wallet"
                  label="Метод"
                  value={overview?.defaultPayoutMethod?.displayName ?? "не добавлен"}
                />
                <PayoutFact icon="clock" label="Обработка" value="заявка в админку" />
                <PayoutFact
                  icon="calendar"
                  label="Мин. сумма"
                  value={
                    overview
                      ? formatMoneyMinor(
                          overview.minimumPayoutAmount.amountMinor,
                          overview.minimumPayoutAmount.currency,
                          locale
                        )
                      : "-"
                  }
                />
                <PayoutFact icon="settings" label="Провайдер" value="банк вручную" />
              </div>
              <form className={styles.form} onSubmit={handlePayoutSubmit}>
                <label className={styles.field}>
                  <span>Сумма</span>
                  <div className={styles.amountInputWrap}>
                    <input
                      id="finance-payout-amount"
                      name="amount"
                      inputMode="decimal"
                      value={payoutAmount}
                      placeholder="5000"
                      onChange={(event) => setPayoutAmount(event.target.value)}
                    />
                    <button
                      className={styles.allAmountButton}
                      type="button"
                      disabled={!overview}
                      onClick={() =>
                        setPayoutAmount(
                          overview
                            ? String(Math.floor(overview.balance.available.amountMinor / 100))
                            : ""
                        )
                      }
                    >
                      Всё
                    </button>
                  </div>
                  {isPayoutAmountAboveAvailable ? (
                    <small className={styles.fieldError}>Больше доступного остатка</small>
                  ) : null}
                </label>
                <button className={styles.primaryButton} type="submit" disabled={!canSubmitPayout}>
                  {payoutRequestMutation.isPending ? "Отправляем" : "Создать заявку"}
                </button>
              </form>
              <p className={styles.panelHint}>{resolvePayoutHelpText(overview, locale)}</p>
            </section>

            <PayoutRequestsPanel requests={overview?.recentPayoutRequests ?? []} locale={locale} />

            <PlanPanel overview={overview} locale={locale} />

            <section className={styles.panel} aria-label="Реквизиты вывода">
              <div className={styles.panelHeader}>
                <h2>Реквизиты</h2>
              </div>
              {overview?.defaultPayoutMethod ? (
                <div className={styles.methodSummary}>
                  <span className={styles.methodIcon}>
                    <Icon iconName="wallet" width={16} height={16} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{overview.defaultPayoutMethod.displayName}</strong>
                    <small>Ручной банковский перевод</small>
                  </span>
                </div>
              ) : (
                <PayoutMethodFormView
                  form={methodForm}
                  isPending={payoutMethodMutation.isPending}
                  isComplete={isMethodFormComplete}
                  onChange={setMethodForm}
                  onSubmit={handleMethodSubmit}
                />
              )}
            </section>
          </aside>
        </div>
      </main>
    </section>
  );
}

function BalanceStrip({
  overview,
  locale
}: {
  readonly overview: AstrologerFinanceOverviewResponse | null;
  readonly locale: "ru" | "en";
}) {
  const buckets = useMemo(() => {
    const baseBuckets: readonly BalanceMetricViewModel[] = [
      {
        label: "Доступно к выводу",
        value: overview?.balance.available.amountMinor ?? 0,
        tone: "positive",
        note: "можно вывести сейчас"
      },
      {
        label: "В ожидании",
        value: overview?.balance.pending.amountMinor ?? 0,
        tone: "warning",
        note: "окно возврата / сессии"
      },
      {
        label: "Всего за месяц",
        value: overview?.periodSummary.netSalesAmount.amountMinor ?? 0,
        tone: "neutral",
        note: "нетто после комиссии"
      },
      {
        label: "MRR (подписки)",
        value: overview?.periodSummary.recurringRevenueAmount?.amountMinor ?? null,
        tone: "accent",
        note: overview?.periodSummary.recurringRevenueUnavailableReason
          ? "контур подписок не подключен"
          : "рекуррентно"
      }
    ];
    const debtMinor = overview?.balance.negativeBalance.amountMinor ?? 0;
    if (debtMinor <= 0) return baseBuckets;
    return [
      ...baseBuckets,
      {
        label: "Долг",
        value: debtMinor,
        tone: "danger",
        note: "возвраты и chargeback"
      }
    ];
  }, [overview]);

  return (
    <section className={styles.balanceStrip} aria-label="Баланс">
      {buckets.map((bucket) => (
        <div className={styles.balanceMetric} key={bucket.label}>
          <span>{bucket.label}</span>
          <strong className={styles[`balanceMetric_${bucket.tone}`]}>
            {bucket.value === null ? "-" : formatMoneyMinor(bucket.value, "RUB", locale)}
          </strong>
          <small>{bucket.note}</small>
        </div>
      ))}
    </section>
  );
}

function PayoutMethodFormView({
  form,
  isPending,
  isComplete,
  onChange,
  onSubmit
}: {
  readonly form: PayoutMethodForm;
  readonly isPending: boolean;
  readonly isComplete: boolean;
  readonly onChange: (form: PayoutMethodForm) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className={styles.formGrid} onSubmit={onSubmit}>
      <FinanceField label="Название">
        <input
          id="finance-payout-method-display-name"
          name="displayName"
          value={form.displayName}
          placeholder="Основной счет"
          onChange={(event) => onChange({ ...form, displayName: event.target.value })}
        />
      </FinanceField>
      <FinanceField label="Получатель">
        <input
          id="finance-payout-method-recipient-name"
          name="recipientName"
          value={form.recipientName}
          placeholder="Alisa Vega"
          onChange={(event) => onChange({ ...form, recipientName: event.target.value })}
        />
      </FinanceField>
      <FinanceField label="Банк">
        <input
          id="finance-payout-method-bank-name"
          name="bankName"
          value={form.bankName}
          placeholder="T-Bank"
          onChange={(event) => onChange({ ...form, bankName: event.target.value })}
        />
      </FinanceField>
      <FinanceField label="Последние 4 цифры">
        <input
          id="finance-payout-method-account-last4"
          name="accountNumberLast4"
          inputMode="numeric"
          maxLength={4}
          value={form.accountNumberLast4}
          placeholder="4417"
          onChange={(event) =>
            onChange({ ...form, accountNumberLast4: event.target.value.replace(/\D/g, "") })
          }
        />
      </FinanceField>
      <FinanceField label="БИК">
        <input
          id="finance-payout-method-bik"
          name="bik"
          inputMode="numeric"
          value={form.bik}
          placeholder="044525974"
          onChange={(event) => onChange({ ...form, bik: event.target.value.replace(/\D/g, "") })}
        />
      </FinanceField>
      <button className={styles.secondaryButton} type="submit" disabled={!isComplete || isPending}>
        {isPending ? "Сохраняем" : "Сохранить реквизиты"}
      </button>
    </form>
  );
}

function FinanceField({
  label,
  children
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function OperationsPanel({
  operations,
  filter,
  search,
  locale,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onFilterChange,
  onSearchChange,
  onLoadMore
}: {
  readonly operations: readonly LedgerOperation[];
  readonly filter: OperationFilter;
  readonly search: string;
  readonly locale: "ru" | "en";
  readonly isLoading: boolean;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onFilterChange: (filter: OperationFilter) => void;
  readonly onSearchChange: (search: string) => void;
  readonly onLoadMore: () => void;
}) {
  const filteredOperations = operations.filter((operation) => {
    if (!matchesOperationFilter(operation, filter)) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [
      operation.id,
      operation.operationType,
      operation.kind,
      operation.balanceBucket ?? "",
      operation.orderId ?? "",
      operation.payoutRequestId ?? "",
      operationTitle(operation)
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  const totals = filteredOperations.reduce(
    (sum, operation) => {
      const breakdown = operation.amountBreakdown;
      return {
        grossAmountMinor: sum.grossAmountMinor + (breakdown?.grossAmountMinor ?? 0),
        platformFeeAmountMinor:
          sum.platformFeeAmountMinor + (breakdown?.platformFeeAmountMinor ?? 0),
        netAmountMinor:
          sum.netAmountMinor + (breakdown?.netAmountMinor ?? operation.signedAmountMinor)
      };
    },
    { grossAmountMinor: 0, platformFeeAmountMinor: 0, netAmountMinor: 0 }
  );

  return (
    <section className={styles.operationsPanel} aria-label="История операций">
      <div className={styles.operationsHeader}>
        <h2>История операций</h2>
        <div className={styles.operationControls}>
          {operationFilters.map((option) => (
            <button
              key={option.value}
              className={`${styles.chip} ${filter === option.value ? styles.chipActive : ""}`}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
            </button>
          ))}
          <input
            id="finance-operation-search"
            className={styles.searchInput}
            name="operationSearch"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Поиск..."
            aria-label="Поиск операций"
          />
        </div>
      </div>
      <div className={styles.operationTotals}>
        <span>Итого · {filteredOperations.length} операций</span>
        <strong>{formatOptionalSignedMoneyMinor(totals.grossAmountMinor, "RUB", locale)}</strong>
        <strong>
          {totals.platformFeeAmountMinor > 0
            ? `-${formatMoneyMinor(totals.platformFeeAmountMinor, "RUB", locale)}`
            : "-"}
        </strong>
        <strong>{formatSignedMoneyMinor(totals.netAmountMinor, "RUB", locale)}</strong>
      </div>
      <div className={styles.operationTableHead}>
        <span>Операция</span>
        <span>Брутто</span>
        <span>Комиссия</span>
        <span>Нетто</span>
      </div>
      {filteredOperations.length === 0 ? (
        <p className={styles.emptyState}>
          {isLoading ? "Операции загружаются" : "Операций по фильтру нет"}
        </p>
      ) : (
        <div className={styles.operationsTable}>
          {filteredOperations.map((operation) => (
            <div className={styles.operationRow} key={operation.id}>
              <span className={styles.operationTitle}>
                <span className={styles.operationIcon}>
                  <Icon iconName="wallet" width={16} height={16} aria-hidden="true" />
                </span>
                <span>
                  <strong>{operationTitle(operation)}</strong>
                  <small>
                    {formatDate(operation.postedAt)} · {operationSubtitle(operation)} ·{" "}
                    <span className={styles.operationStatus}>
                      {operationStatusLabel(operation)}
                    </span>
                  </small>
                </span>
              </span>
              <strong className={styles.operationAmount}>
                {formatOptionalSignedMoneyMinor(
                  operation.amountBreakdown?.grossAmountMinor ?? null,
                  operation.amount.currency,
                  locale
                )}
              </strong>
              <strong className={styles.operationAmountMuted}>
                {operation.amountBreakdown?.platformFeeAmountMinor
                  ? `-${formatMoneyMinor(
                      operation.amountBreakdown.platformFeeAmountMinor,
                      operation.amount.currency,
                      locale
                    )}`
                  : "-"}
              </strong>
              <strong className={styles.operationAmount}>
                {formatSignedMoneyMinor(
                  operation.amountBreakdown?.netAmountMinor ?? operation.signedAmountMinor,
                  operation.amount.currency,
                  locale
                )}
              </strong>
            </div>
          ))}
        </div>
      )}
      {hasNextPage ? (
        <div className={styles.loadMoreRow}>
          <button
            className={styles.ghostButton}
            type="button"
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
          >
            {isFetchingNextPage ? "Загружаем" : "Загрузить еще"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function PayoutRequestsPanel({
  requests,
  locale
}: {
  readonly requests: readonly PayoutRequestResponse[];
  readonly locale: "ru" | "en";
}) {
  return (
    <section className={styles.panel} aria-label="Заявки на вывод">
      <div className={styles.panelHeader}>
        <h2>Заявки на вывод</h2>
      </div>
      {requests.length === 0 ? (
        <p className={styles.panelHint}>Заявок пока нет</p>
      ) : (
        <div className={styles.payoutRequestList}>
          {requests.map((request) => (
            <article className={styles.payoutRequestRow} key={request.id}>
              <span className={styles.methodIcon}>
                <Icon iconName="wallet" width={15} height={15} aria-hidden="true" />
              </span>
              <span className={styles.payoutRequestMain}>
                <strong>
                  {formatMoneyMinor(request.amount.amountMinor, request.amount.currency, locale)}
                </strong>
                <small>
                  {formatDate(request.requestedAt)} · {shortId(request.id)}
                </small>
              </span>
              <span
                className={`${styles.statusPill} ${
                  styles[`statusPill_${payoutRequestTone(request.status)}`]
                }`}
              >
                {payoutRequestStatusLabel(request.status)}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PlanPanel({
  overview,
  locale
}: {
  readonly overview: AstrologerFinanceOverviewResponse | null;
  readonly locale: "ru" | "en";
}) {
  const plan = overview?.currentPlan ?? null;

  return (
    <section className={styles.panel} aria-label="Тариф">
      <div className={styles.planCardHeader}>
        <h2>{plan ? `Тариф ${plan.name}` : "Тариф"}</h2>
        <span>{plan ? "активен" : "не выбран"}</span>
      </div>
      <div className={styles.planFeeRow}>
        <span>Комиссия платформы</span>
        <strong>{plan ? formatFeeBps(plan.platformFeeBps) : "-"}</strong>
      </div>
      <p className={styles.panelHint}>
        Тариф определяет комиссию, которая вычитается из продаж перед зачислением нетто на баланс.
      </p>
      <small className={styles.planPrice}>
        {plan
          ? `${formatMoneyMinor(plan.monthlyPrice.amountMinor, plan.monthlyPrice.currency, locale)}/мес`
          : "план появится после настройки тарифа"}
      </small>
    </section>
  );
}

function PayoutFact({
  icon,
  label,
  value
}: {
  readonly icon: "wallet" | "clock" | "calendar" | "settings";
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className={styles.payoutFact}>
      <Icon iconName={icon} width={15} height={15} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBanner({
  tone,
  children
}: {
  readonly tone: "neutral" | "danger" | "success";
  readonly children: ReactNode;
}) {
  return (
    <div
      className={`${styles.statusBanner} ${tone === "danger" ? styles.statusBannerDanger : ""} ${
        tone === "success" ? styles.statusBannerSuccess : ""
      }`}
      aria-live="polite"
    >
      {children}
    </div>
  );
}

function resolvePayoutHelpText(
  overview: AstrologerFinanceOverviewResponse | null,
  locale: "ru" | "en"
): string {
  if (!overview) return "Данные загрузятся из финансового API";
  if (overview.payoutRequestUnavailableReason === "payout_method_required") {
    return "Сначала добавьте реквизиты для ручного перевода";
  }
  if (overview.payoutRequestUnavailableReason === "insufficient_available_balance") {
    return `Минимальная сумма ${formatMoneyMinor(
      overview.minimumPayoutAmount.amountMinor,
      overview.minimumPayoutAmount.currency,
      locale
    )}`;
  }
  return "Заявка попадет в админку для ручной выплаты";
}

function toAmountMinor(value: string): number {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return 0;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function createIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function matchesOperationFilter(operation: LedgerOperation, filter: OperationFilter): boolean {
  if (filter === "all") return true;
  return operation.kind === filter;
}

function formatSignedMoneyMinor(amountMinor: number, currency: "RUB", locale: "ru" | "en"): string {
  if (amountMinor === 0) return formatMoneyMinor(0, currency, locale);
  const sign = amountMinor < 0 ? "-" : "";
  return `${sign}${formatMoneyMinor(Math.abs(amountMinor), currency, locale)}`;
}

function formatOptionalSignedMoneyMinor(
  amountMinor: number | null,
  currency: "RUB",
  locale: "ru" | "en"
): string {
  if (amountMinor === null) return "-";
  return formatSignedMoneyMinor(amountMinor, currency, locale);
}

function formatFinanceToolbarMeta(overview: AstrologerFinanceOverviewResponse | null): string {
  const plan = overview?.currentPlan?.name;
  const fee = overview?.currentPlan ? formatFeeBps(overview.currentPlan.platformFeeBps) : null;
  if (plan && fee) return `Тариф ${plan} · комиссия ${fee}`;
  return "Тариф не выбран";
}

function formatFeeBps(value: number): string {
  if (value % 100 === 0) return `${value / 100}%`;
  return `${(value / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

function operationTitle(operation: LedgerOperation): string {
  const metadataTitle = metadataString(operation.metadata, "productTitle");
  if (metadataTitle) return metadataTitle;
  switch (operation.operationType) {
    case "sale_captured":
      return "Оплата консультации";
    case "funds_released":
      return "Средства доступны";
    case "payout_reserved":
    case "payout_paid":
    case "payout_failed":
      return "Выплата на ручной перевод";
    case "refund_recorded":
      return "Возврат клиенту";
    case "chargeback_recorded":
      return "Chargeback";
    case "platform_fee_recorded":
      return "Комиссия платформы";
    case "provider_fee_recorded":
      return "Комиссия провайдера";
    case "hold_created":
      return "Холд средств";
    case "reserve_created":
      return "Резерв";
    case "reserve_released":
      return "Резерв освобожден";
    case "manual_adjustment":
      return "Ручная корректировка";
  }
}

function operationSubtitle(operation: LedgerOperation): string {
  const sourceId = operation.orderId
    ? `заказ ${shortId(operation.orderId)}`
    : operation.payoutRequestId
      ? `заявка ${shortId(operation.payoutRequestId)}`
      : "ledger";
  const bucket = operation.balanceBucket ? ` · ${balanceBucketLabel(operation.balanceBucket)}` : "";
  return `${sourceId}${bucket}`;
}

function operationKindLabel(kind: LedgerOperation["kind"]): string {
  switch (kind) {
    case "sale":
      return "Продажа";
    case "payout":
      return "Выплата";
    case "refund":
      return "Возврат";
    case "adjustment":
      return "Корректировка";
  }
}

function operationStatusLabel(operation: LedgerOperation): string {
  switch (operation.operationType) {
    case "sale_captured":
      return "В ожидании";
    case "funds_released":
      return "Доступно";
    case "payout_reserved":
      return "В выводе";
    case "payout_paid":
      return "Выплачено";
    case "payout_failed":
      return "Ошибка выплаты";
    case "refund_recorded":
      return "Возврат";
    case "chargeback_recorded":
      return "Оспорено";
    case "platform_fee_recorded":
    case "provider_fee_recorded":
    case "hold_created":
    case "reserve_created":
    case "reserve_released":
    case "manual_adjustment":
      return operationKindLabel(operation.kind);
  }
}

function payoutRequestStatusLabel(status: PayoutRequestResponse["status"]): string {
  switch (status) {
    case "requested":
      return "В админке";
    case "under_review":
      return "На проверке";
    case "approved":
      return "Одобрено";
    case "processing_manual":
      return "В ручной выплате";
    case "processing_provider":
      return "У провайдера";
    case "paid":
      return "Выплачено";
    case "failed":
      return "Ошибка";
    case "rejected":
      return "Отклонено";
    case "cancelled":
      return "Отменено";
  }
}

function payoutRequestTone(
  status: PayoutRequestResponse["status"]
): "neutral" | "positive" | "warning" | "danger" {
  switch (status) {
    case "requested":
    case "under_review":
    case "approved":
    case "processing_manual":
    case "processing_provider":
      return "warning";
    case "paid":
      return "positive";
    case "failed":
    case "rejected":
    case "cancelled":
      return "danger";
  }
}

function balanceBucketLabel(bucket: NonNullable<LedgerOperation["balanceBucket"]>): string {
  switch (bucket) {
    case "pending":
      return "в ожидании";
    case "available":
      return "доступно";
    case "reserved":
      return "резерв";
    case "payout_pending":
      return "в выводе";
    case "negative_balance":
      return "долг";
  }
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  }).format(new Date(value));
}

function downloadFinanceReportCsv({
  overview,
  operations,
  locale
}: {
  readonly overview: AstrologerFinanceOverviewResponse | null;
  readonly operations: readonly LedgerOperation[];
  readonly locale: "ru" | "en";
}): void {
  const csv = buildFinanceReportCsv({ overview, operations, locale });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `elevenhouse-finance-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildFinanceReportCsv({
  overview,
  operations,
  locale
}: {
  readonly overview: AstrologerFinanceOverviewResponse | null;
  readonly operations: readonly LedgerOperation[];
  readonly locale: "ru" | "en";
}): string {
  const rows: string[][] = [
    ["Раздел", "Показатель", "Значение"],
    [
      "Баланс",
      "Доступно к выводу",
      formatMoneyMinor(overview?.balance.available.amountMinor ?? 0, "RUB", locale)
    ],
    [
      "Баланс",
      "В ожидании",
      formatMoneyMinor(overview?.balance.pending.amountMinor ?? 0, "RUB", locale)
    ],
    [
      "Баланс",
      "Зарезервировано",
      formatMoneyMinor(overview?.balance.reserved.amountMinor ?? 0, "RUB", locale)
    ],
    [
      "Баланс",
      "В выводе",
      formatMoneyMinor(overview?.balance.payoutPending.amountMinor ?? 0, "RUB", locale)
    ],
    [
      "Баланс",
      "Долг",
      formatMoneyMinor(overview?.balance.negativeBalance.amountMinor ?? 0, "RUB", locale)
    ],
    [
      "Период",
      "Всего за месяц",
      formatMoneyMinor(overview?.periodSummary.netSalesAmount.amountMinor ?? 0, "RUB", locale)
    ],
    [
      "Период",
      "Брутто продаж",
      formatMoneyMinor(overview?.periodSummary.grossSalesAmount.amountMinor ?? 0, "RUB", locale)
    ],
    [
      "Период",
      "Комиссия платформы",
      formatMoneyMinor(overview?.periodSummary.platformFeeAmount.amountMinor ?? 0, "RUB", locale)
    ],
    [
      "Период",
      "MRR",
      overview?.periodSummary.recurringRevenueAmount
        ? formatMoneyMinor(
            overview.periodSummary.recurringRevenueAmount.amountMinor,
            overview.periodSummary.recurringRevenueAmount.currency,
            locale
          )
        : "-"
    ],
    [
      "Тариф",
      overview?.currentPlan ? overview.currentPlan.name : "не определен",
      overview?.currentPlan ? formatFeeBps(overview.currentPlan.platformFeeBps) : "-"
    ],
    [],
    ["Дата", "Операция", "Брутто", "Комиссия", "Нетто", "Источник", "Статус"]
  ];

  for (const operation of operations) {
    rows.push([
      formatDate(operation.postedAt),
      operationTitle(operation),
      formatOptionalSignedMoneyMinor(
        operation.amountBreakdown?.grossAmountMinor ?? null,
        operation.amount.currency,
        locale
      ),
      operation.amountBreakdown?.platformFeeAmountMinor
        ? `-${formatMoneyMinor(operation.amountBreakdown.platformFeeAmountMinor, operation.amount.currency, locale)}`
        : "-",
      formatSignedMoneyMinor(
        operation.amountBreakdown?.netAmountMinor ?? operation.signedAmountMinor,
        operation.amount.currency,
        locale
      ),
      operationSubtitle(operation),
      operationStatusLabel(operation)
    ]);
  }

  return `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
