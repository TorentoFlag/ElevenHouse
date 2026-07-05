import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type {
  AstrologerProfileResponse,
  BillingOverviewResponse,
  PlatformPlanFeatureCode,
  PlatformPlanResponse,
  UpsertAstrologerProfileRequest
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { ProfileSettingsForm } from "../../features/astrologer-profile/ui/ProfileSettingsForm";
import { SettingsNavigation, type SettingsSection } from "./components/SettingsNavigation";
import styles from "./SettingsPage.module.css";

export type SettingsPageViewProps = {
  readonly locale: SupportedLocale;
  readonly title: string;
  readonly profile: AstrologerProfileResponse | null;
  readonly billingOverview: BillingOverviewResponse | null;
  readonly selectedBillingCycle: "month" | "year" | null;
  readonly activeSectionId: SettingsSection["id"];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isBillingLoading: boolean;
  readonly isBillingError: boolean;
  readonly isSavingProfile: boolean;
  readonly saveStatus: "saved" | null;
  readonly onSectionChange: (sectionId: SettingsSection["id"]) => void;
  readonly onBillingCycleChange: (billingCycle: "month" | "year") => void;
  readonly onSaveProfile: (body: UpsertAstrologerProfileRequest) => void;
};

const supportedSections = [
  {
    id: "profile",
    title: "Профиль",
    description: "Публичные данные, ссылка и видимость страницы",
    iconName: "layoutGrid",
    disabled: false
  },
  {
    id: "billing",
    title: "Тариф и оплата",
    description: "План, комиссия и платежные документы",
    iconName: "wallet",
    disabled: false
  },
  {
    id: "verification",
    title: "Верификация",
    description: "Появится после Verification workflow",
    iconName: "check",
    disabled: true
  },
  {
    id: "notifications",
    title: "Уведомления",
    description: "Появится после NotificationPreferences",
    iconName: "bell",
    disabled: true
  },
  {
    id: "loyalty",
    title: "Лояльность",
    description: "Появится после Loyalty domain",
    iconName: "sparkle",
    disabled: true
  },
  {
    id: "integrations",
    title: "Интеграции",
    description: "Появится после Integrations API",
    iconName: "flow",
    disabled: true
  },
  {
    id: "security",
    title: "Безопасность",
    description: "Появится после security settings API",
    iconName: "verified",
    disabled: true
  },
  {
    id: "privacy",
    title: "Приватность",
    description: "Появится после Consent/Privacy settings",
    iconName: "reference",
    disabled: true
  },
  {
    id: "referral",
    title: "Рефералы",
    description: "Появится после Referral domain",
    iconName: "plus",
    disabled: true
  }
] satisfies SettingsSection[];

export function SettingsPageView({
  locale,
  title,
  profile,
  billingOverview,
  selectedBillingCycle,
  activeSectionId,
  isLoading,
  isError,
  isBillingLoading,
  isBillingError,
  isSavingProfile,
  saveStatus,
  onSectionChange,
  onBillingCycleChange,
  onSaveProfile
}: SettingsPageViewProps) {
  const publicHandle = profile?.publicHandle;

  return (
    <section className={styles.settingsPage} aria-labelledby="settings-page-title">
      <header className={styles.subhead}>
        <div className={styles.titleGroup}>
          <span className={styles.titleIcon}>
            <Icon iconName="orbit" width={18} height={18} aria-hidden="true" />
          </span>
          <h1 id="settings-page-title" className={styles.title}>
            {title}
          </h1>
        </div>
        {publicHandle ? (
          <a
            className={styles.previewButton}
            href={`https://elevenhouse.app/${publicHandle}`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon iconName="chevronRight" width={15} height={15} aria-hidden="true" />
            Превью глазами клиента
          </a>
        ) : null}
      </header>

      {isLoading ? <StatusBanner tone="neutral">Загружаем профиль</StatusBanner> : null}
      {saveStatus === "saved" && !isError ? (
        <StatusBanner tone="success">Профиль сохранён</StatusBanner>
      ) : null}
      {isError ? (
        <StatusBanner tone="danger">
          Не удалось синхронизировать профиль. Проверьте соединение и повторите сохранение.
        </StatusBanner>
      ) : null}
      {isBillingError ? (
        <StatusBanner tone="danger">
          Не удалось загрузить тариф и платежные данные. Повторите попытку позже.
        </StatusBanner>
      ) : null}

      <div className={styles.body}>
        <SettingsNavigation
          sections={supportedSections}
          activeSectionId={activeSectionId}
          onSectionChange={onSectionChange}
        />
        <main className={styles.content}>
          {activeSectionId === "profile" ? (
            <ProfileSettingsForm
              locale={locale}
              profile={profile}
              isSaving={isSavingProfile}
              onSave={onSaveProfile}
            />
          ) : null}
          {activeSectionId === "billing"
            ? renderBillingSettingsPanel({
                billingOverview,
                isLoading: isBillingLoading,
                selectedBillingCycle,
                onBillingCycleChange
              })
            : null}
        </main>
      </div>
    </section>
  );
}

function StatusBanner({
  tone,
  children
}: {
  readonly tone: "neutral" | "danger" | "success";
  readonly children: React.ReactNode;
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

function renderBillingSettingsPanel({
  billingOverview,
  isLoading,
  selectedBillingCycle,
  onBillingCycleChange
}: {
  readonly billingOverview: BillingOverviewResponse | null;
  readonly isLoading: boolean;
  readonly selectedBillingCycle: "month" | "year" | null;
  readonly onBillingCycleChange: (billingCycle: "month" | "year") => void;
}) {
  if (isLoading) {
    return <StatusBanner tone="neutral">Загружаем тариф и платежные данные</StatusBanner>;
  }

  if (!billingOverview) {
    return (
      <section className={styles.billingPanel} aria-label="Тариф и оплата">
        <div className={styles.billingEmptyState}>
          <Icon iconName="wallet" width={22} height={22} aria-hidden="true" />
          <strong>Тариф пока недоступен</strong>
          <span>Данные появятся после синхронизации с billing API.</span>
        </div>
      </section>
    );
  }

  const currentPlanId = billingOverview.currentSubscription?.planId ?? "start";
  const currentPlan =
    billingOverview.plans.find((plan) => plan.id === currentPlanId) ?? billingOverview.plans[0];
  const billingCycle =
    selectedBillingCycle ??
    billingOverview.currentSubscription?.billingCycle ??
    billingOverview.billingCycle;

  return (
    <section className={styles.billingPanel} aria-label="Тариф и оплата">
      {billingOverview.provider.status === "not_configured" ? (
        <div className={styles.billingProviderNotice}>
          <Icon iconName="wallet" width={18} height={18} aria-hidden="true" />
          <span>
            <strong>Платежный провайдер пока не настроен</strong>
            <em>
              Тарифы доступны для просмотра, изменения тарифа и карты будут включены через ArcPay.
            </em>
          </span>
        </div>
      ) : null}

      {renderBillingGroup({
        title: "Текущий тариф",
        hint: "Оплата за подписку плюс комиссия сервиса с продаж через платформу.",
        children: (
          <>
            <div className={styles.currentPlanSummary}>
              <span className={styles.currentPlanIcon}>
                <Icon iconName="wallet" width={22} height={22} aria-hidden="true" />
              </span>
              <span className={styles.currentPlanText}>
                <strong>
                  {currentPlan?.name ?? "Старт"} · {billingCycle === "year" ? "год" : "месяц"}
                </strong>
                <em>
                  {`Комиссия ${formatFee(currentPlan?.platformFeeBps ?? 0)}`}
                  {billingOverview.currentSubscription?.currentPeriodEndsAt
                    ? ` · следующее списание ${formatDate(
                        billingOverview.currentSubscription.currentPeriodEndsAt
                      )}`
                    : " · без следующего списания"}
                </em>
              </span>
              <span className={styles.currentPlanStatus}>
                {billingOverview.currentSubscription?.status === "active" ? "Активен" : "Старт"}
              </span>
            </div>

            <div className={styles.billingCycleSegment} aria-label="Период оплаты">
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
                Год · -20%
              </button>
            </div>

            <div className={styles.planGrid}>
              {billingOverview.plans.map((plan) => (
                <article
                  key={plan.id}
                  className={`${styles.planCard} ${
                    plan.id === currentPlan?.id ? styles.planCardCurrent : ""
                  }`}
                >
                  <header className={styles.planCardHeader}>
                    <span>
                      <strong>{plan.name}</strong>
                      <em>{plan.tagline}</em>
                    </span>
                    {plan.isPopular ? <b>Хит</b> : null}
                  </header>
                  <div className={styles.planPrice}>
                    <strong>{formatPlanPrice(plan, billingCycle)}</strong>
                    {plan.monthlyPriceMinor > 0 ? <span>/мес</span> : null}
                  </div>
                  <p className={styles.planFee}>{`Комиссия ${formatFee(plan.platformFeeBps)}`}</p>
                  <div className={styles.planFeatureList}>
                    {plan.features.slice(0, 8).map((feature) => (
                      <span key={feature}>
                        <Icon iconName="check" width={13} height={13} aria-hidden="true" />
                        {featureLabel(feature)}
                      </span>
                    ))}
                  </div>
                  <button
                    className={
                      plan.id === currentPlan?.id ? styles.planGhostButton : styles.planButton
                    }
                    type="button"
                    disabled
                  >
                    {plan.id === currentPlan?.id ? "Текущий" : "Выбрать"}
                  </button>
                </article>
              ))}
            </div>
          </>
        )
      })}

      {renderBillingGroup({
        title: "Способ оплаты",
        children: billingOverview.paymentMethod ? (
          <div className={styles.billingRow}>
            <Icon iconName="wallet" width={17} height={17} aria-hidden="true" />
            <span>
              <strong>
                {billingOverview.paymentMethod.brand} ···· {billingOverview.paymentMethod.last4}
              </strong>
              <em>до {billingOverview.paymentMethod.expiresAt}</em>
            </span>
            <button className={styles.planGhostButton} type="button" disabled>
              Изменить
            </button>
          </div>
        ) : (
          <div className={styles.billingRow}>
            <Icon iconName="wallet" width={17} height={17} aria-hidden="true" />
            <span>
              <strong>Способ оплаты не добавлен</strong>
              <em>Добавление карты появится после подключения ArcPay.</em>
            </span>
            <button className={styles.planGhostButton} type="button" disabled>
              Добавить
            </button>
          </div>
        )
      })}

      {renderBillingGroup({
        title: "История списаний",
        children:
          billingOverview.invoices.length > 0 ? (
            <div className={styles.invoiceList}>
              {billingOverview.invoices.map((invoice) => (
                <div key={invoice.id} className={styles.billingRow}>
                  <span>
                    <strong>{planName(billingOverview.plans, invoice.planId)}</strong>
                    <em>{formatDate(invoice.issuedAt)}</em>
                  </span>
                  <b>{formatMoney(invoice.amountMinor, invoice.currency)}</b>
                  <i>{invoice.status === "paid" ? "Оплачено" : "Ожидает"}</i>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.billingEmptyRow}>Пока нет списаний</div>
          )
      })}
    </section>
  );
}

function renderBillingGroup({
  title,
  hint,
  children
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}): React.ReactNode {
  return (
    <section className={styles.settingsGroup}>
      <h2>{title}</h2>
      {hint ? <p>{hint}</p> : null}
      {children}
    </section>
  );
}

function formatPlanPrice(plan: PlatformPlanResponse, billingCycle: "month" | "year"): string {
  if (plan.monthlyPriceMinor === 0) {
    return "Бесплатно";
  }

  const monthlyEquivalent =
    billingCycle === "year" ? Math.round(plan.yearlyPriceMinor / 12) : plan.monthlyPriceMinor;

  return formatMoney(monthlyEquivalent, plan.currency);
}

function formatMoney(amountMinor: number, currency: "RUB"): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amountMinor / 100);
}

function formatFee(platformFeeBps: number): string {
  return `${platformFeeBps / 100}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function planName(plans: readonly PlatformPlanResponse[], planId: string): string {
  return plans.find((plan) => plan.id === planId)?.name ?? planId;
}

function featureLabel(feature: PlatformPlanFeatureCode): string {
  return featureLabels[feature] ?? feature;
}

const featureLabels: Partial<Record<PlatformPlanFeatureCode, string>> = {
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
