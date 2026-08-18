import { useI18n } from "@elevenhouse/i18n";
import { useState } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { AstrologerCopy } from "../../common/i18n/astrologerCopy";
import { useCurrentAstrologerProfileQuery } from "../../features/astrologer-profile/model/useCurrentAstrologerProfileQuery";
import { toAstroDiaryActionError } from "../../features/astro-diary/model/astroDiaryErrorModel";
import {
  collectAstroDiaryTimelineItems,
  isAstroDiaryReplyActionable,
  resolveAstroDiarySelection
} from "../../features/astro-diary/model/astroDiaryWorkspaceModel";
import { useAstroDiaryJournalListQuery } from "../../features/astro-diary/model/useAstroDiaryJournalListQuery";
import { useAstroDiaryJournalQuery } from "../../features/astro-diary/model/useAstroDiaryJournalQuery";
import {
  type AstroDiaryReplyDraftState,
  useAstroDiaryReplyMutations
} from "../../features/astro-diary/model/useAstroDiaryReplyMutations";
import { useAstroDiaryTimelineQuery } from "../../features/astro-diary/model/useAstroDiaryTimelineQuery";
import {
  AstroDiaryWorkspaceView,
  type AstroDiaryWorkspaceState
} from "../../features/astro-diary/ui/AstroDiaryWorkspaceView";

export function AstroDiaryPage() {
  const { dictionary, locale } = useI18n<AstrologerCopy>();
  const copy = dictionary.astroDiary;
  const profileQuery = useCurrentAstrologerProfileQuery();
  const journalsQuery = useAstroDiaryJournalListQuery();
  const [requestedJournalId, setRequestedJournalId] = useState<string>();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, AstroDiaryReplyDraftState>>({});
  const [replyErrors, setReplyErrors] = useState<
    Record<string, ReturnType<typeof toAstroDiaryActionError> | undefined>
  >({});
  const journals = journalsQuery.data?.journals ?? [];
  const selectedJournalId = resolveAstroDiarySelection(requestedJournalId, journals);
  const listSummary = journals.find(({ journal }) => journal.id === selectedJournalId);
  const journalQuery = useAstroDiaryJournalQuery(selectedJournalId);
  const timelineQuery = useAstroDiaryTimelineQuery(selectedJournalId);
  const replyMutations = useAstroDiaryReplyMutations();

  useDocumentTitle(copy.documentTitle);

  const selectedJournal = journalQuery.data ?? listSummary;
  const timelineItems = collectAstroDiaryTimelineItems(timelineQuery.data?.pages);
  const timelineStatus = resolveTimelineStatus({
    isLoading: timelineQuery.isLoading,
    isError: timelineQuery.isError || journalQuery.isError,
    itemCount: timelineItems.length
  });
  const currentDraft = selectedJournalId ? (replyDrafts[selectedJournalId] ?? null) : null;
  const currentError = selectedJournalId ? (replyErrors[selectedJournalId] ?? null) : null;

  const state: AstroDiaryWorkspaceState = journalsQuery.isLoading
    ? { kind: "loading" }
    : journalsQuery.isError
      ? { kind: "error", onRetry: () => void journalsQuery.refetch() }
      : journals.length === 0 || !selectedJournalId || !selectedJournal
        ? { kind: "empty" }
        : {
            kind: "ready",
            journals,
            selectedJournal,
            timelineItems,
            timelineStatus,
            hasMoreTimeline: Boolean(timelineQuery.hasNextPage),
            isLoadingMoreTimeline: timelineQuery.isFetchingNextPage,
            replyDraft: currentDraft,
            replyError: currentError,
            isSavingReply: replyMutations.save.isPending,
            isPublishingReply: replyMutations.publish.isPending,
            mobileDetailOpen,
            canReply: Boolean(
              journalQuery.data &&
                !journalQuery.isFetching &&
                isAstroDiaryReplyActionable(journalQuery.data)
            ),
            ...(profileQuery.data?.profile?.timezone
              ? { timeZone: profileQuery.data.profile.timezone }
              : {}),
            onSelectJournal: (journalId) => {
              setRequestedJournalId(journalId);
              setMobileDetailOpen(true);
            },
            onBackToList: () => setMobileDetailOpen(false),
            onRetryTimeline: () => {
              void Promise.all([journalQuery.refetch(), timelineQuery.refetch()]);
            },
            onLoadMoreTimeline: () => void timelineQuery.fetchNextPage(),
            onOpenReply: () => clearReplyError(selectedJournalId, setReplyErrors),
            onSaveReply: (body) => {
              if (!journalQuery.data) return;
              void replyMutations.save
                .mutateAsync({
                  journalId: selectedJournalId,
                  expectedJournalVersion: journalQuery.data.journal.version,
                  body,
                  draft: currentDraft
                })
                .then(({ draft }) => {
                  setReplyDrafts((current) => ({ ...current, [selectedJournalId]: draft }));
                  clearReplyError(selectedJournalId, setReplyErrors);
                })
                .catch((error: unknown) => {
                  setReplyErrors((current) => ({
                    ...current,
                    [selectedJournalId]: toAstroDiaryActionError(error)
                  }));
                });
            },
            onPublishReply: () => {
              if (!journalQuery.data || !currentDraft) return;
              void replyMutations.publish
                .mutateAsync({
                  journalId: selectedJournalId,
                  expectedJournalVersion: journalQuery.data.journal.version,
                  draft: currentDraft
                })
                .then(() => {
                  setReplyDrafts((current) => {
                    const next = { ...current };
                    delete next[selectedJournalId];
                    return next;
                  });
                  clearReplyError(selectedJournalId, setReplyErrors);
                })
                .catch((error: unknown) => {
                  setReplyErrors((current) => ({
                    ...current,
                    [selectedJournalId]: toAstroDiaryActionError(error)
                  }));
                });
            },
            onReloadLatest: () => {
              clearReplyError(selectedJournalId, setReplyErrors);
              void Promise.all([journalQuery.refetch(), timelineQuery.refetch()]);
            }
          };

  return <AstroDiaryWorkspaceView copy={copy} locale={locale} state={state} />;
}

function resolveTimelineStatus(input: {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly itemCount: number;
}): "loading" | "empty" | "error" | "ready" {
  if (input.isLoading) return "loading";
  if (input.isError) return "error";
  return input.itemCount === 0 ? "empty" : "ready";
}

function clearReplyError(
  journalId: string,
  setReplyErrors: React.Dispatch<
    React.SetStateAction<
      Record<string, ReturnType<typeof toAstroDiaryActionError> | undefined>
    >
  >
): void {
  setReplyErrors((current) => ({ ...current, [journalId]: undefined }));
}
