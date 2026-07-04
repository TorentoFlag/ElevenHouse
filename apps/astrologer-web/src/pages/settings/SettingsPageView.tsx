import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type {
  AstrologerProfileResponse,
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
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isSavingProfile: boolean;
  readonly saveStatus: "saved" | null;
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
    description: "Появится после PlatformPlans/Billing",
    iconName: "wallet",
    disabled: true
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
  isLoading,
  isError,
  isSavingProfile,
  saveStatus,
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

      <div className={styles.body}>
        <SettingsNavigation
          sections={supportedSections}
          activeSectionId="profile"
          onSectionChange={() => undefined}
        />
        <main className={styles.content}>
          <ProfileSettingsForm
            locale={locale}
            profile={profile}
            isSaving={isSavingProfile}
            onSave={onSaveProfile}
          />
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
