import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClientAstroDiaryEntryDraft,
  getClientAstroDiaryEntryDraft,
  getClientAstroDiaryJournal,
  publishClientAstroDiaryEntryDraft,
  updateClientAstroDiaryEntryDraft
} from "./astroDiaryApi";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());

vi.mock("../../../Application", () => ({ application: { http: { get, post, put } } }));

describe("client AstroDiary API", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    put.mockReset();
  });

  it("validates the selected server summary", async () => {
    get.mockResolvedValueOnce(summary);
    await expect(getClientAstroDiaryJournal(journalId)).resolves.toEqual(summary);
    expect(get).toHaveBeenCalledWith(`/astro-diary/journals/${journalId}`);
  });

  it("hydrates the server-owned client entry draft", async () => {
    get.mockResolvedValueOnce({
      draft: {
        draftId,
        version: 2,
        body: "Saved entry",
        moodId: "calm",
        attachmentIds: [attachmentId]
      }
    });

    await expect(getClientAstroDiaryEntryDraft(journalId)).resolves.toEqual({
      draft: {
        draftId,
        version: 2,
        body: "Saved entry",
        moodId: "calm",
        attachmentIds: [attachmentId]
      }
    });
    expect(get).toHaveBeenCalledWith(
      `/astro-diary/journals/${journalId}/client-entry/draft`
    );
  });

  it("creates and updates a client draft with CSRF and caller-owned stable keys", async () => {
    post.mockResolvedValueOnce({ outcome: "applied", draftId, version: 1 });
    put.mockResolvedValueOnce({ outcome: "replayed", draftId, version: 2 });

    await createClientAstroDiaryEntryDraft({
      journalId,
      idempotencyKey: "astro-diary:save:one",
      body: { expectedJournalVersion: 4, body: "First entry", attachmentIds: [], moodId: "calm" }
    });
    await updateClientAstroDiaryEntryDraft({
      journalId,
      draftId,
      idempotencyKey: "astro-diary:save:two",
      body: {
        expectedJournalVersion: 5,
        expectedDraftVersion: 1,
        body: "Updated entry",
        attachmentIds: [],
        moodId: "joy"
      }
    });

    expect(post).toHaveBeenCalledWith(
      `/astro-diary/journals/${journalId}/client-entry/drafts`,
      { expectedJournalVersion: 4, body: "First entry", attachmentIds: [], moodId: "calm" },
      { csrf: true, idempotencyKey: "astro-diary:save:one" }
    );
    expect(put).toHaveBeenCalledWith(
      `/astro-diary/journals/${journalId}/client-entry/drafts/${draftId}`,
      {
        expectedJournalVersion: 5,
        expectedDraftVersion: 1,
        body: "Updated entry",
        attachmentIds: [],
        moodId: "joy"
      },
      { csrf: true, idempotencyKey: "astro-diary:save:two" }
    );
  });

  it("publishes only the acknowledged draft and expected versions", async () => {
    post.mockResolvedValueOnce({ outcome: "replayed", eventIds: [] });
    await expect(
      publishClientAstroDiaryEntryDraft({
        journalId,
        draftId,
        idempotencyKey: "astro-diary:publish:one",
        body: { expectedJournalVersion: 6, expectedDraftVersion: 2 }
      })
    ).resolves.toEqual({ outcome: "replayed", eventIds: [] });
    expect(post).toHaveBeenCalledWith(
      `/astro-diary/journals/${journalId}/client-entry/drafts/${draftId}/publish`,
      { expectedJournalVersion: 6, expectedDraftVersion: 2 },
      { csrf: true, idempotencyKey: "astro-diary:publish:one" }
    );
  });
});

const journalId = "11111111-1111-4111-8111-111111111111";
const draftId = "21111111-1111-4111-8111-111111111111";
const attachmentId = "22111111-1111-4111-8111-111111111111";
const summary = {
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
