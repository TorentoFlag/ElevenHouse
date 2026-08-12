import {
  astroDiaryDraftSchema,
  astroDiaryTimelineItemSchema,
  type AstroDiaryDraft,
  type AstroDiaryMoodId,
  type AstroDiaryTimelineItem
} from "@elevenhouse/contracts";

export type AstroDiaryDraftState = Omit<AstroDiaryDraft, "attachmentIds"> &
  Readonly<{ attachmentIds: readonly string[] }>;

export type AstroDiaryMediaAuthority = Readonly<{
  id: string;
  ownerUserId: string;
  journalId: string;
  status: "uploading" | "processing" | "ready" | "failed" | "deleted";
  visibility: "private";
  purpose: "astro_diary_attachment" | "astro_diary_voice";
  boundItemId: string | null;
}>;

export type AstroDiaryMediaBindingValidation =
  | Readonly<{
      outcome: "valid";
      bindings: readonly Readonly<{ mediaId: string; itemId: string }>[];
    }>
  | Readonly<{
      outcome: "media_not_ready" | "media_scope_conflict" | "media_already_bound";
    }>;

export function validateAstroDiaryMediaBindings(input: {
  readonly attachmentIds: readonly string[];
  readonly media: readonly AstroDiaryMediaAuthority[];
  readonly ownerUserId: string;
  readonly journalId: string;
  readonly itemId: string;
  readonly allowExistingItemBinding: boolean;
}): AstroDiaryMediaBindingValidation {
  const mediaById = new Map(input.media.map((media) => [media.id, media]));
  for (const mediaId of input.attachmentIds) {
    const media = mediaById.get(mediaId);
    if (!media || media.status !== "ready") return { outcome: "media_not_ready" };
    if (
      media.ownerUserId !== input.ownerUserId ||
      media.journalId !== input.journalId ||
      media.visibility !== "private" ||
      (media.purpose !== "astro_diary_attachment" && media.purpose !== "astro_diary_voice")
    ) {
      return { outcome: "media_scope_conflict" };
    }
    if (
      media.boundItemId !== null &&
      (!input.allowExistingItemBinding || media.boundItemId !== input.itemId)
    ) {
      return { outcome: "media_already_bound" };
    }
  }
  return {
    outcome: "valid",
    bindings: input.attachmentIds.map((mediaId) => ({ mediaId, itemId: input.itemId }))
  };
}

export type AstroDiaryDraftEditOutcome =
  | Readonly<{ outcome: "updated"; draft: AstroDiaryDraftState }>
  | Readonly<{ outcome: "author_mismatch" }>
  | Readonly<{ outcome: "version_conflict"; expectedVersion: number; currentVersion: number }>
  | Readonly<{ outcome: "invalid_draft" }>;

export function editAstroDiaryDraft(
  draft: AstroDiaryDraftState,
  input: {
    readonly actorUserId: string;
    readonly expectedVersion: number;
    readonly body: string;
    readonly attachmentIds: readonly string[];
    readonly moodId: AstroDiaryMoodId | null;
    readonly updatedAt: string;
  }
): AstroDiaryDraftEditOutcome {
  if (input.actorUserId !== draft.authorUserId) return { outcome: "author_mismatch" };
  if (input.expectedVersion !== draft.version) {
    return {
      outcome: "version_conflict",
      expectedVersion: input.expectedVersion,
      currentVersion: draft.version
    };
  }
  const parsed = astroDiaryDraftSchema.safeParse({
    ...draft,
    version: draft.version + 1,
    body: input.body,
    attachmentIds: [...input.attachmentIds],
    moodId: draft.kind === "client_entry" ? input.moodId : null,
    updatedAt: input.updatedAt
  });
  return parsed.success ? { outcome: "updated", draft: parsed.data } : { outcome: "invalid_draft" };
}

export type AstroDiaryDraftPublishOutcome =
  | Readonly<{
      outcome: "published";
      sourceDraftVersion: number;
      item: AstroDiaryTimelineItem;
      mediaBindings: readonly Readonly<{ mediaId: string; itemId: string }>[];
    }>
  | Readonly<{ outcome: "author_mismatch" }>
  | Readonly<{ outcome: "version_conflict"; expectedVersion: number; currentVersion: number }>
  | Readonly<{
      outcome:
        | "empty_draft"
        | "media_not_ready"
        | "media_scope_conflict"
        | "media_already_bound"
        | "cycle_scope_conflict"
        | "invalid_publish";
    }>;

export function publishAstroDiaryDraft(
  draft: AstroDiaryDraftState,
  input: {
    readonly actorUserId: string;
    readonly expectedVersion: number;
    readonly media: readonly AstroDiaryMediaAuthority[];
    readonly itemId: string;
    readonly cycleId: string;
    readonly occurredAt: string;
    readonly cursor: number;
  }
): AstroDiaryDraftPublishOutcome {
  if (input.actorUserId !== draft.authorUserId) return { outcome: "author_mismatch" };
  if (input.expectedVersion !== draft.version) {
    return {
      outcome: "version_conflict",
      expectedVersion: input.expectedVersion,
      currentVersion: draft.version
    };
  }
  if (draft.body.trim().length === 0) return { outcome: "empty_draft" };
  if (draft.cycleId !== null && draft.cycleId !== input.cycleId) {
    return { outcome: "cycle_scope_conflict" };
  }
  const mediaValidation = validateAstroDiaryMediaBindings({
    attachmentIds: draft.attachmentIds,
    media: input.media,
    ownerUserId: draft.authorUserId,
    journalId: draft.journalId,
    itemId: input.itemId,
    allowExistingItemBinding: false
  });
  if (mediaValidation.outcome !== "valid") return mediaValidation;

  const common = {
    id: input.itemId,
    journalId: draft.journalId,
    cycleId: input.cycleId,
    authorUserId: draft.authorUserId,
    revision: 1,
    body: draft.body.trim(),
    attachmentIds: [...draft.attachmentIds],
    editedAt: null,
    occurredAt: input.occurredAt,
    cursor: input.cursor
  };
  const candidate =
    draft.kind === "client_entry"
      ? {
          ...common,
          kind: draft.kind,
          authorRole: "client" as const,
          moodId: draft.moodId,
          contextStatus: "pending" as const,
          correctsItemId: null
        }
      : draft.kind === "correction"
        ? {
            ...common,
            kind: draft.kind,
            authorRole: draft.authorRole,
            moodId: null,
            contextStatus: null,
            correctsItemId: draft.correctsItemId
          }
        : {
            ...common,
            kind: draft.kind,
            authorRole: "astrologer" as const,
            moodId: null,
            contextStatus: null,
            correctsItemId: null
          };
  const parsed = astroDiaryTimelineItemSchema.safeParse(candidate);
  return parsed.success
    ? {
        outcome: "published",
        sourceDraftVersion: draft.version,
        item: parsed.data,
        mediaBindings: mediaValidation.bindings
      }
    : { outcome: "invalid_publish" };
}
