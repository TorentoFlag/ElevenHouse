import type {
  AstroDiaryJournalSummaryResponse,
  AstroDiaryTimelineItem
} from "@elevenhouse/contracts";
import { Icon } from "@elevenhouse/design-system/icons/Icon";
import type { SupportedLocale } from "@elevenhouse/i18n";
import type { AstrologerCopy } from "../../../common/i18n/astrologerCopy";
import type { AstroDiaryActionError } from "../model/astroDiaryErrorModel";
import type { AstroDiaryReplyDraftState } from "../model/useAstroDiaryReplyMutations";
import { AstroDiaryJournalRail } from "./AstroDiaryJournalRail";
import { AstroDiaryReplyComposer } from "./AstroDiaryReplyComposer";
import { AstroDiaryTimeline } from "./AstroDiaryTimeline";
import styles from "./AstroDiaryWorkspaceView.module.css";

export type AstroDiaryWorkspaceState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "error"; onRetry: () => void }>
  | Readonly<{
      kind: "ready";
      journals: readonly AstroDiaryJournalSummaryResponse[];
      selectedJournal: AstroDiaryJournalSummaryResponse;
      timelineItems: readonly AstroDiaryTimelineItem[];
      timelineStatus: "loading" | "empty" | "error" | "ready";
      hasMoreTimeline: boolean;
      isLoadingMoreTimeline: boolean;
      loadMoreTimelineError: boolean;
      replyDraft: AstroDiaryReplyDraftState | null;
      replyBody: string;
      replyDraftStatus: "loading" | "error" | "ready";
      replyError: AstroDiaryActionError | null;
      isSavingReply: boolean;
      isPublishingReply: boolean;
      mobileDetailOpen: boolean;
      canReply?: boolean;
      timeZone?: string;
      onSelectJournal: (journalId: string) => void;
      onBackToList: () => void;
      onRetryTimeline: () => void;
      onLoadMoreTimeline: () => void;
      onOpenReply: () => void;
      onReplyBodyChange: (body: string) => void;
      onRetryReplyDraft: () => void;
      onSaveReply: (body: string) => void;
      onPublishReply: () => void;
      onReloadLatest: () => void;
    }>;

type AstroDiaryWorkspaceViewProps = Readonly<{
  copy: AstrologerCopy["astroDiary"];
  locale: SupportedLocale;
  state: AstroDiaryWorkspaceState;
}>;

export function AstroDiaryWorkspaceView({ copy, locale, state }: AstroDiaryWorkspaceViewProps) {
  return (
    <section className={styles.page} aria-labelledby="astro-diary-title">
      <header className={styles.toolbar}>
        <Icon iconName="orbit" width={22} height={22} aria-hidden="true" />
        <div>
          <p>{copy.eyebrow}</p>
          <h1 id="astro-diary-title">{copy.title}</h1>
        </div>
      </header>
      {state.kind === "loading" ? (
        <div
          className={styles.loadingWorkspace}
          aria-label={copy.loadingAriaLabel}
          aria-busy="true"
        >
          <span />
          <span />
        </div>
      ) : state.kind === "empty" ? (
        <div className={styles.emptyState}>
          <Icon iconName="orbit" width={28} height={28} aria-hidden="true" />
          <h2>{copy.emptyTitle}</h2>
          <p>{copy.emptyDescription}</p>
        </div>
      ) : state.kind === "error" ? (
        <div className={styles.emptyState} role="alert">
          <h2>{copy.errorTitle}</h2>
          <p>{copy.errorDescription}</p>
          <button type="button" onClick={state.onRetry}>
            <Icon iconName="refresh" width={14} height={14} aria-hidden="true" />
            {copy.retryLabel}
          </button>
        </div>
      ) : (
        <ReadyWorkspace copy={copy} locale={locale} state={state} />
      )}
    </section>
  );
}

function ReadyWorkspace({
  copy,
  locale,
  state
}: Readonly<{
  copy: AstrologerCopy["astroDiary"];
  locale: SupportedLocale;
  state: Extract<AstroDiaryWorkspaceState, { kind: "ready" }>;
}>) {
  const summary = state.selectedJournal;
  const clientLabel = copy.clientLabel(summary.journal.clientUserId.slice(0, 8));
  const canReply = state.canReply ?? false;
  return (
    <div
      className={styles.workspace}
      data-mobile-detail={state.mobileDetailOpen ? "true" : "false"}
    >
      <AstroDiaryJournalRail
        copy={copy}
        journals={state.journals}
        selectedJournalId={summary.journal.id}
        onSelectJournal={state.onSelectJournal}
      />
      <section className={styles.detail} aria-labelledby="astro-diary-detail-title">
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
            {summary.journal.clientUserId.slice(0, 2).toUpperCase()}
          </span>
          <div className={styles.detailHeading}>
            <h2 id="astro-diary-detail-title">{clientLabel}</h2>
            <p>{copy.journalStateLabel(summary)}</p>
          </div>
          {summary.currentObligation ? (
            <span className={styles.dueBadge}>
              <Icon iconName="clock" width={13} height={13} aria-hidden="true" />
              {copy.responseDueLabel(
                formatDueDate(
                  summary.currentObligation.dueAt,
                  locale,
                  summary.currentObligation.serviceTimezone
                )
              )}
            </span>
          ) : null}
        </header>
        {summary.access.mode === "read_only" ? (
          <div className={styles.readOnlyBanner} role="status">
            {copy.archivedLabel}
          </div>
        ) : null}
        <div className={styles.timeline}>
          <AstroDiaryTimeline
            copy={copy}
            locale={locale}
            timeZone={state.timeZone}
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
          {summary.access.mode === "read_only" ? (
            <p className={styles.composerNotice}>{copy.readOnlyComposerLabel}</p>
          ) : canReply && state.replyDraftStatus === "loading" ? (
            <p className={styles.composerNotice} role="status">
              {copy.reply.loadingDraftLabel}
            </p>
          ) : canReply && state.replyDraftStatus === "error" ? (
            <div className={styles.composerNotice} role="alert">
              {copy.reply.draftLoadErrorLabel}{" "}
              <button type="button" onClick={state.onRetryReplyDraft}>
                {copy.retryLabel}
              </button>
            </div>
          ) : canReply ? (
            <AstroDiaryReplyComposer
              copy={copy}
              draft={state.replyDraft}
              body={state.replyBody}
              error={state.replyError}
              isSaving={state.isSavingReply}
              isPublishing={state.isPublishingReply}
              onOpen={state.onOpenReply}
              onBodyChange={state.onReplyBodyChange}
              onReloadLatest={state.onReloadLatest}
              onSave={state.onSaveReply}
              onPublish={state.onPublishReply}
            />
          ) : (
            <p className={styles.composerNotice}>{copy.waitingForClientLabel}</p>
          )}
        </footer>
      </section>
    </div>
  );
}

function formatDueDate(instant: string, locale: SupportedLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone
  }).format(new Date(instant));
}
