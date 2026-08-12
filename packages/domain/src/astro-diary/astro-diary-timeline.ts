import type {
  AstroDiaryCycleCloseReason,
  AstroDiaryCycleState,
  AstroDiaryTimelineItem
} from "@elevenhouse/contracts";
import { astroDiaryTimelineItemSchema } from "@elevenhouse/contracts";
import { sha256CanonicalJson } from "../calculations/canonical-json";
import {
  validateAstroDiaryMediaBindings,
  type AstroDiaryMediaAuthority
} from "./astro-diary-drafts";

type TimelineDecisionRejection =
  | { readonly outcome: "rejected"; readonly code: "author_mismatch" }
  | {
      readonly outcome: "rejected";
      readonly code: "revision_conflict";
      readonly expectedRevision: number;
      readonly currentRevision: number;
    }
  | { readonly outcome: "rejected"; readonly code: "dependent_item_exists" }
  | { readonly outcome: "rejected"; readonly code: "terminal_transition_exists" }
  | { readonly outcome: "rejected"; readonly code: "edit_still_allowed" }
  | { readonly outcome: "rejected"; readonly code: "ordinary_edit_not_allowed" }
  | { readonly outcome: "rejected"; readonly code: "ordinary_hide_not_allowed" }
  | {
      readonly outcome: "rejected";
      readonly code: "media_not_ready" | "media_scope_conflict" | "media_already_bound";
    }
  | {
      readonly outcome: "rejected";
      readonly code: "cycle_state_conflict";
      readonly currentState: AstroDiaryCycleState;
    };

export type AstroDiaryItemEditDecision =
  | {
      readonly outcome: "edit_allowed";
      readonly previousRevision: number;
      readonly item: AstroDiaryTimelineItem;
      readonly mediaBindings: readonly Readonly<{ mediaId: string; itemId: string }>[];
      readonly mediaReleases: readonly Readonly<{ mediaId: string; itemId: string }>[];
      readonly contextInvalidation: Readonly<{
        itemId: string;
        previousRevision: number;
        nextRevision: number;
      }> | null;
    }
  | TimelineDecisionRejection;

export type AstroDiaryItemCorrectionDecision =
  | {
      readonly outcome: "correction_allowed";
      readonly correction: Extract<AstroDiaryTimelineItem, { kind: "correction" }>;
      readonly mediaBindings: readonly Readonly<{ mediaId: string; itemId: string }>[];
    }
  | TimelineDecisionRejection;

export type AstroDiaryItemHideDecision =
  | {
      readonly outcome: "hide_allowed";
      readonly tombstone: Extract<AstroDiaryTimelineItem, { kind: "tombstone" }>;
      readonly hiddenAt: string;
      readonly cycleClosure: {
        readonly cycleId: string;
        readonly reason: Extract<
          AstroDiaryCycleCloseReason,
          "trigger_deleted" | "prompt_withdrawn"
        >;
      };
      readonly obligationClosure: {
        readonly cycleId: string;
        readonly state: "closed_without_response";
      } | null;
      readonly allowanceTransition: "none" | "release_opening_reservation";
    }
  | TimelineDecisionRejection;

export type AstroDiaryItemErasureDecision =
  | Readonly<{
      outcome: "erasure_started";
      erasureCommand: Readonly<{
        id: string;
        itemId: string;
        sourceRevision: number;
        sourceDigest: `sha256:${string}`;
        requestedAt: string;
        state: "pending";
      }>;
      readAccessRevocation: Readonly<{ itemId: string; sourceRevision: number }>;
      mediaAccessRevocations: readonly string[];
      derivativeRedaction: Readonly<{
        commandId: string;
        sourceItemId: string;
        sourceRevision: number;
      }>;
    }>
  | TimelineDecisionRejection;

export type AstroDiaryItemErasureCompletionDecision =
  | Readonly<{
      outcome: "erasure_completed";
      erasureCommandId: string;
      tombstone: Extract<AstroDiaryTimelineItem, { kind: "tombstone" }>;
      completedAt: string;
      evidence: Readonly<{
        sourceRedactionReceiptId: string;
        derivativeRedactionReceiptId: string;
        mediaRedactionReceiptIds: readonly string[];
      }>;
    }>
  | TimelineDecisionRejection
  | Readonly<{
      outcome: "rejected";
      code: "redaction_evidence_incomplete" | "source_evidence_conflict";
    }>;

export function decideAstroDiaryItemEdit(
  item: AstroDiaryTimelineItem,
  input: {
    readonly actorUserId: string;
    readonly expectedRevision: number;
    readonly dependentItemIds: readonly string[];
    readonly causedTerminalCycleTransition: boolean;
    readonly body: string;
    readonly attachmentIds: readonly string[];
    readonly media: readonly AstroDiaryMediaAuthority[];
    readonly editedAt: string;
  }
): AstroDiaryItemEditDecision {
  const authorRejection = rejectAuthorMismatch(item, input.actorUserId);
  if (authorRejection) return authorRejection;
  if (item.revision !== input.expectedRevision) {
    return {
      outcome: "rejected",
      code: "revision_conflict",
      expectedRevision: input.expectedRevision,
      currentRevision: item.revision
    };
  }
  if (item.kind === "tombstone") {
    return { outcome: "rejected", code: "ordinary_edit_not_allowed" };
  }
  if (input.dependentItemIds.length > 0) {
    return { outcome: "rejected", code: "dependent_item_exists" };
  }
  if (input.causedTerminalCycleTransition) {
    return { outcome: "rejected", code: "terminal_transition_exists" };
  }
  const mediaValidation = validateAstroDiaryMediaBindings({
    attachmentIds: input.attachmentIds,
    media: input.media,
    ownerUserId: item.authorUserId,
    journalId: item.journalId,
    itemId: item.id,
    allowExistingItemBinding: true
  });
  if (mediaValidation.outcome !== "valid") {
    return { outcome: "rejected", code: mediaValidation.outcome };
  }
  const nextAttachmentIds = new Set(input.attachmentIds);
  const removedMediaIds = item.attachmentIds.filter((mediaId) => !nextAttachmentIds.has(mediaId));
  const mediaById = new Map(input.media.map((media) => [media.id, media]));
  for (const mediaId of removedMediaIds) {
    const media = mediaById.get(mediaId);
    if (!media || media.status !== "ready") {
      return { outcome: "rejected", code: "media_not_ready" };
    }
    if (
      media.ownerUserId !== item.authorUserId ||
      media.journalId !== item.journalId ||
      media.visibility !== "private" ||
      (media.purpose !== "astro_diary_attachment" && media.purpose !== "astro_diary_voice") ||
      media.boundItemId !== item.id
    ) {
      return { outcome: "rejected", code: "media_scope_conflict" };
    }
  }
  const nextRevision = item.revision + 1;
  return {
    outcome: "edit_allowed",
    previousRevision: item.revision,
    item: astroDiaryTimelineItemSchema.parse({
      ...item,
      body: input.body,
      attachmentIds: [...input.attachmentIds],
      revision: nextRevision,
      contextStatus: item.kind === "client_entry" ? "pending" : null,
      editedAt: input.editedAt
    }),
    mediaBindings: mediaValidation.bindings,
    mediaReleases: removedMediaIds.map((mediaId) => ({ mediaId, itemId: item.id })),
    contextInvalidation:
      item.kind === "client_entry"
        ? { itemId: item.id, previousRevision: item.revision, nextRevision }
        : null
  };
}

export function decideAstroDiaryItemCorrection(
  item: AstroDiaryTimelineItem,
  input: {
    readonly actorUserId: string;
    readonly dependentItemIds: readonly string[];
    readonly causedTerminalCycleTransition: boolean;
    readonly correctionItemId: string;
    readonly body: string;
    readonly attachmentIds: readonly string[];
    readonly media: readonly AstroDiaryMediaAuthority[];
    readonly occurredAt: string;
    readonly cursor: number;
  }
): AstroDiaryItemCorrectionDecision {
  const authorRejection = rejectAuthorMismatch(item, input.actorUserId);
  if (authorRejection) return authorRejection;
  if (item.kind === "tombstone" || item.kind === "correction") {
    return { outcome: "rejected", code: "ordinary_edit_not_allowed" };
  }
  if (input.dependentItemIds.length === 0 && !input.causedTerminalCycleTransition) {
    return { outcome: "rejected", code: "edit_still_allowed" };
  }
  const mediaValidation = validateAstroDiaryMediaBindings({
    attachmentIds: input.attachmentIds,
    media: input.media,
    ownerUserId: item.authorUserId,
    journalId: item.journalId,
    itemId: input.correctionItemId,
    allowExistingItemBinding: false
  });
  if (mediaValidation.outcome !== "valid") {
    return { outcome: "rejected", code: mediaValidation.outcome };
  }
  const correction = astroDiaryTimelineItemSchema.parse({
    id: input.correctionItemId,
    correctsItemId: item.id,
    journalId: item.journalId,
    cycleId: item.cycleId,
    kind: "correction",
    authorRole: item.authorRole,
    authorUserId: item.authorUserId,
    revision: 1,
    body: input.body,
    attachmentIds: [...input.attachmentIds],
    moodId: null,
    contextStatus: null,
    editedAt: null,
    occurredAt: input.occurredAt,
    cursor: input.cursor
  });
  if (correction.kind !== "correction") {
    throw new TypeError("AstroDiary correction schema returned an unexpected item kind");
  }
  return {
    outcome: "correction_allowed",
    correction,
    mediaBindings: mediaValidation.bindings
  };
}

export function decideAstroDiaryItemHide(
  item: AstroDiaryTimelineItem,
  input: {
    readonly actorUserId: string;
    readonly expectedRevision: number;
    readonly cycleState: AstroDiaryCycleState;
    readonly dependentItemIds: readonly string[];
    readonly tombstonedAt: string;
  }
): AstroDiaryItemHideDecision {
  const authorRejection = rejectAuthorMismatch(item, input.actorUserId);
  if (authorRejection) return authorRejection;
  if (item.revision !== input.expectedRevision) {
    return {
      outcome: "rejected",
      code: "revision_conflict",
      expectedRevision: input.expectedRevision,
      currentRevision: item.revision
    };
  }
  if (item.kind === "tombstone" || item.kind === "correction" || item.kind === "astrologer_reply") {
    return { outcome: "rejected", code: "ordinary_hide_not_allowed" };
  }
  if (input.dependentItemIds.length > 0) {
    return { outcome: "rejected", code: "dependent_item_exists" };
  }

  if (item.kind === "client_entry") {
    if (
      input.cycleState !== "awaiting_astrologer_response" &&
      input.cycleState !== "awaiting_astrologer_closing_response"
    ) {
      return {
        outcome: "rejected",
        code: "cycle_state_conflict",
        currentState: input.cycleState
      };
    }
    return hideAllowed(
      item,
      input,
      "trigger_deleted",
      {
        cycleId: item.cycleId,
        state: "closed_without_response"
      },
      "none"
    );
  }

  if (
    input.cycleState !== "awaiting_client_entry" &&
    input.cycleState !== "awaiting_client_follow_up"
  ) {
    return {
      outcome: "rejected",
      code: "cycle_state_conflict",
      currentState: input.cycleState
    };
  }
  return hideAllowed(
    item,
    input,
    "prompt_withdrawn",
    null,
    input.cycleState === "awaiting_client_entry" ? "release_opening_reservation" : "none"
  );
}

export function decideAstroDiaryItemErasure(
  item: AstroDiaryTimelineItem,
  input: {
    readonly actorUserId: string;
    readonly expectedRevision: number;
    readonly erasureCommandId: string;
    readonly derivativeRedactionCommandId: string;
    readonly occurredAt: string;
  }
): AstroDiaryItemErasureDecision {
  const authorRejection = rejectAuthorMismatch(item, input.actorUserId);
  if (authorRejection) return authorRejection;
  if (item.revision !== input.expectedRevision) {
    return {
      outcome: "rejected",
      code: "revision_conflict",
      expectedRevision: input.expectedRevision,
      currentRevision: item.revision
    };
  }
  if (item.kind === "tombstone") {
    return { outcome: "rejected", code: "ordinary_edit_not_allowed" };
  }
  return {
    outcome: "erasure_started",
    erasureCommand: {
      id: input.erasureCommandId,
      itemId: item.id,
      sourceRevision: item.revision,
      sourceDigest: timelineItemDigest(item),
      requestedAt: input.occurredAt,
      state: "pending"
    },
    readAccessRevocation: { itemId: item.id, sourceRevision: item.revision },
    mediaAccessRevocations: [...item.attachmentIds],
    derivativeRedaction: {
      commandId: input.derivativeRedactionCommandId,
      sourceItemId: item.id,
      sourceRevision: item.revision
    }
  };
}

export function completeAstroDiaryItemErasure(
  item: AstroDiaryTimelineItem,
  input: {
    readonly expectedRevision: number;
    readonly erasureCommand: Readonly<{
      commandId: string;
      itemId: string;
      sourceRevision: number;
      sourceDigest: `sha256:${string}`;
      state: "pending";
    }>;
    readonly sourceRedactionReceiptId: string;
    readonly derivativeRedactionReceiptId: string;
    readonly mediaRedactionReceipts: readonly Readonly<{
      mediaId: string;
      receiptId: string;
    }>[];
    readonly completedAt: string;
  }
): AstroDiaryItemErasureCompletionDecision {
  if (item.revision !== input.expectedRevision) {
    return {
      outcome: "rejected",
      code: "revision_conflict",
      expectedRevision: input.expectedRevision,
      currentRevision: item.revision
    };
  }
  if (item.kind === "tombstone") {
    return { outcome: "rejected", code: "ordinary_edit_not_allowed" };
  }
  if (
    input.erasureCommand.itemId !== item.id ||
    input.erasureCommand.sourceRevision !== item.revision ||
    input.erasureCommand.sourceDigest !== timelineItemDigest(item)
  ) {
    return { outcome: "rejected", code: "source_evidence_conflict" };
  }
  const expectedMediaIds = new Set(item.attachmentIds);
  const observedMediaIds = new Set(input.mediaRedactionReceipts.map(({ mediaId }) => mediaId));
  const receiptIds = input.mediaRedactionReceipts.map(({ receiptId }) => receiptId);
  if (
    expectedMediaIds.size !== item.attachmentIds.length ||
    observedMediaIds.size !== input.mediaRedactionReceipts.length ||
    expectedMediaIds.size !== observedMediaIds.size ||
    [...expectedMediaIds].some((mediaId) => !observedMediaIds.has(mediaId)) ||
    new Set(receiptIds).size !== receiptIds.length
  ) {
    return { outcome: "rejected", code: "redaction_evidence_incomplete" };
  }
  const tombstone = astroDiaryTimelineItemSchema.parse({
    id: item.id,
    journalId: item.journalId,
    cycleId: item.cycleId,
    kind: "tombstone",
    originalKind: item.kind,
    authorRole: item.authorRole,
    authorUserId: item.authorUserId,
    revision: item.revision + 1,
    reason: "content_erased",
    occurredAt: item.occurredAt,
    cursor: item.cursor
  });
  if (tombstone.kind !== "tombstone") {
    throw new TypeError("AstroDiary erasure schema returned an unexpected item kind");
  }
  return {
    outcome: "erasure_completed",
    erasureCommandId: input.erasureCommand.commandId,
    tombstone,
    completedAt: input.completedAt,
    evidence: {
      sourceRedactionReceiptId: input.sourceRedactionReceiptId,
      derivativeRedactionReceiptId: input.derivativeRedactionReceiptId,
      mediaRedactionReceiptIds: receiptIds
    }
  };
}

function timelineItemDigest(item: Exclude<AstroDiaryTimelineItem, { kind: "tombstone" }>) {
  return sha256CanonicalJson({
    itemId: item.id,
    journalId: item.journalId,
    cycleId: item.cycleId,
    kind: item.kind,
    authorUserId: item.authorUserId,
    revision: item.revision,
    body: item.body,
    attachmentIds: item.attachmentIds,
    occurredAt: item.occurredAt,
    cursor: item.cursor
  });
}

function rejectAuthorMismatch(
  item: AstroDiaryTimelineItem,
  actorUserId: string
): Extract<TimelineDecisionRejection, { readonly code: "author_mismatch" }> | null {
  return item.authorUserId === actorUserId
    ? null
    : { outcome: "rejected", code: "author_mismatch" };
}

function hideAllowed(
  item: Extract<AstroDiaryTimelineItem, { readonly kind: "client_entry" | "reflection_prompt" }>,
  input: { readonly tombstonedAt: string },
  reason: "trigger_deleted" | "prompt_withdrawn",
  obligationClosure: {
    readonly cycleId: string;
    readonly state: "closed_without_response";
  } | null,
  allowanceTransition: "none" | "release_opening_reservation"
): AstroDiaryItemHideDecision {
  const tombstone = astroDiaryTimelineItemSchema.parse({
    id: item.id,
    journalId: item.journalId,
    cycleId: item.cycleId,
    kind: "tombstone",
    originalKind: item.kind,
    authorRole: item.authorRole,
    authorUserId: item.authorUserId,
    revision: item.revision + 1,
    reason: "hidden_by_author",
    occurredAt: item.occurredAt,
    cursor: item.cursor
  });
  if (tombstone.kind !== "tombstone") {
    throw new TypeError("AstroDiary hide schema returned an unexpected item kind");
  }
  return {
    outcome: "hide_allowed",
    tombstone,
    hiddenAt: input.tombstonedAt,
    cycleClosure: { cycleId: item.cycleId, reason },
    obligationClosure,
    allowanceTransition
  };
}
