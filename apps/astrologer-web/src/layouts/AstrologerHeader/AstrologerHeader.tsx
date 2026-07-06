import { useI18n } from "@elevenhouse/i18n";
import { Button } from "@elevenhouse/design-system/components/Button";
import "@elevenhouse/design-system/components/Button.css";
import type { AppShellHeaderCopy, AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useCurrentAstrologerProfileQuery } from "../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery";
import styles from "./AstrologerHeader.module.css";
import {
  toAstrologerHeaderProfileModel,
  type AstrologerHeaderProfileModel
} from "./astrologerHeaderProfileModel";
import { Icon } from "@elevenhouse/design-system/icons/Icon";

type AstrologerHeaderViewProps = {
  copy: AppShellHeaderCopy;
  profile: AstrologerHeaderProfileModel;
};

const timezoneReferenceDate = new Date();

export function AstrologerHeader() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const profileQuery = useCurrentAstrologerProfileQuery();
  const copy = dictionary.appShell.header;
  const profile = toAstrologerHeaderProfileModel({
    copy,
    locale,
    now: timezoneReferenceDate,
    profile: profileQuery.data?.profile ?? null,
    profileStatus: profileQuery.status,
    verificationStatus: "none"
  });

  return <AstrologerHeaderView copy={copy} profile={profile} />;
}

export function AstrologerHeaderView({ copy, profile }: AstrologerHeaderViewProps) {
  return (
    <header className={styles.header} aria-label="Astrologer app header">
      <div className={styles.searchWrap}>
        <Icon
          iconName="search"
          className={styles.searchIcon}
          width={17}
          height={17}
          aria-hidden="true"
        />
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
          startIcon={<Icon iconName="plus" width={17} height={17} aria-hidden="true" />}
          endIcon={
            <Icon
              iconName="chevronDown"
              className={styles.createChevron}
              width={15}
              height={15}
              aria-hidden="true"
            />
          }
        />

        <button
          className={styles.notificationButton}
          type="button"
          aria-label={copy.notificationsAriaLabel}
        >
          <Icon iconName="bell" width={19} height={19} aria-hidden="true" />
          <span className={styles.notificationDot} aria-label={copy.unreadNotificationsLabel} />
        </button>

        <button
          className={styles.profileButton}
          type="button"
          aria-label={copy.profileSettingsLabel}
        >
          <span
            className={styles.avatar}
            aria-hidden="true"
            data-loading={profile.isLoading ? "true" : undefined}
          >
            {profile.avatarUrl ? (
              <img className={styles.avatarImage} src={profile.avatarUrl} alt="" />
            ) : (
              profile.avatarInitials
            )}
          </span>
          <span className={styles.profileText}>
            <span className={styles.profileName}>
              {profile.isVerified ? (
                <>
                  {profile.displayName}
                  <Icon
                    iconName="verified"
                    className={styles.verifiedIcon}
                    width={15}
                    height={15}
                    aria-label={copy.verifiedLabel}
                  />
                </>
              ) : (
                profile.displayName
              )}
            </span>
            <span className={styles.profileTimezone}>{profile.timezoneLabel}</span>
          </span>
        </button>
      </div>
    </header>
  );
}
