import type {
  AstroDiaryCycle,
  AstroDiaryDraft,
  AstroDiaryResponseObligation,
  AstroDiaryTimelineItem
} from "@elevenhouse/contracts";
import { Temporal } from "@js-temporal/polyfill";

import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import { authorizeAstroDiaryOperation } from "./astro-diary-access-policy";
import { validateAstroDiaryCommandAuthority } from "./astro-diary-commands";
import { createAstroDiaryContextRequest } from "./astro-diary-context";
import {
  acceptAstrologerPrompt,
  applyAstroDiaryFinanceRevocation,
  closeAwaitingClientCycle,
  openAstrologerPromptCycle,
  publishClientFollowUp
} from "./astro-diary-cycles";
import { publishAstroDiaryDraft } from "./astro-diary-drafts";
import { astroDiaryEvent } from "./astro-diary-events";
import { createAstroDiaryResponseObligation } from "./astro-diary-obligations";
import { decideAstroDiaryItemHide } from "./astro-diary-timeline";
import type {
  AstroDiaryCommandAuthority,
  AstroDiaryCommandDecision,
  AstroDiaryCommandExecution,
  AstroDiaryCommandPrecondition,
  AstroDiaryCommandUnitOfWork,
  AstroDiaryCommandWriteSet
} from "./ports/astro-diary-command-unit-of-work";
import { executeAstroDiaryCommand } from "./ports/astro-diary-command-unit-of-work";

export type OpenAstrologerPromptCommand = Readonly<{
  actorUserId: string;
  promptDraftId: string;
  expectedPromptDraftVersion: number;
  cycleId: string;
  promptItemId: string;
  periodId: string;
  allowanceExpectedVersion: number;
  allowanceIdempotencyKey: string;
  reservationId: string;
  derivativeCommandId: string;
  eventIds: Readonly<{
    cycleOpened: string;
    promptPublished: string;
    derivativeRequested: string;
  }>;
}>;

export type AcceptAstrologerPromptCommand = Readonly<{
  actorUserId: string;
  cycleId: string;
  expectedCycleVersion: number;
  entryDraftId: string;
  expectedEntryDraftVersion: number;
  entryItemId: string;
  obligationId: string;
  contextId: string;
  derivativeCommandId: string;
  allowancePeriodId: string;
  allowanceExpectedVersion: number;
  allowanceIdempotencyKey: string;
  eventIds: Readonly<{
    itemPublished: string;
    obligationCreated: string;
    contextRequested: string;
    derivativeRequested: string;
  }>;
}>;

export type CloseAwaitingClientPromptCommand = Readonly<{
  reason: "client_declined" | "prompt_withdrawn" | "client_response_expired";
  actorUserId: string;
  cycleId: string;
  expectedCycleVersion: number;
  promptItemId: string;
  expectedPromptRevision: number;
  allowancePeriodId: string | null;
  allowanceExpectedVersion: number | null;
  allowanceIdempotencyKey: string | null;
  cycleClosedEventId: string;
}>;

export type PublishClientFollowUpCommand = Readonly<{
  actorUserId: string;
  cycleId: string;
  expectedCycleVersion: number;
  entryDraftId: string;
  expectedEntryDraftVersion: number;
  entryItemId: string;
  obligationId: string;
  contextId: string;
  derivativeCommandId: string;
  eventIds: Readonly<{
    itemPublished: string;
    obligationCreated: string;
    contextRequested: string;
    derivativeRequested: string;
  }>;
}>;

export type RevokeAstroDiaryCycleCommand = Readonly<{
  cycleId: string;
  expectedCycleVersion: number;
  allowanceExpectedVersion: number | null;
  allowanceIdempotencyKey: string | null;
  cycleClosedEventId: string;
}>;

export type AstroDiaryPromptCommand =
  | Readonly<{ type: "open_prompt"; command: OpenAstrologerPromptCommand }>
  | Readonly<{ type: "accept_prompt"; command: AcceptAstrologerPromptCommand }>
  | Readonly<{ type: "close_prompt"; command: CloseAwaitingClientPromptCommand }>
  | Readonly<{ type: "client_follow_up"; command: PublishClientFollowUpCommand }>;

export function executeAstroDiaryPromptCommand(
  unitOfWork: AstroDiaryCommandUnitOfWork,
  input: Readonly<{
    journalId: string;
    expectedJournalVersion: number;
    idempotencyKey: string;
    request: AstroDiaryPromptCommand;
  }>
): Promise<AstroDiaryCommandExecution> {
  const preconditions: AstroDiaryCommandPrecondition[] = [
    {
      aggregate: "journal",
      id: input.journalId,
      expectedVersion: input.expectedJournalVersion
    },
    ...promptCommandPreconditions(input.request)
  ];
  const actorRole =
    input.request.type === "close_prompt" &&
    input.request.command.reason === "client_response_expired"
      ? "system"
      : input.request.type === "open_prompt" ||
          (input.request.type === "close_prompt" &&
            input.request.command.reason === "prompt_withdrawn")
        ? "astrologer"
        : "client";
  const operation =
    input.request.type === "open_prompt"
      ? "start_cycle"
      : input.request.type === "close_prompt"
        ? "close"
        : "continue_open_cycle";
  return executeAstroDiaryCommand(
    unitOfWork,
    {
      journalId: input.journalId,
      idempotencyKey: input.idempotencyKey,
      preconditions,
      envelope: {
        operation,
        actorUserId: input.request.command.actorUserId,
        actorRole,
        request: semanticPromptRequest(input.request)
      }
    },
    (authority) => decidePromptCommand(authority, input.request)
  );
}

export function decideOpenAstrologerPromptCommand(
  authority: AstroDiaryCommandAuthority,
  input: OpenAstrologerPromptCommand
): AstroDiaryCommandDecision {
  const coherence = validateAstroDiaryCommandAuthority(authority);
  if (coherence) return rejected(coherence);
  const access = authorizeAstroDiaryOperation(authority.access, "start_cycle");
  if (access.outcome === "denied") return rejected(access.code);
  if (input.actorUserId !== authority.journal.astrologerUserId) return rejected("actor_mismatch");
  const draft = findDraft(authority, input.promptDraftId);
  const allowance = authority.allowances.find(({ periodId }) => periodId === input.periodId);
  if (!draft || !allowance) return rejected("authority_not_found");
  if (
    !authority.activePeriod ||
    authority.activePeriod.id !== input.periodId ||
    draft.journalId !== authority.journal.id ||
    draft.authorUserId !== input.actorUserId ||
    !withinPeriod(authority)
  ) {
    return rejected("authority_scope_conflict");
  }
  const published = publishAstroDiaryDraft(draft, {
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedPromptDraftVersion,
    media: authority.media,
    itemId: input.promptItemId,
    cycleId: input.cycleId,
    occurredAt: authority.commandAt,
    cursor: authority.visibleMaxCursor + 1
  });
  if (published.outcome !== "published") return rejected(published.outcome);
  if (published.item.kind !== "reflection_prompt") return rejected("draft_kind_conflict");
  const opened = openAstrologerPromptCycle({
    existingOpenCycleId: authority.cycles.find(({ state }) => state !== "closed")?.id ?? null,
    cycleId: input.cycleId,
    journalId: authority.journal.id,
    openingPeriodId: input.periodId,
    openingPromptItemId: input.promptItemId,
    openedAt: authority.commandAt,
    reservationId: input.reservationId,
    allowance,
    allowanceExpectedVersion: input.allowanceExpectedVersion,
    allowanceIdempotencyKey: input.allowanceIdempotencyKey,
    clientResponseWindowCalendarDays:
      authority.contract.astroDiaryConfig.clientResponseWindowCalendarDays,
    serviceTimezone: authority.contract.astroDiaryConfig.serviceTimezone
  });
  if (opened.outcome !== "opened") return rejected(opened.code);
  const sourceDigest = itemDigest(published.item);
  return applied({
    ...emptyWriteSet(),
    journals: [bumpJournal(authority)],
    cycles: [{ beforeVersion: null, after: opened.cycle }],
    drafts: [{ draftId: draft.id, beforeVersion: draft.version, after: null }],
    allowances: [{ beforeVersion: allowance.version, after: opened.allowance }],
    timelineItems: [{ beforeRevision: null, after: published.item }],
    mediaBindings: published.mediaBindings,
    derivativeCommands: [
      {
        commandId: input.derivativeCommandId,
        itemId: input.promptItemId,
        sourceRevision: 1,
        sourceDigest,
        operation: "generate"
      }
    ],
    events: [
      cycleOpenedEvent(authority, input.eventIds.cycleOpened, input.cycleId, input.periodId),
      itemEvent(authority, input.eventIds.promptPublished, input.cycleId, input.promptItemId),
      derivativeEvent(
        authority,
        input.eventIds.derivativeRequested,
        input.cycleId,
        input.promptItemId
      )
    ]
  });
}

export function decideAcceptAstrologerPromptCommand(
  authority: AstroDiaryCommandAuthority,
  input: AcceptAstrologerPromptCommand
): AstroDiaryCommandDecision {
  const coherence = validateAstroDiaryCommandAuthority(authority);
  if (coherence) return rejected(coherence);
  const access = authorizeAstroDiaryOperation(authority.access, "continue_open_cycle");
  if (access.outcome === "denied") return rejected(access.code);
  if (input.actorUserId !== authority.journal.clientUserId) return rejected("actor_mismatch");
  const cycle = findCycle(authority, input.cycleId);
  const draft = findDraft(authority, input.entryDraftId);
  if (!cycle || !draft || !findAwaitedPrompt(authority, cycle)) {
    return rejected("authority_not_found");
  }
  const allowance = authority.allowances.find(
    ({ periodId }) => periodId === input.allowancePeriodId
  );
  if (
    !allowance ||
    draft.journalId !== authority.journal.id ||
    draft.authorUserId !== input.actorUserId
  ) {
    return rejected("authority_scope_conflict");
  }
  if (input.allowancePeriodId !== cycle.openingPeriodId)
    return rejected("authority_scope_conflict");
  const published = publishAstroDiaryDraft(draft, {
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedEntryDraftVersion,
    media: authority.media,
    itemId: input.entryItemId,
    cycleId: input.cycleId,
    occurredAt: authority.commandAt,
    cursor: authority.visibleMaxCursor + 1
  });
  if (published.outcome !== "published") return rejected(published.outcome);
  if (published.item.kind !== "client_entry") return rejected("draft_kind_conflict");
  const obligation = obligationFor(authority, input.obligationId, input.cycleId, input.entryItemId);
  const accepted = acceptAstrologerPrompt(cycle, {
    expectedCycleVersion: input.expectedCycleVersion,
    promptItemId: cycle.awaitingClientPromptItemId ?? "",
    clientEntryItemId: input.entryItemId,
    occurredAt: authority.commandAt,
    allowance,
    allowanceExpectedVersion: input.allowanceExpectedVersion,
    allowanceIdempotencyKey: input.allowanceIdempotencyKey,
    obligation
  });
  if (accepted.outcome !== "applied" || !accepted.obligation || accepted.allowance === null) {
    return rejected(accepted.outcome === "rejected" ? accepted.code : "obligation_missing");
  }
  return clientEntryWriteSet(authority, {
    cycle,
    draft,
    published: { ...published, item: published.item },
    obligation: accepted.obligation,
    nextCycle: accepted.cycle,
    allowance: { before: allowance, after: accepted.allowance },
    entryItemId: input.entryItemId,
    contextId: input.contextId,
    derivativeCommandId: input.derivativeCommandId,
    eventIds: input.eventIds
  });
}

export function decideCloseAwaitingClientPromptCommand(
  authority: AstroDiaryCommandAuthority,
  input: CloseAwaitingClientPromptCommand
): AstroDiaryCommandDecision {
  const coherence = validateAstroDiaryCommandAuthority(authority);
  if (coherence) return rejected(coherence);
  const access = authorizeAstroDiaryOperation(authority.access, "close");
  if (access.outcome === "denied") return rejected(access.code);
  if (
    (input.reason === "client_declined" && input.actorUserId !== authority.journal.clientUserId) ||
    (input.reason === "prompt_withdrawn" &&
      input.actorUserId !== authority.journal.astrologerUserId)
  ) {
    return rejected("actor_mismatch");
  }
  const cycle = findCycle(authority, input.cycleId);
  const prompt = authority.timelineItems.find(({ id }) => id === input.promptItemId);
  if (!cycle || !prompt || prompt.cycleId !== cycle.id || prompt.kind !== "reflection_prompt") {
    return rejected("authority_not_found");
  }
  const allowance =
    cycle.state === "awaiting_client_entry"
      ? (authority.allowances.find(({ periodId }) => periodId === input.allowancePeriodId) ?? null)
      : null;
  if (
    (cycle.state === "awaiting_client_entry" &&
      input.allowancePeriodId !== cycle.openingPeriodId) ||
    (cycle.state === "awaiting_client_follow_up" && input.allowancePeriodId !== null)
  ) {
    return rejected("authority_scope_conflict");
  }
  const closed = closeAwaitingClientCycle(cycle, {
    command: input.reason,
    expectedCycleVersion: input.expectedCycleVersion,
    promptItemId: input.promptItemId,
    occurredAt: authority.commandAt,
    allowance,
    allowanceExpectedVersion: input.allowanceExpectedVersion,
    allowanceIdempotencyKey: input.allowanceIdempotencyKey
  });
  if (closed.outcome !== "applied") return rejected(closed.code);
  let tombstone: AstroDiaryTimelineItem | null = null;
  if (input.reason === "prompt_withdrawn") {
    const hidden = decideAstroDiaryItemHide(prompt, {
      actorUserId: input.actorUserId,
      expectedRevision: input.expectedPromptRevision,
      cycleState: cycle.state,
      dependentItemIds: [],
      tombstonedAt: authority.commandAt
    });
    if (hidden.outcome !== "hide_allowed") return rejected(hidden.code);
    tombstone = hidden.tombstone;
  }
  return applied({
    ...emptyWriteSet(),
    journals: [bumpJournal(authority)],
    cycles: [{ beforeVersion: cycle.version, after: closed.cycle }],
    allowances:
      allowance && closed.allowance
        ? [{ beforeVersion: allowance.version, after: closed.allowance }]
        : [],
    timelineItems: tombstone ? [{ beforeRevision: prompt.revision, after: tombstone }] : [],
    events: [cycleClosedEvent(authority, input.cycleClosedEventId, cycle.id)]
  });
}

export function decidePublishClientFollowUpCommand(
  authority: AstroDiaryCommandAuthority,
  input: PublishClientFollowUpCommand
): AstroDiaryCommandDecision {
  const coherence = validateAstroDiaryCommandAuthority(authority);
  if (coherence) return rejected(coherence);
  const access = authorizeAstroDiaryOperation(authority.access, "continue_open_cycle");
  if (access.outcome === "denied") return rejected(access.code);
  if (input.actorUserId !== authority.journal.clientUserId) return rejected("actor_mismatch");
  const cycle = findCycle(authority, input.cycleId);
  const draft = findDraft(authority, input.entryDraftId);
  if (
    !cycle ||
    !draft ||
    !findAwaitedPrompt(authority, cycle) ||
    draft.authorUserId !== input.actorUserId
  ) {
    return rejected("authority_not_found");
  }
  const published = publishAstroDiaryDraft(draft, {
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedEntryDraftVersion,
    media: authority.media,
    itemId: input.entryItemId,
    cycleId: input.cycleId,
    occurredAt: authority.commandAt,
    cursor: authority.visibleMaxCursor + 1
  });
  if (published.outcome !== "published") return rejected(published.outcome);
  if (published.item.kind !== "client_entry") return rejected("draft_kind_conflict");
  const obligation = obligationFor(authority, input.obligationId, input.cycleId, input.entryItemId);
  const followed = publishClientFollowUp(cycle, {
    expectedCycleVersion: input.expectedCycleVersion,
    promptItemId: cycle.awaitingClientPromptItemId ?? "",
    clientEntryItemId: input.entryItemId,
    occurredAt: authority.commandAt,
    obligation
  });
  if (followed.outcome !== "applied" || !followed.obligation) {
    return rejected(followed.outcome === "rejected" ? followed.code : "obligation_missing");
  }
  return clientEntryWriteSet(authority, {
    cycle,
    draft,
    published: { ...published, item: published.item },
    obligation: followed.obligation,
    nextCycle: followed.cycle,
    allowance: null,
    entryItemId: input.entryItemId,
    contextId: input.contextId,
    derivativeCommandId: input.derivativeCommandId,
    eventIds: input.eventIds
  });
}

export function decideRevokeAstroDiaryCycleCommand(
  authority: AstroDiaryCommandAuthority,
  input: RevokeAstroDiaryCycleCommand
): AstroDiaryCommandDecision {
  const cycle = findCycle(authority, input.cycleId);
  if (!cycle) return rejected("authority_not_found");
  const liveObligations = authority.obligations.filter(
    (obligation) =>
      obligation.cycleId === cycle.id &&
      (obligation.state === "open" || obligation.state === "overdue")
  );
  const allowance =
    cycle.state === "awaiting_client_entry"
      ? (authority.allowances.find(({ periodId }) => periodId === cycle.openingPeriodId) ?? null)
      : null;
  const revoked = applyAstroDiaryFinanceRevocation(cycle, {
    expectedCycleVersion: input.expectedCycleVersion,
    occurredAt: authority.commandAt,
    obligations: liveObligations,
    allowance,
    allowanceExpectedVersion: input.allowanceExpectedVersion,
    allowanceIdempotencyKey: input.allowanceIdempotencyKey
  });
  if (revoked.outcome !== "applied") return rejected(revoked.code);
  return applied({
    ...emptyWriteSet(),
    journals: [bumpJournal(authority)],
    cycles: [{ beforeVersion: cycle.version, after: revoked.cycle }],
    obligations: revoked.obligations.map((obligation) => ({
      beforeVersion:
        liveObligations.find(({ id }) => id === obligation.id)?.version ?? obligation.version - 1,
      after: obligation
    })),
    allowances:
      allowance && revoked.allowance
        ? [{ beforeVersion: allowance.version, after: revoked.allowance }]
        : [],
    events: [cycleClosedEvent(authority, input.cycleClosedEventId, cycle.id)]
  });
}

function clientEntryWriteSet(
  authority: AstroDiaryCommandAuthority,
  input: Readonly<{
    cycle: AstroDiaryCycle;
    draft: AstroDiaryDraft;
    published: Extract<ReturnType<typeof publishAstroDiaryDraft>, { outcome: "published" }> &
      Readonly<{ item: Extract<AstroDiaryTimelineItem, { kind: "client_entry" }> }>;
    obligation: AstroDiaryResponseObligation;
    nextCycle: AstroDiaryCycle;
    allowance: Readonly<{
      before: AstroDiaryCommandAuthority["allowances"][number];
      after: AstroDiaryCommandAuthority["allowances"][number];
    }> | null;
    entryItemId: string;
    contextId: string;
    derivativeCommandId: string;
    eventIds: Readonly<{
      itemPublished: string;
      obligationCreated: string;
      contextRequested: string;
      derivativeRequested: string;
    }>;
  }>
): AstroDiaryCommandDecision {
  const sourceDigest = itemDigest(input.published.item);
  const context = createAstroDiaryContextRequest({
    contextId: input.contextId,
    journalId: authority.journal.id,
    itemId: input.entryItemId,
    sourceItemRevision: input.published.item.revision,
    sourceItemDigest: sourceDigest,
    eventAt: authority.commandAt,
    eventTimezone: authority.contract.astroDiaryConfig.serviceTimezone
  });
  return applied({
    ...emptyWriteSet(),
    journals: [bumpJournal(authority)],
    cycles: [{ beforeVersion: input.cycle.version, after: input.nextCycle }],
    drafts: [
      { draftId: input.draft.id, beforeVersion: input.draft.version, after: null }
    ],
    obligations: [{ beforeVersion: null, after: input.obligation }],
    allowances: input.allowance
      ? [{ beforeVersion: input.allowance.before.version, after: input.allowance.after }]
      : [],
    timelineItems: [{ beforeRevision: null, after: input.published.item }],
    mediaBindings: input.published.mediaBindings,
    contextSnapshots: [{ beforeVersion: null, after: context }],
    derivativeCommands: [
      {
        commandId: input.derivativeCommandId,
        itemId: input.entryItemId,
        sourceRevision: input.published.item.revision,
        sourceDigest,
        operation: "generate"
      }
    ],
    events: [
      itemEvent(authority, input.eventIds.itemPublished, input.cycle.id, input.entryItemId),
      obligationCreatedEvent(
        authority,
        input.eventIds.obligationCreated,
        input.cycle.id,
        input.obligation.id
      ),
      contextEvent(authority, input.eventIds.contextRequested, input.cycle.id, input.entryItemId),
      derivativeEvent(
        authority,
        input.eventIds.derivativeRequested,
        input.cycle.id,
        input.entryItemId
      )
    ]
  });
}

function obligationFor(
  authority: AstroDiaryCommandAuthority,
  obligationId: string,
  cycleId: string,
  itemId: string
): AstroDiaryResponseObligation {
  const terms = authority.contract.astroDiaryConfig;
  return createAstroDiaryResponseObligation({
    obligationId,
    journalId: authority.journal.id,
    cycleId,
    triggerItemId: itemId,
    openedAt: authority.commandAt,
    responseSlaWorkingDays: terms.responseSlaWorkingDays,
    workingWeekdays: terms.workingWeekdays,
    serviceTimezone: terms.serviceTimezone
  });
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

function bumpJournal(authority: AstroDiaryCommandAuthority) {
  return {
    beforeVersion: authority.journal.version,
    after: { ...authority.journal, version: authority.journal.version + 1 }
  };
}

function findCycle(authority: AstroDiaryCommandAuthority, id: string) {
  return authority.cycles.find((cycle) => cycle.id === id);
}

function findDraft(authority: AstroDiaryCommandAuthority, id: string) {
  return authority.drafts.find((draft) => draft.id === id);
}

function findAwaitedPrompt(
  authority: AstroDiaryCommandAuthority,
  cycle: AstroDiaryCycle
): Extract<AstroDiaryTimelineItem, { kind: "reflection_prompt" }> | null {
  const prompt = authority.timelineItems.find(({ id }) => id === cycle.awaitingClientPromptItemId);
  return prompt?.kind === "reflection_prompt" &&
    prompt.journalId === authority.journal.id &&
    prompt.cycleId === cycle.id
    ? prompt
    : null;
}

function withinPeriod(authority: AstroDiaryCommandAuthority): boolean {
  return Boolean(
    authority.activePeriod &&
    Temporal.Instant.compare(authority.commandAt, authority.activePeriod.startsAt) >= 0 &&
    Temporal.Instant.compare(authority.commandAt, authority.activePeriod.endsAt) < 0
  );
}

function itemDigest(
  item: Exclude<AstroDiaryTimelineItem, { kind: "tombstone" }>
): `sha256:${string}` {
  return sha256CanonicalJson({
    itemId: item.id,
    revision: item.revision,
    body: item.body,
    attachmentIds: item.attachmentIds,
    moodId: item.kind === "client_entry" ? item.moodId : null
  });
}

function applied(writeSet: AstroDiaryCommandWriteSet): AstroDiaryCommandDecision {
  return { outcome: "applied", writeSet };
}

function rejected(code: string): AstroDiaryCommandDecision {
  return { outcome: "rejected", code };
}

function decidePromptCommand(
  authority: AstroDiaryCommandAuthority,
  request: AstroDiaryPromptCommand
): AstroDiaryCommandDecision {
  switch (request.type) {
    case "open_prompt":
      return decideOpenAstrologerPromptCommand(authority, request.command);
    case "accept_prompt":
      return decideAcceptAstrologerPromptCommand(authority, request.command);
    case "close_prompt":
      return decideCloseAwaitingClientPromptCommand(authority, request.command);
    case "client_follow_up":
      return decidePublishClientFollowUpCommand(authority, request.command);
  }
}

function promptCommandPreconditions(
  request: AstroDiaryPromptCommand
): readonly AstroDiaryCommandPrecondition[] {
  switch (request.type) {
    case "open_prompt":
      return [
        {
          aggregate: "draft",
          id: request.command.promptDraftId,
          expectedVersion: request.command.expectedPromptDraftVersion
        },
        {
          aggregate: "allowance",
          id: request.command.periodId,
          expectedVersion: request.command.allowanceExpectedVersion
        }
      ];
    case "accept_prompt":
      return [
        {
          aggregate: "cycle",
          id: request.command.cycleId,
          expectedVersion: request.command.expectedCycleVersion
        },
        {
          aggregate: "draft",
          id: request.command.entryDraftId,
          expectedVersion: request.command.expectedEntryDraftVersion
        },
        {
          aggregate: "allowance",
          id: request.command.allowancePeriodId,
          expectedVersion: request.command.allowanceExpectedVersion
        }
      ];
    case "close_prompt":
      return [
        {
          aggregate: "cycle",
          id: request.command.cycleId,
          expectedVersion: request.command.expectedCycleVersion
        },
        {
          aggregate: "timeline_item",
          id: request.command.promptItemId,
          expectedVersion: request.command.expectedPromptRevision
        },
        ...(request.command.allowanceExpectedVersion === null
          ? []
          : [
              {
                aggregate: "allowance" as const,
                id: request.command.allowancePeriodId!,
                expectedVersion: request.command.allowanceExpectedVersion
              }
            ])
      ];
    case "client_follow_up":
      return [
        {
          aggregate: "cycle",
          id: request.command.cycleId,
          expectedVersion: request.command.expectedCycleVersion
        },
        {
          aggregate: "draft",
          id: request.command.entryDraftId,
          expectedVersion: request.command.expectedEntryDraftVersion
        }
      ];
  }
}

function semanticPromptRequest(request: AstroDiaryPromptCommand): CanonicalJson {
  switch (request.type) {
    case "open_prompt":
      return {
        type: request.type,
        actorUserId: request.command.actorUserId,
        promptDraftId: request.command.promptDraftId,
        expectedPromptDraftVersion: request.command.expectedPromptDraftVersion,
        periodId: request.command.periodId,
        allowanceExpectedVersion: request.command.allowanceExpectedVersion
      };
    case "accept_prompt":
      return {
        type: request.type,
        actorUserId: request.command.actorUserId,
        cycleId: request.command.cycleId,
        expectedCycleVersion: request.command.expectedCycleVersion,
        entryDraftId: request.command.entryDraftId,
        expectedEntryDraftVersion: request.command.expectedEntryDraftVersion,
        allowancePeriodId: request.command.allowancePeriodId,
        allowanceExpectedVersion: request.command.allowanceExpectedVersion
      };
    case "close_prompt":
      return {
        type: request.type,
        reason: request.command.reason,
        actorUserId: request.command.actorUserId,
        cycleId: request.command.cycleId,
        expectedCycleVersion: request.command.expectedCycleVersion,
        promptItemId: request.command.promptItemId,
        expectedPromptRevision: request.command.expectedPromptRevision,
        allowancePeriodId: request.command.allowancePeriodId,
        allowanceExpectedVersion: request.command.allowanceExpectedVersion
      };
    case "client_follow_up":
      return {
        type: request.type,
        actorUserId: request.command.actorUserId,
        cycleId: request.command.cycleId,
        expectedCycleVersion: request.command.expectedCycleVersion,
        entryDraftId: request.command.entryDraftId,
        expectedEntryDraftVersion: request.command.expectedEntryDraftVersion
      };
  }
}

function eventBase(authority: AstroDiaryCommandAuthority, cycleId: string) {
  return {
    journalId: authority.journal.id,
    journalEpochId: authority.journal.journalEpochId,
    cycleId
  };
}

function cycleOpenedEvent(
  authority: AstroDiaryCommandAuthority,
  eventId: string,
  cycleId: string,
  periodId: string
) {
  return astroDiaryEvent({
    eventId,
    eventType: "astro_diary.cycle_opened.v1",
    occurredAt: authority.commandAt,
    data: { ...eventBase(authority, cycleId), periodId }
  });
}

function cycleClosedEvent(authority: AstroDiaryCommandAuthority, eventId: string, cycleId: string) {
  return astroDiaryEvent({
    eventId,
    eventType: "astro_diary.cycle_closed.v1",
    occurredAt: authority.commandAt,
    data: eventBase(authority, cycleId)
  });
}

function itemEvent(
  authority: AstroDiaryCommandAuthority,
  eventId: string,
  cycleId: string,
  itemId: string
) {
  return astroDiaryEvent({
    eventId,
    eventType: "astro_diary.timeline_item_published.v1",
    occurredAt: authority.commandAt,
    data: { ...eventBase(authority, cycleId), itemId }
  });
}

function obligationCreatedEvent(
  authority: AstroDiaryCommandAuthority,
  eventId: string,
  cycleId: string,
  obligationId: string
) {
  return astroDiaryEvent({
    eventId,
    eventType: "astro_diary.response_obligation_created.v1",
    occurredAt: authority.commandAt,
    data: { ...eventBase(authority, cycleId), obligationId }
  });
}

function contextEvent(
  authority: AstroDiaryCommandAuthority,
  eventId: string,
  cycleId: string,
  itemId: string
) {
  return astroDiaryEvent({
    eventId,
    eventType: "astro_diary.context_generation_requested.v1",
    occurredAt: authority.commandAt,
    data: { ...eventBase(authority, cycleId), itemId }
  });
}

function derivativeEvent(
  authority: AstroDiaryCommandAuthority,
  eventId: string,
  cycleId: string,
  itemId: string
) {
  return astroDiaryEvent({
    eventId,
    eventType: "astro_diary.derivative_generation_requested.v1",
    occurredAt: authority.commandAt,
    data: { ...eventBase(authority, cycleId), itemId }
  });
}
