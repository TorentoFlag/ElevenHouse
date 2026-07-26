import { describe, expect, it, vi } from "vitest";
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
import {
  createMessagingThreadClientMutationOptions,
  getMessagingThreadQueryOptions,
  handleMessagingRealtimeEvent,
  linkMessagingThreadClientMutationOptions,
  listMessagingChannelConnectionsQueryOptions,
  listMessagingThreadsQueryOptions,
  markMessagingThreadReadMutationOptions,
  messagingQueryKeys,
  sendMessagingMessageMutationOptions,
  startTelegramBusinessConnectionMutationOptions
} from "./messagingQueries";

vi.mock("../api/messagingApi", () => ({
  createMessagingThreadClient: vi.fn(async () => ({
    clientUserId: "33333333-3333-4333-8333-333333333333",
    thread: { id: "11111111-1111-4111-8111-111111111111" }
  })),
  getMessagingThread: vi.fn(async () => ({ thread: { id: "thread-id" }, messages: [] })),
  linkMessagingThreadClient: vi.fn(async () => ({
    clientUserId: "22222222-2222-4222-8222-222222222222",
    thread: { id: "11111111-1111-4111-8111-111111111111" }
  })),
  listMessagingChannelConnections: vi.fn(async () => ({ channelConnections: [] })),
  listMessagingThreads: vi.fn(async () => ({ threads: [], nextCursor: null })),
  markMessagingThreadRead: vi.fn(async () => ({ thread: { id: "thread-id" } })),
  sendMessagingMessage: vi.fn(async () => ({ message: { id: "message-id" } })),
  startTelegramBusinessConnection: vi.fn(async () => ({
    channelConnection: { id: "55555555-5555-4555-8555-555555555555" },
    telegramBotUsername: "ElevenHouseTestBot",
    telegramBotUrl: "https://t.me/ElevenHouseTestBot"
  }))
}));

describe("messagingQueries", () => {
  it("describes channel connection, thread list and thread detail queries", async () => {
    const connectionOptions = listMessagingChannelConnectionsQueryOptions();
    const listOptions = listMessagingThreadsQueryOptions({ limit: 30, offset: 10 });
    const detailOptions = getMessagingThreadQueryOptions("11111111-1111-4111-8111-111111111111");

    expect(connectionOptions.queryKey).toEqual(messagingQueryKeys.channelConnections());
    expect(listOptions.queryKey).toEqual(
      messagingQueryKeys.threadList({ limit: 30, offset: 10 })
    );
    expect(detailOptions.queryKey).toEqual(
      messagingQueryKeys.threadDetail("11111111-1111-4111-8111-111111111111")
    );

    await connectionOptions.queryFn();
    await listOptions.queryFn();
    await detailOptions.queryFn();

    expect(listMessagingChannelConnections).toHaveBeenCalledWith();
    expect(listMessagingThreads).toHaveBeenCalledWith({ limit: 30, offset: 10 });
    expect(getMessagingThread).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  it("adds idempotency keys to state-changing messaging mutations and refreshes thread reads", async () => {
    const queryClient = { invalidateQueries: vi.fn(async () => undefined) };
    const createIdempotencyKey = vi.fn(() => "idem-1");
    const sendOptions = sendMessagingMessageMutationOptions(queryClient, createIdempotencyKey);
    const linkOptions = linkMessagingThreadClientMutationOptions(queryClient, createIdempotencyKey);
    const createOptions = createMessagingThreadClientMutationOptions(
      queryClient,
      createIdempotencyKey
    );
    const readOptions = markMessagingThreadReadMutationOptions(queryClient);

    await sendOptions.mutationFn({
      threadId: "11111111-1111-4111-8111-111111111111",
      body: { text: "Здравствуйте" }
    });
    await sendOptions.onSuccess?.(undefined, {
      threadId: "11111111-1111-4111-8111-111111111111",
      body: { text: "Здравствуйте" }
    });
    await linkOptions.mutationFn({
      threadId: "11111111-1111-4111-8111-111111111111",
      body: { clientUserId: "22222222-2222-4222-8222-222222222222" }
    });
    await createOptions.mutationFn({
      threadId: "11111111-1111-4111-8111-111111111111",
      body: { displayName: "Марина Краснова" }
    });
    await readOptions.mutationFn("11111111-1111-4111-8111-111111111111");

    expect(sendMessagingMessage).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      { text: "Здравствуйте" },
      "idem-1"
    );
    expect(linkMessagingThreadClient).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      { clientUserId: "22222222-2222-4222-8222-222222222222" },
      "idem-1"
    );
    expect(createMessagingThreadClient).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      { displayName: "Марина Краснова" },
      "idem-1"
    );
    expect(markMessagingThreadRead).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: messagingQueryKeys.threadDetail("11111111-1111-4111-8111-111111111111")
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: messagingQueryKeys.threads()
    });
  });

  it("starts Telegram Business connection and refreshes channel connections", async () => {
    const queryClient = { invalidateQueries: vi.fn(async () => undefined) };
    const options = startTelegramBusinessConnectionMutationOptions(queryClient);

    await expect(options.mutationFn()).resolves.toMatchObject({
      telegramBotUrl: "https://t.me/ElevenHouseTestBot"
    });
    await options.onSuccess?.();

    expect(startTelegramBusinessConnection).toHaveBeenCalledWith();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: messagingQueryKeys.channelConnections()
    });
  });

  it("invalidates exact messaging reads for realtime events", async () => {
    const queryClient = { invalidateQueries: vi.fn(async () => undefined) };

    await handleMessagingRealtimeEvent(queryClient, {
      eventId: "42",
      type: "message.received",
      occurredAt: "2026-07-22T10:00:00.000Z",
      threadId: "11111111-1111-4111-8111-111111111111",
      messageId: "44444444-4444-4444-8444-444444444444"
    });
    await handleMessagingRealtimeEvent(queryClient, {
      eventId: "43",
      type: "channelConnection.updated",
      occurredAt: "2026-07-22T10:00:01.000Z",
      channelConnectionId: "55555555-5555-4555-8555-555555555555"
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: messagingQueryKeys.threadDetail("11111111-1111-4111-8111-111111111111")
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: messagingQueryKeys.threads()
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: messagingQueryKeys.channelConnections()
    });
  });
});
