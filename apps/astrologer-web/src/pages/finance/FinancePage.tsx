import { FormEvent, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AstrologerFinanceOverviewResponse,
  CreateManualBankTransferPayoutMethod,
  CreatePayoutRequest,
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
import styles from "./FinancePage.module.css";

type PayoutMethodForm = {
  readonly displayName: string;
  readonly recipientName: string;
  readonly bankName: string;
  readonly accountNumberLast4: string;
  readonly bik: string;
};

type OperationFilter = "all" | "open" | "processing" | "terminal";

const operationFilters: readonly { readonly value: OperationFilter; readonly label: string }[] = [
  { value: "all", label: "Все" },
  { value: "open", label: "Открытые" },
  { value: "processing", label: "В обработке" },
  { value: "terminal", label: "Закрытые" }
];

export function FinancePage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const financeQuery = useCurrentFinanceOverviewQuery();
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
  const canSubmitPayout =
    Boolean(overview?.canRequestPayout) &&
    toAmountMinor(payoutAmount) > 0 &&
    !payoutRequestMutation.isPending;
  const isMethodFormComplete = Object.values(methodForm).every((value) => value.trim().length > 0);

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
    const amountMinor = toAmountMinor(payoutAmount);
    if (!overview || !canSubmitPayout || amountMinor <= 0) return;

    const body: CreatePayoutRequest = {
      amount: { amountMinor, currency: "RUB" },
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

  return (
    <section className={styles.financePage} aria-labelledby="finance-page-title">
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <h1 id="finance-page-title" className={styles.title}>
            {dictionary.finance.title}
          </h1>
        </div>
        <div className={styles.toolbarMeta}>
          <span>{formatPayoutMethodLine(overview)}</span>
          <button className={styles.ghostButton} type="button" onClick={() => void financeQuery.refetch()}>
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
            requests={overview?.recentPayoutRequests ?? []}
            filter={operationFilter}
            search={operationSearch}
            locale={locale}
            onFilterChange={setOperationFilter}
            onSearchChange={setOperationSearch}
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
                <PayoutFact
                  icon="clock"
                  label="Обработка"
                  value="заявка в админку"
                />
                <PayoutFact
                  icon="calendar"
                  label="Мин. сумма"
                  value={overview ? formatMoneyMinor(
                    overview.minimumPayoutAmount.amountMinor,
                    overview.minimumPayoutAmount.currency,
                    locale
                  ) : "-"}
                />
                <PayoutFact
                  icon="settings"
                  label="Провайдер"
                  value="банк вручную"
                />
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
                          overview ? String(Math.floor(overview.balance.available.amountMinor / 100)) : ""
                        )
                      }
                    >
                      Всё
                    </button>
                  </div>
                </label>
                <button className={styles.primaryButton} type="submit" disabled={!canSubmitPayout}>
                  {payoutRequestMutation.isPending ? "Отправляем" : "Создать заявку"}
                </button>
              </form>
              <p className={styles.panelHint}>{resolvePayoutHelpText(overview, locale)}</p>
            </section>

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
  const buckets = useMemo(
    () => [
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
        label: "Зарезервировано",
        value: overview?.balance.reserved.amountMinor ?? 0,
        tone: "neutral",
        note: "споры и резервы"
      },
      {
        label: "В выводе",
        value: overview?.balance.payoutPending.amountMinor ?? 0,
        tone: "accent",
        note: "ручная обработка"
      }
    ],
    [overview]
  );

  return (
    <section className={styles.balanceStrip} aria-label="Баланс">
      {buckets.map((bucket) => (
        <div className={styles.balanceMetric} key={bucket.label}>
          <span>{bucket.label}</span>
          <strong className={styles[`balanceMetric_${bucket.tone}`]}>
            {formatMoneyMinor(bucket.value, "RUB", locale)}
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
  requests,
  filter,
  search,
  locale,
  onFilterChange,
  onSearchChange
}: {
  readonly requests: readonly PayoutRequestResponse[];
  readonly filter: OperationFilter;
  readonly search: string;
  readonly locale: "ru" | "en";
  readonly onFilterChange: (filter: OperationFilter) => void;
  readonly onSearchChange: (search: string) => void;
}) {
  const filteredRequests = requests.filter((request) => {
    if (!matchesOperationFilter(request, filter)) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${request.id} ${request.status} ${request.method} ${request.externalReference ?? ""}`
      .toLowerCase()
      .includes(query);
  });
  const totalMinor = filteredRequests.reduce((sum, request) => sum - request.amount.amountMinor, 0);

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
            className={styles.searchInput}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Поиск..."
            aria-label="Поиск операций"
          />
        </div>
      </div>
      <div className={styles.operationTotals}>
        <span>Итого · {filteredRequests.length} операций</span>
        <strong>{formatSignedMoneyMinor(totalMinor, "RUB", locale)}</strong>
      </div>
      <div className={styles.operationTableHead}>
        <span>Операция</span>
        <span>Статус</span>
        <span>Сумма</span>
        <span>Дата</span>
      </div>
      {filteredRequests.length === 0 ? (
        <p className={styles.emptyState}>Заявок на вывод по фильтру нет</p>
      ) : (
        <div className={styles.operationsTable}>
          {filteredRequests.map((request) => (
            <div className={styles.operationRow} key={request.id}>
              <span className={styles.operationTitle}>
                <span className={styles.operationIcon}>
                  <Icon iconName="wallet" width={16} height={16} aria-hidden="true" />
                </span>
                <span>
                  <strong>Выплата на {methodDisplayName(request)}</strong>
                  <small>{shortId(request.id)} · {methodLabel(request.method)}</small>
                </span>
              </span>
              <span className={`${styles.statusPill} ${styles[`statusPill_${statusTone(request.status)}`]}`}>
                {formatPayoutStatus(request.status)}
              </span>
              <strong className={styles.operationAmount}>
                {formatSignedMoneyMinor(-request.amount.amountMinor, request.amount.currency, locale)}
              </strong>
              <time dateTime={request.requestedAt}>{formatDate(request.requestedAt)}</time>
            </div>
          ))}
        </div>
      )}
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

function formatPayoutStatus(status: PayoutRequestResponse["status"]): string {
  switch (status) {
    case "requested":
      return "Новая";
    case "under_review":
      return "На проверке";
    case "approved":
      return "Одобрена";
    case "processing_manual":
      return "В ручной выплате";
    case "processing_provider":
      return "В провайдере";
    case "paid":
      return "Выплачена";
    case "failed":
      return "Ошибка";
    case "rejected":
      return "Отклонена";
    case "cancelled":
      return "Отменена";
  }
}

function matchesOperationFilter(
  request: PayoutRequestResponse,
  filter: OperationFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "open") {
    return request.status === "requested" || request.status === "under_review" || request.status === "approved";
  }
  if (filter === "processing") {
    return request.status === "processing_manual" || request.status === "processing_provider";
  }
  return (
    request.status === "paid" ||
    request.status === "failed" ||
    request.status === "rejected" ||
    request.status === "cancelled"
  );
}

function formatSignedMoneyMinor(
  amountMinor: number,
  currency: "RUB",
  locale: "ru" | "en"
): string {
  if (amountMinor === 0) return formatMoneyMinor(0, currency, locale);
  const sign = amountMinor < 0 ? "-" : "+";
  return `${sign}${formatMoneyMinor(Math.abs(amountMinor), currency, locale)}`;
}

function formatPayoutMethodLine(overview: AstrologerFinanceOverviewResponse | null): string {
  const method = overview?.defaultPayoutMethod?.displayName ?? "реквизиты не добавлены";
  return `Вывод · ${method}`;
}

function methodDisplayName(request: PayoutRequestResponse): string {
  return request.method === "manual_bank_transfer" ? "ручной перевод" : "Arc Pay";
}

function methodLabel(method: PayoutRequestResponse["method"]): string {
  return method === "manual_bank_transfer" ? "ручной банк" : "Arc Pay";
}

function statusTone(status: PayoutRequestResponse["status"]): "neutral" | "positive" | "warning" | "danger" {
  if (status === "paid") return "positive";
  if (status === "failed" || status === "rejected" || status === "cancelled") return "danger";
  if (status === "processing_manual" || status === "processing_provider") return "warning";
  return "neutral";
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
