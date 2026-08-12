export type AstroDiaryPrivateMediaPurpose = "astro_diary_attachment" | "astro_diary_voice";

export type AstroDiaryMediaAuthorizationContext = Readonly<{
  actorUserId: string;
  relationship: Readonly<{
    id: string;
    clientUserId: string;
    astrologerUserId: string;
    state: "active" | "archived" | "blocked";
  }>;
  journal: Readonly<{
    id: string;
    relationshipId: string;
    clientUserId: string;
    astrologerUserId: string;
    state: "active" | "erasing" | "erased";
  }>;
}>;

export type AstroDiaryPrivateMediaAuthority = Readonly<{
  id: string;
  ownerUserId: string;
  journalId: string;
  purpose: string;
  visibility: "public" | "private";
  status: "uploading" | "processing" | "ready" | "failed" | "deleted";
  boundItemId: string | null;
  accessRevoked: boolean;
}>;

export type AstroDiaryMediaItemReadAuthority = Readonly<{
  id: string;
  journalId: string;
  authorUserId: string;
  visibility: "visible" | "hidden" | "erased";
  attachmentIds: readonly string[];
  readAccessRevoked: boolean;
}>;

export type AstroDiaryMediaAuthorizationDeniedCode =
  | "relationship_denied"
  | "relationship_pair_conflict"
  | "journal_scope_conflict"
  | "journal_not_active"
  | "actor_not_participant"
  | "media_owner_conflict"
  | "media_purpose_conflict"
  | "media_visibility_conflict"
  | "media_state_conflict"
  | "media_already_bound"
  | "media_journal_conflict"
  | "media_not_ready"
  | "media_binding_conflict"
  | "item_journal_conflict"
  | "item_author_conflict"
  | "item_not_visible"
  | "read_access_revoked";

export type AstroDiaryMediaAuthorizationDecision =
  | Readonly<{ outcome: "allowed" }>
  | Readonly<{
      outcome: "denied";
      code: AstroDiaryMediaAuthorizationDeniedCode;
    }>;

export function authorizeAstroDiaryMediaUpload(
  authority: AstroDiaryMediaAuthorizationContext,
  input: Readonly<{ ownerUserId: string; purpose: string }>
): AstroDiaryMediaAuthorizationDecision {
  const scope = authorizeParticipantJournal(authority);
  if (scope.outcome === "denied") return scope;
  if (!isAstroDiaryPrivateMediaPurpose(input.purpose)) {
    return denied("media_purpose_conflict");
  }
  if (input.ownerUserId !== authority.actorUserId) {
    return denied("media_owner_conflict");
  }
  return allowed;
}

export function authorizeAstroDiaryMediaCompletion(
  authority: AstroDiaryMediaAuthorizationContext,
  media: AstroDiaryPrivateMediaAuthority
): AstroDiaryMediaAuthorizationDecision {
  const scope = authorizeParticipantJournal(authority);
  if (scope.outcome === "denied") return scope;
  if (!isAstroDiaryPrivateMediaPurpose(media.purpose)) {
    return denied("media_purpose_conflict");
  }
  if (media.ownerUserId !== authority.actorUserId) {
    return denied("media_owner_conflict");
  }
  if (media.journalId !== authority.journal.id) {
    return denied("media_journal_conflict");
  }
  if (media.visibility !== "private") {
    return denied("media_visibility_conflict");
  }
  if (media.accessRevoked) return denied("read_access_revoked");
  if (media.status !== "uploading") return denied("media_state_conflict");
  if (media.boundItemId !== null) return denied("media_already_bound");
  return allowed;
}

export function authorizeAstroDiaryMediaSignedRead(
  authority: AstroDiaryMediaAuthorizationContext,
  media: AstroDiaryPrivateMediaAuthority,
  item: AstroDiaryMediaItemReadAuthority
): AstroDiaryMediaAuthorizationDecision {
  const scope = authorizeParticipantJournal(authority);
  if (scope.outcome === "denied") return scope;
  if (!isAstroDiaryPrivateMediaPurpose(media.purpose)) {
    return denied("media_purpose_conflict");
  }
  if (media.journalId !== authority.journal.id) {
    return denied("media_journal_conflict");
  }
  if (media.visibility !== "private") {
    return denied("media_visibility_conflict");
  }
  if (media.status !== "ready") return denied("media_not_ready");
  if (media.accessRevoked || item.readAccessRevoked) {
    return denied("read_access_revoked");
  }
  if (item.journalId !== authority.journal.id) {
    return denied("item_journal_conflict");
  }
  if (!isParticipant(authority, item.authorUserId)) {
    return denied("item_author_conflict");
  }
  if (media.ownerUserId !== item.authorUserId) {
    return denied("media_owner_conflict");
  }
  if (item.visibility !== "visible") return denied("item_not_visible");
  if (media.boundItemId !== item.id || !item.attachmentIds.includes(media.id)) {
    return denied("media_binding_conflict");
  }
  return allowed;
}

function authorizeParticipantJournal(
  authority: AstroDiaryMediaAuthorizationContext
): AstroDiaryMediaAuthorizationDecision {
  if (authority.relationship.state !== "active") {
    return denied("relationship_denied");
  }
  if (
    authority.relationship.clientUserId === authority.relationship.astrologerUserId ||
    authority.relationship.clientUserId !== authority.journal.clientUserId ||
    authority.relationship.astrologerUserId !== authority.journal.astrologerUserId
  ) {
    return denied("relationship_pair_conflict");
  }
  if (authority.journal.relationshipId !== authority.relationship.id) {
    return denied("journal_scope_conflict");
  }
  if (authority.journal.state !== "active") return denied("journal_not_active");
  if (!isParticipant(authority, authority.actorUserId)) {
    return denied("actor_not_participant");
  }
  return allowed;
}

function isParticipant(authority: AstroDiaryMediaAuthorizationContext, userId: string): boolean {
  return (
    userId === authority.relationship.clientUserId ||
    userId === authority.relationship.astrologerUserId
  );
}

function isAstroDiaryPrivateMediaPurpose(value: string): value is AstroDiaryPrivateMediaPurpose {
  return value === "astro_diary_attachment" || value === "astro_diary_voice";
}

const allowed = { outcome: "allowed" } as const;

function denied(
  code: AstroDiaryMediaAuthorizationDeniedCode
): AstroDiaryMediaAuthorizationDecision {
  return { outcome: "denied", code };
}
