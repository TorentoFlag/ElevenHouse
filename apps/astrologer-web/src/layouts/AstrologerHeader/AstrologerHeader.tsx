import { useI18n } from "@elevenhouse/i18n";
import { Button } from "@elevenhouse/design-system/components/Button";
import { Bell } from "@elevenhouse/design-system/icons/Bell";
import { ChevronDown } from "@elevenhouse/design-system/icons/ChevronDown";
import { Plus } from "@elevenhouse/design-system/icons/Plus";
import { Search } from "@elevenhouse/design-system/icons/Search";
import { Verified } from "@elevenhouse/design-system/icons/Verified";
import "@elevenhouse/design-system/components/Button.css";
import type { AppShellHeaderCopy, AstrologerCopy } from "../../common/i18n/astrologerCopy";
import styles from "./AstrologerHeader.module.css";

type AstrologerHeaderViewProps = {
  copy: AppShellHeaderCopy;
};

export function AstrologerHeader() {
  const { dictionary } = useI18n<AstrologerCopy>();

  return <AstrologerHeaderView copy={dictionary.appShell.header} />;
}

export function AstrologerHeaderView({ copy }: AstrologerHeaderViewProps) {
  return (
    <header className={styles.header} aria-label="Astrologer app header">
      <div className={styles.searchWrap}>
        <Search className={styles.searchIcon} width={17} height={17} aria-hidden="true" />
        <input
          className={styles.searchInput}
          type="search"
          placeholder={copy.searchPlaceholder}
          aria-label={copy.searchPlaceholder}
        />
      </div>

      <div className={styles.actions}>
        <Button
          className={styles.createButton}
          type="button"
          variant="brand"
          size="big"
          title={copy.createLabel}
          aria-label={copy.createMenuAriaLabel}
          startIcon={<Plus width={17} height={17} aria-hidden="true" />}
          endIcon={
            <ChevronDown className={styles.createChevron} width={15} height={15} aria-hidden="true" />
          }
        />

        <button
          className={styles.notificationButton}
          type="button"
          aria-label={copy.notificationsAriaLabel}
        >
          <Bell width={19} height={19} aria-hidden="true" />
          <span className={styles.notificationDot} aria-label={copy.unreadNotificationsLabel} />
        </button>

        <button
          className={styles.profileButton}
          type="button"
          aria-label={copy.profileSettingsLabel}
        >
          <span className={styles.avatar} aria-hidden="true">
            {copy.profileInitials}
          </span>
          <span className={styles.profileText}>
            <span className={styles.profileName}>
              {copy.profileName}
              <Verified
                className={styles.verifiedIcon}
                width={15}
                height={15}
                aria-label={copy.verifiedLabel}
              />
            </span>
            <span className={styles.profileTimezone}>{copy.profileTimezone}</span>
          </span>
        </button>
      </div>
    </header>
  );
}
