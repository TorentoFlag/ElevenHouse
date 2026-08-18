import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClientAstroDiaryEntryDraft,
  publishClientAstroDiaryEntryDraft,
  updateClientAstroDiaryEntryDraft
} from "./astroDiaryApi";

const fetcher = vi.hoisted(() => vi.fn());

vi.mock("../../../Application", async () => {
  const { HttpClient } = await import("../../../common/http/HttpClient");
  return {
    application: {
      http: new HttpClient({
        basePath: "https://public-api.test",
        csrf: {
          cookieName: "elevenhouse_public_csrf",
          headerName: "x-csrf-token",
          readCookie: () => "csrf-token"
        },
        fetcher
      })
    }
  };
});

describe("client AstroDiary real HTTP transport", () => {
  beforeEach(() => {
    fetcher.mockReset();
    fetcher.mockImplementation(async (url: string) =>
      jsonResponse(
        url.endsWith("/publish")
          ? { outcome: "applied", eventIds: [] }
          : { outcome: "applied", draftId, version: 1 }
      )
    );
  });

  it("constructs create, update, and publish requests with CSRF and Idempotency-Key headers", async () => {
    await createClientAstroDiaryEntryDraft({
      journalId,
      idempotencyKey: "create-key",
      body: {
        expectedJournalVersion: 4,
        body: "Create",
        attachmentIds: [],
        moodId: null
      }
    });
    await updateClientAstroDiaryEntryDraft({
      journalId,
      draftId,
      idempotencyKey: "update-key",
      body: {
        expectedJournalVersion: 4,
        expectedDraftVersion: 1,
        body: "Update",
        attachmentIds: [],
        moodId: "calm"
      }
    });
    await publishClientAstroDiaryEntryDraft({
      journalId,
      draftId,
      idempotencyKey: "publish-key",
      body: { expectedJournalVersion: 4, expectedDraftVersion: 1 }
    });

    expectRequestHeaders(1, "create-key");
    expectRequestHeaders(2, "update-key");
    expectRequestHeaders(3, "publish-key");
  });
});

function expectRequestHeaders(callNumber: number, idempotencyKey: string): void {
  expect(fetcher).toHaveBeenNthCalledWith(
    callNumber,
    expect.stringContaining("/astro-diary/journals/"),
    expect.objectContaining({
      headers: expect.objectContaining({
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        "x-csrf-token": "csrf-token"
      })
    })
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

const journalId = "11111111-1111-4111-8111-111111111111";
const draftId = "21111111-1111-4111-8111-111111111111";
