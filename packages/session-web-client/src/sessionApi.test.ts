import { describe, expect, it, vi } from "vitest";
import { createSessionApi } from "./sessionApi.js";

describe("createSessionApi", () => {
  it("parses responses and marks commands as CSRF protected", async () => {
    const http = {
      get: vi.fn().mockResolvedValue({ messages: [], nextAfterSequence: null }),
      post: vi.fn().mockResolvedValue({
        message: {
          id: "11111111-1111-4111-8111-111111111111",
          sessionId: "22222222-2222-4222-8222-222222222222",
          sequence: "1",
          operationId: "33333333-3333-4333-8333-333333333333",
          senderRole: "client",
          text: "Привет",
          createdAt: "2026-08-13T12:00:00.000Z"
        },
        replayed: false
      })
    };
    const api = createSessionApi(http);

    await api.messages("22222222-2222-4222-8222-222222222222");
    await api.sendMessage("22222222-2222-4222-8222-222222222222", {
      operationId: "33333333-3333-4333-8333-333333333333",
      text: "Привет"
    });

    expect(http.get).toHaveBeenCalledWith(
      "/sessions/22222222-2222-4222-8222-222222222222/messages?afterSequence=0&limit=100"
    );
    expect(http.post).toHaveBeenCalledWith(
      "/sessions/22222222-2222-4222-8222-222222222222/messages",
      { operationId: "33333333-3333-4333-8333-333333333333", text: "Привет" },
      { csrf: true }
    );
  });
});
