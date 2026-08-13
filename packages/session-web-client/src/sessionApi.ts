import {
  EndSessionBodySchema,
  SendSessionMessageBodySchema,
  SessionJoinCredentialResponseSchema,
  SessionListResponseSchema,
  SessionMessagePageSchema,
  SessionMessageResponseSchema,
  SessionRangeQuerySchema,
  SessionRealtimeEventPageSchema,
  SessionResponseSchema,
  type EndSessionBody,
  type SendSessionMessageBody,
  type SessionJoinCredentialResponse,
  type SessionListResponse,
  type SessionMessagePage,
  type SessionMessageResponse,
  type SessionRangeQuery,
  type SessionRealtimeEvent,
  type SessionResponse
} from "@elevenhouse/contracts/sessions";

export type SessionRealtimeEventPage = { readonly events: readonly SessionRealtimeEvent[] };

export type SessionHttpClient = {
  readonly get: <TResponse>(path: string) => Promise<TResponse>;
  readonly post: <TResponse>(
    path: string,
    body?: unknown,
    options?: { readonly csrf?: boolean }
  ) => Promise<TResponse>;
};

export type SessionApi = ReturnType<typeof createSessionApi>;

export function createSessionApi(http: SessionHttpClient) {
  return {
    async list(query: SessionRangeQuery): Promise<SessionListResponse> {
      const parsed = SessionRangeQuerySchema.parse(query);
      const search = new URLSearchParams(parsed);
      return SessionListResponseSchema.parse(await http.get(`/sessions?${search.toString()}`));
    },
    async session(sessionId: string): Promise<SessionResponse> {
      return SessionResponseSchema.parse(await http.get(`/sessions/${encodeURIComponent(sessionId)}`));
    },
    async join(sessionId: string): Promise<SessionJoinCredentialResponse> {
      return SessionJoinCredentialResponseSchema.parse(
        await http.post(`/sessions/${encodeURIComponent(sessionId)}/join`, undefined, { csrf: true })
      );
    },
    async messages(sessionId: string, afterSequence = "0"): Promise<SessionMessagePage> {
      return SessionMessagePageSchema.parse(
        await http.get(
          `/sessions/${encodeURIComponent(sessionId)}/messages?afterSequence=${encodeURIComponent(afterSequence)}&limit=100`
        )
      );
    },
    async sendMessage(sessionId: string, body: SendSessionMessageBody): Promise<SessionMessageResponse> {
      const parsed = SendSessionMessageBodySchema.parse(body);
      return SessionMessageResponseSchema.parse(
        await http.post(`/sessions/${encodeURIComponent(sessionId)}/messages`, parsed, { csrf: true })
      );
    },
    async events(sessionId: string, afterEventId?: string): Promise<SessionRealtimeEventPage> {
      const search = new URLSearchParams({ limit: "100" });
      if (afterEventId) search.set("afterEventId", afterEventId);
      return SessionRealtimeEventPageSchema.parse(
        await http.get(`/sessions/${encodeURIComponent(sessionId)}/events?${search.toString()}`)
      );
    },
    async end(sessionId: string, body: EndSessionBody): Promise<SessionResponse> {
      const parsed = EndSessionBodySchema.parse(body);
      return SessionResponseSchema.parse(
        await http.post(`/sessions/${encodeURIComponent(sessionId)}/end`, parsed, { csrf: true })
      );
    }
  };
}
