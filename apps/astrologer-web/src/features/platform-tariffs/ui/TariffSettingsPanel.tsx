import type {
  AstrologerTariffCatalogResponse,
  AstrologerTariffResponse,
  StartAstrologerTariffSubscriptionResponse
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import styles from "../../../pages/settings/SettingsPage.module.css";
import { TariffPaymentWorkflow } from "./TariffPaymentWorkflow";

export type TariffSettingsPanelProps = {
  readonly catalog: AstrologerTariffCatalogResponse | null;
  readonly locale?: "ru" | "en";
  readonly billingCycle: "month" | "year";
  readonly selectionResult: StartAstrologerTariffSubscriptionResponse | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isSelecting: boolean;
  readonly onBillingCycleChange: (billingCycle: "month" | "year") => void;
  readonly onSelectTariff: (
    tariff: AstrologerTariffResponse,
    billingCycle: "month" | "year"
  ) => void;
};

export function TariffSettingsPanel({
  catalog,
  locale = "ru",
  billingCycle,
  isLoading,
  isError,
  isSelecting,
  onBillingCycleChange,
  onSelectTariff
}: TariffSettingsPanelProps) {
  if (isLoading) {
    return <StatusNotice tone="neutral">Загружаем тарифы</StatusNotice>;
  }

  if (isError) {
    return (
      <StatusNotice tone="danger">
        Не удалось загрузить тарифы. Повторите попытку позже.
      </StatusNotice>
    );
  }

  if (!catalog || catalog.tariffs.length === 0) {
    return (
      <section className={styles.billingPanel} aria-label="Тариф и оплата">
        <div className={styles.billingEmptyState}>
          <Icon iconName="wallet" width={22} height={22} aria-hidden="true" />
          <strong>Тарифы пока недоступны</strong>
          <span>Опубликованные тарифы появятся здесь после настройки в админке.</span>
        </div>
      </section>
    );
  }

  const current = catalog.currentSubscription;
  const currentTariff = current
    ? catalog.tariffs.find(
        (tariff) =>
          tariff.tariffSeriesId === current.tariffSeriesId && tariff.version === current.tariffVersion
      ) ?? null
    : null;
  const tariffs = [...catalog.tariffs].sort((left, right) => left.displayOrder - right.displayOrder);
  const annualDiscount = annualDiscountPercent(tariffs);
  return (
    <section className={styles.billingPanel} aria-label="Тариф и оплата">
      {current?.state === "awaiting_initial_payment" ? (
        <StatusNotice tone="neutral">Ожидается подтверждение первого списания</StatusNotice>
      ) : null}
      {current?.state === "past_due" ? (
        <StatusNotice tone="danger">
          Не удалось подтвердить очередное списание по тарифу
        </StatusNotice>
      ) : null}

      <section className={styles.settingsGroup}>
        <h2>Текущий тариф</h2>
        <p>Оплата за подписку + комиссия сервиса с продаж через платформу.</p>
        {current ? (
          <div className={styles.currentPlanSummary}>
            <span className={styles.currentPlanIcon}>
              <Icon iconName="wallet" width={22} height={22} aria-hidden="true" />
            </span>
            <span className={styles.currentPlanText}>
              <strong>
                {currentTariff
                  ? `${currentTariff.name} · ${current.billingCycle === "year" ? "год" : "месяц"}`
                  : "Текущий тариф"}
              </strong>
              <em>
                {currentTariff
                  ? `Комиссия сервиса ${formatCommission(currentTariff.clientSaleCommissionBps)}${current.endsAt ? ` · следующее списание ${formatBillingDate(current.endsAt)}` : ""}`
                  : "Условия текущего тарифа загружаются из опубликованного каталога."}
              </em>
            </span>
            <span className={styles.currentPlanStatus}>
              {current.state === "active" ? "Активен" : stateLabel(current.state)}
            </span>
          </div>
        ) : null}
        <div className={styles.billingCycleSegment} aria-label="Период тарифа">
          <button
            className={billingCycle === "month" ? styles.billingCycleActive : ""}
            type="button"
            aria-pressed={billingCycle === "month"}
            onClick={() => onBillingCycleChange("month")}
          >
            Помесячно
          </button>
          <button
            className={billingCycle === "year" ? styles.billingCycleActive : ""}
            type="button"
            aria-pressed={billingCycle === "year"}
            onClick={() => onBillingCycleChange("year")}
          >
            {annualDiscount ? `Год · −${annualDiscount}%` : "Год"}
          </button>
        </div>
        <div className={styles.planGrid}>
          {tariffs.map((tariff) => {
            const isCurrent =
              current?.tariffSeriesId === tariff.tariffSeriesId &&
              current.tariffVersion === tariff.version;
            const selectionBlocked = current !== null;
            return (
              <article
                key={`${tariff.tariffSeriesId}:${tariff.version}`}
                className={`${styles.planCard} ${isCurrent ? styles.planCardCurrent : ""}`}
              >
                <header className={styles.planCardHeader}>
                  <span>
                    <strong>{tariff.name}</strong>
                    <em>{tariff.tagline}</em>
                  </span>
                  {tariff.isPopular ? <b>Хит</b> : null}
                </header>
                <div className={styles.planPrice}>
                  <strong>{formatPrice(tariff, billingCycle)}</strong>
                  <span>{billingCycle === "year" ? "/год" : "/мес"}</span>
                </div>
                <p className={styles.planFee}>
                  Комиссия {formatCommission(tariff.clientSaleCommissionBps)}
                </p>
                <div className={styles.planFeatureList}>
                  {tariff.features.slice(0, 8).map((feature) => (
                    <span key={feature}>
                      <Icon iconName="check" width={13} height={13} aria-hidden="true" />
                      {featureLabel(feature)}
                    </span>
                  ))}
                </div>
                {isCurrent ? (
                  <button className={styles.planGhostButton} type="button" disabled>
                    Текущий
                  </button>
                ) : (
                  <button
                    className={styles.planButton}
                    type="button"
                    disabled={selectionBlocked || isSelecting}
                    onClick={() => onSelectTariff(tariff, billingCycle)}
                  >
                    {isSelecting ? "Сохраняем…" : "Выбрать"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.settingsGroup}>
        <h2>Способ оплаты</h2>
        {current?.state === "incomplete_setup" || current?.state === "awaiting_initial_payment" ? (
          <TariffPaymentWorkflow subscription={current} locale={locale} />
        ) : catalog.paymentMethod ? (
          <div className={styles.billingRow}>
            <Icon iconName="wallet" width={18} height={18} aria-hidden="true" />
            <span>
              <strong>Карта ···· {catalog.paymentMethod.last4}</strong>
              <em>до {formatCardExpiry(catalog.paymentMethod)}</em>
            </span>
          </div>
        ) : (
          <div className={styles.billingEmptyRow}>Нет привязанных способов оплаты</div>
        )}
      </section>

      <section className={styles.settingsGroup}>
        <h2>История списаний</h2>
        {catalog.recentInvoices.length === 0 ? (
          <div className={styles.billingEmptyRow}>
            История станет доступна после первого подтверждённого списания.
          </div>
        ) : (
          <div className={styles.invoiceList}>
            {catalog.recentInvoices.map((invoice) => {
              const invoiceTariff = tariffs.find(
                (tariff) =>
                  tariff.tariffSeriesId === invoice.tariffSeriesId && tariff.version === invoice.tariffVersion
              );
              return (
                <div key={invoice.invoiceId} className={styles.invoiceRow}>
                  <span>
                    <strong>{`${invoiceTariff?.name ?? "Тариф"} · ${current?.billingCycle === "year" ? "год" : "месяц"}`}</strong>
                    <em>{formatBillingDate(invoice.capturedAt)}</em>
                  </span>
                  <b>{formatMoney(invoice.amountMinor)}</b>
                  <i>Оплачено</i>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function StatusNotice({
  tone,
  children
}: {
  readonly tone: "neutral" | "danger" | "warning";
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className={`${styles.billingProviderNotice} ${tone === "danger" ? styles.statusBannerDanger : ""}`}
      aria-live="polite"
    >
      <Icon iconName="wallet" width={18} height={18} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function formatPrice(tariff: AstrologerTariffResponse, billingCycle: "month" | "year"): string {
  const amountMinor = billingCycle === "month" ? tariff.monthlyPriceMinor : tariff.yearlyPriceMinor;
  if (amountMinor === 0) return "Бесплатно";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(amountMinor / 100);
}

function formatCommission(bps: number): string {
  return `${bps / 100}%`;
}

function formatCardExpiry(paymentMethod: NonNullable<AstrologerTariffCatalogResponse["paymentMethod"]>): string {
  return `${String(paymentMethod.expiryMonth).padStart(2, "0")}/${String(paymentMethod.expiryYear).slice(-2)}`;
}

function annualDiscountPercent(tariffs: readonly AstrologerTariffResponse[]): number | null {
  const paidTariffs = tariffs.filter((tariff) => tariff.monthlyPriceMinor > 0 && tariff.yearlyPriceMinor > 0);
  if (paidTariffs.length === 0) return null;
  const values = paidTariffs.map((tariff) =>
    Math.round((1 - tariff.yearlyPriceMinor / (tariff.monthlyPriceMinor * 12)) * 100)
  );
  return values.every((value) => value > 0 && value === values[0]) ? values[0]! : null;
}

function formatBillingDate(value: string): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).formatToParts(new Date(value));
  return parts
    .filter((part) => part.type === "day" || part.type === "month" || part.type === "year")
    .map((part) => part.value)
    .join(" ");
}

function formatMoney(amountMinor: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(amountMinor / 100);
}

function stateLabel(state: NonNullable<AstrologerTariffCatalogResponse["currentSubscription"]>["state"]): string {
  if (state === "incomplete_setup") return "Привязка карты";
  if (state === "awaiting_initial_payment") return "Ожидает списания";
  if (state === "past_due") return "Требует оплаты";
  if (state === "cancelled") return "Отменён";
  return "Истёк";
}

function featureLabel(feature: AstrologerTariffResponse["features"][number]): string {
  return featureLabels[feature] ?? feature;
}

const featureLabels: Partial<Record<AstrologerTariffResponse["features"][number], string>> = {
  engine: "Движок карт",
  pdf: "PDF-отчеты",
  natal: "Натальная карта",
  synastry: "Синастрия",
  forecast: "Прогнозы",
  page: "Личная страница",
  products: "Конструктор продуктов",
  calendar: "Календарь",
  crm: "CRM",
  funnels: "Воронки",
  ai: "AI-трактовки",
  content: "Контент",
  analytics: "Аналитика",
  refs: "Справочник",
  team: "Команда",
  whitelabel: "White-label",
  api: "API-доступ",
  priority: "Приоритетная поддержка"
};
