import { describe, expect, it } from "vitest";

import {
  authorizeAstroDiaryMediaCompletion,
  authorizeAstroDiaryMediaSignedRead,
  authorizeAstroDiaryMediaUpload
} from "./astro-diary-media-authorization";

const clientUserId = "30000000-0000-4000-8000-000000000001";
const astrologerUserId = "30000000-0000-4000-8000-000000000002";
const relationshipId = "30000000-0000-4000-8000-000000000003";
const journalId = "30000000-0000-4000-8000-000000000004";
const itemId = "30000000-0000-4000-8000-000000000005";
const mediaId = "30000000-0000-4000-8000-000000000006";

const authority = {
  actorUserId: clientUserId,
  relationship: {
    id: relationshipId,
    clientUserId,
    astrologerUserId,
    state: "active"
  },
  journal: {
    id: journalId,
    relationshipId,
    clientUserId,
    astrologerUserId,
    state: "active"
  }
} as const;

const uploadingMedia = {
  id: mediaId,
  ownerUserId: clientUserId,
  journalId,
  purpose: "astro_diary_attachment",
  visibility: "private",
  status: "uploading",
  boundItemId: null,
  accessRevoked: false
} as const;

const readyMedia = {
  ...uploadingMedia,
  status: "ready",
  boundItemId: itemId
} as const;

const visibleItem = {
  id: itemId,
  journalId,
  authorUserId: clientUserId,
  visibility: "visible",
  attachmentIds: [mediaId],
  readAccessRevoked: false
} as const;

describe("AstroDiary private media authorization", () => {
  it("authorizes a participant to upload only their own exact Diary private purpose", () => {
    expect(
      authorizeAstroDiaryMediaUpload(authority, {
        ownerUserId: clientUserId,
        purpose: "astro_diary_attachment"
      })
    ).toEqual({ outcome: "allowed" });
    expect(
      authorizeAstroDiaryMediaUpload(
        { ...authority, actorUserId: astrologerUserId },
        { ownerUserId: astrologerUserId, purpose: "astro_diary_voice" }
      )
    ).toEqual({ outcome: "allowed" });
    expect(
      authorizeAstroDiaryMediaUpload(authority, {
        ownerUserId: clientUserId,
        purpose: "messaging_attachment"
      })
    ).toEqual({ outcome: "denied", code: "media_purpose_conflict" });
    expect(
      authorizeAstroDiaryMediaUpload(
        { ...authority, actorUserId: "30000000-0000-4000-8000-000000000099" },
        { ownerUserId: clientUserId, purpose: "astro_diary_attachment" }
      )
    ).toEqual({ outcome: "denied", code: "actor_not_participant" });
  });

  it("fails closed when the relationship pair, journal ownership, or writable state differs", () => {
    expect(
      authorizeAstroDiaryMediaUpload(
        {
          ...authority,
          relationship: { ...authority.relationship, clientUserId: astrologerUserId }
        },
        { ownerUserId: clientUserId, purpose: "astro_diary_attachment" }
      )
    ).toEqual({ outcome: "denied", code: "relationship_pair_conflict" });
    expect(
      authorizeAstroDiaryMediaUpload(
        {
          ...authority,
          journal: { ...authority.journal, relationshipId: mediaId }
        },
        { ownerUserId: clientUserId, purpose: "astro_diary_attachment" }
      )
    ).toEqual({ outcome: "denied", code: "journal_scope_conflict" });
    for (const state of ["erasing", "erased"] as const) {
      expect(
        authorizeAstroDiaryMediaUpload(
          { ...authority, journal: { ...authority.journal, state } },
          { ownerUserId: clientUserId, purpose: "astro_diary_attachment" }
        )
      ).toEqual({ outcome: "denied", code: "journal_not_active" });
    }
  });

  it("authorizes completion only for the participant-author's unbound private uploading asset", () => {
    expect(authorizeAstroDiaryMediaCompletion(authority, uploadingMedia)).toEqual({
      outcome: "allowed"
    });
    expect(
      authorizeAstroDiaryMediaCompletion(
        { ...authority, actorUserId: astrologerUserId },
        uploadingMedia
      )
    ).toEqual({ outcome: "denied", code: "media_owner_conflict" });
    expect(
      authorizeAstroDiaryMediaCompletion(authority, {
        ...uploadingMedia,
        visibility: "public"
      })
    ).toEqual({ outcome: "denied", code: "media_visibility_conflict" });
    expect(
      authorizeAstroDiaryMediaCompletion(authority, {
        ...uploadingMedia,
        status: "ready"
      })
    ).toEqual({ outcome: "denied", code: "media_state_conflict" });
    expect(
      authorizeAstroDiaryMediaCompletion(authority, {
        ...uploadingMedia,
        boundItemId: itemId
      })
    ).toEqual({ outcome: "denied", code: "media_already_bound" });
  });

  it("authorizes signed read for either current participant only from a visible same-journal binding", () => {
    expect(authorizeAstroDiaryMediaSignedRead(authority, readyMedia, visibleItem)).toEqual({
      outcome: "allowed"
    });
    expect(
      authorizeAstroDiaryMediaSignedRead(
        { ...authority, actorUserId: astrologerUserId },
        readyMedia,
        visibleItem
      )
    ).toEqual({ outcome: "allowed" });

    for (const [media, item, code] of [
      [{ ...readyMedia, status: "processing" as const }, visibleItem, "media_not_ready"],
      [{ ...readyMedia, journalId: mediaId }, visibleItem, "media_journal_conflict"],
      [{ ...readyMedia, boundItemId: null }, visibleItem, "media_binding_conflict"],
      [readyMedia, { ...visibleItem, journalId: mediaId }, "item_journal_conflict"],
      [readyMedia, { ...visibleItem, visibility: "hidden" as const }, "item_not_visible"],
      [readyMedia, { ...visibleItem, attachmentIds: [] }, "media_binding_conflict"]
    ] as const) {
      expect(authorizeAstroDiaryMediaSignedRead(authority, media, item)).toEqual({
        outcome: "denied",
        code
      });
    }
  });

  it("revokes signed reads as soon as item or journal erasure starts", () => {
    expect(
      authorizeAstroDiaryMediaSignedRead(
        authority,
        { ...readyMedia, accessRevoked: true },
        visibleItem
      )
    ).toEqual({ outcome: "denied", code: "read_access_revoked" });
    expect(
      authorizeAstroDiaryMediaSignedRead(authority, readyMedia, {
        ...visibleItem,
        readAccessRevoked: true
      })
    ).toEqual({ outcome: "denied", code: "read_access_revoked" });
    for (const state of ["erasing", "erased"] as const) {
      expect(
        authorizeAstroDiaryMediaSignedRead(
          { ...authority, journal: { ...authority.journal, state } },
          readyMedia,
          visibleItem
        )
      ).toEqual({ outcome: "denied", code: "journal_not_active" });
    }
  });
});
