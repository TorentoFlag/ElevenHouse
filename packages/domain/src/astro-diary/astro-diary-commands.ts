import type {
  AstroDiaryCycle,
  AstroDiaryDraft,
  AstroDiaryResponseObligation,
  AstroDiaryTimelineItem
} from "@elevenhouse/contracts";
import { Temporal } from "@js-temporal/polyfill";
import { sha256CanonicalJson, type CanonicalJson } from "../calculations/canonical-json";
import { authorizeAstroDiaryOperation } from "./astro-diary-access-policy";
import { createAstroDiaryContextRequest } from "./astro-diary-context";
import {
  openClientInitiatedCycle,
  publishAstrologerClosingReply,
  publishAstrologerReplyWithFollowUp
} from "./astro-diary-cycles";
import { publishAstroDiaryDraft } from "./astro-diary-drafts";
import { astroDiaryEvent } from "./astro-diary-events";
import { createAstroDiaryResponseObligation } from "./astro-diary-obligations";
import type {
  AstroDiaryCommandAuthority,
  AstroDiaryCommandDecision,
  AstroDiaryCommandWriteSet,
  AstroDiaryCommandExecution,
  AstroDiaryCommandUnitOfWork
} from "./ports/astro-diary-command-unit-of-work";
import { executeAstroDiaryCommand } from "./ports/astro-diary-command-unit-of-work";

export type OpenClientCycleCommand = Readonly<{
  actorUserId: string;
  draftId: string;
  expectedDraftVersion: number;
  cycleId: string;
  entryItemId: string;
  obligationId: string;
  contextId: string;
  derivativeCommandId: string;
  allowancePeriodId: string;
  allowanceExpectedVersion: number;
  allowanceIdempotencyKey: string;
  allowanceConsumptionId: string;
  eventIds: Readonly<{
    cycleOpened: string;
    itemPublished: string;
    obligationCreated: string;
    contextRequested: string;
    derivativeRequested: string;
  }>;
}>;

type CloseAstrologerReplyCommand = Readonly<{
  mode: "close";
  actorUserId: string;
  cycleId: string;
  expectedCycleVersion: number;
  obligationId: string;
  expectedObligationVersion: number;
  replyDraftId: string;
  expectedReplyDraftVersion: number;
  replyItemId: string;
  derivativeCommandId: string;
  eventIds: Readonly<{
    itemPublished: string;
    obligationSatisfied: string;
    cycleClosed: string;
    derivativeRequested: string;
  }>;
}>;

type FollowUpAstrologerReplyCommand = Readonly<{
  mode: "follow_up";
  actorUserId: string;
  cycleId: string;
  expectedCycleVersion: number;
  obligationId: string;
  expectedObligationVersion: number;
  replyDraftId: string;
  expectedReplyDraftVersion: number;
  replyItemId: string;
  replyDerivativeCommandId: string;
  promptDraftId: string;
  expectedPromptDraftVersion: number;
  promptItemId: string;
  promptDerivativeCommandId: string;
  eventIds: Readonly<{
    replyPublished: string;
    promptPublished: string;
    obligationSatisfied: string;
    replyDerivativeRequested: string;
    promptDerivativeRequested: string;
  }>;
}>;

export type PublishAstrologerReplyCommand =
  | CloseAstrologerReplyCommand
  | FollowUpAstrologerReplyCommand;

export function executeOpenClientCycleCommand(
  unitOfWork: AstroDiaryCommandUnitOfWork,
  input: Readonly<{
    journalId: string;
    expectedJournalVersion: number;
    idempotencyKey: string;
    command: OpenClientCycleCommand;
  }>
): Promise<AstroDiaryCommandExecution> {
  const command = freezeOpenClientCycleCommand(input.command);
  return executeAstroDiaryCommand(
    unitOfWork,
    {
      journalId: input.journalId,
      idempotencyKey: input.idempotencyKey,
      preconditions: [
        {
          aggregate: "journal",
          id: input.journalId,
          expectedVersion: input.expectedJournalVersion
        },
        {
          aggregate: "draft",
          id: command.draftId,
          expectedVersion: command.expectedDraftVersion
        },
        {
          aggregate: "allowance",
          id: command.allowancePeriodId,
          expectedVersion: command.allowanceExpectedVersion
        }
      ],
      privateResourceScope: {
        ownerUserId: command.actorUserId,
        ownerRole: "client",
        draftIds: [command.draftId],
        mediaIds: []
      },
      envelope: {
        operation: "start_cycle",
        actorUserId: command.actorUserId,
        actorRole: "client",
        request: openClientCycleRequest(command)
      }
    },
    (authority) => decideOpenClientCycleCommand(authority, command)
  );
}

export function executePublishAstrologerReplyCommand(
  unitOfWork: AstroDiaryCommandUnitOfWork,
  input: Readonly<{
    journalId: string;
    expectedJournalVersion: number;
    idempotencyKey: string;
    command: PublishAstrologerReplyCommand;
  }>
): Promise<AstroDiaryCommandExecution> {
  const command = freezePublishAstrologerReplyCommand(input.command);
  return executeAstroDiaryCommand(
    unitOfWork,
    {
      journalId: input.journalId,
      idempotencyKey: input.idempotencyKey,
      preconditions: [
        {
          aggregate: "journal",
          id: input.journalId,
          expectedVersion: input.expectedJournalVersion
        },
        {
          aggregate: "cycle",
          id: command.cycleId,
          expectedVersion: command.expectedCycleVersion
        },
        {
          aggregate: "obligation",
          id: command.obligationId,
          expectedVersion: command.expectedObligationVersion
        },
        {
          aggregate: "draft",
          id: command.replyDraftId,
          expectedVersion: command.expectedReplyDraftVersion
        },
        ...(command.mode === "follow_up"
          ? [
              {
                aggregate: "draft" as const,
                id: command.promptDraftId,
                expectedVersion: command.expectedPromptDraftVersion
              }
            ]
          : [])
      ],
      privateResourceScope: {
        ownerUserId: command.actorUserId,
        ownerRole: "astrologer",
        draftIds:
          command.mode === "follow_up"
            ? [command.replyDraftId, command.promptDraftId]
            : [command.replyDraftId],
        mediaIds: []
      },
      envelope: {
        operation: "close",
        actorUserId: command.actorUserId,
        actorRole: "astrologer",
        request: publishAstrologerReplyRequest(command)
      }
    },
    (authority) => decidePublishAstrologerReplyCommand(authority, command)
  );
}

export function decideOpenClientCycleCommand(
  authority: AstroDiaryCommandAuthority,
  input: OpenClientCycleCommand
): AstroDiaryCommandDecision {
  const coherence = validateAstroDiaryCommandAuthority(authority);
  if (coherence) return rejected(coherence);
  const access = authorizeAstroDiaryOperation(authority.access, "start_cycle");
  if (access.outcome === "denied") return rejected(access.code);
  if (input.actorUserId !== authority.journal.clientUserId) return rejected("actor_mismatch");
  const draft = owned(authority.drafts, input.draftId);
  const allowance = authority.allowances.find(
    ({ periodId }) => periodId === input.allowancePeriodId
  );
  if (!draft || !allowance) return rejected("authority_not_found");
  if (
    draft.journalId !== authority.journal.id ||
    draft.authorUserId !== input.actorUserId ||
    authority.activePeriod?.id !== input.allowancePeriodId ||
    allowance.periodId !== authority.activePeriod.id ||
    allowance.receipts.some(
      (receipt) =>
        receipt.idempotencyKey === input.allowanceIdempotencyKey &&
        receipt.operation === "consume_available"
    )
  ) {
    return rejected("authority_scope_conflict");
  }
  if (
    Temporal.Instant.compare(authority.commandAt, authority.activePeriod.startsAt) < 0 ||
    Temporal.Instant.compare(authority.commandAt, authority.activePeriod.endsAt) >= 0
  ) {
    return rejected("active_period_conflict");
  }
  const openCycleId = authority.cycles.find(({ state }) => state !== "closed")?.id ?? null;
  const published = publishAstroDiaryDraft(draft, {
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedDraftVersion,
    media: authority.media,
    itemId: input.entryItemId,
    cycleId: input.cycleId,
    occurredAt: authority.commandAt,
    cursor: authority.visibleMaxCursor + 1
  });
  if (published.outcome !== "published") return rejected(published.outcome);
  if (published.item.kind !== "client_entry") return rejected("draft_kind_conflict");

  const terms = authority.contract.astroDiaryConfig;
  const obligation = createAstroDiaryResponseObligation({
    obligationId: input.obligationId,
    journalId: authority.journal.id,
    cycleId: input.cycleId,
    triggerItemId: input.entryItemId,
    openedAt: authority.commandAt,
    responseSlaWorkingDays: terms.responseSlaWorkingDays,
    workingWeekdays: terms.workingWeekdays,
    serviceTimezone: terms.serviceTimezone
  });
  const cycleDecision = openClientInitiatedCycle({
    existingOpenCycleId: openCycleId,
    cycleId: input.cycleId,
    journalId: authority.journal.id,
    openingPeriodId: input.allowancePeriodId,
    openingItemId: input.entryItemId,
    openedAt: authority.commandAt,
    allowance,
    allowanceExpectedVersion: input.allowanceExpectedVersion,
    allowanceIdempotencyKey: input.allowanceIdempotencyKey,
    allowanceConsumptionId: input.allowanceConsumptionId,
    obligation
  });
  if (cycleDecision.outcome !== "opened") return rejected(cycleDecision.code);

  const sourceDigest = sha256CanonicalJson({
    itemId: published.item.id,
    revision: published.item.revision,
    body: published.item.body,
    attachmentIds: published.item.attachmentIds,
    moodId: published.item.moodId
  });
  const context = createAstroDiaryContextRequest({
    contextId: input.contextId,
    journalId: authority.journal.id,
    itemId: input.entryItemId,
    sourceItemRevision: 1,
    sourceItemDigest: sourceDigest,
    eventAt: authority.commandAt,
    eventTimezone: terms.serviceTimezone
  });
  const journal = { ...authority.journal, version: authority.journal.version + 1 };
  return applied({
    ...emptyWriteSet(),
    journals: [{ beforeVersion: authority.journal.version, after: journal }],
    cycles: [{ beforeVersion: null, after: cycleDecision.cycle }],
    drafts: [{ draftId: draft.id, beforeVersion: draft.version, after: null }],
    obligations: [{ beforeVersion: null, after: obligation }],
    allowances: [{ beforeVersion: allowance.version, after: cycleDecision.allowance }],
    timelineItems: [{ beforeRevision: null, after: published.item }],
    mediaBindings: published.mediaBindings,
    contextSnapshots: [{ beforeVersion: null, after: context }],
    derivativeCommands: [
      {
        commandId: input.derivativeCommandId,
        itemId: input.entryItemId,
        sourceRevision: 1,
        sourceDigest,
        operation: "generate"
      }
    ],
    events: [
      cycleEvent(input.eventIds.cycleOpened, "astro_diary.cycle_opened.v1", authority, input, {
        periodId: input.allowancePeriodId
      }),
      itemEvent(
        input.eventIds.itemPublished,
        "astro_diary.timeline_item_published.v1",
        authority,
        input
      ),
      obligationEvent(
        input.eventIds.obligationCreated,
        "astro_diary.response_obligation_created.v1",
        authority,
        input,
        { obligationId: input.obligationId }
      ),
      itemEvent(
        input.eventIds.contextRequested,
        "astro_diary.context_generation_requested.v1",
        authority,
        input
      ),
      itemEvent(
        input.eventIds.derivativeRequested,
        "astro_diary.derivative_generation_requested.v1",
        authority,
        input
      )
    ]
  });
}

export function decidePublishAstrologerReplyCommand(
  authority: AstroDiaryCommandAuthority,
  input: PublishAstrologerReplyCommand
): AstroDiaryCommandDecision {
  const coherence = validateAstroDiaryCommandAuthority(authority);
  if (coherence) return rejected(coherence);
  const access = authorizeAstroDiaryOperation(authority.access, "close");
  if (access.outcome === "denied") return rejected(access.code);
  if (authority.access.entitlementState !== "active") return rejected("paid_access_ended");
  if (input.actorUserId !== authority.journal.astrologerUserId) return rejected("actor_mismatch");
  const cycle = owned(authority.cycles, input.cycleId);
  const obligation = owned(authority.obligations, input.obligationId);
  const draft = owned(authority.drafts, input.replyDraftId);
  if (!cycle || !obligation || !draft) return rejected("authority_not_found");
  if (
    cycle.journalId !== authority.journal.id ||
    obligation.journalId !== authority.journal.id ||
    obligation.cycleId !== cycle.id ||
    draft.journalId !== authority.journal.id ||
    draft.authorUserId !== input.actorUserId
  ) {
    return rejected("authority_scope_conflict");
  }
  const triggerItem = authority.timelineItems.find(({ id }) => id === obligation.triggerItemId);
  if (
    !authority.subscription.paidPeriods.some(({ id }) => id === cycle.openingPeriodId) ||
    !triggerItem ||
    triggerItem.journalId !== authority.journal.id ||
    triggerItem.cycleId !== cycle.id ||
    triggerItem.kind !== "client_entry" ||
    triggerItem.authorRole !== "client" ||
    triggerItem.authorUserId !== authority.journal.clientUserId ||
    Temporal.Instant.compare(obligation.openedAt, triggerItem.occurredAt) !== 0
  ) {
    return rejected("obligation_scope_conflict");
  }
  if (!matchesPaidObligationDeadline(authority, obligation)) {
    return rejected("obligation_deadline_conflict");
  }
  const published = publishAstroDiaryDraft(draft, {
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedReplyDraftVersion,
    media: authority.media,
    itemId: input.replyItemId,
    cycleId: input.cycleId,
    occurredAt: authority.commandAt,
    cursor: authority.visibleMaxCursor + 1
  });
  if (published.outcome !== "published") return rejected(published.outcome);
  if (published.item.kind !== "astrologer_reply") return rejected("draft_kind_conflict");
  if (
    authority.obligations.filter(
      (candidate) =>
        candidate.cycleId === cycle.id &&
        (candidate.state === "open" || candidate.state === "overdue")
    ).length !== 1 ||
    (obligation.state !== "open" && obligation.state !== "overdue")
  ) {
    return rejected("obligation_scope_conflict");
  }
  const sourceDigest = sha256CanonicalJson({
    itemId: published.item.id,
    revision: published.item.revision,
    body: published.item.body,
    attachmentIds: published.item.attachmentIds
  });
  if (input.mode === "follow_up") {
    return decideReplyWithFollowUp(authority, input, cycle, obligation, draft, published.item, {
      sourceDigest,
      mediaBindings: published.mediaBindings
    });
  }
  const cycleDecision = publishAstrologerClosingReply(cycle, {
    expectedCycleVersion: input.expectedCycleVersion,
    replyItemId: input.replyItemId,
    occurredAt: authority.commandAt,
    obligation,
    expectedObligationVersion: input.expectedObligationVersion
  });
  if (cycleDecision.outcome !== "applied" || !cycleDecision.obligation) {
    return rejected(
      cycleDecision.outcome === "rejected" ? cycleDecision.code : "obligation_missing"
    );
  }
  return applied({
    ...emptyWriteSet(),
    journals: [
      {
        beforeVersion: authority.journal.version,
        after: { ...authority.journal, version: authority.journal.version + 1 }
      }
    ],
    cycles: [{ beforeVersion: cycle.version, after: cycleDecision.cycle }],
    drafts: [{ draftId: draft.id, beforeVersion: draft.version, after: null }],
    obligations: [{ beforeVersion: obligation.version, after: cycleDecision.obligation }],
    timelineItems: [{ beforeRevision: null, after: published.item }],
    mediaBindings: published.mediaBindings,
    derivativeCommands: [
      {
        commandId: input.derivativeCommandId,
        itemId: input.replyItemId,
        sourceRevision: 1,
        sourceDigest,
        operation: "generate"
      }
    ],
    events: [
      replyItemEvent(
        input.eventIds.itemPublished,
        "astro_diary.timeline_item_published.v1",
        authority,
        input
      ),
      replyObligationEvent(
        input.eventIds.obligationSatisfied,
        "astro_diary.response_obligation_satisfied.v1",
        authority,
        input
      ),
      replyCycleEvent(input.eventIds.cycleClosed, "astro_diary.cycle_closed.v1", authority, input),
      replyItemEvent(
        input.eventIds.derivativeRequested,
        "astro_diary.derivative_generation_requested.v1",
        authority,
        input
      )
    ]
  });
}

function decideReplyWithFollowUp(
  authority: AstroDiaryCommandAuthority,
  input: FollowUpAstrologerReplyCommand,
  cycle: AstroDiaryCycle,
  obligation: AstroDiaryResponseObligation,
  replyDraft: AstroDiaryDraft,
  replyItem: AstroDiaryTimelineItem,
  reply: Readonly<{
    sourceDigest: `sha256:${string}`;
    mediaBindings: readonly Readonly<{ mediaId: string; itemId: string }>[];
  }>
): AstroDiaryCommandDecision {
  const promptDraft = owned(authority.drafts, input.promptDraftId);
  if (!promptDraft) return rejected("authority_not_found");
  if (
    promptDraft.id === replyDraft.id ||
    promptDraft.journalId !== authority.journal.id ||
    promptDraft.authorUserId !== input.actorUserId
  ) {
    return rejected("authority_scope_conflict");
  }
  const promptPublished = publishAstroDiaryDraft(promptDraft, {
    actorUserId: input.actorUserId,
    expectedVersion: input.expectedPromptDraftVersion,
    media: authority.media,
    itemId: input.promptItemId,
    cycleId: input.cycleId,
    occurredAt: authority.commandAt,
    cursor: authority.visibleMaxCursor + 2
  });
  if (promptPublished.outcome !== "published") return rejected(promptPublished.outcome);
  if (promptPublished.item.kind !== "reflection_prompt") return rejected("draft_kind_conflict");

  const cycleDecision = publishAstrologerReplyWithFollowUp(cycle, {
    expectedCycleVersion: input.expectedCycleVersion,
    replyItemId: input.replyItemId,
    followUpPromptItemId: input.promptItemId,
    occurredAt: authority.commandAt,
    obligation,
    expectedObligationVersion: input.expectedObligationVersion,
    clientResponseWindowCalendarDays:
      authority.contract.astroDiaryConfig.clientResponseWindowCalendarDays,
    serviceTimezone: authority.contract.astroDiaryConfig.serviceTimezone
  });
  if (cycleDecision.outcome !== "applied" || !cycleDecision.obligation) {
    return rejected(
      cycleDecision.outcome === "rejected" ? cycleDecision.code : "obligation_missing"
    );
  }
  const promptDigest = sha256CanonicalJson({
    itemId: promptPublished.item.id,
    revision: promptPublished.item.revision,
    body: promptPublished.item.body,
    attachmentIds: promptPublished.item.attachmentIds
  });
  const base = baseCycleData(authority, input.cycleId);
  const itemEventFor = (eventId: string, itemId: string) =>
    astroDiaryEvent({
      eventId,
      eventType: "astro_diary.timeline_item_published.v1",
      occurredAt: authority.commandAt,
      data: { ...base, itemId }
    });
  const derivativeEventFor = (eventId: string, itemId: string) =>
    astroDiaryEvent({
      eventId,
      eventType: "astro_diary.derivative_generation_requested.v1",
      occurredAt: authority.commandAt,
      data: { ...base, itemId }
    });
  return applied({
    ...emptyWriteSet(),
    journals: [
      {
        beforeVersion: authority.journal.version,
        after: { ...authority.journal, version: authority.journal.version + 1 }
      }
    ],
    cycles: [{ beforeVersion: cycle.version, after: cycleDecision.cycle }],
    drafts: [
      { draftId: replyDraft.id, beforeVersion: replyDraft.version, after: null },
      { draftId: promptDraft.id, beforeVersion: promptDraft.version, after: null }
    ],
    obligations: [{ beforeVersion: obligation.version, after: cycleDecision.obligation }],
    timelineItems: [
      { beforeRevision: null, after: replyItem },
      { beforeRevision: null, after: promptPublished.item }
    ],
    mediaBindings: [...reply.mediaBindings, ...promptPublished.mediaBindings],
    derivativeCommands: [
      {
        commandId: input.replyDerivativeCommandId,
        itemId: input.replyItemId,
        sourceRevision: 1,
        sourceDigest: reply.sourceDigest,
        operation: "generate"
      },
      {
        commandId: input.promptDerivativeCommandId,
        itemId: input.promptItemId,
        sourceRevision: 1,
        sourceDigest: promptDigest,
        operation: "generate"
      }
    ],
    events: [
      itemEventFor(input.eventIds.replyPublished, input.replyItemId),
      itemEventFor(input.eventIds.promptPublished, input.promptItemId),
      astroDiaryEvent({
        eventId: input.eventIds.obligationSatisfied,
        eventType: "astro_diary.response_obligation_satisfied.v1",
        occurredAt: authority.commandAt,
        data: {
          ...base,
          obligationId: input.obligationId,
          responseItemId: input.replyItemId
        }
      }),
      derivativeEventFor(input.eventIds.replyDerivativeRequested, input.replyItemId),
      derivativeEventFor(input.eventIds.promptDerivativeRequested, input.promptItemId)
    ]
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

function applied(writeSet: AstroDiaryCommandWriteSet): AstroDiaryCommandDecision {
  return { outcome: "applied", writeSet };
}

function rejected(code: string): AstroDiaryCommandDecision {
  return { outcome: "rejected", code };
}

function owned<Value extends { readonly id: string }>(
  values: readonly Value[],
  id: string
): Value | undefined {
  return values.find((value) => value.id === id);
}

function matchesPaidObligationDeadline(
  authority: AstroDiaryCommandAuthority,
  obligation: AstroDiaryResponseObligation
): boolean {
  const terms = authority.contract.astroDiaryConfig;
  const expected = createAstroDiaryResponseObligation({
    obligationId: obligation.id,
    journalId: obligation.journalId,
    cycleId: obligation.cycleId,
    triggerItemId: obligation.triggerItemId,
    openedAt: obligation.openedAt,
    responseSlaWorkingDays: terms.responseSlaWorkingDays,
    workingWeekdays: terms.workingWeekdays,
    serviceTimezone: terms.serviceTimezone
  });
  return (
    Temporal.Instant.compare(obligation.dueAt, expected.dueAt) === 0 &&
    obligation.responseSlaWorkingDays === expected.responseSlaWorkingDays &&
    obligation.serviceTimezone === expected.serviceTimezone &&
    obligation.resolvedDueLocal === expected.resolvedDueLocal &&
    obligation.resolvedDueOffset === expected.resolvedDueOffset &&
    obligation.workingWeekdays.length === expected.workingWeekdays.length &&
    obligation.workingWeekdays.every(
      (weekday, index) => weekday === expected.workingWeekdays[index]
    )
  );
}

export function validateAstroDiaryCommandAuthority(
  authority: AstroDiaryCommandAuthority
): string | null {
  const contract = authority.contract;
  if (
    authority.subscription.contract.id !== contract.id ||
    authority.subscription.journalEpochId !== authority.journal.journalEpochId ||
    contract.relationshipId !== authority.journal.relationshipId ||
    contract.astrologerUserId !== authority.journal.astrologerUserId ||
    contract.clientUserId !== authority.journal.clientUserId ||
    (authority.subscription.state === "active") !==
      (authority.access.entitlementState === "active") ||
    (authority.subscription.state === "ended") !==
      (authority.access.entitlementState === "ended") ||
    (authority.subscription.state === "revoked") !==
      (authority.access.entitlementState === "revoked") ||
    authority.cycles.some(({ journalId }) => journalId !== authority.journal.id) ||
    authority.drafts.some(({ journalId }) => journalId !== authority.journal.id) ||
    authority.obligations.some(({ journalId }) => journalId !== authority.journal.id) ||
    authority.timelineItems.some(({ journalId }) => journalId !== authority.journal.id) ||
    authority.media.some(({ journalId }) => journalId !== authority.journal.id)
  ) {
    return "authority_scope_conflict";
  }
  if (
    authority.activePeriod !== null &&
    (!authority.subscription.paidPeriods.some(({ id }) => id === authority.activePeriod?.id) ||
      authority.subscription.endedPeriodIds.includes(authority.activePeriod.id))
  ) {
    return "active_period_conflict";
  }
  return null;
}

function baseCycleData(authority: AstroDiaryCommandAuthority, cycleId: string) {
  return {
    journalId: authority.journal.id,
    journalEpochId: authority.journal.journalEpochId,
    cycleId
  };
}

function cycleEvent(
  eventId: string,
  eventType: "astro_diary.cycle_opened.v1",
  authority: AstroDiaryCommandAuthority,
  input: OpenClientCycleCommand,
  extra: { periodId: string }
) {
  return astroDiaryEvent({
    eventId,
    eventType,
    occurredAt: authority.commandAt,
    data: { ...baseCycleData(authority, input.cycleId), ...extra }
  });
}
function itemEvent(
  eventId: string,
  eventType:
    | "astro_diary.timeline_item_published.v1"
    | "astro_diary.context_generation_requested.v1"
    | "astro_diary.derivative_generation_requested.v1",
  authority: AstroDiaryCommandAuthority,
  input: OpenClientCycleCommand
) {
  return astroDiaryEvent({
    eventId,
    eventType,
    occurredAt: authority.commandAt,
    data: { ...baseCycleData(authority, input.cycleId), itemId: input.entryItemId }
  });
}
function obligationEvent(
  eventId: string,
  eventType: "astro_diary.response_obligation_created.v1",
  authority: AstroDiaryCommandAuthority,
  input: OpenClientCycleCommand,
  extra: { obligationId: string }
) {
  return astroDiaryEvent({
    eventId,
    eventType,
    occurredAt: authority.commandAt,
    data: { ...baseCycleData(authority, input.cycleId), ...extra }
  });
}
function replyItemEvent(
  eventId: string,
  eventType:
    | "astro_diary.timeline_item_published.v1"
    | "astro_diary.derivative_generation_requested.v1",
  authority: AstroDiaryCommandAuthority,
  input: PublishAstrologerReplyCommand
) {
  return astroDiaryEvent({
    eventId,
    eventType,
    occurredAt: authority.commandAt,
    data: { ...baseCycleData(authority, input.cycleId), itemId: input.replyItemId }
  });
}
function replyObligationEvent(
  eventId: string,
  eventType: "astro_diary.response_obligation_satisfied.v1",
  authority: AstroDiaryCommandAuthority,
  input: PublishAstrologerReplyCommand
) {
  return astroDiaryEvent({
    eventId,
    eventType,
    occurredAt: authority.commandAt,
    data: {
      ...baseCycleData(authority, input.cycleId),
      obligationId: input.obligationId,
      responseItemId: input.replyItemId
    }
  });
}
function replyCycleEvent(
  eventId: string,
  eventType: "astro_diary.cycle_closed.v1",
  authority: AstroDiaryCommandAuthority,
  input: PublishAstrologerReplyCommand
) {
  return astroDiaryEvent({
    eventId,
    eventType,
    occurredAt: authority.commandAt,
    data: baseCycleData(authority, input.cycleId)
  });
}

function freezeOpenClientCycleCommand(input: OpenClientCycleCommand): OpenClientCycleCommand {
  return Object.freeze({ ...input, eventIds: Object.freeze({ ...input.eventIds }) });
}

function freezePublishAstrologerReplyCommand(
  input: PublishAstrologerReplyCommand
): PublishAstrologerReplyCommand {
  return input.mode === "close"
    ? Object.freeze({ ...input, eventIds: Object.freeze({ ...input.eventIds }) })
    : Object.freeze({ ...input, eventIds: Object.freeze({ ...input.eventIds }) });
}

function openClientCycleRequest(input: OpenClientCycleCommand): CanonicalJson {
  return {
    draftId: input.draftId
  };
}

function publishAstrologerReplyRequest(input: PublishAstrologerReplyCommand): CanonicalJson {
  const common = {
    mode: input.mode,
    replyDraftId: input.replyDraftId
  };
  return input.mode === "close"
    ? {
        ...common
      }
    : {
        ...common,
        promptDraftId: input.promptDraftId
      };
}
