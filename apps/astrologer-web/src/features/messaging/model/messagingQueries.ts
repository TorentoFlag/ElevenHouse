import { keepPreviousData, type QueryClient } from "@tanstack/react-query";
import type {
  CreateMessagingThreadClientRequest,
  LinkMessagingThreadClientRequest,
  MessagingRealtimeEvent,
  MessagingThreadDetailQuery,
  MessagingThreadListQuery,
  SendMessagingMessageRequest
} from "@elevenhouse/contracts";
import {
  createMessagingThreadClient,
  getMessagingThread,
  linkMessagingThreadClient,
  listMessagingChannelConnections,
  listMessagingThreads,
  markMessagingThreadRead,
  sendMessagingMessage,
  startTelegramBusinessConnection
} from "../api/messagingApi";

type QueryInvalidator = Pick<QueryClient, "invalidateQueries">;
type IdempotencyKeyFactory = () => string;

export const messagingQueryKeys = {
  all: () => ["messaging"] as const,
  channelConnections: () => ["messaging", "channelConnections"] as const,
  threads: () => ["messaging", "threads"] as const,
  threadList: (query: MessagingThreadListQuery) => ["messaging", "threads", "list", query] as const,
  threadDetail: (threadId: string) => ["messaging", "threads", "detail", threadId] as const
};

export function listMessagingChannelConnectionsQueryOptions() {
  return {
    queryKey: messagingQueryKeys.channelConnections(),
    queryFn: () => listMessagingChannelConnections()
  };
}

export function listMessagingThreadsQueryOptions(query: MessagingThreadListQuery) {
  return {
    queryKey: messagingQueryKeys.threadList(query),
    queryFn: () => listMessagingThreads(query),
    placeholderData: keepPreviousData
  };
}

export function startTelegramBusinessConnectionMutationOptions(queryClient: QueryInvalidator) {
  return {
    mutationFn: () => startTelegramBusinessConnection(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: messagingQueryKeys.channelConnections() })
  };
}

export function getMessagingThreadQueryOptions(
  threadId: string | null,
  query: Partial<MessagingThreadDetailQuery> = {}
) {
  return {
    queryKey: messagingQueryKeys.threadDetail(threadId ?? ""),
    queryFn: () =>
      Object.keys(query).length > 0
        ? getMessagingThread(threadId ?? "", query)
        : getMessagingThread(threadId ?? ""),
    enabled: Boolean(threadId)
  };
}

export type SendMessagingMessageMutationInput = {
  readonly threadId: string;
  readonly body: SendMessagingMessageRequest;
};

export type LinkMessagingThreadClientMutationInput = {
  readonly threadId: string;
  readonly body: LinkMessagingThreadClientRequest;
};

export type CreateMessagingThreadClientMutationInput = {
  readonly threadId: string;
  readonly body: CreateMessagingThreadClientRequest;
};

export function sendMessagingMessageMutationOptions(
  queryClient: QueryInvalidator,
  createIdempotencyKey: IdempotencyKeyFactory = createMessagingIdempotencyKey
) {
  return {
    mutationFn: (input: SendMessagingMessageMutationInput) =>
      sendMessagingMessage(input.threadId, input.body, createIdempotencyKey()),
    onSuccess: (_data: unknown, input: SendMessagingMessageMutationInput) =>
      invalidateMessagingThread(queryClient, input.threadId)
  };
}

export function linkMessagingThreadClientMutationOptions(
  queryClient: QueryInvalidator,
  createIdempotencyKey: IdempotencyKeyFactory = createMessagingIdempotencyKey
) {
  return {
    mutationFn: (input: LinkMessagingThreadClientMutationInput) =>
      linkMessagingThreadClient(input.threadId, input.body, createIdempotencyKey()),
    onSuccess: (_data: unknown, input: LinkMessagingThreadClientMutationInput) =>
      invalidateMessagingThread(queryClient, input.threadId)
  };
}

export function createMessagingThreadClientMutationOptions(
  queryClient: QueryInvalidator,
  createIdempotencyKey: IdempotencyKeyFactory = createMessagingIdempotencyKey
) {
  return {
    mutationFn: (input: CreateMessagingThreadClientMutationInput) =>
      createMessagingThreadClient(input.threadId, input.body, createIdempotencyKey()),
    onSuccess: (_data: unknown, input: CreateMessagingThreadClientMutationInput) =>
      invalidateMessagingThread(queryClient, input.threadId)
  };
}

export function markMessagingThreadReadMutationOptions(queryClient: QueryInvalidator) {
  return {
    mutationFn: (threadId: string) => markMessagingThreadRead(threadId),
    onSuccess: (_data: unknown, threadId: string) => invalidateMessagingThread(queryClient, threadId)
  };
}

export async function handleMessagingRealtimeEvent(
  queryClient: QueryInvalidator,
  event: MessagingRealtimeEvent
) {
  if (event.threadId) {
    await invalidateMessagingThread(queryClient, event.threadId);
    return;
  }

  if (event.type === "channelConnection.updated") {
    await queryClient.invalidateQueries({ queryKey: messagingQueryKeys.channelConnections() });
  }
}

function invalidateMessagingThread(queryClient: QueryInvalidator, threadId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: messagingQueryKeys.threadDetail(threadId) }),
    queryClient.invalidateQueries({ queryKey: messagingQueryKeys.threads() })
  ]);
}

function createMessagingIdempotencyKey() {
  return crypto.randomUUID();
}
