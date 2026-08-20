import type {
  AstrologerClientCrmDetail,
  ClientCrmActivityItem,
  ClientBirthDataResponse,
  ClientCrmServiceWorkBookingItem,
  ClientCrmServiceWorkSessionItem,
  ClientRelatedBirthProfileResponse
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { ReactNode } from "react";
import type { ClientsCrmCopy } from "../../../common/i18n/astrologerCopy";
import {
  formatClientCrmDate,
  formatClientCrmDisplayName,
  formatClientCrmLifecycle,
  formatClientCrmReadiness,
  formatClientCrmSource
} from "../model/clientsCrmPresentation";
import { ClientCrmActivityTimeline } from "./ClientCrmActivityTimeline";
import { ClientCrmAvatar } from "./ClientCrmAvatar";
import { ClientCrmTabs, type ClientCrmTabId } from "./ClientCrmTabs";
import styles from "./ClientsCrm.module.css";

type ClientCrmDetailPanelProps = {
  readonly copy: ClientsCrmCopy;
  readonly client: AstrologerClientCrmDetail | null;
  readonly selectedClientUserId: string | undefined;
  readonly locale: SupportedLocale;
  readonly activeTab: ClientCrmTabId;
  readonly activityItems: readonly ClientCrmActivityItem[];
  readonly isDetailLoading: boolean;
  readonly isDetailError: boolean;
  readonly isActivityLoading: boolean;
  readonly isActivityError: boolean;
  readonly onTabChange: (tab: ClientCrmTabId) => void;
  readonly onBackToList: () => void;
  readonly onRetryDetail: () => void;
  readonly onRetryActivity: () => void;
};

export function ClientCrmDetailPanel({
  copy,
  client,
  selectedClientUserId,
  locale,
  activeTab,
  activityItems,
  isDetailLoading,
  isDetailError,
  isActivityLoading,
  isActivityError,
  onTabChange,
  onBackToList,
  onRetryDetail,
  onRetryActivity
}: ClientCrmDetailPanelProps) {
  const displayName = client
    ? formatClientCrmDisplayName(client.clientUserId, client.displayName, locale)
    : "";

  return (
    <section className={styles.detailPanel} aria-label={copy.selectClientTitle}>
      <div className={styles.mobileDetailTop}>
        <button
          aria-label={copy.backToListLabel}
          className={styles.backButton}
          onClick={onBackToList}
          type="button"
        >
          <Icon iconName="chevronLeft" size={20} aria-hidden="true" />
        </button>
        <span className={styles.mobileDetailTitle}>
          {displayName || selectedClientUserId || copy.selectClientTitle}
        </span>
      </div>

      {!selectedClientUserId ? (
        <div className={styles.selectState}>
          <div>
            <p className={styles.selectTitle}>{copy.selectClientTitle}</p>
            <p className={styles.selectDescription}>{copy.selectClientDescription}</p>
          </div>
        </div>
      ) : isDetailLoading ? (
        <div role="status" aria-label={copy.loadingDetailLabel} className={styles.loadingState}>
          {copy.loadingDetailLabel}
        </div>
      ) : isDetailError || !client ? (
        <div role="alert" aria-label={copy.detailErrorTitle} className={styles.errorState}>
          <div>
            <p className={styles.errorTitle}>{copy.detailErrorTitle}</p>
            <button type="button" className={styles.button} onClick={onRetryDetail}>
              <Icon iconName="refresh" size={15} aria-hidden="true" />
              {copy.retryLabel}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.detailHead}>
            <div className={styles.profileHead}>
              <ClientCrmAvatar name={displayName} size={60} />
              <div className={styles.profileMain}>
                <div className={styles.profileTitleRow}>
                  <h2 className={styles.profileTitle}>{displayName}</h2>
                  <span className={styles.badge} data-tone={formatClientCrmLifecycle(client.lifecycle.status, locale).tone}>
                    {formatClientCrmLifecycle(client.lifecycle.status, locale).label}
                  </span>
                </div>
                <div className={styles.profileMeta}>
                  <span>{formatClientCrmSource(client.relationship.source, locale).label}</span>
                  <span>{copy.facts.status}: {client.relationship.status}</span>
                  <span>{copy.facts.revision}: {client.lifecycle.revision}</span>
                </div>
              </div>
              <div className={styles.statStrip} aria-label={copy.facts.relationship}>
                <Stat label={copy.facts.firstLinkedAt} value={formatClientCrmDate(client.relationship.firstLinkedAt, locale)} />
                <Stat label={copy.facts.lastLinkedAt} value={formatClientCrmDate(client.relationship.lastLinkedAt, locale)} />
                <Stat label={copy.facts.lastActivityAt} value={formatClientCrmDate(client.lifecycle.lastActivityAt, locale)} />
              </div>
            </div>
            <ClientCrmTabs activeTab={activeTab} copy={copy} onTabChange={onTabChange} />
          </div>

          <div
            aria-labelledby={`clients-crm-tab-${activeTab}`}
            className={styles.detailBody}
            id={`clients-crm-panel-${activeTab}`}
            role="tabpanel"
          >
            {activeTab === "overview" ? (
              <OverviewPanel client={client} copy={copy} locale={locale} />
            ) : activeTab === "birthData" ? (
              <BirthDataPanel birthData={client.birthData} copy={copy} locale={locale} />
            ) : activeTab === "relatedProfiles" ? (
              <RelatedProfilesPanel copy={copy} profiles={client.relatedBirthProfiles} locale={locale} />
            ) : (
              <ClientCrmActivityTimeline
                copy={copy}
                items={activityItems}
                locale={locale}
                isLoading={isActivityLoading}
                isError={isActivityError}
                onRetry={onRetryActivity}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

type StatProps = {
  readonly label: string;
  readonly value: string;
};

function Stat({ label, value }: StatProps) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function OverviewPanel({
  client,
  copy,
  locale
}: {
  readonly client: AstrologerClientCrmDetail;
  readonly copy: ClientsCrmCopy;
  readonly locale: SupportedLocale;
}) {
  const lifecycle = formatClientCrmLifecycle(client.lifecycle.status, locale);
  const readiness = {
    birthData: formatClientCrmReadiness("birthData", client.readiness.birthData, locale),
    relatedProfiles: formatClientCrmReadiness("relatedProfiles", client.readiness.relatedProfiles, locale)
  };

  return (
    <div className={styles.overviewGrid}>
      <section className={styles.card}>
        <div className={styles.kicker}>{copy.facts.relationship}</div>
        <div className={styles.factList}>
          <Fact label={copy.facts.source} value={formatClientCrmSource(client.relationship.source, locale).label} />
          <Fact label={copy.facts.status} value={client.relationship.status} />
          <Fact label={copy.facts.firstLinkedAt} value={formatClientCrmDate(client.relationship.firstLinkedAt, locale)} />
          <Fact label={copy.facts.lastLinkedAt} value={formatClientCrmDate(client.relationship.lastLinkedAt, locale)} />
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.kicker}>{copy.facts.readiness}</div>
        <div className={styles.factList}>
          <Fact
            label={copy.facts.lifecycle}
            value={<span className={styles.badge} data-tone={lifecycle.tone}>{lifecycle.label}</span>}
          />
          <Fact
            label={copy.facts.birthData}
            value={<span className={styles.badge} data-tone={readiness.birthData.tone}>{readiness.birthData.label}</span>}
          />
          <Fact
            label={copy.facts.relatedProfiles}
            value={<span className={styles.badge} data-tone={readiness.relatedProfiles.tone}>{readiness.relatedProfiles.label}</span>}
          />
        </div>
      </section>

      {client.serviceWork ? (
        <ServiceWorkPanel copy={copy} locale={locale} serviceWork={client.serviceWork} />
      ) : null}

      <section className={`${styles.card} ${styles.wideCard}`}>
        <div className={styles.kicker}>{copy.tabs.activity}</div>
        <ClientCrmActivityTimeline
          copy={copy}
          items={client.activity.items}
          locale={locale}
          isLoading={false}
          isError={false}
          onRetry={() => undefined}
        />
      </section>
    </div>
  );
}

function ServiceWorkPanel({
  copy,
  locale,
  serviceWork
}: {
  readonly copy: ClientsCrmCopy;
  readonly locale: SupportedLocale;
  readonly serviceWork: AstrologerClientCrmDetail["serviceWork"];
}) {
  if (!serviceWork) return null;
  if (serviceWork.status === "unavailable") {
    return (
      <section className={`${styles.card} ${styles.wideCard}`}>
        <div className={styles.kicker}>{copy.serviceWork.title}</div>
        <div className={styles.emptyStateCompact}>{copy.serviceWork.unavailable}</div>
      </section>
    );
  }

  const hasItems =
    serviceWork.bookings.upcoming.length > 0 ||
    serviceWork.bookings.recent.length > 0 ||
    serviceWork.sessions.upcoming.length > 0 ||
    serviceWork.sessions.recent.length > 0;

  return (
    <section className={`${styles.card} ${styles.wideCard}`}>
      <div className={styles.kicker}>{copy.serviceWork.title}</div>
      {hasItems ? (
        <div className={styles.workGrid}>
          <ServiceWorkGroup
            title={copy.serviceWork.upcomingBookings}
            total={serviceWork.bookings.upcomingTotal}
            items={serviceWork.bookings.upcoming}
            locale={locale}
          />
          <ServiceWorkGroup
            title={copy.serviceWork.recentBookings}
            total={serviceWork.bookings.recentTotal}
            items={serviceWork.bookings.recent}
            locale={locale}
          />
          <ServiceWorkGroup
            title={copy.serviceWork.upcomingSessions}
            total={serviceWork.sessions.upcomingTotal}
            items={serviceWork.sessions.upcoming}
            locale={locale}
          />
          <ServiceWorkGroup
            title={copy.serviceWork.recentSessions}
            total={serviceWork.sessions.recentTotal}
            items={serviceWork.sessions.recent}
            locale={locale}
          />
        </div>
      ) : (
        <div className={styles.emptyStateCompact}>{copy.serviceWork.empty}</div>
      )}
    </section>
  );
}

function ServiceWorkGroup({
  title,
  total,
  items,
  locale
}: {
  readonly title: string;
  readonly total: number;
  readonly items: readonly (ClientCrmServiceWorkBookingItem | ClientCrmServiceWorkSessionItem)[];
  readonly locale: SupportedLocale;
}) {
  if (items.length === 0) return null;

  return (
    <div className={styles.workGroup}>
      <div className={styles.workGroupTitle}>
        <span>{title}</span>
        <span className={styles.workCount}>{total}</span>
      </div>
      <div className={styles.workList}>
        {items.map((item) => (
          <a className={styles.workItem} href={item.href} key={item.id}>
            <span className={styles.workTitle}>{item.productTitle}</span>
            <span className={styles.workMeta}>
              {formatClientCrmDate(getServiceWorkStartAt(item), locale, item.timeZone)} · {item.state}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function getServiceWorkStartAt(
  item: ClientCrmServiceWorkBookingItem | ClientCrmServiceWorkSessionItem
): string {
  return "startAt" in item ? item.startAt : item.scheduledStartAt;
}

function BirthDataPanel({
  birthData,
  copy,
  locale
}: {
  readonly birthData: ClientBirthDataResponse | null;
  readonly copy: ClientsCrmCopy;
  readonly locale: SupportedLocale;
}) {
  if (!birthData) {
    return <div className={styles.emptyState}>{copy.missingBirthData}</div>;
  }

  return (
    <section className={styles.card}>
      <div className={styles.kicker}>{copy.tabs.birthData}</div>
      <div className={styles.factList}>
        <Fact label={copy.facts.birthData} value={birthData.birthDate ?? copy.missingBirthData} />
        <Fact
          label={copy.facts.birthTime}
          value={
            birthData.birthTime
              ? `${birthData.birthTime} · ${birthData.birthTimePrecision}`
              : birthData.birthTimePrecision
          }
        />
        <Fact label={copy.facts.place} value={birthData.birthPlaceText ?? "—"} />
        <Fact label={copy.facts.timezone} value={birthData.birthTimezone ?? "—"} />
        <Fact label={copy.facts.revision} value={String(birthData.revision)} />
        <Fact label={copy.facts.updatedAt} value={formatClientCrmDate(birthData.updatedAt, locale)} />
      </div>
    </section>
  );
}

function RelatedProfilesPanel({
  copy,
  profiles
}: {
  readonly copy: ClientsCrmCopy;
  readonly profiles: readonly ClientRelatedBirthProfileResponse[];
  readonly locale: SupportedLocale;
}) {
  if (profiles.length === 0) {
    return <div className={styles.emptyState}>{copy.emptyRelatedProfiles}</div>;
  }

  return (
    <div className={styles.overviewGrid}>
      {profiles.map((profile) => (
        <section className={styles.card} key={profile.id}>
          <div className={styles.sectionHeader}>
            <ClientCrmAvatar name={profile.displayName} size={38} />
            <div>
              <div className={styles.activityTitle}>{profile.displayName}</div>
              <div className={styles.activityMeta}>{profile.relationshipLabel}</div>
            </div>
          </div>
          <div className={styles.factList}>
            <Fact label={copy.facts.birthData} value={profile.birthDate ?? copy.missingBirthData} />
            <Fact label={copy.facts.place} value={profile.birthPlaceText ?? "—"} />
            <Fact label={copy.facts.revision} value={String(profile.revision)} />
          </div>
        </section>
      ))}
    </div>
  );
}

function Fact({
  label,
  value
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <div className={styles.factRow}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{value}</span>
    </div>
  );
}
