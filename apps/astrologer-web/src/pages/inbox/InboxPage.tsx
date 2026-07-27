import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { createMessagingRealtimeClient } from "../../features/messaging/realtime/messagingRealtimeClient";
import { getMessagingMessageMediaSource } from "../../features/messaging/api/messagingApi";
import {
  createMessagingThreadClientMutationOptions,
  getMessagingThreadQueryOptions,
  handleMessagingRealtimeEvent,
  linkMessagingThreadClientMutationOptions,
  listMessagingChannelConnectionsQueryOptions,
  listMessagingThreadsQueryOptions,
  markMessagingThreadReadMutationOptions,
  sendMessagingMessageMutationOptions,
  startTelegramBusinessConnectionMutationOptions
} from "../../features/messaging/model/messagingQueries";
import { InboxPageView } from "./InboxPageView";

export function InboxPage() {
  const queryClient = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [linkClientUserId, setLinkClientUserId] = useState("");
  const [createClientDisplayName, setCreateClientDisplayName] = useState("");
  const channelConnectionsQuery = useQuery(listMessagingChannelConnectionsQueryOptions());
  const threadsQuery = useQuery(listMessagingThreadsQueryOptions({ limit: 50, offset: 0 }));
  const threadQuery = useQuery(getMessagingThreadQueryOptions(selectedThreadId));
  const startTelegramBusinessMutation = useMutation(
    startTelegramBusinessConnectionMutationOptions(queryClient)
  );
  const sendMessageMutation = useMutation(sendMessagingMessageMutationOptions(queryClient));
  const markReadMutation = useMutation(markMessagingThreadReadMutationOptions(queryClient));
  const linkClientMutation = useMutation(linkMessagingThreadClientMutationOptions(queryClient));
  const createClientMutation = useMutation(
    createMessagingThreadClientMutationOptions(queryClient)
  );
  const threads = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const allThreads = threadsQuery.data?.threads ?? [];

    if (!normalizedSearch) {
      return allThreads;
    }

    return allThreads.filter((thread) => {
      const identity = thread.primaryIdentity;
      return [
        identity?.displayName,
        identity?.username,
        identity?.providerChatId,
        thread.lastMessage?.text
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedSearch));
    });
  }, [search, threadsQuery.data?.threads]);

  useDocumentTitle("ElevenHouse | Сообщения");

  useEffect(() => {
    if (selectedThreadId || threads.length === 0) {
      return;
    }

    setSelectedThreadId(threads[0]?.id ?? null);
  }, [selectedThreadId, threads]);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      return undefined;
    }

    const realtimeClient = createMessagingRealtimeClient({
      baseUrl: "/api",
      onEvent: (event) => {
        void handleMessagingRealtimeEvent(queryClient, event);
      }
    });

    return () => realtimeClient.close();
  }, [queryClient]);

  const sendError =
    sendMessageMutation.error instanceof Error ? sendMessageMutation.error.message : null;
  const telegramBusinessStartError =
    startTelegramBusinessMutation.error instanceof Error
      ? startTelegramBusinessMutation.error.message
      : null;
  const clientActionError =
    linkClientMutation.error instanceof Error
      ? linkClientMutation.error.message
      : createClientMutation.error instanceof Error
        ? createClientMutation.error.message
        : null;

  return (
    <InboxPageView
      channelConnections={channelConnectionsQuery.data?.channelConnections ?? []}
      threads={threads}
      selectedThreadId={selectedThreadId}
      selectedThreadResponse={threadQuery.data ?? null}
      isConnectionsLoading={channelConnectionsQuery.isLoading}
      isThreadsLoading={threadsQuery.isLoading}
      isThreadsError={threadsQuery.isError}
      isThreadLoading={threadQuery.isLoading}
      isThreadError={threadQuery.isError}
      isSending={sendMessageMutation.isPending}
      sendError={sendError}
      isStartingTelegramBusinessConnection={startTelegramBusinessMutation.isPending}
      telegramBusinessStartError={telegramBusinessStartError}
      draft={draft}
      search={search}
      linkClientUserId={linkClientUserId}
      createClientDisplayName={createClientDisplayName}
      isLinkingClient={linkClientMutation.isPending}
      isCreatingClient={createClientMutation.isPending}
      clientActionError={clientActionError}
      onSearchChange={setSearch}
      onSelectThread={setSelectedThreadId}
      onDraftChange={setDraft}
      onStartTelegramBusinessConnection={() => {
        startTelegramBusinessMutation
          .mutateAsync()
          .then((result) => {
            if (result.telegramBotUrl) {
              window.open(result.telegramBotUrl, "_blank", "noopener,noreferrer");
            }
          })
          .catch(() => undefined);
      }}
      onSend={() => {
        if (!selectedThreadId || !draft.trim()) {
          return;
        }

        sendMessageMutation
          .mutateAsync({
            threadId: selectedThreadId,
            body: { text: draft }
          })
          .then(() => setDraft(""))
          .catch(() => undefined);
      }}
      onMarkRead={(threadId) => markReadMutation.mutate(threadId)}
      onLinkClientUserIdChange={setLinkClientUserId}
      onCreateClientDisplayNameChange={setCreateClientDisplayName}
      onLinkClientSubmit={(threadId) => {
        const clientUserId = linkClientUserId.trim();

        if (!clientUserId) {
          return;
        }

        linkClientMutation
          .mutateAsync({
            threadId,
            body: { clientUserId }
          })
          .then(() => setLinkClientUserId(""))
          .catch(() => undefined);
      }}
      onCreateClientSubmit={(threadId) => {
        const displayName = createClientDisplayName.trim();

        if (!displayName) {
          return;
        }

        createClientMutation
          .mutateAsync({
            threadId,
            body: { displayName }
          })
          .then(() => setCreateClientDisplayName(""))
          .catch(() => undefined);
      }}
      onLoadMessageMediaSource={getMessagingMessageMediaSource}
    />
  );
}
