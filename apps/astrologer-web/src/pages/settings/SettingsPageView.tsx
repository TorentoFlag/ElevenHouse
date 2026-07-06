import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type {
  AstrologerProfileIntegrityIssueResponse,
  AstrologerProfileResponse,
  BillingIntegrityIssueResponse,
  BillingOverviewResponse,
  GetAstrologerVerificationResponse,
  PlatformPlanFeatureCode,
  PlatformPlanResponse,
  SubmitAstrologerVerificationRequest,
  UpsertAstrologerProfileRequest
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { ProfileSettingsForm } from "../../features/astrologer-profile/ui/ProfileSettingsForm";
import { VerificationSettingsPanel } from "../../features/verification/ui/VerificationSettingsPanel";
import { SettingsNavigation, type SettingsSection } from "./components/SettingsNavigation";
import styles from "./SettingsPage.module.css";

export type SettingsPageViewProps = {
  readonly locale: SupportedLocale;
  readonly title: string;
  readonly profile: AstrologerProfileResponse | null;
  readonly profileIntegrityIssues: readonly AstrologerProfileIntegrityIssueResponse[];
  readonly billingOverview: BillingOverviewResponse | null;
  readonly verification?: GetAstrologerVerificationResponse | null;
  readonly selectedBillingCycle: "month" | "year" | null;
  readonly activeSectionId: SettingsSection["id"];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isBillingLoading: boolean;
  readonly isBillingError: boolean;
  readonly isVerificationLoading?: boolean;
  readonly isVerificationError?: boolean;
  readonly isSavingProfile: boolean;
  readonly isSubmittingVerification?: boolean;
  readonly saveStatus: "saved" | null;
  readonly verificationSubmitStatus?: "submitted" | null;
  readonly onSectionChange: (sectionId: SettingsSection["id"]) => void;
  readonly onBillingCycleChange: (billingCycle: "month" | "year") => void;
  readonly onProfileDirtyChange: (isDirty: boolean) => void;
  readonly onSaveProfile: (body: UpsertAstrologerProfileRequest) => void;
  readonly onSubmitVerification?: (body: SubmitAstrologerVerificationRequest) => void;
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
    description: "Документы и статус доверия",
    iconName: "check",
    disabled: false
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
  profileIntegrityIssues,
  billingOverview,
  verification = null,
  selectedBillingCycle,
  activeSectionId,
  isLoading,
  isError,
  isBillingLoading,
  isBillingError,
  isVerificationLoading = false,
  isVerificationError = false,
  isSavingProfile,
  isSubmittingVerification = false,
  saveStatus,
  verificationSubmitStatus = null,
  onSectionChange,
  onBillingCycleChange,
  onProfileDirtyChange,
  onSaveProfile,
  onSubmitVerification = noopSubmitVerification
}: SettingsPageViewProps) {
  const canEditProfile = !isLoading && !isError;

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
      {profileIntegrityIssues.length > 0 && !isError ? (
        <StatusBanner tone="warning">
          Медиа профиля требует проверки. Загрузите аватар или обложку заново, если изображение не
          отображается.
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
          {activeSectionId === "profile" && canEditProfile ? (
            <ProfileSettingsForm
              locale={locale}
              profile={profile}
              isSaving={isSavingProfile}
              onDirtyChange={onProfileDirtyChange}
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
          {activeSectionId === "verification" ? (
            <VerificationSettingsPanel
              verification={verification}
              isLoading={isVerificationLoading}
              isError={isVerificationError}
              isSubmitting={isSubmittingVerification}
              submitStatus={verificationSubmitStatus}
              onSubmit={onSubmitVerification}
            />
          ) : null}
        </main>
      </div>
    </section>
  );
}

function noopSubmitVerification(_body: SubmitAstrologerVerificationRequest): void {}

function StatusBanner({
  tone,
  children
}: {
  readonly tone: "neutral" | "danger" | "success" | "warning";
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className={`${styles.statusBanner} ${tone === "danger" ? styles.statusBannerDanger : ""} ${
        tone === "success" ? styles.statusBannerSuccess : ""
      } ${tone === "warning" ? styles.statusBannerWarning : ""}`}
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

  const currentPlan = billingOverview.currentPlan;
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
      {billingOverview.integrityIssues.length > 0 ? (
        <div className={styles.billingProviderNotice}>
          <Icon iconName="wallet" width={18} height={18} aria-hidden="true" />
          <span>
            <strong>Тариф требует проверки</strong>
            <em>{formatBillingIssueMessage(billingOverview.integrityIssues[0])}</em>
          </span>
        </div>
      ) : null}

      {renderBillingGroup({
        title: "Текущий тариф",
        hint: "Оплата за подписку плюс комиссия сервиса с продаж через платформу.",
        children: (
          <>
            {currentPlan ? (
              <div className={styles.currentPlanSummary}>
                <span className={styles.currentPlanIcon}>
                  <Icon iconName="wallet" width={22} height={22} aria-hidden="true" />
                </span>
                <span className={styles.currentPlanText}>
                  <strong>
                    {currentPlan.name} · {billingCycle === "year" ? "год" : "месяц"}
                  </strong>
                  <em>
                    {`Комиссия ${formatFee(currentPlan.platformFeeBps)}`}
                    {billingOverview.currentSubscription?.currentPeriodEndsAt
                      ? ` · следующее списание ${formatDate(
                          billingOverview.currentSubscription.currentPeriodEndsAt
                        )}`
                      : " · без следующего списания"}
                  </em>
                </span>
                <span className={styles.currentPlanStatus}>
                  {formatCurrentPlanStatus(billingOverview)}
                </span>
              </div>
            ) : (
              <div className={styles.currentPlanSummary}>
                <span className={styles.currentPlanIcon}>
                  <Icon iconName="wallet" width={22} height={22} aria-hidden="true" />
                </span>
                <span className={styles.currentPlanText}>
                  <strong>Текущий тариф не определён</strong>
                  <em>Проверьте подписку и каталог тарифов перед изменением оплаты.</em>
                </span>
                <span className={styles.currentPlanStatus}>Проверка</span>
              </div>
            )}

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
                  {plan.id === currentPlan?.id ? (
                    <button className={styles.planGhostButton} type="button" disabled>
                      Текущий
                    </button>
                  ) : billingOverview.provider.checkoutUrl ? (
                    renderExternalBillingLink({
                      className: styles.planButton,
                      href: billingOverview.provider.checkoutUrl,
                      children: "Выбрать"
                    })
                  ) : (
                    <button className={styles.planButton} type="button" disabled>
                      Выбрать
                    </button>
                  )}
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
            {billingOverview.provider.managePaymentMethodUrl ? (
              renderExternalBillingLink({
                className: styles.planGhostButton,
                href: billingOverview.provider.managePaymentMethodUrl,
                children: "Изменить"
              })
            ) : (
              <button className={styles.planGhostButton} type="button" disabled>
                Изменить
              </button>
            )}
          </div>
        ) : (
          <div className={styles.billingRow}>
            <Icon iconName="wallet" width={17} height={17} aria-hidden="true" />
            <span>
              <strong>Способ оплаты не добавлен</strong>
              <em>Добавление карты появится после подключения ArcPay.</em>
            </span>
            {billingOverview.provider.managePaymentMethodUrl ? (
              renderExternalBillingLink({
                className: styles.planGhostButton,
                href: billingOverview.provider.managePaymentMethodUrl,
                children: "Добавить"
              })
            ) : (
              <button className={styles.planGhostButton} type="button" disabled>
                Добавить
              </button>
            )}
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
                  {invoice.receiptUrl ? (
                    renderExternalBillingLink({
                      className: styles.planGhostButton,
                      href: invoice.receiptUrl,
                      children: "Скачать чек"
                    })
                  ) : null}
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

function renderExternalBillingLink({
  className,
  href,
  children
}: {
  readonly className: string | undefined;
  readonly href: string;
  readonly children: React.ReactNode;
}): React.ReactNode {
  return (
    <a className={className ?? ""} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
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

function formatCurrentPlanStatus(billingOverview: BillingOverviewResponse): string {
  if (billingOverview.currentSubscription?.status === "active") {
    return "Активен";
  }

  if (billingOverview.currentPlanSource === "default") {
    return "Базовый";
  }

  return "Проверка";
}

function formatBillingIssueMessage(issue: BillingIntegrityIssueResponse | undefined): string {
  if (!issue) {
    return "Проверьте подписку и каталог тарифов.";
  }

  if (issue.code === "subscription_plan_not_found") {
    return "Подписка ссылается на тариф, которого нет в активном каталоге.";
  }

  return "Базовый тариф отсутствует в активном каталоге.";
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
