import type {
  AstrologerClientCrmDetail,
  AstrologerClientCrmPrivateProfileUpdateResponse,
  AstrologerClientCrmPrivateProfileUpdateRequest,
  ClientBirthDataUpsertRequest,
  ClientCrmActivityItem,
  ClientCrmServiceWorkBookingItem,
  ClientCrmServiceWorkOrderItem,
  ClientCrmServiceWorkPaymentItem,
  ClientCrmServiceWorkSessionItem,
  ClientRelatedBirthProfileUpsertRequest
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { ReactNode } from "react";
import type { ClientsCrmCopy } from "../../../common/i18n/astrologerCopy";
import {
  formatClientCrmDate,
  formatClientCrmDisplayName,
  formatClientCrmLifecycle,
  formatClientCrmMoney,
  formatClientCrmReadiness,
  formatClientCrmSource
} from "../model/clientsCrmPresentation";
import { ClientCrmActivityTimeline } from "./ClientCrmActivityTimeline";
import { ClientCrmAvatar } from "./ClientCrmAvatar";
import { ClientCrmBirthDataPanel } from "./ClientCrmBirthDataPanel";
import { ClientCrmPrivatePanel } from "./ClientCrmPrivatePanel";
import { ClientCrmRelatedProfilesPanel } from "./ClientCrmRelatedProfilesPanel";
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
  readonly isPrivateCrmSaving: boolean;
  readonly isPrivateCrmError: boolean;
  readonly isBirthDataSaving: boolean;
  readonly isBirthDataError: boolean;
  readonly isRelatedProfileSaving: boolean;
  readonly isRelatedProfileError: boolean;
  readonly reviewReceiptOrderId: string | null;
  readonly isReviewReceiptSaving: boolean;
  readonly isReviewReceiptError: boolean;
  readonly onTabChange: (tab: ClientCrmTabId) => void;
  readonly onBackToList: () => void;
  readonly onRetryDetail: () => void;
  readonly onRetryActivity: () => void;
  readonly onSavePrivateCrm: (
    input: AstrologerClientCrmPrivateProfileUpdateRequest
  ) => Promise<AstrologerClientCrmPrivateProfileUpdateResponse>;
  readonly onSaveBirthData: (input: ClientBirthDataUpsertRequest) => Promise<unknown>;
  readonly onCreateRelatedProfile: (
    input: ClientRelatedBirthProfileUpsertRequest
  ) => Promise<unknown>;
  readonly onSaveRelatedProfile: (
    relatedProfileId: string,
    input: ClientRelatedBirthProfileUpsertRequest
  ) => Promise<unknown>;
  readonly onRecordReviewReceipt: (orderId: string) => Promise<unknown>;
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
  isPrivateCrmSaving,
  isPrivateCrmError,
  isBirthDataSaving,
  isBirthDataError,
  isRelatedProfileSaving,
  isRelatedProfileError,
  reviewReceiptOrderId,
  isReviewReceiptSaving,
  isReviewReceiptError,
  onTabChange,
  onBackToList,
  onRetryDetail,
  onRetryActivity,
  onSavePrivateCrm,
  onSaveBirthData,
  onCreateRelatedProfile,
  onSaveRelatedProfile,
  onRecordReviewReceipt
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
                  <span
                    className={styles.badge}
                    data-tone={formatClientCrmLifecycle(client.lifecycle.status, locale).tone}
                  >
                    {formatClientCrmLifecycle(client.lifecycle.status, locale).label}
                  </span>
                </div>
                <div className={styles.profileMeta}>
                  <span>{formatClientCrmSource(client.relationship.source, locale).label}</span>
                  <span>
                    {copy.facts.status}: {client.relationship.status}
                  </span>
                  <span>
                    {copy.facts.revision}: {client.lifecycle.revision}
                  </span>
                </div>
              </div>
              <div
                className={styles.statStrip}
                aria-label={`${copy.facts.relationship}: ${copy.facts.status}`}
              >
                <Stat
                  label={copy.facts.firstLinkedAt}
                  value={formatClientCrmDate(client.relationship.firstLinkedAt, locale)}
                />
                <Stat
                  label={copy.facts.lastLinkedAt}
                  value={formatClientCrmDate(client.relationship.lastLinkedAt, locale)}
                />
                <Stat
                  label={copy.facts.lastActivityAt}
                  value={formatClientCrmDate(client.lifecycle.lastActivityAt, locale)}
                />
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
              <OverviewPanel
                client={client}
                copy={copy}
                locale={locale}
                isPrivateCrmSaving={isPrivateCrmSaving}
                isPrivateCrmError={isPrivateCrmError}
                onSavePrivateCrm={onSavePrivateCrm}
                reviewReceiptOrderId={reviewReceiptOrderId}
                isReviewReceiptSaving={isReviewReceiptSaving}
                isReviewReceiptError={isReviewReceiptError}
                onRecordReviewReceipt={onRecordReviewReceipt}
              />
            ) : activeTab === "birthData" ? (
              <ClientCrmBirthDataPanel
                birthData={client.birthData}
                copy={copy}
                locale={locale}
                isSaving={isBirthDataSaving}
                isError={isBirthDataError}
                onSave={onSaveBirthData}
              />
            ) : activeTab === "relatedProfiles" ? (
              <ClientCrmRelatedProfilesPanel
                copy={copy}
                profiles={client.relatedBirthProfiles}
                locale={locale}
                isSaving={isRelatedProfileSaving}
                isError={isRelatedProfileError}
                onCreate={onCreateRelatedProfile}
                onSave={onSaveRelatedProfile}
              />
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
  locale,
  isPrivateCrmSaving,
  isPrivateCrmError,
  onSavePrivateCrm,
  reviewReceiptOrderId,
  isReviewReceiptSaving,
  isReviewReceiptError,
  onRecordReviewReceipt
}: {
  readonly client: AstrologerClientCrmDetail;
  readonly copy: ClientsCrmCopy;
  readonly locale: SupportedLocale;
  readonly isPrivateCrmSaving: boolean;
  readonly isPrivateCrmError: boolean;
  readonly reviewReceiptOrderId: string | null;
  readonly isReviewReceiptSaving: boolean;
  readonly isReviewReceiptError: boolean;
  readonly onSavePrivateCrm: (
    input: AstrologerClientCrmPrivateProfileUpdateRequest
  ) => Promise<AstrologerClientCrmPrivateProfileUpdateResponse>;
  readonly onRecordReviewReceipt: (orderId: string) => Promise<unknown>;
}) {
  const lifecycle = formatClientCrmLifecycle(client.lifecycle.status, locale);
  const readiness = {
    birthData: formatClientCrmReadiness("birthData", client.readiness.birthData, locale),
    relatedProfiles: formatClientCrmReadiness(
      "relatedProfiles",
      client.readiness.relatedProfiles,
      locale
    )
  };

  return (
    <div className={styles.overviewGrid}>
      <section className={styles.card}>
        <div className={styles.kicker}>{copy.facts.relationship}</div>
        <div className={styles.factList}>
          <Fact
            label={copy.facts.source}
            value={formatClientCrmSource(client.relationship.source, locale).label}
          />
          <Fact label={copy.facts.status} value={client.relationship.status} />
          <Fact
            label={copy.facts.firstLinkedAt}
            value={formatClientCrmDate(client.relationship.firstLinkedAt, locale)}
          />
          <Fact
            label={copy.facts.lastLinkedAt}
            value={formatClientCrmDate(client.relationship.lastLinkedAt, locale)}
          />
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.kicker}>{copy.facts.readiness}</div>
        <div className={styles.factList}>
          <Fact
            label={copy.facts.lifecycle}
            value={
              <span className={styles.badge} data-tone={lifecycle.tone}>
                {lifecycle.label}
              </span>
            }
          />
          <Fact
            label={copy.facts.birthData}
            value={
              <span className={styles.badge} data-tone={readiness.birthData.tone}>
                {readiness.birthData.label}
              </span>
            }
          />
          <Fact
            label={copy.facts.relatedProfiles}
            value={
              <span className={styles.badge} data-tone={readiness.relatedProfiles.tone}>
                {readiness.relatedProfiles.label}
              </span>
            }
          />
        </div>
      </section>

      <ClientCrmPrivatePanel
        client={client}
        copy={copy}
        lifecycle={lifecycle}
        isSaving={isPrivateCrmSaving}
        isError={isPrivateCrmError}
        onSave={onSavePrivateCrm}
      />

      {client.serviceWork ? (
        <ServiceWorkPanel
          copy={copy}
          locale={locale}
          serviceWork={client.serviceWork}
          reviewReceiptOrderId={reviewReceiptOrderId}
          isReviewReceiptSaving={isReviewReceiptSaving}
          isReviewReceiptError={isReviewReceiptError}
          onRecordReviewReceipt={onRecordReviewReceipt}
        />
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
  serviceWork,
  reviewReceiptOrderId,
  isReviewReceiptSaving,
  isReviewReceiptError,
  onRecordReviewReceipt
}: {
  readonly copy: ClientsCrmCopy;
  readonly locale: SupportedLocale;
  readonly serviceWork: AstrologerClientCrmDetail["serviceWork"];
  readonly reviewReceiptOrderId: string | null;
  readonly isReviewReceiptSaving: boolean;
  readonly isReviewReceiptError: boolean;
  readonly onRecordReviewReceipt: (orderId: string) => Promise<unknown>;
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
    serviceWork.sessions.recent.length > 0 ||
    serviceWork.orders.recent.length > 0 ||
    serviceWork.payments.recent.length > 0;

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
          <ServiceWorkGroup
            title={copy.serviceWork.recentOrders}
            total={serviceWork.orders.recentTotal}
            items={serviceWork.orders.recent}
            locale={locale}
            reviewReceiptOrderId={reviewReceiptOrderId}
            isReviewReceiptSaving={isReviewReceiptSaving}
            isReviewReceiptError={isReviewReceiptError}
            onRecordReviewReceipt={onRecordReviewReceipt}
            receiptLabels={copy.serviceWork.reviewReceipt}
          />
          <ServiceWorkGroup
            title={copy.serviceWork.recentPayments}
            total={serviceWork.payments.recentTotal}
            items={serviceWork.payments.recent}
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
  locale,
  reviewReceiptOrderId = null,
  isReviewReceiptSaving = false,
  isReviewReceiptError = false,
  onRecordReviewReceipt,
  receiptLabels
}: {
  readonly title: string;
  readonly total: number;
  readonly items: readonly ServiceWorkItem[];
  readonly locale: SupportedLocale;
  readonly reviewReceiptOrderId?: string | null;
  readonly isReviewReceiptSaving?: boolean;
  readonly isReviewReceiptError?: boolean;
  readonly onRecordReviewReceipt?: (orderId: string) => Promise<unknown>;
  readonly receiptLabels?: ClientsCrmCopy["serviceWork"]["reviewReceipt"];
}) {
  if (items.length === 0) return null;

  return (
    <div className={styles.workGroup}>
      <div className={styles.workGroupTitle}>
        <span>{title}</span>
        <span className={styles.workCount}>{total}</span>
      </div>
      <div className={styles.workList}>
        {items.map((item) => {
          const canRecordReviewReceipt =
            receiptLabels !== undefined &&
            onRecordReviewReceipt !== undefined &&
            isReviewReceiptEligibleOrder(item);
          const action = canRecordReviewReceipt
            ? {
                labels: receiptLabels,
                onRecord: onRecordReviewReceipt,
                isSaving: isReviewReceiptSaving && reviewReceiptOrderId === item.id,
                isError: isReviewReceiptError && reviewReceiptOrderId === item.id
              }
            : null;
          const content = (
            <>
              <span className={styles.workTitle}>{getServiceWorkTitle(item, locale)}</span>
              <span className={styles.workMeta}>{getServiceWorkMeta(item, locale)}</span>
              {action ? (
                <span className={styles.workActions}>
                  <button
                    className={styles.secondaryButton}
                    disabled={action.isSaving}
                    onClick={() => void action.onRecord(item.id)}
                    type="button"
                  >
                    {action.isSaving ? action.labels.saving : action.labels.action}
                  </button>
                  {action.isError ? (
                    <span className={styles.workActionError}>{action.labels.error}</span>
                  ) : null}
                </span>
              ) : null}
            </>
          );

          return action ? (
            <div className={styles.workItem} key={item.id}>
              {content}
            </div>
          ) : (
            <a
              className={styles.workItem}
              href={"href" in item ? item.href : undefined}
              key={item.id}
            >
              {content}
            </a>
          );
        })}
      </div>
    </div>
  );
}

type ServiceWorkItem =
  | ClientCrmServiceWorkBookingItem
  | ClientCrmServiceWorkSessionItem
  | ClientCrmServiceWorkOrderItem
  | ClientCrmServiceWorkPaymentItem;

function getServiceWorkTitle(item: ServiceWorkItem, locale: SupportedLocale): string {
  if ("productTitle" in item) return item.productTitle;
  const shortOrderId = item.orderId.slice(0, 8);
  return `${locale === "ru" ? "Платеж" : "Payment"} ${shortOrderId}`;
}

function isReviewReceiptEligibleOrder(
  item: ServiceWorkItem
): item is ClientCrmServiceWorkOrderItem {
  return (
    "productTitle" in item &&
    "amountMinor" in item &&
    "reviewReceiptAvailable" in item &&
    item.reviewReceiptAvailable
  );
}

function getServiceWorkMeta(item: ServiceWorkItem, locale: SupportedLocale): string {
  if ("state" in item) {
    return `${formatClientCrmDate(getServiceWorkStartAt(item), locale, item.timeZone)} · ${item.state}`;
  }

  return `${formatClientCrmDate(item.createdAt, locale)} · ${item.status} · ${formatClientCrmMoney(
    item.amountMinor,
    item.currency,
    locale
  )}`;
}

function getServiceWorkStartAt(
  item: ClientCrmServiceWorkBookingItem | ClientCrmServiceWorkSessionItem
): string {
  return "startAt" in item ? item.startAt : item.scheduledStartAt;
}

function Fact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className={styles.factRow}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{value}</span>
    </div>
  );
}
