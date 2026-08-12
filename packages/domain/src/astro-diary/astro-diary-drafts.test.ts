import { describe, expect, it } from "vitest";
import { editAstroDiaryDraft, publishAstroDiaryDraft } from "./astro-diary-drafts";

const draft = {
  id: "30000000-0000-4000-8000-000000000001",
  journalId: "30000000-0000-4000-8000-000000000002",
  cycleId: null,
  kind: "client_entry",
  authorRole: "client",
  authorUserId: "30000000-0000-4000-8000-000000000003",
  version: 1,
  body: "Первый вариант",
  attachmentIds: [] as readonly string[],
  moodId: "calm",
  correctsItemId: null,
  updatedAt: "2026-08-12T09:00:00Z"
} as const;

describe("AstroDiary author drafts", () => {
  it("edits only the owning author's current CAS version", () => {
    expect(
      editAstroDiaryDraft(draft, {
        actorUserId: draft.authorUserId,
        expectedVersion: 1,
        body: "Уточнённый вариант",
        attachmentIds: [],
        moodId: "joy",
        updatedAt: "2026-08-12T10:00:00Z"
      })
    ).toMatchObject({ outcome: "updated", draft: { version: 2, body: "Уточнённый вариант" } });
    expect(
      editAstroDiaryDraft(draft, {
        actorUserId: "30000000-0000-4000-8000-000000000004",
        expectedVersion: 1,
        body: "Чужая правка",
        attachmentIds: [],
        moodId: null,
        updatedAt: "2026-08-12T10:00:00Z"
      })
    ).toEqual({ outcome: "author_mismatch" });
    expect(
      editAstroDiaryDraft(draft, {
        actorUserId: draft.authorUserId,
        expectedVersion: 2,
        body: "Устаревшая правка",
        attachmentIds: [],
        moodId: null,
        updatedAt: "2026-08-12T10:00:00Z"
      })
    ).toEqual({ outcome: "version_conflict", expectedVersion: 2, currentVersion: 1 });
  });

  it("publishes a non-empty ready-media draft and seals its source revision", () => {
    expect(
      publishAstroDiaryDraft(draft, {
        actorUserId: draft.authorUserId,
        expectedVersion: 1,
        media: [],
        itemId: "30000000-0000-4000-8000-000000000005",
        cycleId: "30000000-0000-4000-8000-000000000006",
        occurredAt: "2026-08-12T10:00:00Z",
        cursor: 1
      })
    ).toMatchObject({
      outcome: "published",
      sourceDraftVersion: 1,
      item: { kind: "client_entry", revision: 1, body: "Первый вариант" }
    });
    expect(
      publishAstroDiaryDraft(
        { ...draft, attachmentIds: ["30000000-0000-4000-8000-000000000007"] },
        {
          actorUserId: draft.authorUserId,
          expectedVersion: 1,
          media: [],
          itemId: "30000000-0000-4000-8000-000000000005",
          cycleId: "30000000-0000-4000-8000-000000000006",
          occurredAt: "2026-08-12T10:00:00Z",
          cursor: 1
        }
      )
    ).toEqual({ outcome: "media_not_ready" });
    expect(
      publishAstroDiaryDraft(
        {
          ...draft,
          cycleId: "30000000-0000-4000-8000-000000000008"
        },
        {
          actorUserId: draft.authorUserId,
          expectedVersion: 1,
          media: [],
          itemId: "30000000-0000-4000-8000-000000000005",
          cycleId: "30000000-0000-4000-8000-000000000006",
          occurredAt: "2026-08-12T10:00:00Z",
          cursor: 1
        }
      )
    ).toEqual({ outcome: "cycle_scope_conflict" });
  });

  it("requires exact private journal media authority", () => {
    const mediaId = "30000000-0000-4000-8000-000000000007";
    const withMedia = { ...draft, attachmentIds: [mediaId] };
    const input = {
      actorUserId: draft.authorUserId,
      expectedVersion: 1,
      itemId: "30000000-0000-4000-8000-000000000005",
      cycleId: "30000000-0000-4000-8000-000000000006",
      occurredAt: "2026-08-12T10:00:00Z",
      cursor: 1
    } as const;
    const valid = {
      id: mediaId,
      ownerUserId: draft.authorUserId,
      journalId: draft.journalId,
      status: "ready",
      visibility: "private",
      purpose: "astro_diary_attachment",
      boundItemId: null
    } as const;
    expect(publishAstroDiaryDraft(withMedia, { ...input, media: [valid] })).toMatchObject({
      outcome: "published",
      mediaBindings: [{ mediaId, itemId: input.itemId }]
    });
    expect(
      publishAstroDiaryDraft(withMedia, {
        ...input,
        media: [{ ...valid, ownerUserId: "30000000-0000-4000-8000-000000000099" }]
      })
    ).toEqual({ outcome: "media_scope_conflict" });
  });
});
