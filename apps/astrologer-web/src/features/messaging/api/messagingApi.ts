import {
  CreateMessagingThreadClientRequestSchema,
  LinkMessagingThreadClientRequestSchema,
  MessagingChannelConnectionResponseSchema,
  MessagingMessageResponseSchema,
  MessagingThreadClientLinkResponseSchema,
  MessagingThreadDetailQuerySchema,
  MessagingThreadListQuerySchema,
  MessagingThreadListResponseSchema,
  MessagingThreadMutationResponseSchema,
  MessagingThreadParamsSchema,
  MessagingThreadResponseSchema,
  SendMessagingMessageRequestSchema,
  type CreateMessagingThreadClientRequest,
  type LinkMessagingThreadClientRequest,
  type MessagingChannelConnectionResponse,
  type MessagingMessageResponse,
  type MessagingThreadClientLinkResponse,
  type MessagingThreadDetailQuery,
  type MessagingThreadListQuery,
  type MessagingThreadListResponse,
  type MessagingThreadMutationResponse,
  type MessagingThreadResponse,
  type SendMessagingMessageRequest
} from "@elevenhouse/contracts";
import { application } from "../../../Application";

export async function listMessagingChannelConnections(): Promise<MessagingChannelConnectionResponse> {
  return MessagingChannelConnectionResponseSchema.parse(
    await application.http.get("/messaging/channel-connections")
  );
}

export async function listMessagingThreads(
  query: Partial<MessagingThreadListQuery> = {}
): Promise<MessagingThreadListResponse> {
  const parsedQuery = MessagingThreadListQuerySchema.parse(query);
  return MessagingThreadListResponseSchema.parse(
    await application.http.get(`/messaging/threads?${toPaginationSearch(parsedQuery)}`)
  );
}

export async function getMessagingThread(
  threadId: string,
  query: Partial<MessagingThreadDetailQuery> = {}
): Promise<MessagingThreadResponse> {
  const params = MessagingThreadParamsSchema.parse({ threadId });
  const parsedQuery = MessagingThreadDetailQuerySchema.parse(query);
  return MessagingThreadResponseSchema.parse(
    await application.http.get(
      `/messaging/threads/${params.threadId}?${toPaginationSearch(parsedQuery)}`
    )
  );
}

export async function sendMessagingMessage(
  threadId: string,
  request: SendMessagingMessageRequest,
  idempotencyKey: string
): Promise<MessagingMessageResponse> {
  const params = MessagingThreadParamsSchema.parse({ threadId });
  const body = SendMessagingMessageRequestSchema.parse(request);
  return MessagingMessageResponseSchema.parse(
    await application.http.post(`/messaging/threads/${params.threadId}/messages`, body, {
      csrf: true,
      headers: { "idempotency-key": idempotencyKey }
    })
  );
}

export async function linkMessagingThreadClient(
  threadId: string,
  request: LinkMessagingThreadClientRequest,
  idempotencyKey: string
): Promise<MessagingThreadClientLinkResponse> {
  const params = MessagingThreadParamsSchema.parse({ threadId });
  const body = LinkMessagingThreadClientRequestSchema.parse(request);
  return MessagingThreadClientLinkResponseSchema.parse(
    await application.http.post(`/messaging/threads/${params.threadId}/link-client`, body, {
      csrf: true,
      headers: { "idempotency-key": idempotencyKey }
    })
  );
}

export async function createMessagingThreadClient(
  threadId: string,
  request: CreateMessagingThreadClientRequest,
  idempotencyKey: string
): Promise<MessagingThreadClientLinkResponse> {
  const params = MessagingThreadParamsSchema.parse({ threadId });
  const body = CreateMessagingThreadClientRequestSchema.parse(request);
  return MessagingThreadClientLinkResponseSchema.parse(
    await application.http.post(`/messaging/threads/${params.threadId}/create-client`, body, {
      csrf: true,
      headers: { "idempotency-key": idempotencyKey }
    })
  );
}

export async function markMessagingThreadRead(
  threadId: string
): Promise<MessagingThreadMutationResponse> {
  const params = MessagingThreadParamsSchema.parse({ threadId });
  return MessagingThreadMutationResponseSchema.parse(
    await application.http.post(`/messaging/threads/${params.threadId}/read`, undefined, {
      csrf: true
    })
  );
}

function toPaginationSearch(query: { readonly limit: number; readonly offset: number }): string {
  return new URLSearchParams({
    limit: String(query.limit),
    offset: String(query.offset)
  }).toString();
}
