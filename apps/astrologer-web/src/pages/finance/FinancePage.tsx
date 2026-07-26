import { FormEvent, useMemo, useState, type ReactNode } from "react";
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

export function FinancePage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const financeQuery = useCurrentFinanceOverviewQuery();
  const payoutMethodMutation = useCreateManualPayoutMethodMutation();
  const payoutRequestMutation = useCreatePayoutRequestMutation();
  const [methodForm, setMethodForm] = useState<PayoutMethodForm>({
    displayName: "",
    recipientName: "",
    bankName: "",
    accountNumberLast4: "",
    bik: ""
  });
  const [payoutAmount, setPayoutAmount] = useState("");
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

  return (
    <section className={styles.financePage} aria-labelledby="finance-page-title">
      <header className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <span className={styles.titleIcon}>
            <Icon iconName="wallet" width={18} height={18} aria-hidden="true" />
          </span>
          <h1 id="finance-page-title" className={styles.title}>
            {dictionary.finance.title}
          </h1>
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
          <section className={styles.panel} aria-label="Заявка на вывод">
            <div className={styles.panelHeader}>
              <span className={styles.panelIcon}>
                <Icon iconName="wallet" width={18} height={18} aria-hidden="true" />
              </span>
              <div>
                <h2>Вывод средств</h2>
                <p>{resolvePayoutHelpText(overview)}</p>
              </div>
            </div>
            <form className={styles.form} onSubmit={handlePayoutSubmit}>
              <label className={styles.field}>
                <span>Сумма вывода</span>
                <input
                  inputMode="decimal"
                  value={payoutAmount}
                  placeholder="5000"
                  onChange={(event) => setPayoutAmount(event.target.value)}
                />
              </label>
              <button className={styles.primaryButton} type="submit" disabled={!canSubmitPayout}>
                {payoutRequestMutation.isPending ? "Отправляем" : "Создать заявку"}
              </button>
            </form>
          </section>

          <section className={styles.panel} aria-label="Реквизиты вывода">
            <div className={styles.panelHeader}>
              <span className={styles.panelIcon}>
                <Icon iconName="settings" width={18} height={18} aria-hidden="true" />
              </span>
              <div>
                <h2>Реквизиты</h2>
                <p>
                  {overview?.defaultPayoutMethod?.displayName ?? "Добавьте счет для ручного вывода"}
                </p>
              </div>
            </div>
            {overview?.defaultPayoutMethod ? (
              <div className={styles.methodSummary}>
                <strong>{overview.defaultPayoutMethod.displayName}</strong>
                <span>Ручной банковский перевод</span>
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
        </div>

        <PayoutRequestsTable requests={overview?.recentPayoutRequests ?? []} locale={locale} />
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
      { label: "Доступно", value: overview?.balance.available.amountMinor ?? 0 },
      { label: "На холде", value: overview?.balance.pending.amountMinor ?? 0 },
      { label: "Зарезервировано", value: overview?.balance.reserved.amountMinor ?? 0 },
      { label: "В выводе", value: overview?.balance.payoutPending.amountMinor ?? 0 }
    ],
    [overview]
  );

  return (
    <section className={styles.balanceStrip} aria-label="Баланс">
      {buckets.map((bucket) => (
        <div className={styles.balanceMetric} key={bucket.label}>
          <span>{bucket.label}</span>
          <strong>{formatMoneyMinor(bucket.value, "RUB", locale)}</strong>
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
          value={form.displayName}
          placeholder="Основной счет"
          onChange={(event) => onChange({ ...form, displayName: event.target.value })}
        />
      </FinanceField>
      <FinanceField label="Получатель">
        <input
          value={form.recipientName}
          placeholder="Alisa Vega"
          onChange={(event) => onChange({ ...form, recipientName: event.target.value })}
        />
      </FinanceField>
      <FinanceField label="Банк">
        <input
          value={form.bankName}
          placeholder="T-Bank"
          onChange={(event) => onChange({ ...form, bankName: event.target.value })}
        />
      </FinanceField>
      <FinanceField label="Последние 4 цифры">
        <input
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

function PayoutRequestsTable({
  requests,
  locale
}: {
  readonly requests: readonly PayoutRequestResponse[];
  readonly locale: "ru" | "en";
}) {
  return (
    <section className={styles.requestsPanel} aria-label="Последние заявки">
      <div className={styles.requestsHeader}>
        <h2>Последние заявки</h2>
        <span>{requests.length}</span>
      </div>
      {requests.length === 0 ? (
        <p className={styles.emptyState}>Заявок на вывод пока нет</p>
      ) : (
        <div className={styles.requestsTable}>
          {requests.map((request) => (
            <div className={styles.requestRow} key={request.id}>
              <span>{formatPayoutStatus(request.status)}</span>
              <strong>
                {formatMoneyMinor(request.amount.amountMinor, request.amount.currency, locale)}
              </strong>
              <time dateTime={request.requestedAt}>{formatDate(request.requestedAt)}</time>
            </div>
          ))}
        </div>
      )}
    </section>
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

function resolvePayoutHelpText(overview: AstrologerFinanceOverviewResponse | null): string {
  if (!overview) return "Данные загрузятся из финансового API";
  if (overview.payoutRequestUnavailableReason === "payout_method_required") {
    return "Сначала добавьте реквизиты для ручного перевода";
  }
  if (overview.payoutRequestUnavailableReason === "insufficient_available_balance") {
    return `Минимальная сумма ${formatMoneyMinor(
      overview.minimumPayoutAmount.amountMinor,
      overview.minimumPayoutAmount.currency,
      "ru"
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  }).format(new Date(value));
}
