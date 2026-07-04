import { Icon, type IconName } from "@elevenhouse/design-system/icons/Icon";
import styles from "../SettingsPage.module.css";

export type SettingsSectionId =
  | "profile"
  | "billing"
  | "verification"
  | "notifications"
  | "loyalty"
  | "integrations"
  | "security"
  | "privacy"
  | "referral";

export type SettingsSection = {
  readonly id: SettingsSectionId;
  readonly title: string;
  readonly description: string;
  readonly iconName: IconName;
  readonly disabled: boolean;
};

export type SettingsNavigationProps = {
  readonly sections: readonly SettingsSection[];
  readonly activeSectionId: SettingsSectionId;
  readonly onSectionChange: (sectionId: SettingsSectionId) => void;
};

export function SettingsNavigation({
  sections,
  activeSectionId,
  onSectionChange
}: SettingsNavigationProps) {
  return (
    <nav className={styles.settingsNavigation} aria-label="Разделы настроек">
      {sections.map((section) => (
        <button
          key={section.id}
          className={`${styles.navigationButton} ${
            activeSectionId === section.id ? styles.navigationButtonActive : ""
          } ${section.disabled ? styles.navigationButtonDisabled : ""}`}
          type="button"
          onClick={() => {
            if (!section.disabled) {
              onSectionChange(section.id);
            }
          }}
          disabled={section.disabled}
          aria-disabled={section.disabled}
        >
          <Icon iconName={section.iconName} width={18} height={18} aria-hidden="true" />
          <span>
            <strong>{section.title}</strong>
            <em>{section.description}</em>
          </span>
        </button>
      ))}
    </nav>
  );
}
