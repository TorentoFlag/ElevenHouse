import { classNames } from "@elevenhouse/design-system/helpers";
import { Sparkle } from "@elevenhouse/design-system/icons/Sparkle";
import { MotionText } from "@elevenhouse/design-system/motion";
import { BackLink } from "@elevenhouse/design-system/navigation";
import type { AuthVisualCopy } from "../../common/i18n/astrologerCopy";
import { authHighlightIcons } from "./const";
import styles from "./AuthPage.module.css";

export type AuthVisualPaneProps = {
  readonly copy: AuthVisualCopy;
  readonly motionKey: string;
};

export function AuthVisualPane({ copy, motionKey }: AuthVisualPaneProps) {
  const renderMotionText = (scope: string, value: string) => (
    <MotionText transitionKey={`${motionKey}:${scope}:${value}`}>{value}</MotionText>
  );

  return (
    <section className={styles.visualPane}>
      <div className={classNames(styles.planet, styles.planetGold)}>
        <span className={styles.orbit} />
      </div>
      <div className={classNames(styles.planet, styles.planetTeal)} />
      <div className={classNames(styles.planet, styles.planetAmber)} />
      <div className={classNames(styles.planet, styles.planetViolet)}>
        <span className={styles.orbit} />
      </div>
      <div className={classNames(styles.planet, styles.planetBlue)} />
      <div className={styles.stars} />

      <div className={styles.visualContent}>
        <BackLink
          ariaLabel={copy.backLinkTitle}
          className={styles.backLink ?? ""}
          path="/"
          title={renderMotionText("backLinkTitle", copy.backLinkTitle)}
        />

        <div className={styles.heroCopy}>
          <div className={styles.brandBadge}>
            <Sparkle aria-hidden="true" />
            ElevenHouse
          </div>
          <h1 className={styles.heroTitle}>
            {renderMotionText("heroTitleLine1", copy.heroTitleLine1)}
            <br />
            {renderMotionText("heroTitleLine2", copy.heroTitleLine2)}
          </h1>
          <div className={styles.highlightList}>
            {copy.highlights.map(({ key, description, label }) => {
              const Icon = authHighlightIcons[key];

              return (
                <div className={styles.highlightItem} key={key}>
                  <span className={styles.highlightIcon} aria-hidden="true">
                    <Icon />
                  </span>
                  <span className={styles.highlightText}>
                    <span className={styles.highlightLabel}>
                      {renderMotionText(`highlight:${key}`, label)}
                    </span>
                    {description ? (
                      <span className={styles.highlightDescription}>
                        {renderMotionText(`highlightDescription:${key}`, description)}
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.joinedInfo} aria-label={copy.joinedInfoLabel}>
          <div className={styles.joinedAvatars} aria-hidden="true">
            {copy.avatarInitials.map((initials) => (
              <span key={initials}>{initials}</span>
            ))}
          </div>
          <p>
            {renderMotionText("joinedInfoPrefix", copy.joinedInfoPrefix)}{" "}
            <strong>{renderMotionText("joinedInfoCount", copy.joinedInfoCount)}</strong>
          </p>
        </div>
      </div>
    </section>
  );
}
