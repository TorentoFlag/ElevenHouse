import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import { createMessagingRealtimeClient } from "../../features/messaging/realtime/messagingRealtimeClient";
import { getMessagingMessageMediaSource } from "../../features/messaging/api/messagingApi";
import type { ClientSelectOption } from "../../features/clients/model/clientSelectorModel";
import type { StartTelegramBusinessConnectionResponse } from "@elevenhouse/contracts";
import {
  filterInboxThreads,
  type InboxThreadFilter
} from "../../features/messaging/model/inboxThreadFilters";
import {
  createMessagingThreadClientMutationOptions,
  getMessagingThreadQueryOptions,
  handleMessagingRealtimeEvent,
  linkMessagingThreadClientMutationOptions,
  listMessagingChannelConnectionsQueryOptions,
  listMessagingThreadsQueryOptions,
  markMessagingThreadReadMutationOptions,
  sendMessagingMessageMutationOptions,
  startInstagramGraphConnectionMutationOptions,
  startTelegramBusinessConnectionMutationOptions,
  startTelegramMtprotoConnectionMutationOptions,
  submitTelegramMtprotoCodeMutationOptions,
  submitTelegramMtprotoPasswordMutationOptions
} from "../../features/messaging/model/messagingQueries";
import {
  createInitialTelegramMtprotoWizardState,
  deriveTelegramMtprotoWizardState
} from "../../features/messaging/model/telegramMtprotoConnectionWizard";
import { InboxPageView } from "./InboxPageView";

export function InboxPage() {
  const queryClient = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [activeThreadFilter, setActiveThreadFilter] = useState<InboxThreadFilter>("all");
  const [linkClient, setLinkClient] = useState<ClientSelectOption | null>(null);
  const [createClientDisplayName, setCreateClientDisplayName] = useState("");
  const [isTelegramBusinessGuideOpen, setIsTelegramBusinessGuideOpen] = useState(false);
  const [telegramBusinessStartGuide, setTelegramBusinessStartGuide] =
    useState<StartTelegramBusinessConnectionResponse | null>(null);
  const [telegramMtprotoWizard, setTelegramMtprotoWizard] = useState(
    createInitialTelegramMtprotoWizardState
  );
  const [telegramMtprotoPhoneNumber, setTelegramMtprotoPhoneNumber] = useState("");
  const [telegramMtprotoCode, setTelegramMtprotoCode] = useState("");
  const [telegramMtprotoPassword, setTelegramMtprotoPassword] = useState("");
  const [isTelegramMtprotoConsentAccepted, setIsTelegramMtprotoConsentAccepted] = useState(false);
  const channelConnectionsQuery = useQuery(listMessagingChannelConnectionsQueryOptions());
  const threadsQuery = useQuery(listMessagingThreadsQueryOptions({ limit: 50, offset: 0 }));
  const threadQuery = useQuery(getMessagingThreadQueryOptions(selectedThreadId));
  const startTelegramBusinessMutation = useMutation(
    startTelegramBusinessConnectionMutationOptions(queryClient)
  );
  const startInstagramGraphMutation = useMutation(
    startInstagramGraphConnectionMutationOptions(queryClient)
  );
  const startTelegramMtprotoMutation = useMutation(
    startTelegramMtprotoConnectionMutationOptions(queryClient)
  );
  const submitTelegramMtprotoCodeMutation = useMutation(
    submitTelegramMtprotoCodeMutationOptions(queryClient)
  );
  const submitTelegramMtprotoPasswordMutation = useMutation(
    submitTelegramMtprotoPasswordMutationOptions(queryClient)
  );
  const sendMessageMutation = useMutation(sendMessagingMessageMutationOptions(queryClient));
  const markReadMutation = useMutation(markMessagingThreadReadMutationOptions(queryClient));
  const linkClientMutation = useMutation(linkMessagingThreadClientMutationOptions(queryClient));
  const createClientMutation = useMutation(createMessagingThreadClientMutationOptions(queryClient));
  const channelConnections = channelConnectionsQuery.data?.channelConnections ?? [];
  const hasActiveTelegramConnection = channelConnections.some(
    (connection) => connection.provider === "telegram" && connection.status === "active"
  );
  const wasTelegramActiveRef = useRef(hasActiveTelegramConnection);
  const threads = useMemo(() => {
    const allThreads = threadsQuery.data?.threads ?? [];

    return filterInboxThreads(allThreads, {
      search,
      activeFilter: activeThreadFilter
    });
  }, [activeThreadFilter, search, threadsQuery.data?.threads]);

  useDocumentTitle("ElevenHouse | Сообщения");

  useEffect(() => {
    if (selectedThreadId && threads.some((thread) => thread.id === selectedThreadId)) {
      return;
    }

    setSelectedThreadId(threads[0]?.id ?? null);
  }, [selectedThreadId, threads]);

  useEffect(() => {
    setLinkClient(null);
    setCreateClientDisplayName("");
  }, [selectedThreadId]);

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

  useEffect(() => {
    const wasTelegramActive = wasTelegramActiveRef.current;
    wasTelegramActiveRef.current = hasActiveTelegramConnection;
    if (!isTelegramBusinessGuideOpen || !hasActiveTelegramConnection || wasTelegramActive) {
      return;
    }

    setIsTelegramBusinessGuideOpen(false);
    setTelegramBusinessStartGuide(null);
    setTelegramMtprotoWizard(createInitialTelegramMtprotoWizardState());
    setTelegramMtprotoCode("");
    setTelegramMtprotoPassword("");
  }, [hasActiveTelegramConnection, isTelegramBusinessGuideOpen]);

  const sendError =
    sendMessageMutation.error instanceof Error ? sendMessageMutation.error.message : null;
  const telegramBusinessStartError =
    startTelegramBusinessMutation.error instanceof Error
      ? startTelegramBusinessMutation.error.message
      : null;
  const telegramMtprotoError =
    startTelegramMtprotoMutation.error instanceof Error
      ? startTelegramMtprotoMutation.error.message
      : submitTelegramMtprotoCodeMutation.error instanceof Error
        ? submitTelegramMtprotoCodeMutation.error.message
        : submitTelegramMtprotoPasswordMutation.error instanceof Error
          ? submitTelegramMtprotoPasswordMutation.error.message
          : null;
  const instagramGraphStartError =
    startInstagramGraphMutation.error instanceof Error
      ? startInstagramGraphMutation.error.message
      : null;
  const clientActionError =
    linkClientMutation.error instanceof Error
      ? linkClientMutation.error.message
      : createClientMutation.error instanceof Error
        ? createClientMutation.error.message
        : null;

  return (
    <InboxPageView
      channelConnections={channelConnections}
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
      isTelegramBusinessGuideOpen={isTelegramBusinessGuideOpen}
      telegramBusinessBotUsername={telegramBusinessStartGuide?.telegramBotUsername ?? null}
      isStartingTelegramBusinessConnection={startTelegramBusinessMutation.isPending}
      telegramBusinessStartError={telegramBusinessStartError}
      isStartingInstagramGraphConnection={startInstagramGraphMutation.isPending}
      instagramGraphStartError={instagramGraphStartError}
      telegramMtprotoStep={telegramMtprotoWizard.step}
      telegramMtprotoPhoneNumber={telegramMtprotoPhoneNumber}
      telegramMtprotoCode={telegramMtprotoCode}
      telegramMtprotoPassword={telegramMtprotoPassword}
      telegramMtprotoMaskedPhoneNumber={telegramMtprotoWizard.maskedPhoneNumber}
      telegramMtprotoRetryAfterSeconds={telegramMtprotoWizard.retryAfterSeconds}
      isTelegramMtprotoConsentAccepted={isTelegramMtprotoConsentAccepted}
      isStartingTelegramMtprotoConnection={startTelegramMtprotoMutation.isPending}
      isSubmittingTelegramMtprotoCode={submitTelegramMtprotoCodeMutation.isPending}
      isSubmittingTelegramMtprotoPassword={submitTelegramMtprotoPasswordMutation.isPending}
      telegramMtprotoError={telegramMtprotoError}
      draft={draft}
      search={search}
      activeThreadFilter={activeThreadFilter}
      linkClientUserId={linkClient?.value ?? ""}
      linkClient={linkClient}
      createClientDisplayName={createClientDisplayName}
      isLinkingClient={linkClientMutation.isPending}
      isCreatingClient={createClientMutation.isPending}
      clientActionError={clientActionError}
      onSearchChange={setSearch}
      onThreadFilterChange={setActiveThreadFilter}
      onSelectThread={setSelectedThreadId}
      onDraftChange={setDraft}
      onOpenTelegramBusinessGuide={() => setIsTelegramBusinessGuideOpen(true)}
      onCloseTelegramBusinessGuide={() => setIsTelegramBusinessGuideOpen(false)}
      onStartTelegramBusinessConnection={() => {
        startTelegramBusinessMutation
          .mutateAsync()
          .then((result) => setTelegramBusinessStartGuide(result))
          .catch(() => undefined);
      }}
      onStartInstagramGraphConnection={() => {
        startInstagramGraphMutation
          .mutateAsync()
          .then((result) => window.location.assign(result.authorizationUrl))
          .catch(() => undefined);
      }}
      onTelegramMtprotoPhoneNumberChange={setTelegramMtprotoPhoneNumber}
      onTelegramMtprotoConsentAcceptedChange={setIsTelegramMtprotoConsentAccepted}
      onTelegramMtprotoCodeChange={setTelegramMtprotoCode}
      onTelegramMtprotoPasswordChange={setTelegramMtprotoPassword}
      onStartTelegramMtprotoConnection={() => {
        startTelegramMtprotoMutation
          .mutateAsync({
            phoneNumber: telegramMtprotoPhoneNumber,
            consentAccepted: true
          })
          .then((result) => {
            setTelegramMtprotoWizard(deriveTelegramMtprotoWizardState(result));
            setTelegramMtprotoCode("");
            setTelegramMtprotoPassword("");
          })
          .catch(() => undefined);
      }}
      onSubmitTelegramMtprotoCode={() => {
        const channelConnectionId = telegramMtprotoWizard.channelConnectionId;
        if (!channelConnectionId || !telegramMtprotoCode.trim()) {
          return;
        }

        submitTelegramMtprotoCodeMutation
          .mutateAsync({
            channelConnectionId,
            code: telegramMtprotoCode
          })
          .then((result) => {
            setTelegramMtprotoWizard(deriveTelegramMtprotoWizardState(result));
            setTelegramMtprotoCode("");
            setTelegramMtprotoPassword("");
          })
          .catch(() => undefined);
      }}
      onSubmitTelegramMtprotoPassword={() => {
        const channelConnectionId = telegramMtprotoWizard.channelConnectionId;
        if (!channelConnectionId || !telegramMtprotoPassword) {
          return;
        }

        submitTelegramMtprotoPasswordMutation
          .mutateAsync({
            channelConnectionId,
            password: telegramMtprotoPassword
          })
          .then((result) => {
            setTelegramMtprotoWizard(deriveTelegramMtprotoWizardState(result));
            setTelegramMtprotoPassword("");
          })
          .catch(() => undefined);
      }}
      onResetTelegramMtprotoConnection={() => {
        setTelegramMtprotoWizard(createInitialTelegramMtprotoWizardState());
        setTelegramMtprotoCode("");
        setTelegramMtprotoPassword("");
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
      onLinkClientSelect={setLinkClient}
      onCreateClientDisplayNameChange={setCreateClientDisplayName}
      onLinkClientSubmit={(threadId) => {
        const clientUserId = linkClient?.value ?? "";

        if (!clientUserId) {
          return;
        }

        linkClientMutation
          .mutateAsync({
            threadId,
            body: { clientUserId }
          })
          .then(() => setLinkClient(null))
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
