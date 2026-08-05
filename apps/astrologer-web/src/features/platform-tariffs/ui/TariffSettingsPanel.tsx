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
  selectionResult,
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
  return (
    <section className={styles.billingPanel} aria-label="Тариф и оплата">
      {selectionResult?.nextAction === "saved_card_setup_required" ? (
        <StatusNotice tone="warning">
          Тариф выбран. Для завершения потребуется защищённая привязка карты.
        </StatusNotice>
      ) : null}
      {current?.state === "incomplete_setup" ? (
        <StatusNotice tone="warning">Ожидается защищённая привязка карты</StatusNotice>
      ) : null}
      {current?.state === "awaiting_initial_payment" ? (
        <StatusNotice tone="neutral">Ожидается подтверждение первого списания</StatusNotice>
      ) : null}
      {current?.state === "past_due" ? (
        <StatusNotice tone="danger">
          Не удалось подтвердить очередное списание по тарифу
        </StatusNotice>
      ) : null}
      {current?.state === "incomplete_setup" || current?.state === "awaiting_initial_payment" ? (
        <TariffPaymentWorkflow subscription={current} locale={locale} />
      ) : null}

      <section className={styles.settingsGroup}>
        <h2>Тариф и комиссия</h2>
        <p>Тариф определяет комиссию ElevenHouse с клиентских продаж через платформу.</p>
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
            Год
          </button>
        </div>
        <div className={styles.planGrid}>
          {catalog.tariffs.map((tariff) => {
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
                  Комиссия ElevenHouse {formatCommission(tariff.clientSaleCommissionBps)}
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
                    Текущий выбор
                  </button>
                ) : (
                  <button
                    className={styles.planButton}
                    type="button"
                    disabled={selectionBlocked || isSelecting}
                    onClick={() => onSelectTariff(tariff, billingCycle)}
                  >
                    {isSelecting ? "Сохраняем…" : "Выбрать тариф"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
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
