import type {
  AstroDiaryJournalSummaryResponse,
  AstroDiaryMoodId,
  AstroDiaryTimelineItem
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import { Link } from "react-router";
import type { ClientCopy } from "../../../common/i18n/clientCopy";
import type { ClientAstroDiaryActionError } from "../model/astroDiaryErrorModel";
import type { ClientAstroDiaryEntryDraftState } from "../model/useClientAstroDiaryEntryMutations";
import {
  ClientAstroDiaryEntryComposer,
  type ClientAstroDiaryComposerAttachment
} from "./ClientAstroDiaryEntryComposer";
import { ClientAstroDiaryJournalRail } from "./ClientAstroDiaryJournalRail";
import { ClientAstroDiaryTimeline } from "./ClientAstroDiaryTimeline";
import styles from "./ClientAstroDiaryWorkspaceView.module.css";

export type ClientAstroDiaryWorkspaceState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "not_related" }>
  | Readonly<{ kind: "no_subscription"; astrologerName: string }>
  | Readonly<{ kind: "error"; onRetry: () => void }>
  | Readonly<{
      kind: "ready";
      astrologerName: string;
      journals: readonly AstroDiaryJournalSummaryResponse[];
      selectedJournal: AstroDiaryJournalSummaryResponse;
      timelineItems: readonly AstroDiaryTimelineItem[];
      timelineStatus: "loading" | "empty" | "error" | "ready";
      hasMoreTimeline: boolean;
      isLoadingMoreTimeline: boolean;
      loadMoreTimelineError: boolean;
      entryDraft: ClientAstroDiaryEntryDraftState | null;
      entryBody: string;
      entryMoodId: AstroDiaryMoodId | null;
      entryAttachments: readonly ClientAstroDiaryComposerAttachment[];
      entryAttachmentError: boolean;
      isUploadingEntryAttachment: boolean;
      entryError: ClientAstroDiaryActionError | null;
      isSavingEntry: boolean;
      isPublishingEntry: boolean;
      mobileDetailOpen: boolean;
      canWrite: boolean;
      entryAuthorityStatus: "loading" | "error" | "ready";
      onSelectJournal: (journalId: string) => void;
      onBackToList: () => void;
      onRetryTimeline: () => void;
      onLoadMoreTimeline: () => void;
      onOpenEntry: () => void;
      onRetryEntryAuthority: () => void;
      onEntryBodyChange: (body: string) => void;
      onEntryMoodChange: (moodId: AstroDiaryMoodId | null) => void;
      onAttachEntryFile: Parameters<typeof ClientAstroDiaryEntryComposer>[0]["onAttachFile"];
      onRemoveEntryAttachment: (mediaId: string) => void;
      onSaveEntry: (
        body: string,
        moodId: AstroDiaryMoodId | null,
        attachmentIds: readonly string[]
      ) => void;
      onPublishEntry: () => void;
      onReloadLatest: () => void;
    }>;

export function ClientAstroDiaryWorkspaceView(props: {
  readonly copy: ClientCopy["astroDiary"];
  readonly locale: SupportedLocale;
  readonly state: ClientAstroDiaryWorkspaceState;
}) {
  return (
    <main className={styles.page}>
      <aside className={styles.appSidebar} aria-label={props.copy.clientCabinetLabel}>
        <Link className={styles.brand} to="/me">
          <Icon iconName="logoMoon" width={34} height={34} aria-hidden="true" />
          <span>
            <strong>ElevenHouse</strong>
            <small>{props.copy.clientCabinetLabel}</small>
          </span>
        </Link>
        <nav className={styles.appNav} aria-label={props.copy.navigationLabel}>
          <Link to="/me">
            <Icon iconName="layoutGrid" width={19} height={19} aria-hidden="true" />
            {props.copy.backToCabinetLabel}
          </Link>
          <span aria-current="page">
            <Icon iconName="orbit" width={19} height={19} aria-hidden="true" />
            {props.copy.title}
          </span>
        </nav>
      </aside>
      <section className={styles.contentShell}>
        <header className={styles.appHeader}>
          <Link to="/me">
            <Icon iconName="arrowLeft" width={18} height={18} aria-hidden="true" />
            {props.copy.backToCabinetLabel}
          </Link>
          <span>{props.copy.privateLabel}</span>
        </header>
        <section className={styles.diarySurface} aria-labelledby="client-astro-diary-title">
          <header className={styles.toolbar}>
            <Icon iconName="orbit" width={22} height={22} aria-hidden="true" />
            <div>
              <p>{props.copy.eyebrow}</p>
              <h1 id="client-astro-diary-title">{props.copy.title}</h1>
            </div>
          </header>
          {props.state.kind === "loading" ? (
            <LoadingState copy={props.copy} />
          ) : props.state.kind === "not_related" ? (
            <CenteredState
              title={props.copy.notRelatedTitle}
              description={props.copy.notRelatedDescription}
            />
          ) : props.state.kind === "no_subscription" ? (
            <CenteredState
              title={props.copy.noSubscriptionTitle(props.state.astrologerName)}
              description={props.copy.noSubscriptionDescription}
            />
          ) : props.state.kind === "error" ? (
            <CenteredState
              role="alert"
              title={props.copy.errorTitle}
              description={props.copy.errorDescription}
              action={
                <button type="button" onClick={props.state.onRetry}>
                  <Icon iconName="refresh" width={14} height={14} aria-hidden="true" />
                  {props.copy.retryLabel}
                </button>
              }
            />
          ) : (
            <ReadyWorkspace copy={props.copy} locale={props.locale} state={props.state} />
          )}
        </section>
      </section>
    </main>
  );
}

function LoadingState({ copy }: { readonly copy: ClientCopy["astroDiary"] }) {
  return (
    <div className={styles.loadingWorkspace} aria-label={copy.loadingAriaLabel} aria-busy="true">
      <span />
      <span />
    </div>
  );
}

function CenteredState(props: {
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
  readonly role?: "alert";
}) {
  return (
    <div className={styles.emptyState} role={props.role}>
      <Icon iconName="orbit" width={28} height={28} aria-hidden="true" />
      <h2>{props.title}</h2>
      <p>{props.description}</p>
      {props.action}
    </div>
  );
}

function ReadyWorkspace(props: {
  readonly copy: ClientCopy["astroDiary"];
  readonly locale: SupportedLocale;
  readonly state: Extract<ClientAstroDiaryWorkspaceState, { kind: "ready" }>;
}) {
  const { state, copy } = props;
  return (
    <div
      className={styles.workspace}
      data-mobile-detail={state.mobileDetailOpen ? "true" : "false"}
      data-testid="client-astro-diary-workspace"
    >
      <ClientAstroDiaryJournalRail
        copy={copy}
        locale={props.locale}
        journals={state.journals}
        selectedJournalId={state.selectedJournal.journal.id}
        onSelectJournal={state.onSelectJournal}
      />
      <section className={styles.detail} aria-labelledby="client-astro-diary-detail-title">
        <header className={styles.detailHeader}>
          <button
            className={styles.mobileBackButton}
            type="button"
            aria-label={copy.backToListLabel}
            onClick={state.onBackToList}
          >
            <Icon iconName="arrowLeft" width={18} height={18} aria-hidden="true" />
          </button>
          <span className={styles.detailAvatar} aria-hidden="true">
            {initials(state.astrologerName)}
          </span>
          <div className={styles.detailHeading}>
            <h2 id="client-astro-diary-detail-title">{state.astrologerName}</h2>
            <p>{copy.journalStateLabel(state.selectedJournal)}</p>
          </div>
          {state.selectedJournal.access.mode === "active" ? (
            <span className={styles.allowanceBadge}>
              {copy.allowanceLabel(state.selectedJournal.access.allowance.available)}
            </span>
          ) : null}
        </header>
        {state.selectedJournal.access.mode === "read_only" ? (
          <div className={styles.readOnlyBanner} role="status">
            {copy.archivedLabel}
          </div>
        ) : null}
        <div className={styles.timeline}>
          <ClientAstroDiaryTimeline
            copy={copy}
            locale={props.locale}
            items={state.timelineItems}
            status={state.timelineStatus}
            hasMore={state.hasMoreTimeline}
            isLoadingMore={state.isLoadingMoreTimeline}
            loadMoreError={state.loadMoreTimelineError}
            onRetry={state.onRetryTimeline}
            onLoadMore={state.onLoadMoreTimeline}
          />
        </div>
        <footer className={styles.composerRegion}>
          {state.selectedJournal.access.mode === "read_only" ? (
            <p className={styles.composerNotice}>{copy.readOnlyComposerLabel}</p>
          ) : state.entryAuthorityStatus === "loading" ? (
            <p className={styles.composerNotice} role="status">
              {copy.loadingAccessLabel}
            </p>
          ) : state.entryAuthorityStatus === "error" ? (
            <div className={styles.composerNotice} role="alert">
              <p>{copy.accessErrorLabel}</p>
              <button type="button" onClick={state.onRetryEntryAuthority}>
                <Icon iconName="refresh" width={14} height={14} aria-hidden="true" />
                {copy.retryLabel}
              </button>
            </div>
          ) : state.canWrite ? (
            <ClientAstroDiaryEntryComposer
              copy={copy}
              draft={state.entryDraft}
              body={state.entryBody}
              moodId={state.entryMoodId}
              attachments={state.entryAttachments}
              attachmentError={state.entryAttachmentError}
              isUploadingAttachment={state.isUploadingEntryAttachment}
              error={state.entryError}
              isSaving={state.isSavingEntry}
              isPublishing={state.isPublishingEntry}
              onOpen={state.onOpenEntry}
              onBodyChange={state.onEntryBodyChange}
              onMoodChange={state.onEntryMoodChange}
              onAttachFile={state.onAttachEntryFile}
              onRemoveAttachment={state.onRemoveEntryAttachment}
              onReloadLatest={state.onReloadLatest}
              onSave={state.onSaveEntry}
              onPublish={state.onPublishEntry}
            />
          ) : (
            <p className={styles.composerNotice}>
              {state.selectedJournal.access.allowance.available === 0
                ? copy.allowanceExhaustedLabel
                : copy.waitingForAstrologerLabel}
            </p>
          )}
        </footer>
      </section>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "EH"
  );
}
