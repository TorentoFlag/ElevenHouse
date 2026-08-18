import {
  astroDiaryAstrologerDraftCreateRequestSchema,
  astroDiaryAstrologerDraftUpdateRequestSchema,
  astroDiaryClientDraftCreateRequestSchema,
  astroDiaryClientDraftUpdateRequestSchema,
  astroDiaryDraftDeleteRequestSchema,
  astroDiaryDraftSchema,
  type AstroDiaryAstrologerDraftCreateRequest,
  type AstroDiaryAstrologerDraftUpdateRequest,
  type AstroDiaryClientDraftCreateRequest,
  type AstroDiaryClientDraftUpdateRequest,
  type AstroDiaryDraftDeleteRequest,
  type AstroDiaryDraft
} from "@elevenhouse/contracts";
import { Temporal } from "@js-temporal/polyfill";

import { authorizeAstroDiaryOperation, type AstroDiaryOperation } from "./astro-diary-access-policy";
import { validateAstroDiaryCommandAuthority } from "./astro-diary-commands";
import type { AstroDiaryMediaAuthority } from "./astro-diary-drafts";
import { editAstroDiaryDraft } from "./astro-diary-drafts";
import {
  executeAstroDiaryDraftCreateCommand,
  executeAstroDiaryDraftMutationCommand,
  type AstroDiaryCommandAuthority,
  type AstroDiaryCommandDecision,
  type AstroDiaryCommandExecution,
  type AstroDiaryCommandUnitOfWork,
  type AstroDiaryCommandWriteSet
} from "./ports/astro-diary-command-unit-of-work";

type ParticipantDraftCreateInput =
  | Readonly<{
      actorUserId: string;
      actorRole: "client";
      request: AstroDiaryClientDraftCreateRequest;
    }>
  | Readonly<{
      actorUserId: string;
      actorRole: "astrologer";
      request: AstroDiaryAstrologerDraftCreateRequest;
    }>;

export type ExecuteAstroDiaryParticipantDraftCreateInput = ParticipantDraftCreateInput &
  Readonly<{ journalId: string; idempotencyKey: string }>;

export type DecideAstroDiaryDraftCreateInput = ParticipantDraftCreateInput &
  Readonly<{ draftId: string }>;

type ParticipantDraftUpdateInput =
  | Readonly<{
      actorUserId: string;
      actorRole: "client";
      request: AstroDiaryClientDraftUpdateRequest;
    }>
  | Readonly<{
      actorUserId: string;
      actorRole: "astrologer";
      request: AstroDiaryAstrologerDraftUpdateRequest;
    }>;

type ParticipantDraftDeleteInput = Readonly<{
  actorUserId: string;
  actorRole: "client" | "astrologer";
  draftId: string;
  request: AstroDiaryDraftDeleteRequest;
}>;

export function executeAstroDiaryParticipantDraftCreateCommand(
  unitOfWork: AstroDiaryCommandUnitOfWork,
  input: ExecuteAstroDiaryParticipantDraftCreateInput
): Promise<AstroDiaryCommandExecution> {
  const operation = operationFor(input.request);
  return executeAstroDiaryDraftCreateCommand(
    unitOfWork,
    {
      journalId: input.journalId,
      idempotencyKey: input.idempotencyKey,
      preconditions: [
        {
          aggregate: "journal",
          id: input.journalId,
          expectedVersion: input.request.expectedJournalVersion
        }
      ],
      envelope: {
        operation,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        request: semanticDraftCreateRequest(input.request)
      }
    },
    (authority, _envelope, allocation) =>
      input.actorRole === "client"
        ? decideAstroDiaryDraftCreateCommand(authority, {
            actorUserId: input.actorUserId,
            actorRole: input.actorRole,
            request: input.request,
            draftId: allocation.draftId
          })
        : decideAstroDiaryDraftCreateCommand(authority, {
            actorUserId: input.actorUserId,
            actorRole: input.actorRole,
            request: input.request,
            draftId: allocation.draftId
          })
  );
}

export function executeAstroDiaryParticipantDraftUpdateCommand(
  unitOfWork: AstroDiaryCommandUnitOfWork,
  input: ParticipantDraftUpdateInput &
    Readonly<{ journalId: string; idempotencyKey: string }>
): Promise<AstroDiaryCommandExecution> {
  return executeAstroDiaryDraftMutationCommand(
    unitOfWork,
    {
      journalId: input.journalId,
      draftId: input.request.draftId,
      idempotencyKey: input.idempotencyKey,
      preconditions: draftMutationPreconditions(
        input.journalId,
        input.request.expectedJournalVersion,
        input.request.draftId,
        input.request.expectedDraftVersion
      ),
      envelope: {
        operation: "edit",
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        request: {
          command: "update_draft",
          draftId: input.request.draftId,
          expectedJournalVersion: input.request.expectedJournalVersion,
          expectedDraftVersion: input.request.expectedDraftVersion,
          body: input.request.body,
          attachmentIds: input.request.attachmentIds,
          moodId: input.request.moodId
        }
      }
    },
    (authority) =>
      input.actorRole === "client"
        ? decideAstroDiaryDraftUpdateCommand(authority, input)
        : decideAstroDiaryDraftUpdateCommand(authority, input)
  );
}

export function executeAstroDiaryParticipantDraftDeleteCommand(
  unitOfWork: AstroDiaryCommandUnitOfWork,
  input: ParticipantDraftDeleteInput &
    Readonly<{ journalId: string; idempotencyKey: string }>
): Promise<AstroDiaryCommandExecution> {
  return executeAstroDiaryDraftMutationCommand(
    unitOfWork,
    {
      journalId: input.journalId,
      draftId: input.draftId,
      idempotencyKey: input.idempotencyKey,
      preconditions: draftMutationPreconditions(
        input.journalId,
        input.request.expectedJournalVersion,
        input.draftId,
        input.request.expectedDraftVersion
      ),
      envelope: {
        operation: "edit",
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        request: {
          command: "delete_draft",
          draftId: input.draftId,
          expectedJournalVersion: input.request.expectedJournalVersion,
          expectedDraftVersion: input.request.expectedDraftVersion
        }
      }
    },
    (authority) => decideAstroDiaryDraftDeleteCommand(authority, input)
  );
}

export function decideAstroDiaryDraftCreateCommand(
  authority: AstroDiaryCommandAuthority,
  input: DecideAstroDiaryDraftCreateInput
): AstroDiaryCommandDecision {
  const request = parseParticipantRequest(input);
  if (!request) return rejected("invalid_request");
  const coherence = validateAstroDiaryCommandAuthority(authority);
  if (coherence) return rejected(coherence);
  const expectedActor =
    input.actorRole === "client"
      ? authority.journal.clientUserId
      : authority.journal.astrologerUserId;
  if (input.actorUserId !== expectedActor) return rejected("actor_mismatch");

  const operation = operationFor(request);
  const access = authorizeAstroDiaryOperation(authority.access, operation);
  if (access.outcome === "denied") return rejected(access.code);
  if (request.cycleId === null && !hasCurrentPaidPeriod(authority)) {
    return rejected("paid_access_ended");
  }

  const cycle =
    request.cycleId === null
      ? null
      : (authority.cycles.find(({ id }) => id === request.cycleId) ?? null);
  if (
    request.cycleId !== null &&
    (!cycle || (request.kind !== "correction" && cycle.state === "closed"))
  ) {
    return rejected("cycle_scope_conflict");
  }
  if (!validTurn(request.kind, cycle?.state ?? null)) {
    return rejected("cycle_turn_conflict");
  }
  if (request.kind === "correction") {
    const source = authority.timelineItems.find(({ id }) => id === request.correctsItemId);
    if (
      !source ||
      source.kind === "tombstone" ||
      source.kind === "correction" ||
      source.cycleId !== request.cycleId ||
      source.authorUserId !== input.actorUserId ||
      source.authorRole !== input.actorRole
    ) {
      return rejected("correction_source_conflict");
    }
  }
  if (
    authority.drafts.some(
      (draft) =>
        draft.authorUserId === input.actorUserId &&
        draft.kind === request.kind &&
        draft.cycleId === request.cycleId &&
        draft.correctsItemId === request.correctsItemId
    )
  ) {
    return rejected("draft_already_exists");
  }
  const mediaFailure = validateDraftMedia(authority.media, request.attachmentIds, {
    journalId: authority.journal.id,
    ownerUserId: input.actorUserId
  });
  if (mediaFailure) return rejected(mediaFailure);

  const parsedDraft = astroDiaryDraftSchema.safeParse({
    id: input.draftId,
    journalId: authority.journal.id,
    cycleId: request.cycleId,
    authorUserId: input.actorUserId,
    authorRole: input.actorRole,
    kind: request.kind,
    version: 1,
    body: request.body,
    attachmentIds: request.attachmentIds,
    moodId: request.moodId,
    correctsItemId: request.correctsItemId,
    updatedAt: authority.commandAt
  });
  if (!parsedDraft.success) return rejected("invalid_draft");
  return applied(authority, parsedDraft.data);
}

export function decideAstroDiaryDraftUpdateCommand(
  authority: AstroDiaryCommandAuthority,
  input: ParticipantDraftUpdateInput
): AstroDiaryCommandDecision {
  const request =
    input.actorRole === "client"
      ? astroDiaryClientDraftUpdateRequestSchema.safeParse(input.request)
      : astroDiaryAstrologerDraftUpdateRequestSchema.safeParse(input.request);
  if (!request.success) return rejected("invalid_request");
  const common = validateDraftMutationAuthority(authority, input, request.data.draftId);
  if (common.outcome === "rejected") return common;
  const mediaFailure = validateDraftMedia(authority.media, request.data.attachmentIds, {
    journalId: authority.journal.id,
    ownerUserId: input.actorUserId
  });
  if (mediaFailure) return rejected(mediaFailure);
  const edited = editAstroDiaryDraft(common.draft, {
    actorUserId: input.actorUserId,
    expectedVersion: request.data.expectedDraftVersion,
    body: request.data.body,
    attachmentIds: request.data.attachmentIds,
    moodId: request.data.moodId,
    updatedAt: authority.commandAt
  });
  if (edited.outcome !== "updated") return rejected(edited.outcome);
  const parsedDraft = astroDiaryDraftSchema.safeParse(edited.draft);
  if (!parsedDraft.success) return rejected("invalid_draft");
  return appliedDraftMutation(authority, {
    draftId: common.draft.id,
    beforeVersion: common.draft.version,
    after: parsedDraft.data
  });
}

export function decideAstroDiaryDraftDeleteCommand(
  authority: AstroDiaryCommandAuthority,
  input: ParticipantDraftDeleteInput
): AstroDiaryCommandDecision {
  const request = astroDiaryDraftDeleteRequestSchema.safeParse(input.request);
  if (!request.success) return rejected("invalid_request");
  const common = validateDraftMutationAuthority(authority, input, input.draftId);
  if (common.outcome === "rejected") return common;
  if (request.data.expectedDraftVersion !== common.draft.version) {
    return rejected("version_conflict");
  }
  return appliedDraftMutation(authority, {
    draftId: common.draft.id,
    beforeVersion: common.draft.version,
    after: null
  });
}

function parseParticipantRequest(input: DecideAstroDiaryDraftCreateInput) {
  const result =
    input.actorRole === "client"
      ? astroDiaryClientDraftCreateRequestSchema.safeParse(input.request)
      : astroDiaryAstrologerDraftCreateRequestSchema.safeParse(input.request);
  return result.success ? result.data : null;
}

function validateDraftMutationAuthority(
  authority: AstroDiaryCommandAuthority,
  input: Readonly<{ actorUserId: string; actorRole: "client" | "astrologer" }>,
  draftId: string
):
  | Readonly<{ outcome: "allowed"; draft: AstroDiaryDraft }>
  | Readonly<{ outcome: "rejected"; code: string }> {
  const coherence = validateAstroDiaryCommandAuthority(authority);
  if (coherence) return { outcome: "rejected", code: coherence };
  const access = authorizeAstroDiaryOperation(authority.access, "edit");
  if (access.outcome === "denied") return { outcome: "rejected", code: access.code };
  const expectedActor =
    input.actorRole === "client"
      ? authority.journal.clientUserId
      : authority.journal.astrologerUserId;
  if (input.actorUserId !== expectedActor) return { outcome: "rejected", code: "actor_mismatch" };
  const draft = authority.drafts.find(({ id }) => id === draftId);
  if (!draft) return { outcome: "rejected", code: "draft_not_found" };
  if (draft.authorUserId !== input.actorUserId || draft.authorRole !== input.actorRole) {
    return { outcome: "rejected", code: "author_mismatch" };
  }
  return { outcome: "allowed", draft };
}

function draftMutationPreconditions(
  journalId: string,
  journalVersion: number,
  draftId: string,
  draftVersion: number
) {
  return [
    { aggregate: "journal" as const, id: journalId, expectedVersion: journalVersion },
    { aggregate: "draft" as const, id: draftId, expectedVersion: draftVersion }
  ];
}

function operationFor(
  request: AstroDiaryClientDraftCreateRequest | AstroDiaryAstrologerDraftCreateRequest
): AstroDiaryOperation {
  if (request.kind === "correction") return "edit";
  return request.cycleId === null ? "start_cycle" : "continue_open_cycle";
}

function validTurn(kind: AstroDiaryDraft["kind"], state: string | null): boolean {
  if (kind === "correction") return state !== null;
  if (state === null) return kind === "client_entry" || kind === "reflection_prompt";
  if (kind === "client_entry") {
    return state === "awaiting_client_entry" || state === "awaiting_client_follow_up";
  }
  if (kind === "astrologer_reply") {
    return state === "awaiting_astrologer_response" || state === "awaiting_astrologer_closing_response";
  }
  return kind === "reflection_prompt" && state === "awaiting_astrologer_response";
}

function hasCurrentPaidPeriod(authority: AstroDiaryCommandAuthority): boolean {
  return Boolean(
    authority.activePeriod &&
    Temporal.Instant.compare(authority.commandAt, authority.activePeriod.startsAt) >= 0 &&
    Temporal.Instant.compare(authority.commandAt, authority.activePeriod.endsAt) < 0
  );
}

function validateDraftMedia(
  media: readonly AstroDiaryMediaAuthority[],
  attachmentIds: readonly string[],
  scope: Readonly<{ journalId: string; ownerUserId: string }>
): "media_not_ready" | "media_scope_conflict" | "media_already_bound" | null {
  const mediaById = new Map(media.map((item) => [item.id, item]));
  for (const mediaId of attachmentIds) {
    const item = mediaById.get(mediaId);
    if (!item || item.status !== "ready") return "media_not_ready";
    if (
      item.journalId !== scope.journalId ||
      item.ownerUserId !== scope.ownerUserId ||
      item.visibility !== "private" ||
      (item.purpose !== "astro_diary_attachment" && item.purpose !== "astro_diary_voice")
    ) {
      return "media_scope_conflict";
    }
    if (item.boundItemId !== null) return "media_already_bound";
  }
  return null;
}

function semanticDraftCreateRequest(
  request: AstroDiaryClientDraftCreateRequest | AstroDiaryAstrologerDraftCreateRequest
) {
  return {
    command: "create_draft",
    cycleId: request.cycleId,
    kind: request.kind,
    body: request.body,
    attachmentIds: request.attachmentIds,
    moodId: request.moodId,
    correctsItemId: request.correctsItemId
  };
}

function applied(
  authority: AstroDiaryCommandAuthority,
  draft: AstroDiaryDraft
): AstroDiaryCommandDecision {
  return {
    outcome: "applied",
    writeSet: {
      ...emptyWriteSet(),
      journals: [
        {
          beforeVersion: authority.journal.version,
          after: { ...authority.journal, version: authority.journal.version + 1 }
        }
      ],
      drafts: [{ draftId: draft.id, beforeVersion: null, after: draft }]
    }
  };
}

function appliedDraftMutation(
  authority: AstroDiaryCommandAuthority,
  draftEffect: AstroDiaryCommandWriteSet["drafts"][number]
): AstroDiaryCommandDecision {
  return {
    outcome: "applied",
    writeSet: {
      ...emptyWriteSet(),
      journals: [
        {
          beforeVersion: authority.journal.version,
          after: { ...authority.journal, version: authority.journal.version + 1 }
        }
      ],
      drafts: [draftEffect]
    }
  };
}

function rejected(code: string): AstroDiaryCommandDecision {
  return { outcome: "rejected", code };
}

function emptyWriteSet(): AstroDiaryCommandWriteSet {
  return {
    journals: [],
    cycles: [],
    drafts: [],
    obligations: [],
    allowances: [],
    timelineItems: [],
    mediaBindings: [],
    mediaReleases: [],
    mediaAccessRevocations: [],
    journalMediaAccessRevocations: [],
    itemReadAccessRevocations: [],
    contextSnapshots: [],
    contextInvalidations: [],
    derivativeCommands: [],
    erasureCommands: [],
    subscriptionTransitions: [],
    cascadeCommands: [],
    cascadeTargets: [],
    erasureFacts: [],
    readCursors: [],
    events: []
  };
}
