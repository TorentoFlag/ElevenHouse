import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type {
  AstrologerProfileIntegrityIssueResponse,
  AstrologerProfileResponse,
  AstrologerTariffCatalogResponse,
  StartAstrologerTariffSubscriptionResponse,
  GetAstrologerVerificationResponse,
  SubmitAstrologerVerificationRequest,
  UpsertAstrologerProfileRequest
} from "@elevenhouse/contracts";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { ProfileSettingsForm } from "../../features/astrologer-profile/ui/ProfileSettingsForm";
import { TariffSettingsPanel } from "../../features/platform-tariffs/ui/TariffSettingsPanel";
import { VerificationSettingsPanel } from "../../features/verification/ui/VerificationSettingsPanel";
import { SettingsNavigation, type SettingsSection } from "./components/SettingsNavigation";
import styles from "./SettingsPage.module.css";

export type SettingsPageViewProps = {
  readonly locale: SupportedLocale;
  readonly title: string;
  readonly profile: AstrologerProfileResponse | null;
  readonly profileIntegrityIssues: readonly AstrologerProfileIntegrityIssueResponse[];
  readonly tariffCatalog: AstrologerTariffCatalogResponse | null;
  readonly tariffSelectionResult: StartAstrologerTariffSubscriptionResponse | null;
  readonly verification?: GetAstrologerVerificationResponse | null;
  readonly selectedBillingCycle: "month" | "year";
  readonly activeSectionId: SettingsSection["id"];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isTariffLoading: boolean;
  readonly isTariffError: boolean;
  readonly isSelectingTariff: boolean;
  readonly isVerificationLoading?: boolean;
  readonly isVerificationError?: boolean;
  readonly isSavingProfile: boolean;
  readonly isSubmittingVerification?: boolean;
  readonly saveStatus: "saved" | null;
  readonly verificationSubmitStatus?: "submitted" | null;
  readonly onSectionChange: (sectionId: SettingsSection["id"]) => void;
  readonly onBillingCycleChange: (billingCycle: "month" | "year") => void;
  readonly onSelectTariff: (
    tariff: AstrologerTariffCatalogResponse["tariffs"][number],
    billingCycle: "month" | "year"
  ) => void;
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
    description: "Тариф, комиссия и статус подписки",
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
  tariffCatalog,
  tariffSelectionResult,
  verification = null,
  selectedBillingCycle,
  activeSectionId,
  isLoading,
  isError,
  isTariffLoading,
  isTariffError,
  isSelectingTariff,
  isVerificationLoading = false,
  isVerificationError = false,
  isSavingProfile,
  isSubmittingVerification = false,
  saveStatus,
  verificationSubmitStatus = null,
  onSectionChange,
  onBillingCycleChange,
  onSelectTariff,
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
          {activeSectionId === "billing" ? (
            <TariffSettingsPanel
              catalog={tariffCatalog}
              locale={locale}
              billingCycle={selectedBillingCycle}
              selectionResult={tariffSelectionResult}
              isLoading={isTariffLoading}
              isError={isTariffError}
              isSelecting={isSelectingTariff}
              onBillingCycleChange={onBillingCycleChange}
              onSelectTariff={onSelectTariff}
            />
          ) : null}
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

function noopSubmitVerification(): void {}

function StatusBanner({
  tone,
  children
}: {
  readonly tone: "neutral" | "danger" | "success" | "warning";
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className={`${styles.statusBanner} ${tone === "danger" ? styles.statusBannerDanger : ""} ${tone === "success" ? styles.statusBannerSuccess : ""} ${tone === "warning" ? styles.statusBannerWarning : ""}`}
      aria-live="polite"
    >
      {children}
    </div>
  );
}
