import type { AstroDiaryMoodId } from "@elevenhouse/contracts";
import { useI18n } from "@elevenhouse/i18n";
import { useState } from "react";
import { useParams } from "react-router";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import type { ClientCopy } from "../../common/i18n/clientCopy";
import { toClientAstroDiaryActionError } from "../../features/astro-diary/model/astroDiaryErrorModel";
import {
  collectAstroDiaryTimelineItems,
  isClientEntryActionable,
  resolveRelationshipJournalSelection
} from "../../features/astro-diary/model/astroDiaryWorkspaceModel";
import { useClientAstroDiaryEntryMutations } from "../../features/astro-diary/model/useClientAstroDiaryEntryMutations";
import { useClientAstroDiaryEntryDraftQuery } from "../../features/astro-diary/model/useClientAstroDiaryEntryDraftQuery";
import { useClientAstroDiaryJournalListQuery } from "../../features/astro-diary/model/useClientAstroDiaryJournalListQuery";
import { useClientAstroDiaryJournalQuery } from "../../features/astro-diary/model/useClientAstroDiaryJournalQuery";
import { useClientAstroDiaryRelationshipQuery } from "../../features/astro-diary/model/useClientAstroDiaryRelationshipQuery";
import { useClientAstroDiaryTimelineQuery } from "../../features/astro-diary/model/useClientAstroDiaryTimelineQuery";
import { ClientAstroDiaryWorkspaceView, type ClientAstroDiaryWorkspaceState } from "../../features/astro-diary/ui/ClientAstroDiaryWorkspaceView";

export function ClientAstroDiaryPage() {
  const { astrologerId } = useParams<{ astrologerId: string }>();
  const { dictionary, locale } = useI18n<ClientCopy>();
  const copy = dictionary.astroDiary;
  const relationshipQuery = useClientAstroDiaryRelationshipQuery();
  const relationship = relationshipQuery.data?.astrologers.find(
    (item) => item.astrologerUserId === astrologerId && item.relationshipStatus !== "blocked"
  );
  const journalsQuery = useClientAstroDiaryJournalListQuery(Boolean(relationship));
  const [requestedJournalId, setRequestedJournalId] = useState<string>();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [entryBodies, setEntryBodies] = useState<Record<string, string>>({});
  const [entryMoods, setEntryMoods] = useState<Record<string, AstroDiaryMoodId | null>>({});
  const [entryErrors, setEntryErrors] = useState<Record<string, ReturnType<typeof toClientAstroDiaryActionError> | undefined>>({});
  const selection = resolveRelationshipJournalSelection({
    astrologerId: astrologerId ?? "",
    requestedJournalId,
    journals: journalsQuery.data?.journals ?? []
  });
  const selectedJournalId = selection.selectedJournalId;
  const listSummary = selection.journals.find(({ journal }) => journal.id === selectedJournalId);
  const journalQuery = useClientAstroDiaryJournalQuery(selectedJournalId);
  const timelineQuery = useClientAstroDiaryTimelineQuery(selectedJournalId);
  const entryDraftQuery = useClientAstroDiaryEntryDraftQuery(selectedJournalId);
  const mutations = useClientAstroDiaryEntryMutations();

  useDocumentTitle(copy.documentTitle);

  const selectedJournal = journalQuery.data ?? listSummary;
  const timelineItems = collectAstroDiaryTimelineItems(timelineQuery.data?.pages);
  const draft = selectedJournalId ? entryDraftQuery.data?.draft ?? null : null;
  const body = selectedJournalId ? entryBodies[selectedJournalId] ?? draft?.body ?? "" : "";
  const moodId = selectedJournalId ? entryMoods[selectedJournalId] ?? draft?.moodId ?? null : null;
  const error = selectedJournalId ? entryErrors[selectedJournalId] ?? null : null;

  const state: ClientAstroDiaryWorkspaceState = relationshipQuery.isLoading
    ? { kind: "loading" }
    : relationshipQuery.isError
      ? { kind: "error", onRetry: () => void relationshipQuery.refetch() }
      : !relationship
        ? { kind: "not_related" }
        : journalsQuery.isLoading
          ? { kind: "loading" }
          : journalsQuery.isError
            ? { kind: "error", onRetry: () => void journalsQuery.refetch() }
            : !selectedJournalId || !selectedJournal
              ? { kind: "no_subscription", astrologerName: relationship.publicName }
              : {
                  kind: "ready",
                  astrologerName: relationship.publicName,
                  journals: selection.journals,
                  selectedJournal,
                  timelineItems,
                  timelineStatus: resolveTimelineStatus({
                    isLoading: timelineQuery.isLoading,
                    isError: (timelineQuery.isError && !timelineQuery.isFetchNextPageError) || journalQuery.isError,
                    itemCount: timelineItems.length
                  }),
                  hasMoreTimeline: Boolean(timelineQuery.hasNextPage),
                  isLoadingMoreTimeline: timelineQuery.isFetchingNextPage,
                  loadMoreTimelineError: timelineQuery.isFetchNextPageError,
                  entryDraft: draft,
                  entryBody: body,
                  entryMoodId: moodId,
                  entryError: error,
                  isSavingEntry: mutations.save.isPending,
                  isPublishingEntry: mutations.publish.isPending,
                  mobileDetailOpen,
                  canWrite: Boolean(journalQuery.data && isClientEntryActionable(journalQuery.data)),
                  entryAuthorityStatus: journalQuery.isPending || entryDraftQuery.isPending
                    ? "loading"
                    : journalQuery.isError || entryDraftQuery.isError
                      ? "error"
                      : "ready",
                  onSelectJournal: (journalId) => { setRequestedJournalId(journalId); setMobileDetailOpen(true); },
                  onBackToList: () => setMobileDetailOpen(false),
                  onRetryTimeline: () => { void Promise.all([journalQuery.refetch(), timelineQuery.refetch()]); },
                  onLoadMoreTimeline: () => void timelineQuery.fetchNextPage(),
                  onOpenEntry: () => clearEntryError(selectedJournalId, setEntryErrors),
                  onRetryEntryAuthority: () => {
                    void Promise.all([journalQuery.refetch(), entryDraftQuery.refetch()]);
                  },
                  onEntryBodyChange: (nextBody) => setEntryBodies((current) => ({ ...current, [selectedJournalId]: nextBody })),
                  onEntryMoodChange: (nextMood) => setEntryMoods((current) => ({ ...current, [selectedJournalId]: nextMood })),
                  onSaveEntry: (nextBody, nextMoodId) => {
                    if (!journalQuery.data) return;
                    void mutations.save.mutateAsync({ journalId: selectedJournalId, expectedJournalVersion: journalQuery.data.journal.version, body: nextBody, moodId: nextMoodId, draft }).then(() => {
                      clearEntryError(selectedJournalId, setEntryErrors);
                    }).catch((caught: unknown) => setEntryErrors((current) => ({ ...current, [selectedJournalId]: toClientAstroDiaryActionError(caught) })));
                  },
                  onPublishEntry: () => {
                    if (!journalQuery.data || !draft) return;
                    void mutations.publish.mutateAsync({ journalId: selectedJournalId, expectedJournalVersion: journalQuery.data.journal.version, draft }).then(() => {
                      setEntryBodies((current) => omit(current, selectedJournalId));
                      setEntryMoods((current) => omit(current, selectedJournalId));
                      clearEntryError(selectedJournalId, setEntryErrors);
                    }).catch((caught: unknown) => setEntryErrors((current) => ({ ...current, [selectedJournalId]: toClientAstroDiaryActionError(caught) })));
                  },
                  onReloadLatest: () => {
                    clearEntryError(selectedJournalId, setEntryErrors);
                    void Promise.all([
                      journalQuery.refetch(),
                      timelineQuery.refetch(),
                      entryDraftQuery.refetch(),
                      journalsQuery.refetch()
                    ]);
                  }
                };

  return <ClientAstroDiaryWorkspaceView copy={copy} locale={locale} state={state} />;
}

function resolveTimelineStatus(input: { readonly isLoading: boolean; readonly isError: boolean; readonly itemCount: number }): "loading" | "empty" | "error" | "ready" {
  if (input.isLoading) return "loading";
  if (input.isError) return "error";
  return input.itemCount === 0 ? "empty" : "ready";
}

function omit<T>(current: Record<string, T>, key: string): Record<string, T> {
  const next = { ...current };
  delete next[key];
  return next;
}

function clearEntryError(
  journalId: string,
  setErrors: React.Dispatch<React.SetStateAction<Record<string, ReturnType<typeof toClientAstroDiaryActionError> | undefined>>>
): void {
  setErrors((current) => ({ ...current, [journalId]: undefined }));
}
