import { Icon } from "@elevenhouse/design-system/icons/Icon";
import { useState } from "react";
import type { ChartAiConsentCopy } from "../../common/i18n/clientCopy";
import type { ClientDataConsentCard } from "../../features/client-profile/model/clientDataConsentModel";
import styles from "./MePage.module.css";

export type ClientDataConsentSectionStatus = "loading" | "ready" | "error";

export type ClientDataConsentPendingAction = {
  readonly kind: "grant" | "revoke";
  readonly id: string;
};

export type ChartAiConsentNoticeView = {
  readonly locale: "ru" | "en";
  readonly policyVersion: string;
  readonly processor: { readonly name: string };
  readonly title: string;
  readonly summary: string;
  readonly relationshipScope: string;
  readonly dataSent: readonly { readonly code: string; readonly label: string }[];
  readonly dataExcluded: readonly { readonly code: string; readonly label: string }[];
  readonly withdrawal: string;
};

export type ClientDataConsentSectionProps = {
  readonly cards: readonly ClientDataConsentCard[] | null;
  readonly copy: ChartAiConsentCopy;
  readonly notice: ChartAiConsentNoticeView | null;
  readonly noticeSha256: string | null;
  readonly pendingAction: ClientDataConsentPendingAction | null;
  readonly status: ClientDataConsentSectionStatus;
  readonly onGrant: (astrologerUserId: string) => void;
  readonly onRetry: () => void;
  readonly onRevoke: (consentId: string) => void;
};

export function ClientDataConsentSection({
  cards,
  copy,
  notice,
  noticeSha256,
  pendingAction,
  status,
  onGrant,
  onRetry,
  onRevoke
}: ClientDataConsentSectionProps) {
  const [acceptedByNotice, setAcceptedByNotice] = useState<
    Readonly<Record<string, boolean>>
  >({});

  if (status === "loading") {
    return (
      <section className={styles.consentSection} aria-busy="true">
        <span className={styles.eyebrow}>{copy.sectionEyebrow}</span>
        <h2>{copy.sectionTitle}</h2>
        <p className={styles.consentStateText}>{copy.loading}</p>
      </section>
    );
  }

  if (status === "error" || cards === null || notice === null || noticeSha256 === null) {
    return (
      <section className={styles.consentSection}>
        <span className={styles.eyebrow}>{copy.sectionEyebrow}</span>
        <h2>{copy.sectionTitle}</h2>
        <div className={styles.consentError} role="alert">
          <Icon iconName="lightning" size={18} />
          <p>{copy.error}</p>
          <button className={styles.secondaryButton} type="button" onClick={onRetry}>
            {copy.retry}
          </button>
        </div>
      </section>
    );
  }

  if (cards.length === 0) {
    return (
      <section className={styles.consentSection}>
        <span className={styles.eyebrow}>{copy.sectionEyebrow}</span>
        <h2>{copy.sectionTitle}</h2>
        <p className={styles.consentStateText}>{copy.empty}</p>
      </section>
    );
  }

  return (
    <section className={styles.consentSection} aria-labelledby="chart-ai-consent-title">
      <div className={styles.consentHeader}>
        <span className={styles.consentIcon} aria-hidden="true">
          <Icon iconName="sparkle" size={20} />
        </span>
        <div>
          <span className={styles.eyebrow}>{copy.sectionEyebrow}</span>
          <h2 id="chart-ai-consent-title">{notice.title}</h2>
        </div>
        <span className={styles.consentProcessor}>{notice.processor.name}</span>
      </div>

      <p className={styles.consentSummary}>{notice.summary}</p>
      <p className={styles.consentRelationshipScope}>{notice.relationshipScope}</p>

      <div className={styles.consentDisclosureGrid}>
        <div>
          <h3>{copy.sentHeading}</h3>
          <ul>
            {notice.dataSent.map((item) => (
              <li key={item.code}>
                <Icon iconName="check" size={13} />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>{copy.excludedHeading}</h3>
          <ul>
            {notice.dataExcluded.map((item) => (
              <li key={item.code}>
                <Icon iconName="verified" size={13} />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className={styles.consentWithdrawal}>{notice.withdrawal}</p>

      <div className={styles.consentRelationshipHeader}>
        <h3>{copy.relationshipHeading}</h3>
        <span className={styles.counter}>{cards.length}</span>
      </div>

      <ul className={styles.consentCardList}>
        {cards.map((card) => {
          const acceptanceKey = [
            card.astrologerUserId,
            notice.locale,
            notice.policyVersion,
            noticeSha256,
            card.state,
            card.consentId ?? "none",
            card.revokedAt ?? "current"
          ].join(":");
          const isAccepted = acceptedByNotice[acceptanceKey] === true;
          const isGrantPending =
            pendingAction?.kind === "grant" && pendingAction.id === card.astrologerUserId;
          const isRevokePending =
            pendingAction?.kind === "revoke" && pendingAction.id === card.consentId;
          const consentId = card.consentId;
          const stateLabel = copy.states[card.state];
          const stateClassName =
            card.state === "granted" ? styles.consentStateGranted : styles.consentStateRestricted;

          return (
            <li key={card.astrologerUserId} className={styles.consentCard}>
              <div className={styles.consentCardIdentity}>
                <span className={styles.avatar}>{getInitials(card.publicName)}</span>
                <span>
                  <strong>{card.publicName}</strong>
                  <small>@{card.publicHandle}</small>
                </span>
                <span className={stateClassName}>{stateLabel}</span>
              </div>

              {card.grantedAt ? (
                <p className={styles.consentEvidenceTime}>
                  {copy.grantedAt}: {formatTimestamp(card.grantedAt, notice.locale)}
                </p>
              ) : null}
              {card.revokedAt ? (
                <p className={styles.consentEvidenceTime}>
                  {copy.revokedAt}: {formatTimestamp(card.revokedAt, notice.locale)}
                </p>
              ) : null}

              {card.canGrant ? (
                <label className={styles.consentAcceptance}>
                  <span className={styles.consentCheckboxTarget}>
                    <input
                      type="checkbox"
                      checked={isAccepted}
                      disabled={isGrantPending}
                      onChange={(event) =>
                        setAcceptedByNotice((current) => ({
                          ...current,
                          [acceptanceKey]: event.target.checked
                        }))
                      }
                    />
                  </span>
                  <span>{copy.acceptanceLabel}</span>
                </label>
              ) : null}

              <div className={styles.consentCardActions}>
                {card.canGrant ? (
                  <button
                    className={styles.primaryButton}
                    type="button"
                    disabled={!isAccepted || isGrantPending || pendingAction !== null}
                    onClick={() => {
                      setAcceptedByNotice((current) => ({
                        ...current,
                        [acceptanceKey]: false
                      }));
                      onGrant(card.astrologerUserId);
                    }}
                  >
                    {isGrantPending
                      ? copy.granting
                      : card.state === "missing"
                        ? copy.grant
                        : copy.grantAgain}
                  </button>
                ) : null}
                {card.canRevoke && consentId ? (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={isRevokePending || pendingAction !== null}
                    onClick={() => onRevoke(consentId)}
                  >
                    {isRevokePending ? copy.revoking : copy.revoke}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatTimestamp(
  value: string,
  locale: ChartAiConsentNoticeView["locale"]
): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
