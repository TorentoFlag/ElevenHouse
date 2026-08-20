import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAstroDiaryReplyDraft,
  getAstroDiaryJournal,
  getAstroDiaryReplyDraft,
  publishAstroDiaryReplyDraft,
  uploadAstroDiaryMediaFile,
  updateAstroDiaryReplyDraft
} from "./astroDiaryApi";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());

vi.mock("../../../Application", () => ({
  application: { http: { get, post, put } }
}));

describe("astroDiaryApi paid-core commands", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    put.mockReset();
  });

  it("loads the selected journal through the shared response contract", async () => {
    get.mockResolvedValueOnce(summaryResponse);

    await expect(getAstroDiaryJournal(journalId)).resolves.toEqual(summaryResponse);
    expect(get).toHaveBeenCalledWith(`/astro-diary/journals/${journalId}`);
  });

  it("hydrates the current saved reply draft through the shared response contract", async () => {
    get.mockResolvedValueOnce({
      draft: {
        draftId,
        version: 3,
        body: "Saved answer",
        attachmentIds: [attachmentId]
      }
    });

    await expect(getAstroDiaryReplyDraft(journalId)).resolves.toEqual({
      draft: {
        draftId,
        version: 3,
        body: "Saved answer",
        attachmentIds: [attachmentId]
      }
    });
    expect(get).toHaveBeenCalledWith(`/astro-diary/journals/${journalId}/astrologer-reply/draft`);
  });

  it("creates and updates a reply draft with CSRF and a stable idempotency key", async () => {
    post.mockResolvedValueOnce({ outcome: "applied", draftId, version: 1 });
    put.mockResolvedValueOnce({ outcome: "replayed", draftId, version: 2 });

    await createAstroDiaryReplyDraft({
      journalId,
      idempotencyKey: "astro-diary:save:one",
      body: { expectedJournalVersion: 4, body: "First answer", attachmentIds: [] }
    });
    await updateAstroDiaryReplyDraft({
      journalId,
      draftId,
      idempotencyKey: "astro-diary:save:two",
      body: {
        expectedJournalVersion: 5,
        expectedDraftVersion: 1,
        body: "Updated answer",
        attachmentIds: []
      }
    });

    expect(post).toHaveBeenCalledWith(
      `/astro-diary/journals/${journalId}/astrologer-reply/drafts`,
      { expectedJournalVersion: 4, body: "First answer", attachmentIds: [] },
      { csrf: true, headers: { "idempotency-key": "astro-diary:save:one" } }
    );
    expect(put).toHaveBeenCalledWith(
      `/astro-diary/journals/${journalId}/astrologer-reply/drafts/${draftId}`,
      {
        expectedJournalVersion: 5,
        expectedDraftVersion: 1,
        body: "Updated answer",
        attachmentIds: []
      },
      { csrf: true, headers: { "idempotency-key": "astro-diary:save:two" } }
    );
  });

  it("publishes the exact saved draft without inventing server state", async () => {
    post.mockResolvedValueOnce({ outcome: "replayed", eventIds: [] });

    await expect(
      publishAstroDiaryReplyDraft({
        journalId,
        draftId,
        idempotencyKey: "astro-diary:publish:one",
        body: { expectedJournalVersion: 6, expectedDraftVersion: 2 }
      })
    ).resolves.toEqual({ outcome: "replayed", eventIds: [] });
    expect(post).toHaveBeenCalledWith(
      `/astro-diary/journals/${journalId}/astrologer-reply/drafts/${draftId}/publish`,
      { expectedJournalVersion: 6, expectedDraftVersion: 2 },
      { csrf: true, headers: { "idempotency-key": "astro-diary:publish:one" } }
    );
  });

  it("uploads astrologer journal media through the journal-scoped private media flow", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    post
      .mockResolvedValueOnce({
        mediaId: attachmentId,
        status: "uploading",
        upload: {
          method: "PUT",
          url: "https://storage.local/astro-diary/reply.ogg",
          headers: { "content-type": "audio/ogg" },
          expiresAt: "2026-08-20T10:00:00.000Z"
        }
      })
      .mockResolvedValueOnce({
        mediaId: attachmentId,
        status: "ready",
        purpose: "astro_diary_voice",
        mimeType: "audio/ogg",
        sizeBytes: 5,
        checksumSha256: null,
        width: null,
        height: null
      });

    await expect(
      uploadAstroDiaryMediaFile({
        journalId,
        purpose: "astro_diary_voice",
        file: new File(["voice"], "reply.ogg", { type: "audio/ogg" }),
        fetcher
      })
    ).resolves.toMatchObject({ mediaId: attachmentId, status: "ready" });

    expect(post).toHaveBeenNthCalledWith(
      1,
      `/astro-diary/journals/${journalId}/media/upload-intents`,
      {
        purpose: "astro_diary_voice",
        fileName: "reply.ogg",
        mimeType: "audio/ogg",
        sizeBytes: 5
      },
      { csrf: true }
    );
    expect(fetcher).toHaveBeenCalledWith("https://storage.local/astro-diary/reply.ogg", {
      method: "PUT",
      headers: { "content-type": "audio/ogg" },
      body: expect.any(File)
    });
    expect(post).toHaveBeenNthCalledWith(
      2,
      `/astro-diary/journals/${journalId}/media/${attachmentId}/complete`,
      {},
      { csrf: true }
    );
  });
});

const journalId = "11111111-1111-4111-8111-111111111111";
const draftId = "21111111-1111-4111-8111-111111111111";
const attachmentId = "22111111-1111-4111-8111-111111111111";
const summaryResponse = {
  journal: {
    id: journalId,
    relationshipId: "31111111-1111-4111-8111-111111111111",
    journalEpochId: "41111111-1111-4111-8111-111111111111",
    astrologerUserId: "51111111-1111-4111-8111-111111111111",
    clientUserId: "61111111-1111-4111-8111-111111111111",
    state: "active",
    version: 4,
    createdAt: "2026-08-18T10:00:00.000Z"
  },
  currentCycle: null,
  currentObligation: null,
  access: {
    mode: "read_only",
    subscriptionId: "71111111-1111-4111-8111-111111111111",
    subscriptionState: "ended",
    currentPeriod: null,
    allowance: null
  },
  unreadCount: 0,
  visibleMaxCursor: 0
} as const;
