import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  buildAstroDiaryCommandAppliedResult,
  consumeAvailableAllowance,
  consumeReservedAllowance,
  releaseReservedAllowance,
  reservePeriodAllowance,
  sha256CanonicalJson,
  stableJson,
  type AstroDiaryCommandAllocatedResource,
  type AstroDiaryCommandExecution,
  type AstroDiaryCommandReceipt,
  type AstroDiaryCommandUnitOfWork,
  type AstroDiaryCommandUnitOfWorkInput,
  type AstroDiaryCommandWriteSet
} from "@elevenhouse/domain";
import type { AstroDiaryTimelineItem } from "@elevenhouse/contracts";
import { z } from "@elevenhouse/validation";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  astroDiaryCommandEventReceipts,
  astroDiaryCommandPreconditions,
  astroDiaryCommandReceipts,
  astroDiaryCycleOpeningAllowanceFacts,
  astroDiaryDraftAttachments,
  astroDiaryDraftVersionFacts,
  astroDiaryDrafts,
  astroDiaryContextSnapshots,
  astroDiaryCycles,
  astroDiaryDerivativeCommands,
  astroDiaryEntryAttachments,
  astroDiaryEventDeliveries,
  astroDiaryJournals,
  astroDiaryMediaAuthorities,
  astroDiaryResponseObligations,
  astroDiaryResponseObligationWeekdays,
  astroDiaryTimelineItemRevisions,
  astroDiaryTimelineRevisionAttachments,
  astroDiaryTimelineItems
} from "../../schema/astro-diary";
import { astroDiaryEvents } from "../../schema/astro-diary/commands.schema";
import { outboxEvents } from "../../schema/outbox/outbox-events.schema";
import type { ClientSubscriptionTransaction } from "../client-subscriptions/drizzle-client-subscription-transition-persistence";
import { executeClientSubscriptionAllowanceCommandInTransaction } from "../client-subscriptions/drizzle-client-subscription-allowance-uow";
import {
  preconditionKey,
  readLockedAstroDiaryCommandAuthority
} from "./drizzle-astro-diary-command-authority";

const digestSchema = z.custom<`sha256:${string}`>(
  (value): value is `sha256:${string}` =>
    typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)
);

export function createDrizzleAstroDiaryCommandUnitOfWork(
  database: ElevenHouseDatabase
): AstroDiaryCommandUnitOfWork {
  return {
    execute: (input) =>
      database.transaction((transaction) =>
        executeAstroDiaryCommandInTransaction(transaction, input)
      )
  };
}

async function executeAstroDiaryCommandInTransaction(
  transaction: ClientSubscriptionTransaction,
  input: AstroDiaryCommandUnitOfWorkInput
): Promise<AstroDiaryCommandExecution> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(
      ${`astro-diary-command:${input.journalId}:${input.idempotencyKey}`}, 0
    ))`
  );
  const prior = await readReceipt(transaction, input.journalId, input.idempotencyKey);
  if (prior) {
    return prior.receipt.requestHash === input.requestHash
      ? { outcome: "replayed", result: prior.receipt.result }
      : { outcome: "idempotency_conflict" };
  }

  const clockResult = await transaction.execute<{ command_at: Date | string }>(
    sql`select clock_timestamp() as command_at`
  );
  const clockValue = clockResult.rows[0]?.command_at;
  const commandAt = clockValue instanceof Date ? clockValue : new Date(clockValue ?? "");
  if (!Number.isFinite(commandAt.getTime())) {
    throw new Error("AstroDiary command server timestamp is missing");
  }
  const locked = await readLockedAstroDiaryCommandAuthority(
    transaction,
    input.journalId,
    commandAt
  );
  if (!locked) return { outcome: "not_found" };
  for (const precondition of input.preconditions) {
    const currentVersion = locked.preconditionVersions.get(preconditionKey(precondition));
    if (currentVersion === undefined) return { outcome: "not_found" };
    if (currentVersion !== precondition.expectedVersion) {
      return {
        outcome: "version_conflict",
        aggregate: precondition.aggregate,
        id: precondition.id,
        expectedVersion: precondition.expectedVersion,
        currentVersion
      };
    }
  }

  const allocation =
    input.resourceAllocation === null
      ? null
      : ({ type: "draft", draftId: randomUUID() } satisfies AstroDiaryCommandAllocatedResource);
  const decision =
    input.resourceAllocation === null
      ? input.decide(locked.authority, input.envelope, null)
      : input.decide(locked.authority, input.envelope, requireAllocation(allocation));
  if (decision.outcome === "rejected") {
    const receipt: AstroDiaryCommandReceipt = {
      journalId: input.journalId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      preconditions: input.preconditions,
      result: { outcome: "rejected", code: decision.code }
    };
    await persistReceipt(transaction, receipt, commandAt);
    return { outcome: "rejected", code: decision.code, receipt };
  }

  const persistence = assertSupportedWriteSet(input, decision.writeSet, allocation);
  if (persistence === "draft") {
    await persistDraftWriteSet(transaction, decision.writeSet);
  } else if (persistence === "prompt_opening") {
    await persistPromptOpeningWriteSet(transaction, decision.writeSet, commandAt);
  } else if (persistence === "prompt_acceptance") {
    await persistPromptAcceptanceWriteSet(transaction, decision.writeSet, commandAt);
  } else if (persistence === "prompt_decline") {
    await persistPromptDeclineWriteSet(transaction, decision.writeSet, commandAt);
  } else if (persistence === "prompt_withdrawal") {
    await persistPromptWithdrawalWriteSet(transaction, decision.writeSet, commandAt);
  } else if (persistence === "client_follow_up") {
    await persistClientFollowUpWriteSet(transaction, decision.writeSet, commandAt);
  } else if (persistence === "client_entry_publication") {
    await persistClientEntryPublicationWriteSet(transaction, decision.writeSet, commandAt);
  } else if (persistence === "closing_reply") {
    await persistClosingReplyWriteSet(transaction, decision.writeSet, commandAt);
  } else {
    await persistFollowUpReplyWriteSet(transaction, decision.writeSet, commandAt);
  }
  const response = buildAstroDiaryCommandAppliedResult(
    decision.writeSet,
    allocation,
    input.resultResource ?? null
  );
  const receipt: AstroDiaryCommandReceipt = {
    journalId: input.journalId,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    preconditions: input.preconditions,
    result: response
  };
  await persistReceipt(transaction, receipt, commandAt);
  return { outcome: "applied", response, writeSet: decision.writeSet, receipt };
}

function requireAllocation(
  allocation: AstroDiaryCommandAllocatedResource | null
): AstroDiaryCommandAllocatedResource {
  if (!allocation) throw new Error("AstroDiary draft allocation is missing");
  return allocation;
}

function assertSupportedWriteSet(
  input: AstroDiaryCommandUnitOfWorkInput,
  writeSet: AstroDiaryCommandWriteSet,
  allocation: AstroDiaryCommandAllocatedResource | null
):
  | "draft"
  | "prompt_opening"
  | "prompt_acceptance"
  | "prompt_decline"
  | "prompt_withdrawal"
  | "client_follow_up"
  | "client_entry_publication"
  | "closing_reply"
  | "follow_up_reply" {
  if (isPromptOpeningWriteSet(input, writeSet, allocation)) {
    return "prompt_opening";
  }
  if (isPromptAcceptanceWriteSet(input, writeSet, allocation)) {
    return "prompt_acceptance";
  }
  if (isPromptDeclineWriteSet(input, writeSet, allocation)) {
    return "prompt_decline";
  }
  if (isPromptWithdrawalWriteSet(input, writeSet, allocation)) {
    return "prompt_withdrawal";
  }
  if (isClientFollowUpWriteSet(input, writeSet, allocation)) {
    return "client_follow_up";
  }
  if (isClientEntryPublicationWriteSet(input, writeSet, allocation)) {
    return "client_entry_publication";
  }
  if (isClosingReplyWriteSet(input, writeSet, allocation)) {
    return "closing_reply";
  }
  if (isFollowUpReplyWriteSet(input, writeSet, allocation)) {
    return "follow_up_reply";
  }
  if (input.envelope.operation === "continue_open_cycle" && writeSet.cycles.length > 0) {
    throw new Error(
      `AstroDiary continuation shape is unsupported: ${JSON.stringify({
        cycles: writeSet.cycles.map((effect) => effect.after?.state),
        drafts: writeSet.drafts.map((effect) => effect.after === null),
        obligations: writeSet.obligations.length,
        allowances: writeSet.allowances.length,
        items: writeSet.timelineItems.map((effect) => effect.after.kind),
        contexts: writeSet.contextSnapshots.length,
        derivatives: writeSet.derivativeCommands.length,
        events: writeSet.events.length
      })}`
    );
  }
  const createdDrafts = writeSet.drafts.filter(
    (effect) => effect.beforeVersion === null && effect.after !== null
  );
  if (allocation !== null) {
    if (
      input.resourceAllocation?.type !== "draft" ||
      createdDrafts.length !== 1 ||
      createdDrafts[0]?.after?.id !== allocation.draftId ||
      createdDrafts[0]?.after?.version !== 1 ||
      createdDrafts[0]?.after?.journalId !== input.journalId
    ) {
      throw new Error(
        "AstroDiary command adapter currently accepts one allocated draft creation only"
      );
    }
  } else {
    const requested = input.resultResource;
    const draftEffects = writeSet.drafts;
    const exactEffect =
      requested?.type === "draft" &&
      draftEffects.length === 1 &&
      (draftEffects[0]?.after?.id ??
        (draftEffects[0] && "draftId" in draftEffects[0] ? draftEffects[0].draftId : null)) ===
        requested.draftId;
    if (!exactEffect || createdDrafts.length !== 0) {
      throw new Error("AstroDiary command adapter requires one exact existing draft mutation");
    }
  }
  const journalEffects = writeSet.journals;
  if (
    journalEffects.length !== 1 ||
    journalEffects[0]?.beforeVersion === null ||
    journalEffects[0]?.after === null ||
    journalEffects[0]?.after.id !== input.journalId ||
    journalEffects[0]?.after.version !== journalEffects[0]?.beforeVersion + 1
  ) {
    throw new Error("AstroDiary draft creation must advance the exact journal CAS version");
  }
  const unsupported = [
    writeSet.cycles,
    writeSet.obligations,
    writeSet.allowances,
    writeSet.timelineItems,
    writeSet.mediaBindings,
    writeSet.mediaReleases,
    writeSet.mediaAccessRevocations,
    writeSet.journalMediaAccessRevocations,
    writeSet.itemReadAccessRevocations,
    writeSet.contextSnapshots,
    writeSet.contextInvalidations,
    writeSet.derivativeCommands,
    writeSet.erasureCommands,
    writeSet.subscriptionTransitions,
    writeSet.cascadeCommands,
    writeSet.cascadeTargets,
    writeSet.erasureFacts,
    writeSet.readCursors,
    writeSet.events
  ];
  if (unsupported.some((effects) => effects.length !== 0)) {
    throw new Error("AstroDiary draft-create adapter refuses an unsupported partial write-set");
  }
  return "draft";
}

function isPromptOpeningWriteSet(
  input: AstroDiaryCommandUnitOfWorkInput,
  writeSet: AstroDiaryCommandWriteSet,
  allocation: AstroDiaryCommandAllocatedResource | null
): boolean {
  if (
    allocation !== null ||
    input.resultResource !== null ||
    input.envelope.operation !== "start_cycle"
  ) {
    return false;
  }
  const [journal] = writeSet.journals;
  const [cycle] = writeSet.cycles;
  const [draft] = writeSet.drafts;
  const [allowance] = writeSet.allowances;
  const [item] = writeSet.timelineItems;
  const [derivative] = writeSet.derivativeCommands;
  return Boolean(
    journal?.after &&
    journal.beforeVersion !== null &&
    journal.after.id === input.journalId &&
    journal.after.version === journal.beforeVersion + 1 &&
    cycle?.beforeVersion === null &&
    cycle.after?.journalId === input.journalId &&
    cycle.after.state === "awaiting_client_entry" &&
    cycle.after.openingAllowanceReservationId !== null &&
    draft !== undefined &&
    draft.beforeVersion !== null &&
    draft.after === null &&
    allowance !== undefined &&
    allowance.beforeVersion !== null &&
    allowance.after?.version === allowance.beforeVersion + 1 &&
    item?.beforeRevision === null &&
    item.after.journalId === input.journalId &&
    item.after.kind === "reflection_prompt" &&
    derivative?.operation === "generate" &&
    derivative.itemId === item.after.id &&
    writeSet.journals.length === 1 &&
    writeSet.cycles.length === 1 &&
    writeSet.drafts.length === 1 &&
    writeSet.obligations.length === 0 &&
    writeSet.allowances.length === 1 &&
    writeSet.timelineItems.length === 1 &&
    writeSet.mediaBindings.every((binding) => binding.itemId === item.after.id) &&
    writeSet.contextSnapshots.length === 0 &&
    writeSet.contextInvalidations.length === 0 &&
    writeSet.derivativeCommands.length === 1 &&
    writeSet.events.length === 3 &&
    writeSet.mediaReleases.length === 0 &&
    writeSet.mediaAccessRevocations.length === 0 &&
    writeSet.journalMediaAccessRevocations.length === 0 &&
    writeSet.itemReadAccessRevocations.length === 0 &&
    writeSet.erasureCommands.length === 0 &&
    writeSet.subscriptionTransitions.length === 0 &&
    writeSet.cascadeCommands.length === 0 &&
    writeSet.cascadeTargets.length === 0 &&
    writeSet.erasureFacts.length === 0 &&
    writeSet.readCursors.length === 0
  );
}

function isPromptAcceptanceWriteSet(
  input: AstroDiaryCommandUnitOfWorkInput,
  writeSet: AstroDiaryCommandWriteSet,
  allocation: AstroDiaryCommandAllocatedResource | null
): boolean {
  if (
    allocation !== null ||
    input.resultResource !== null ||
    input.envelope.operation !== "continue_open_cycle"
  ) {
    return false;
  }
  const [journal] = writeSet.journals;
  const [cycle] = writeSet.cycles;
  const [draft] = writeSet.drafts;
  const [obligation] = writeSet.obligations;
  const [allowance] = writeSet.allowances;
  const [item] = writeSet.timelineItems;
  const [context] = writeSet.contextSnapshots;
  const [derivative] = writeSet.derivativeCommands;
  return Boolean(
    journal?.after &&
    journal.beforeVersion !== null &&
    journal.after.id === input.journalId &&
    journal.after.version === journal.beforeVersion + 1 &&
    cycle !== undefined &&
    cycle.beforeVersion !== null &&
    cycle.after?.journalId === input.journalId &&
    cycle.after.state === "awaiting_astrologer_response" &&
    cycle.after.openingAllowanceReservationId === null &&
    draft !== undefined &&
    draft.beforeVersion !== null &&
    draft.after === null &&
    obligation?.beforeVersion === null &&
    obligation.after?.journalId === input.journalId &&
    allowance !== undefined &&
    allowance.beforeVersion !== null &&
    allowance.after?.version === allowance.beforeVersion + 1 &&
    item?.beforeRevision === null &&
    item.after.journalId === input.journalId &&
    item.after.kind === "client_entry" &&
    context?.beforeVersion === null &&
    context.after?.journalId === input.journalId &&
    derivative?.operation === "generate" &&
    derivative.itemId === item.after.id &&
    writeSet.journals.length === 1 &&
    writeSet.cycles.length === 1 &&
    writeSet.drafts.length === 1 &&
    writeSet.obligations.length === 1 &&
    writeSet.allowances.length === 1 &&
    writeSet.timelineItems.length === 1 &&
    writeSet.mediaBindings.every((binding) => binding.itemId === item.after.id) &&
    writeSet.contextSnapshots.length === 1 &&
    writeSet.contextInvalidations.length === 0 &&
    writeSet.derivativeCommands.length === 1 &&
    writeSet.events.length === 4 &&
    writeSet.mediaReleases.length === 0 &&
    writeSet.mediaAccessRevocations.length === 0 &&
    writeSet.journalMediaAccessRevocations.length === 0 &&
    writeSet.itemReadAccessRevocations.length === 0 &&
    writeSet.erasureCommands.length === 0 &&
    writeSet.subscriptionTransitions.length === 0 &&
    writeSet.cascadeCommands.length === 0 &&
    writeSet.cascadeTargets.length === 0 &&
    writeSet.erasureFacts.length === 0 &&
    writeSet.readCursors.length === 0
  );
}

function isPromptDeclineWriteSet(
  input: AstroDiaryCommandUnitOfWorkInput,
  writeSet: AstroDiaryCommandWriteSet,
  allocation: AstroDiaryCommandAllocatedResource | null
): boolean {
  if (
    allocation !== null ||
    input.resultResource !== null ||
    input.envelope.operation !== "close"
  ) {
    return false;
  }
  const [journal] = writeSet.journals;
  const [cycle] = writeSet.cycles;
  const [allowance] = writeSet.allowances;
  return Boolean(
    journal?.after &&
    journal.beforeVersion !== null &&
    journal.after.id === input.journalId &&
    journal.after.version === journal.beforeVersion + 1 &&
    cycle !== undefined &&
    cycle.beforeVersion !== null &&
    cycle.after?.journalId === input.journalId &&
    cycle.after.state === "closed" &&
    cycle.after.closeReason === "client_declined" &&
    cycle.after.openingAllowanceReservationId === null &&
    allowance !== undefined &&
    allowance.beforeVersion !== null &&
    allowance.after?.version === allowance.beforeVersion + 1 &&
    writeSet.journals.length === 1 &&
    writeSet.cycles.length === 1 &&
    writeSet.drafts.length === 0 &&
    writeSet.obligations.length === 0 &&
    writeSet.allowances.length === 1 &&
    writeSet.timelineItems.length === 0 &&
    writeSet.mediaBindings.length === 0 &&
    writeSet.contextSnapshots.length === 0 &&
    writeSet.derivativeCommands.length === 0 &&
    writeSet.events.length === 1 &&
    writeSet.mediaReleases.length === 0 &&
    writeSet.mediaAccessRevocations.length === 0 &&
    writeSet.journalMediaAccessRevocations.length === 0 &&
    writeSet.itemReadAccessRevocations.length === 0 &&
    writeSet.contextInvalidations.length === 0 &&
    writeSet.erasureCommands.length === 0 &&
    writeSet.subscriptionTransitions.length === 0 &&
    writeSet.cascadeCommands.length === 0 &&
    writeSet.cascadeTargets.length === 0 &&
    writeSet.erasureFacts.length === 0 &&
    writeSet.readCursors.length === 0
  );
}

function isPromptWithdrawalWriteSet(
  input: AstroDiaryCommandUnitOfWorkInput,
  writeSet: AstroDiaryCommandWriteSet,
  allocation: AstroDiaryCommandAllocatedResource | null
): boolean {
  if (
    allocation !== null ||
    input.resultResource !== null ||
    input.envelope.operation !== "close"
  ) {
    return false;
  }
  const [journal] = writeSet.journals;
  const [cycle] = writeSet.cycles;
  const [allowance] = writeSet.allowances;
  const [item] = writeSet.timelineItems;
  return Boolean(
    journal?.after &&
    journal.beforeVersion !== null &&
    journal.after.id === input.journalId &&
    journal.after.version === journal.beforeVersion + 1 &&
    cycle !== undefined &&
    cycle.beforeVersion !== null &&
    cycle.after?.journalId === input.journalId &&
    cycle.after.state === "closed" &&
    cycle.after.closeReason === "prompt_withdrawn" &&
    cycle.after.openingAllowanceReservationId === null &&
    allowance !== undefined &&
    allowance.beforeVersion !== null &&
    allowance.after?.version === allowance.beforeVersion + 1 &&
    item !== undefined &&
    item.beforeRevision !== null &&
    item.after.journalId === input.journalId &&
    item.after.kind === "tombstone" &&
    item.after.revision === item.beforeRevision + 1 &&
    item.after.originalKind === "reflection_prompt" &&
    item.after.reason === "hidden_by_author" &&
    writeSet.journals.length === 1 &&
    writeSet.cycles.length === 1 &&
    writeSet.drafts.length === 0 &&
    writeSet.obligations.length === 0 &&
    writeSet.allowances.length === 1 &&
    writeSet.timelineItems.length === 1 &&
    writeSet.mediaBindings.length === 0 &&
    writeSet.mediaReleases.length === 0 &&
    writeSet.mediaAccessRevocations.length === 0 &&
    writeSet.journalMediaAccessRevocations.length === 0 &&
    writeSet.itemReadAccessRevocations.length === 0 &&
    writeSet.contextSnapshots.length === 0 &&
    writeSet.contextInvalidations.length === 0 &&
    writeSet.derivativeCommands.length === 0 &&
    writeSet.erasureCommands.length === 0 &&
    writeSet.subscriptionTransitions.length === 0 &&
    writeSet.cascadeCommands.length === 0 &&
    writeSet.cascadeTargets.length === 0 &&
    writeSet.erasureFacts.length === 0 &&
    writeSet.readCursors.length === 0 &&
    writeSet.events.length === 1
  );
}

function isClientFollowUpWriteSet(
  input: AstroDiaryCommandUnitOfWorkInput,
  writeSet: AstroDiaryCommandWriteSet,
  allocation: AstroDiaryCommandAllocatedResource | null
): boolean {
  if (
    allocation !== null ||
    input.resultResource !== null ||
    input.envelope.operation !== "continue_open_cycle"
  ) {
    return false;
  }
  const [journal] = writeSet.journals;
  const [cycle] = writeSet.cycles;
  const [draft] = writeSet.drafts;
  const [obligation] = writeSet.obligations;
  const [item] = writeSet.timelineItems;
  const [context] = writeSet.contextSnapshots;
  const [derivative] = writeSet.derivativeCommands;
  return Boolean(
    journal?.after &&
    journal.beforeVersion !== null &&
    journal.after.id === input.journalId &&
    journal.after.version === journal.beforeVersion + 1 &&
    cycle !== undefined &&
    cycle.beforeVersion !== null &&
    cycle.after?.journalId === input.journalId &&
    cycle.after.state === "awaiting_astrologer_closing_response" &&
    draft !== undefined &&
    draft.beforeVersion !== null &&
    draft.after === null &&
    obligation?.beforeVersion === null &&
    obligation.after?.journalId === input.journalId &&
    item?.beforeRevision === null &&
    item.after.journalId === input.journalId &&
    item.after.kind === "client_entry" &&
    context?.beforeVersion === null &&
    context.after?.journalId === input.journalId &&
    derivative?.operation === "generate" &&
    derivative.itemId === item.after.id &&
    writeSet.journals.length === 1 &&
    writeSet.cycles.length === 1 &&
    writeSet.drafts.length === 1 &&
    writeSet.obligations.length === 1 &&
    writeSet.allowances.length === 0 &&
    writeSet.timelineItems.length === 1 &&
    writeSet.mediaBindings.every((binding) => binding.itemId === item.after.id) &&
    writeSet.contextSnapshots.length === 1 &&
    writeSet.contextInvalidations.length === 0 &&
    writeSet.derivativeCommands.length === 1 &&
    writeSet.events.length === 4 &&
    writeSet.mediaReleases.length === 0 &&
    writeSet.mediaAccessRevocations.length === 0 &&
    writeSet.journalMediaAccessRevocations.length === 0 &&
    writeSet.itemReadAccessRevocations.length === 0 &&
    writeSet.erasureCommands.length === 0 &&
    writeSet.subscriptionTransitions.length === 0 &&
    writeSet.cascadeCommands.length === 0 &&
    writeSet.cascadeTargets.length === 0 &&
    writeSet.erasureFacts.length === 0 &&
    writeSet.readCursors.length === 0
  );
}

function isClientEntryPublicationWriteSet(
  input: AstroDiaryCommandUnitOfWorkInput,
  writeSet: AstroDiaryCommandWriteSet,
  allocation: AstroDiaryCommandAllocatedResource | null
): boolean {
  if (
    allocation !== null ||
    input.resultResource !== null ||
    input.envelope.operation !== "start_cycle"
  ) {
    return false;
  }
  const [journal] = writeSet.journals;
  const [cycle] = writeSet.cycles;
  const [draft] = writeSet.drafts;
  const [obligation] = writeSet.obligations;
  const [allowance] = writeSet.allowances;
  const [item] = writeSet.timelineItems;
  const [context] = writeSet.contextSnapshots;
  const [derivative] = writeSet.derivativeCommands;
  return Boolean(
    journal?.after &&
    journal.beforeVersion !== null &&
    journal.after.id === input.journalId &&
    journal.after.version === journal.beforeVersion + 1 &&
    cycle?.beforeVersion === null &&
    cycle.after?.journalId === input.journalId &&
    draft?.after === null &&
    draft.beforeVersion !== null &&
    obligation?.beforeVersion === null &&
    obligation.after?.journalId === input.journalId &&
    allowance !== undefined &&
    allowance.beforeVersion !== null &&
    allowance.after?.version === allowance.beforeVersion + 1 &&
    item?.beforeRevision === null &&
    item.after.journalId === input.journalId &&
    context?.beforeVersion === null &&
    context.after?.journalId === input.journalId &&
    derivative?.operation === "generate" &&
    derivative.itemId === item.after.id &&
    writeSet.cycles.length === 1 &&
    writeSet.drafts.length === 1 &&
    writeSet.obligations.length === 1 &&
    writeSet.allowances.length === 1 &&
    writeSet.timelineItems.length === 1 &&
    writeSet.mediaBindings.every((binding) => binding.itemId === item.after.id) &&
    writeSet.contextSnapshots.length === 1 &&
    writeSet.derivativeCommands.length === 1 &&
    writeSet.events.length === 5 &&
    writeSet.mediaReleases.length === 0 &&
    writeSet.mediaAccessRevocations.length === 0 &&
    writeSet.journalMediaAccessRevocations.length === 0 &&
    writeSet.itemReadAccessRevocations.length === 0 &&
    writeSet.contextInvalidations.length === 0 &&
    writeSet.erasureCommands.length === 0 &&
    writeSet.subscriptionTransitions.length === 0 &&
    writeSet.cascadeCommands.length === 0 &&
    writeSet.cascadeTargets.length === 0 &&
    writeSet.erasureFacts.length === 0 &&
    writeSet.readCursors.length === 0
  );
}

function isClosingReplyWriteSet(
  input: AstroDiaryCommandUnitOfWorkInput,
  writeSet: AstroDiaryCommandWriteSet,
  allocation: AstroDiaryCommandAllocatedResource | null
): boolean {
  if (
    allocation !== null ||
    input.resultResource !== null ||
    input.envelope.operation !== "close"
  ) {
    return false;
  }
  const [journal] = writeSet.journals;
  const [cycle] = writeSet.cycles;
  const [draft] = writeSet.drafts;
  const [obligation] = writeSet.obligations;
  const [item] = writeSet.timelineItems;
  const [derivative] = writeSet.derivativeCommands;
  if (
    !journal?.after ||
    journal.beforeVersion === null ||
    !cycle?.after ||
    cycle.beforeVersion === null ||
    !draft ||
    draft.beforeVersion === null ||
    draft.after !== null ||
    !obligation?.after ||
    obligation.beforeVersion === null ||
    !item?.after ||
    item.beforeRevision !== null ||
    !derivative
  ) {
    return false;
  }
  return Boolean(
    journal.after.id === input.journalId &&
    journal.after.version === journal.beforeVersion + 1 &&
    cycle.after.journalId === input.journalId &&
    cycle.after.state === "closed" &&
    obligation.after.state === "satisfied" &&
    item.after.journalId === input.journalId &&
    item.after.kind === "astrologer_reply" &&
    obligation.after.satisfiedByItemId === item.after.id &&
    derivative.operation === "generate" &&
    derivative.itemId === item.after.id &&
    writeSet.journals.length === 1 &&
    writeSet.cycles.length === 1 &&
    writeSet.drafts.length === 1 &&
    writeSet.obligations.length === 1 &&
    writeSet.allowances.length === 0 &&
    writeSet.timelineItems.length === 1 &&
    writeSet.mediaBindings.every((binding) => binding.itemId === item.after.id) &&
    writeSet.contextSnapshots.length === 0 &&
    writeSet.contextInvalidations.length === 0 &&
    writeSet.derivativeCommands.length === 1 &&
    writeSet.events.length === 4 &&
    writeSet.mediaReleases.length === 0 &&
    writeSet.mediaAccessRevocations.length === 0 &&
    writeSet.journalMediaAccessRevocations.length === 0 &&
    writeSet.itemReadAccessRevocations.length === 0 &&
    writeSet.erasureCommands.length === 0 &&
    writeSet.subscriptionTransitions.length === 0 &&
    writeSet.cascadeCommands.length === 0 &&
    writeSet.cascadeTargets.length === 0 &&
    writeSet.erasureFacts.length === 0 &&
    writeSet.readCursors.length === 0
  );
}

function isFollowUpReplyWriteSet(
  input: AstroDiaryCommandUnitOfWorkInput,
  writeSet: AstroDiaryCommandWriteSet,
  allocation: AstroDiaryCommandAllocatedResource | null
): boolean {
  if (
    allocation !== null ||
    input.resultResource !== null ||
    input.envelope.operation !== "close"
  ) {
    return false;
  }
  const [journal] = writeSet.journals;
  const [cycle] = writeSet.cycles;
  const [obligation] = writeSet.obligations;
  if (
    !journal?.after ||
    journal.beforeVersion === null ||
    !cycle?.after ||
    cycle.beforeVersion === null ||
    !obligation?.after ||
    obligation.beforeVersion === null ||
    writeSet.drafts.length !== 2 ||
    writeSet.drafts.some((effect) => effect.beforeVersion === null || effect.after !== null) ||
    writeSet.timelineItems.length !== 2 ||
    writeSet.timelineItems.some((effect) => effect.beforeRevision !== null) ||
    writeSet.derivativeCommands.length !== 2
  ) {
    return false;
  }
  const items = writeSet.timelineItems.map((effect) => effect.after);
  const reply = items.find((item) => item.kind === "astrologer_reply");
  const prompt = items.find((item) => item.kind === "reflection_prompt");
  const itemIds = new Set(items.map((item) => item.id));
  return Boolean(
    reply &&
    prompt &&
    journal.after.id === input.journalId &&
    journal.after.version === journal.beforeVersion + 1 &&
    cycle.after.journalId === input.journalId &&
    cycle.after.state === "awaiting_client_follow_up" &&
    cycle.after.awaitingClientPromptItemId === prompt.id &&
    cycle.after.clientResponseDueAt !== null &&
    obligation.after.state === "satisfied" &&
    obligation.after.satisfiedByItemId === reply.id &&
    writeSet.allowances.length === 0 &&
    writeSet.mediaBindings.every((binding) => itemIds.has(binding.itemId)) &&
    writeSet.contextSnapshots.length === 0 &&
    writeSet.contextInvalidations.length === 0 &&
    writeSet.derivativeCommands.every(
      (command) => command.operation === "generate" && itemIds.has(command.itemId)
    ) &&
    writeSet.events.length === 5 &&
    writeSet.mediaReleases.length === 0 &&
    writeSet.mediaAccessRevocations.length === 0 &&
    writeSet.journalMediaAccessRevocations.length === 0 &&
    writeSet.itemReadAccessRevocations.length === 0 &&
    writeSet.erasureCommands.length === 0 &&
    writeSet.subscriptionTransitions.length === 0 &&
    writeSet.cascadeCommands.length === 0 &&
    writeSet.cascadeTargets.length === 0 &&
    writeSet.erasureFacts.length === 0 &&
    writeSet.readCursors.length === 0
  );
}

async function persistDraftWriteSet(
  transaction: ClientSubscriptionTransaction,
  writeSet: AstroDiaryCommandWriteSet
): Promise<void> {
  const journalEffect = writeSet.journals[0];
  const draftEffect = writeSet.drafts[0];
  if (!journalEffect?.after || !draftEffect) throw new Error("Draft write-set is incomplete");
  const journal = journalEffect.after;
  const [updatedJournal] = await transaction
    .update(astroDiaryJournals)
    .set({ state: journal.state, version: journal.version })
    .where(
      and(
        eq(astroDiaryJournals.id, journal.id),
        eq(astroDiaryJournals.version, journalEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryJournals.id });
  if (!updatedJournal) throw new Error("AstroDiary journal CAS changed inside locked transaction");
  if (draftEffect.after === null) {
    await transaction
      .delete(astroDiaryDraftAttachments)
      .where(eq(astroDiaryDraftAttachments.draftId, draftEffect.draftId));
    const deleted = await transaction
      .delete(astroDiaryDrafts)
      .where(
        and(
          eq(astroDiaryDrafts.id, draftEffect.draftId),
          eq(astroDiaryDrafts.version, draftEffect.beforeVersion)
        )
      )
      .returning({ id: astroDiaryDrafts.id });
    if (deleted.length !== 1) throw new Error("AstroDiary draft delete CAS changed under lock");
    return;
  }
  const draft = draftEffect.after;
  if (draftEffect.beforeVersion === null) {
    await transaction.insert(astroDiaryDrafts).values(mapDraftHead(draft));
  } else {
    const updated = await transaction
      .update(astroDiaryDrafts)
      .set(mapDraftHead(draft))
      .where(
        and(
          eq(astroDiaryDrafts.id, draft.id),
          eq(astroDiaryDrafts.version, draftEffect.beforeVersion)
        )
      )
      .returning({ id: astroDiaryDrafts.id });
    if (updated.length !== 1) throw new Error("AstroDiary draft update CAS changed under lock");
    await transaction
      .delete(astroDiaryDraftAttachments)
      .where(eq(astroDiaryDraftAttachments.draftId, draft.id));
  }
  await transaction.insert(astroDiaryDraftVersionFacts).values({
    draftId: draft.id,
    journalId: draft.journalId,
    version: draft.version,
    recordedAt: new Date(draft.updatedAt)
  });
  if (draft.attachmentIds.length > 0) {
    const authorityRows = await transaction.query.astroDiaryMediaAuthorities.findMany({
      where: (table, operators) => operators.inArray(table.mediaId, [...draft.attachmentIds])
    });
    const authorityById = new Map(authorityRows.map((row) => [row.mediaId, row]));
    await transaction.insert(astroDiaryDraftAttachments).values(
      draft.attachmentIds.map((mediaId, ordinal) => {
        const authority = authorityById.get(mediaId);
        if (!authority || authority.journalId !== draft.journalId) {
          throw new Error("AstroDiary draft attachment authority is missing");
        }
        return {
          draftId: draft.id,
          journalId: draft.journalId,
          ordinal,
          mediaId,
          ownerUserId: authority.ownerUserId,
          purpose: authority.purpose
        };
      })
    );
  }
}

/**
 * The first paid client publication is deliberately persisted as one complete write-set.  Do not
 * split the allowance command into another UOW: its immutable effect is the authority for the
 * cycle's opening period and must commit with the visible entry.
 */
async function persistClientEntryPublicationWriteSet(
  transaction: ClientSubscriptionTransaction,
  writeSet: AstroDiaryCommandWriteSet,
  commandAt: Date
): Promise<void> {
  const [journalEffect] = writeSet.journals;
  const [cycleEffect] = writeSet.cycles;
  const [draftEffect] = writeSet.drafts;
  const [obligationEffect] = writeSet.obligations;
  const [allowanceEffect] = writeSet.allowances;
  const [itemEffect] = writeSet.timelineItems;
  const [contextEffect] = writeSet.contextSnapshots;
  const [derivative] = writeSet.derivativeCommands;
  if (
    !journalEffect?.after ||
    !cycleEffect?.after ||
    !draftEffect ||
    draftEffect.after !== null ||
    !obligationEffect?.after ||
    !allowanceEffect?.after ||
    !itemEffect?.after ||
    !contextEffect?.after ||
    !derivative
  ) {
    throw new Error("AstroDiary client entry publication write-set is incomplete");
  }
  if (itemEffect.after.kind !== "client_entry") {
    throw new Error("AstroDiary client entry publication requires a client entry timeline item");
  }
  const [updatedJournal] = await transaction
    .update(astroDiaryJournals)
    .set({ state: journalEffect.after.state, version: journalEffect.after.version })
    .where(
      and(
        eq(astroDiaryJournals.id, journalEffect.after.id),
        eq(astroDiaryJournals.version, journalEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryJournals.id });
  if (!updatedJournal) throw new Error("AstroDiary journal CAS changed inside locked transaction");

  const cycle = cycleEffect.after;
  await transaction.insert(astroDiaryCycles).values({
    id: cycle.id,
    journalId: cycle.journalId,
    openingPeriodId: cycle.openingPeriodId,
    openingAllowanceReservationId: cycle.openingAllowanceReservationId,
    awaitingClientPromptItemId: cycle.awaitingClientPromptItemId,
    clientResponseDueAt: nullableDate(cycle.clientResponseDueAt),
    clientResponseWindowCalendarDays: cycle.clientResponseWindowCalendarDays,
    clientResponseTimezone: cycle.clientResponseTimezone,
    state: cycle.state,
    version: cycle.version,
    openedAt: new Date(cycle.openedAt),
    closedAt: nullableDate(cycle.closedAt),
    closeReason: cycle.closeReason
  });

  const item = itemEffect.after;
  const sourceDigest = derivative.sourceDigest;
  await transaction.insert(astroDiaryTimelineItems).values(mapTimelineItem(item));
  await transaction.insert(astroDiaryTimelineItemRevisions).values({
    ...mapTimelineItem(item),
    itemId: item.id,
    revision: item.revision,
    sourceDigest,
    recordedAt: commandAt
  });
  await persistPublishedMediaBindings(transaction, writeSet.mediaBindings, item, commandAt);

  const obligation = obligationEffect.after;
  await transaction.insert(astroDiaryResponseObligations).values({
    id: obligation.id,
    journalId: obligation.journalId,
    cycleId: obligation.cycleId,
    triggerItemId: obligation.triggerItemId,
    state: obligation.state,
    version: obligation.version,
    openedAt: new Date(obligation.openedAt),
    dueAt: new Date(obligation.dueAt),
    responseSlaWorkingDays: obligation.responseSlaWorkingDays,
    serviceTimezone: obligation.serviceTimezone,
    resolvedDueLocal: obligation.resolvedDueLocal,
    resolvedDueOffset: obligation.resolvedDueOffset,
    satisfiedByItemId: obligation.satisfiedByItemId,
    closedAt: nullableDate(obligation.closedAt)
  });
  await transaction
    .insert(astroDiaryResponseObligationWeekdays)
    .values(
      obligation.workingWeekdays.map((isoWeekday) => ({ obligationId: obligation.id, isoWeekday }))
    );

  const context = contextEffect.after;
  if (context.sourceItemDigest !== sourceDigest) {
    throw new Error("AstroDiary context and derivative source digest differ");
  }
  await transaction.insert(astroDiaryContextSnapshots).values({
    id: context.id,
    journalId: context.journalId,
    itemId: context.itemId,
    sourceItemRevision: context.sourceItemRevision,
    sourceItemDigest: context.sourceItemDigest,
    eventAt: new Date(context.eventAt),
    eventTimezone: context.eventTimezone,
    version: context.version,
    status: context.status,
    engineRevision: context.engineRevision,
    globalContextRef: context.globalContextRef,
    birthProfileId: context.birthProfileId,
    birthProfileRevision: context.birthProfileRevision,
    personalChartRef: context.personalChartRef,
    contextDigest: context.contextDigest,
    calculatedAt: nullableDate(context.calculatedAt),
    failureCode: context.failureCode
  });
  await transaction.insert(astroDiaryDerivativeCommands).values({
    id: derivative.commandId,
    journalId: item.journalId,
    itemId: derivative.itemId,
    sourceRevision: derivative.sourceRevision,
    sourceDigest: derivative.sourceDigest,
    operation: derivative.operation,
    state: "pending",
    requestedAt: commandAt
  });

  const consumptionId = await persistConsumedOpeningAllowance(transaction, allowanceEffect);
  await transaction.insert(astroDiaryCycleOpeningAllowanceFacts).values({
    cycleId: cycle.id,
    journalId: cycle.journalId,
    openingPeriodId: cycle.openingPeriodId,
    openingAllowanceReservationId: null,
    openingAllowanceConsumptionId: consumptionId,
    recordedAt: new Date(cycle.openedAt)
  });

  await transaction
    .delete(astroDiaryDraftAttachments)
    .where(eq(astroDiaryDraftAttachments.draftId, draftEffect.draftId));
  const deletedDraft = await transaction
    .delete(astroDiaryDrafts)
    .where(
      and(
        eq(astroDiaryDrafts.id, draftEffect.draftId),
        eq(astroDiaryDrafts.version, draftEffect.beforeVersion)
      )
    )
    .returning({ id: astroDiaryDrafts.id });
  if (deletedDraft.length !== 1)
    throw new Error("AstroDiary published draft CAS changed under lock");

  await persistEventsAndDeliveries(transaction, writeSet.events, commandAt);
}

/**
 * A prompt reserves exactly one paid allowance unit. The reservation receipt and immutable
 * opening fact are persisted in this transaction with its visible prompt; otherwise a retry or
 * a crash could leave paid capacity reserved without a client-visible cycle.
 */
async function persistPromptOpeningWriteSet(
  transaction: ClientSubscriptionTransaction,
  writeSet: AstroDiaryCommandWriteSet,
  commandAt: Date
): Promise<void> {
  const [journalEffect] = writeSet.journals;
  const [cycleEffect] = writeSet.cycles;
  const [draftEffect] = writeSet.drafts;
  const [allowanceEffect] = writeSet.allowances;
  const [itemEffect] = writeSet.timelineItems;
  const [derivative] = writeSet.derivativeCommands;
  if (
    !journalEffect?.after ||
    !cycleEffect?.after ||
    !draftEffect ||
    draftEffect.after !== null ||
    !allowanceEffect?.after ||
    !itemEffect?.after ||
    !derivative
  ) {
    throw new Error("AstroDiary prompt opening write-set is incomplete");
  }
  if (itemEffect.after.kind !== "reflection_prompt") {
    throw new Error("AstroDiary prompt opening requires a reflection prompt timeline item");
  }
  const [updatedJournal] = await transaction
    .update(astroDiaryJournals)
    .set({ state: journalEffect.after.state, version: journalEffect.after.version })
    .where(
      and(
        eq(astroDiaryJournals.id, journalEffect.after.id),
        eq(astroDiaryJournals.version, journalEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryJournals.id });
  if (!updatedJournal) throw new Error("AstroDiary journal CAS changed inside locked transaction");

  const reservationId = await persistReservedOpeningAllowance(transaction, allowanceEffect);
  const cycle = cycleEffect.after;
  if (cycle.openingAllowanceReservationId !== reservationId) {
    throw new Error("AstroDiary cycle prompt reservation does not match its allowance receipt");
  }
  await transaction.insert(astroDiaryCycles).values({
    id: cycle.id,
    journalId: cycle.journalId,
    openingPeriodId: cycle.openingPeriodId,
    openingAllowanceReservationId: reservationId,
    awaitingClientPromptItemId: cycle.awaitingClientPromptItemId,
    clientResponseDueAt: nullableDate(cycle.clientResponseDueAt),
    clientResponseWindowCalendarDays: cycle.clientResponseWindowCalendarDays,
    clientResponseTimezone: cycle.clientResponseTimezone,
    state: cycle.state,
    version: cycle.version,
    openedAt: new Date(cycle.openedAt),
    closedAt: nullableDate(cycle.closedAt),
    closeReason: cycle.closeReason
  });
  await transaction.insert(astroDiaryCycleOpeningAllowanceFacts).values({
    cycleId: cycle.id,
    journalId: cycle.journalId,
    openingPeriodId: cycle.openingPeriodId,
    openingAllowanceReservationId: reservationId,
    openingAllowanceConsumptionId: null,
    recordedAt: new Date(cycle.openedAt)
  });

  const item = itemEffect.after;
  await transaction.insert(astroDiaryTimelineItems).values(mapTimelineItem(item));
  await transaction.insert(astroDiaryTimelineItemRevisions).values({
    ...mapTimelineItem(item),
    itemId: item.id,
    revision: item.revision,
    sourceDigest: derivative.sourceDigest,
    recordedAt: commandAt
  });
  await persistPublishedMediaBindings(transaction, writeSet.mediaBindings, item, commandAt);
  await transaction.insert(astroDiaryDerivativeCommands).values({
    id: derivative.commandId,
    journalId: item.journalId,
    itemId: derivative.itemId,
    sourceRevision: derivative.sourceRevision,
    sourceDigest: derivative.sourceDigest,
    operation: derivative.operation,
    state: "pending",
    requestedAt: commandAt
  });
  await transaction
    .delete(astroDiaryDraftAttachments)
    .where(eq(astroDiaryDraftAttachments.draftId, draftEffect.draftId));
  const deletedDraft = await transaction
    .delete(astroDiaryDrafts)
    .where(
      and(
        eq(astroDiaryDrafts.id, draftEffect.draftId),
        eq(astroDiaryDrafts.version, draftEffect.beforeVersion)
      )
    )
    .returning({ id: astroDiaryDrafts.id });
  if (deletedDraft.length !== 1) throw new Error("AstroDiary prompt draft CAS changed under lock");
  await persistEventsAndDeliveries(transaction, writeSet.events, commandAt);
}

async function persistPromptAcceptanceWriteSet(
  transaction: ClientSubscriptionTransaction,
  writeSet: AstroDiaryCommandWriteSet,
  commandAt: Date
): Promise<void> {
  const [journalEffect] = writeSet.journals;
  const [cycleEffect] = writeSet.cycles;
  const [draftEffect] = writeSet.drafts;
  const [obligationEffect] = writeSet.obligations;
  const [allowanceEffect] = writeSet.allowances;
  const [itemEffect] = writeSet.timelineItems;
  const [contextEffect] = writeSet.contextSnapshots;
  const [derivative] = writeSet.derivativeCommands;
  if (
    !journalEffect?.after ||
    !cycleEffect?.after ||
    !draftEffect ||
    draftEffect.after !== null ||
    !obligationEffect?.after ||
    !allowanceEffect?.after ||
    !itemEffect?.after ||
    !contextEffect?.after ||
    !derivative
  ) {
    throw new Error("AstroDiary prompt acceptance write-set is incomplete");
  }
  if (itemEffect.after.kind !== "client_entry") {
    throw new Error("AstroDiary prompt acceptance requires a client entry timeline item");
  }
  const [updatedJournal] = await transaction
    .update(astroDiaryJournals)
    .set({ state: journalEffect.after.state, version: journalEffect.after.version })
    .where(
      and(
        eq(astroDiaryJournals.id, journalEffect.after.id),
        eq(astroDiaryJournals.version, journalEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryJournals.id });
  if (!updatedJournal) throw new Error("AstroDiary journal CAS changed inside locked transaction");

  const cycle = cycleEffect.after;
  const updatedCycle = await transaction
    .update(astroDiaryCycles)
    .set({
      openingAllowanceReservationId: null,
      awaitingClientPromptItemId: null,
      clientResponseDueAt: null,
      clientResponseWindowCalendarDays: null,
      clientResponseTimezone: null,
      state: cycle.state,
      version: cycle.version,
      closedAt: nullableDate(cycle.closedAt),
      closeReason: cycle.closeReason
    })
    .where(
      and(
        eq(astroDiaryCycles.id, cycle.id),
        eq(astroDiaryCycles.version, cycleEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryCycles.id });
  if (updatedCycle.length !== 1)
    throw new Error("AstroDiary prompt acceptance cycle CAS changed inside locked transaction");

  await persistConsumedReservedOpeningAllowance(transaction, allowanceEffect);
  const item = itemEffect.after;
  await transaction.insert(astroDiaryTimelineItems).values(mapTimelineItem(item));
  await transaction.insert(astroDiaryTimelineItemRevisions).values({
    ...mapTimelineItem(item),
    itemId: item.id,
    revision: item.revision,
    sourceDigest: derivative.sourceDigest,
    recordedAt: commandAt
  });
  await persistPublishedMediaBindings(transaction, writeSet.mediaBindings, item, commandAt);

  const obligation = obligationEffect.after;
  await transaction.insert(astroDiaryResponseObligations).values({
    id: obligation.id,
    journalId: obligation.journalId,
    cycleId: obligation.cycleId,
    triggerItemId: obligation.triggerItemId,
    state: obligation.state,
    version: obligation.version,
    openedAt: new Date(obligation.openedAt),
    dueAt: new Date(obligation.dueAt),
    responseSlaWorkingDays: obligation.responseSlaWorkingDays,
    serviceTimezone: obligation.serviceTimezone,
    resolvedDueLocal: obligation.resolvedDueLocal,
    resolvedDueOffset: obligation.resolvedDueOffset,
    satisfiedByItemId: obligation.satisfiedByItemId,
    closedAt: nullableDate(obligation.closedAt)
  });
  await transaction
    .insert(astroDiaryResponseObligationWeekdays)
    .values(
      obligation.workingWeekdays.map((isoWeekday) => ({ obligationId: obligation.id, isoWeekday }))
    );

  const context = contextEffect.after;
  if (context.sourceItemDigest !== derivative.sourceDigest) {
    throw new Error("AstroDiary accepted prompt context and derivative source digest differ");
  }
  await transaction.insert(astroDiaryContextSnapshots).values({
    id: context.id,
    journalId: context.journalId,
    itemId: context.itemId,
    sourceItemRevision: context.sourceItemRevision,
    sourceItemDigest: context.sourceItemDigest,
    eventAt: new Date(context.eventAt),
    eventTimezone: context.eventTimezone,
    version: context.version,
    status: context.status,
    engineRevision: context.engineRevision,
    globalContextRef: context.globalContextRef,
    birthProfileId: context.birthProfileId,
    birthProfileRevision: context.birthProfileRevision,
    personalChartRef: context.personalChartRef,
    contextDigest: context.contextDigest,
    calculatedAt: nullableDate(context.calculatedAt),
    failureCode: context.failureCode
  });
  await transaction.insert(astroDiaryDerivativeCommands).values({
    id: derivative.commandId,
    journalId: item.journalId,
    itemId: derivative.itemId,
    sourceRevision: derivative.sourceRevision,
    sourceDigest: derivative.sourceDigest,
    operation: derivative.operation,
    state: "pending",
    requestedAt: commandAt
  });
  await transaction
    .delete(astroDiaryDraftAttachments)
    .where(eq(astroDiaryDraftAttachments.draftId, draftEffect.draftId));
  const deletedDraft = await transaction
    .delete(astroDiaryDrafts)
    .where(
      and(
        eq(astroDiaryDrafts.id, draftEffect.draftId),
        eq(astroDiaryDrafts.version, draftEffect.beforeVersion)
      )
    )
    .returning({ id: astroDiaryDrafts.id });
  if (deletedDraft.length !== 1)
    throw new Error("AstroDiary accepted entry draft CAS changed under lock");
  await persistEventsAndDeliveries(transaction, writeSet.events, commandAt);
}

async function persistClientFollowUpWriteSet(
  transaction: ClientSubscriptionTransaction,
  writeSet: AstroDiaryCommandWriteSet,
  commandAt: Date
): Promise<void> {
  const [journalEffect] = writeSet.journals;
  const [cycleEffect] = writeSet.cycles;
  const [draftEffect] = writeSet.drafts;
  const [obligationEffect] = writeSet.obligations;
  const [itemEffect] = writeSet.timelineItems;
  const [contextEffect] = writeSet.contextSnapshots;
  const [derivative] = writeSet.derivativeCommands;
  if (
    !journalEffect?.after ||
    !cycleEffect?.after ||
    !draftEffect ||
    draftEffect.after !== null ||
    !obligationEffect?.after ||
    !itemEffect?.after ||
    !contextEffect?.after ||
    !derivative
  ) {
    throw new Error("AstroDiary client follow-up write-set is incomplete");
  }
  if (itemEffect.after.kind !== "client_entry") {
    throw new Error("AstroDiary client follow-up requires a client entry timeline item");
  }
  const [updatedJournal] = await transaction
    .update(astroDiaryJournals)
    .set({ state: journalEffect.after.state, version: journalEffect.after.version })
    .where(
      and(
        eq(astroDiaryJournals.id, journalEffect.after.id),
        eq(astroDiaryJournals.version, journalEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryJournals.id });
  if (!updatedJournal) throw new Error("AstroDiary journal CAS changed inside locked transaction");
  const cycle = cycleEffect.after;
  const updatedCycle = await transaction
    .update(astroDiaryCycles)
    .set({
      awaitingClientPromptItemId: cycle.awaitingClientPromptItemId,
      clientResponseDueAt: nullableDate(cycle.clientResponseDueAt),
      clientResponseWindowCalendarDays: cycle.clientResponseWindowCalendarDays,
      clientResponseTimezone: cycle.clientResponseTimezone,
      state: cycle.state,
      version: cycle.version,
      closedAt: nullableDate(cycle.closedAt),
      closeReason: cycle.closeReason
    })
    .where(
      and(
        eq(astroDiaryCycles.id, cycle.id),
        eq(astroDiaryCycles.version, cycleEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryCycles.id });
  if (updatedCycle.length !== 1) {
    throw new Error("AstroDiary client follow-up cycle CAS changed inside locked transaction");
  }
  const item = itemEffect.after;
  await transaction.insert(astroDiaryTimelineItems).values(mapTimelineItem(item));
  await transaction.insert(astroDiaryTimelineItemRevisions).values({
    ...mapTimelineItem(item),
    itemId: item.id,
    revision: item.revision,
    sourceDigest: derivative.sourceDigest,
    recordedAt: commandAt
  });
  await persistPublishedMediaBindings(transaction, writeSet.mediaBindings, item, commandAt);
  const obligation = obligationEffect.after;
  await transaction.insert(astroDiaryResponseObligations).values({
    id: obligation.id,
    journalId: obligation.journalId,
    cycleId: obligation.cycleId,
    triggerItemId: obligation.triggerItemId,
    state: obligation.state,
    version: obligation.version,
    openedAt: new Date(obligation.openedAt),
    dueAt: new Date(obligation.dueAt),
    responseSlaWorkingDays: obligation.responseSlaWorkingDays,
    serviceTimezone: obligation.serviceTimezone,
    resolvedDueLocal: obligation.resolvedDueLocal,
    resolvedDueOffset: obligation.resolvedDueOffset,
    satisfiedByItemId: obligation.satisfiedByItemId,
    closedAt: nullableDate(obligation.closedAt)
  });
  await transaction
    .insert(astroDiaryResponseObligationWeekdays)
    .values(
      obligation.workingWeekdays.map((isoWeekday) => ({ obligationId: obligation.id, isoWeekday }))
    );
  const context = contextEffect.after;
  if (context.sourceItemDigest !== derivative.sourceDigest) {
    throw new Error("AstroDiary follow-up context and derivative source digest differ");
  }
  await transaction.insert(astroDiaryContextSnapshots).values({
    id: context.id,
    journalId: context.journalId,
    itemId: context.itemId,
    sourceItemRevision: context.sourceItemRevision,
    sourceItemDigest: context.sourceItemDigest,
    eventAt: new Date(context.eventAt),
    eventTimezone: context.eventTimezone,
    version: context.version,
    status: context.status,
    engineRevision: context.engineRevision,
    globalContextRef: context.globalContextRef,
    birthProfileId: context.birthProfileId,
    birthProfileRevision: context.birthProfileRevision,
    personalChartRef: context.personalChartRef,
    contextDigest: context.contextDigest,
    calculatedAt: nullableDate(context.calculatedAt),
    failureCode: context.failureCode
  });
  await transaction.insert(astroDiaryDerivativeCommands).values({
    id: derivative.commandId,
    journalId: item.journalId,
    itemId: derivative.itemId,
    sourceRevision: derivative.sourceRevision,
    sourceDigest: derivative.sourceDigest,
    operation: derivative.operation,
    state: "pending",
    requestedAt: commandAt
  });
  await transaction
    .delete(astroDiaryDraftAttachments)
    .where(eq(astroDiaryDraftAttachments.draftId, draftEffect.draftId));
  const deletedDraft = await transaction
    .delete(astroDiaryDrafts)
    .where(
      and(
        eq(astroDiaryDrafts.id, draftEffect.draftId),
        eq(astroDiaryDrafts.version, draftEffect.beforeVersion)
      )
    )
    .returning({ id: astroDiaryDrafts.id });
  if (deletedDraft.length !== 1) {
    throw new Error("AstroDiary client follow-up draft CAS changed under lock");
  }
  await persistEventsAndDeliveries(transaction, writeSet.events, commandAt);
}

async function persistPromptDeclineWriteSet(
  transaction: ClientSubscriptionTransaction,
  writeSet: AstroDiaryCommandWriteSet,
  commandAt: Date
): Promise<void> {
  const [journalEffect] = writeSet.journals;
  const [cycleEffect] = writeSet.cycles;
  const [allowanceEffect] = writeSet.allowances;
  if (!journalEffect?.after || !cycleEffect?.after || !allowanceEffect?.after) {
    throw new Error("AstroDiary prompt decline write-set is incomplete");
  }
  const [updatedJournal] = await transaction
    .update(astroDiaryJournals)
    .set({ state: journalEffect.after.state, version: journalEffect.after.version })
    .where(
      and(
        eq(astroDiaryJournals.id, journalEffect.after.id),
        eq(astroDiaryJournals.version, journalEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryJournals.id });
  if (!updatedJournal) throw new Error("AstroDiary journal CAS changed inside locked transaction");
  const cycle = cycleEffect.after;
  const updatedCycle = await transaction
    .update(astroDiaryCycles)
    .set({
      openingAllowanceReservationId: null,
      awaitingClientPromptItemId: null,
      clientResponseDueAt: nullableDate(cycle.clientResponseDueAt),
      clientResponseWindowCalendarDays: cycle.clientResponseWindowCalendarDays,
      clientResponseTimezone: cycle.clientResponseTimezone,
      state: cycle.state,
      version: cycle.version,
      closedAt: nullableDate(cycle.closedAt),
      closeReason: cycle.closeReason
    })
    .where(
      and(
        eq(astroDiaryCycles.id, cycle.id),
        eq(astroDiaryCycles.version, cycleEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryCycles.id });
  if (updatedCycle.length !== 1)
    throw new Error("AstroDiary prompt decline cycle CAS changed inside locked transaction");
  await persistReleasedOpeningAllowance(transaction, allowanceEffect);
  await persistEventsAndDeliveries(transaction, writeSet.events, commandAt);
}

async function persistPromptWithdrawalWriteSet(
  transaction: ClientSubscriptionTransaction,
  writeSet: AstroDiaryCommandWriteSet,
  commandAt: Date
): Promise<void> {
  const [journalEffect] = writeSet.journals;
  const [cycleEffect] = writeSet.cycles;
  const [allowanceEffect] = writeSet.allowances;
  const [itemEffect] = writeSet.timelineItems;
  if (
    !journalEffect?.after ||
    !cycleEffect?.after ||
    !allowanceEffect?.after ||
    !itemEffect?.after ||
    itemEffect.after.kind !== "tombstone"
  ) {
    throw new Error("AstroDiary prompt withdrawal write-set is incomplete");
  }
  const [updatedJournal] = await transaction
    .update(astroDiaryJournals)
    .set({ state: journalEffect.after.state, version: journalEffect.after.version })
    .where(
      and(
        eq(astroDiaryJournals.id, journalEffect.after.id),
        eq(astroDiaryJournals.version, journalEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryJournals.id });
  if (!updatedJournal) throw new Error("AstroDiary journal CAS changed inside locked transaction");
  const cycle = cycleEffect.after;
  const updatedCycle = await transaction
    .update(astroDiaryCycles)
    .set({
      openingAllowanceReservationId: null,
      awaitingClientPromptItemId: null,
      clientResponseDueAt: nullableDate(cycle.clientResponseDueAt),
      clientResponseWindowCalendarDays: cycle.clientResponseWindowCalendarDays,
      clientResponseTimezone: cycle.clientResponseTimezone,
      state: cycle.state,
      version: cycle.version,
      closedAt: nullableDate(cycle.closedAt),
      closeReason: cycle.closeReason
    })
    .where(
      and(
        eq(astroDiaryCycles.id, cycle.id),
        eq(astroDiaryCycles.version, cycleEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryCycles.id });
  if (updatedCycle.length !== 1)
    throw new Error("AstroDiary prompt withdrawal cycle CAS changed inside locked transaction");
  await persistReleasedOpeningAllowance(transaction, allowanceEffect);

  const tombstone = itemEffect.after;
  const [updatedItem] = await transaction
    .update(astroDiaryTimelineItems)
    .set({
      currentRevision: tombstone.revision,
      kind: tombstone.kind,
      originalKind: tombstone.originalKind,
      body: null,
      moodId: null,
      contextStatus: null,
      correctsItemId: null,
      tombstoneReason: tombstone.reason,
      editedAt: null
    })
    .where(
      and(
        eq(astroDiaryTimelineItems.id, tombstone.id),
        eq(astroDiaryTimelineItems.currentRevision, itemEffect.beforeRevision!)
      )
    )
    .returning({ id: astroDiaryTimelineItems.id });
  if (!updatedItem)
    throw new Error("AstroDiary prompt withdrawal timeline CAS changed inside lock");
  await transaction.insert(astroDiaryTimelineItemRevisions).values({
    ...mapTombstoneTimelineItem(tombstone),
    itemId: tombstone.id,
    revision: tombstone.revision,
    sourceDigest: sha256CanonicalJson({
      itemId: tombstone.id,
      revision: tombstone.revision,
      originalKind: tombstone.originalKind,
      reason: tombstone.reason
    }),
    recordedAt: commandAt
  });
  await persistEventsAndDeliveries(transaction, writeSet.events, commandAt);
}

async function persistPublishedMediaBindings(
  transaction: ClientSubscriptionTransaction,
  bindings: AstroDiaryCommandWriteSet["mediaBindings"],
  item: Extract<
    AstroDiaryTimelineItem,
    { kind: "client_entry" | "astrologer_reply" | "reflection_prompt" }
  >,
  commandAt: Date
): Promise<void> {
  if (bindings.length !== item.attachmentIds.length) {
    throw new Error(
      "AstroDiary published media bindings do not match the immutable item attachments"
    );
  }
  const boundIds = new Set(bindings.map((binding) => binding.mediaId));
  if (
    boundIds.size !== bindings.length ||
    item.attachmentIds.some((mediaId) => !boundIds.has(mediaId))
  ) {
    throw new Error("AstroDiary published media bindings are not an exact attachment set");
  }
  if (bindings.length === 0) return;
  const authorities = await transaction
    .select()
    .from(astroDiaryMediaAuthorities)
    .where(eq(astroDiaryMediaAuthorities.journalId, item.journalId))
    .for("update");
  const authorityByMediaId = new Map(
    authorities.map((authority) => [authority.mediaId, authority])
  );
  const rows = bindings.map((binding, ordinal) => {
    const authority = authorityByMediaId.get(binding.mediaId);
    if (
      binding.itemId !== item.id ||
      !authority ||
      authority.ownerUserId !== item.authorUserId ||
      authority.state !== "ready" ||
      authority.visibility !== "private" ||
      authority.boundItemId !== null ||
      authority.readyAt === null
    ) {
      throw new Error(
        "AstroDiary published media authority is not exactly ready for its item author"
      );
    }
    return { authority, ordinal };
  });
  for (const { authority } of rows) {
    const updated = await transaction
      .update(astroDiaryMediaAuthorities)
      .set({ state: "bound", boundItemId: item.id, boundAt: commandAt, updatedAt: commandAt })
      .where(
        and(
          eq(astroDiaryMediaAuthorities.mediaId, authority.mediaId),
          eq(astroDiaryMediaAuthorities.state, "ready")
        )
      )
      .returning({ mediaId: astroDiaryMediaAuthorities.mediaId });
    if (updated.length !== 1) {
      throw new Error("AstroDiary media authority changed during journal command");
    }
  }
  await transaction.insert(astroDiaryEntryAttachments).values(
    rows.map(({ authority }) => ({
      mediaId: authority.mediaId,
      journalId: item.journalId,
      itemId: item.id,
      ownerUserId: authority.ownerUserId,
      purpose: authority.purpose,
      state: "bound",
      boundAt: commandAt,
      releasedAt: null
    }))
  );
  await transaction.insert(astroDiaryTimelineRevisionAttachments).values(
    rows.map(({ authority, ordinal }) => ({
      itemId: item.id,
      revision: item.revision,
      journalId: item.journalId,
      ordinal,
      mediaId: authority.mediaId
    }))
  );
}

async function persistClosingReplyWriteSet(
  transaction: ClientSubscriptionTransaction,
  writeSet: AstroDiaryCommandWriteSet,
  commandAt: Date
): Promise<void> {
  const [journalEffect] = writeSet.journals;
  const [cycleEffect] = writeSet.cycles;
  const [draftEffect] = writeSet.drafts;
  const [obligationEffect] = writeSet.obligations;
  const [itemEffect] = writeSet.timelineItems;
  const [derivative] = writeSet.derivativeCommands;
  if (
    !journalEffect?.after ||
    !cycleEffect?.after ||
    !draftEffect ||
    draftEffect.after !== null ||
    !obligationEffect?.after ||
    !itemEffect?.after ||
    !derivative
  ) {
    throw new Error("AstroDiary closing reply write-set is incomplete");
  }
  const [updatedJournal] = await transaction
    .update(astroDiaryJournals)
    .set({ state: journalEffect.after.state, version: journalEffect.after.version })
    .where(
      and(
        eq(astroDiaryJournals.id, journalEffect.after.id),
        eq(astroDiaryJournals.version, journalEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryJournals.id });
  if (!updatedJournal) throw new Error("AstroDiary journal CAS changed inside locked transaction");

  const cycle = cycleEffect.after;
  const updatedCycle = await transaction
    .update(astroDiaryCycles)
    .set({
      openingAllowanceReservationId: cycle.openingAllowanceReservationId,
      awaitingClientPromptItemId: cycle.awaitingClientPromptItemId,
      clientResponseDueAt: nullableDate(cycle.clientResponseDueAt),
      clientResponseWindowCalendarDays: cycle.clientResponseWindowCalendarDays,
      clientResponseTimezone: cycle.clientResponseTimezone,
      state: cycle.state,
      version: cycle.version,
      closedAt: nullableDate(cycle.closedAt),
      closeReason: cycle.closeReason
    })
    .where(
      and(
        eq(astroDiaryCycles.id, cycle.id),
        eq(astroDiaryCycles.version, cycleEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryCycles.id });
  if (updatedCycle.length !== 1)
    throw new Error("AstroDiary cycle CAS changed inside locked transaction");

  const obligation = obligationEffect.after;
  const updatedObligation = await transaction
    .update(astroDiaryResponseObligations)
    .set({
      state: obligation.state,
      version: obligation.version,
      satisfiedByItemId: obligation.satisfiedByItemId,
      closedAt: nullableDate(obligation.closedAt)
    })
    .where(
      and(
        eq(astroDiaryResponseObligations.id, obligation.id),
        eq(astroDiaryResponseObligations.version, obligationEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryResponseObligations.id });
  if (updatedObligation.length !== 1) {
    throw new Error("AstroDiary response obligation CAS changed inside locked transaction");
  }

  const item = itemEffect.after;
  if (item.kind !== "astrologer_reply") {
    throw new Error("AstroDiary closing reply requires an astrologer reply timeline item");
  }
  await transaction.insert(astroDiaryTimelineItems).values(mapTimelineItem(item));
  await transaction.insert(astroDiaryTimelineItemRevisions).values({
    ...mapTimelineItem(item),
    itemId: item.id,
    revision: item.revision,
    sourceDigest: derivative.sourceDigest,
    recordedAt: commandAt
  });
  await persistPublishedMediaBindings(transaction, writeSet.mediaBindings, item, commandAt);
  await transaction.insert(astroDiaryDerivativeCommands).values({
    id: derivative.commandId,
    journalId: item.journalId,
    itemId: derivative.itemId,
    sourceRevision: derivative.sourceRevision,
    sourceDigest: derivative.sourceDigest,
    operation: derivative.operation,
    state: "pending",
    requestedAt: commandAt
  });
  await transaction
    .delete(astroDiaryDraftAttachments)
    .where(eq(astroDiaryDraftAttachments.draftId, draftEffect.draftId));
  const deletedDraft = await transaction
    .delete(astroDiaryDrafts)
    .where(
      and(
        eq(astroDiaryDrafts.id, draftEffect.draftId),
        eq(astroDiaryDrafts.version, draftEffect.beforeVersion)
      )
    )
    .returning({ id: astroDiaryDrafts.id });
  if (deletedDraft.length !== 1) throw new Error("AstroDiary reply draft CAS changed under lock");
  await persistEventsAndDeliveries(transaction, writeSet.events, commandAt);
}

async function persistFollowUpReplyWriteSet(
  transaction: ClientSubscriptionTransaction,
  writeSet: AstroDiaryCommandWriteSet,
  commandAt: Date
): Promise<void> {
  const [journalEffect] = writeSet.journals;
  const [cycleEffect] = writeSet.cycles;
  const [obligationEffect] = writeSet.obligations;
  if (!journalEffect?.after || !cycleEffect?.after || !obligationEffect?.after) {
    throw new Error("AstroDiary follow-up reply write-set is incomplete");
  }
  const [updatedJournal] = await transaction
    .update(astroDiaryJournals)
    .set({ state: journalEffect.after.state, version: journalEffect.after.version })
    .where(
      and(
        eq(astroDiaryJournals.id, journalEffect.after.id),
        eq(astroDiaryJournals.version, journalEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryJournals.id });
  if (!updatedJournal) throw new Error("AstroDiary journal CAS changed inside locked transaction");

  const cycle = cycleEffect.after;
  const updatedCycle = await transaction
    .update(astroDiaryCycles)
    .set({
      openingAllowanceReservationId: cycle.openingAllowanceReservationId,
      awaitingClientPromptItemId: cycle.awaitingClientPromptItemId,
      clientResponseDueAt: nullableDate(cycle.clientResponseDueAt),
      clientResponseWindowCalendarDays: cycle.clientResponseWindowCalendarDays,
      clientResponseTimezone: cycle.clientResponseTimezone,
      state: cycle.state,
      version: cycle.version,
      closedAt: nullableDate(cycle.closedAt),
      closeReason: cycle.closeReason
    })
    .where(
      and(
        eq(astroDiaryCycles.id, cycle.id),
        eq(astroDiaryCycles.version, cycleEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryCycles.id });
  if (updatedCycle.length !== 1)
    throw new Error("AstroDiary cycle CAS changed inside locked transaction");

  const obligation = obligationEffect.after;
  const updatedObligation = await transaction
    .update(astroDiaryResponseObligations)
    .set({
      state: obligation.state,
      version: obligation.version,
      satisfiedByItemId: obligation.satisfiedByItemId,
      closedAt: nullableDate(obligation.closedAt)
    })
    .where(
      and(
        eq(astroDiaryResponseObligations.id, obligation.id),
        eq(astroDiaryResponseObligations.version, obligationEffect.beforeVersion!)
      )
    )
    .returning({ id: astroDiaryResponseObligations.id });
  if (updatedObligation.length !== 1) {
    throw new Error("AstroDiary response obligation CAS changed inside locked transaction");
  }

  const derivativesByItemId = new Map(
    writeSet.derivativeCommands.map((derivative) => [derivative.itemId, derivative])
  );
  for (const effect of writeSet.timelineItems) {
    const item = effect.after;
    const derivative = derivativesByItemId.get(item.id);
    if (item.kind !== "astrologer_reply" && item.kind !== "reflection_prompt") {
      throw new Error(
        "AstroDiary follow-up reply can publish only reply and reflection prompt items"
      );
    }
    if (!derivative) throw new Error("AstroDiary follow-up item lacks its derivative request");
    await transaction.insert(astroDiaryTimelineItems).values(mapTimelineItem(item));
    await transaction.insert(astroDiaryTimelineItemRevisions).values({
      ...mapTimelineItem(item),
      itemId: item.id,
      revision: item.revision,
      sourceDigest: derivative.sourceDigest,
      recordedAt: commandAt
    });
    await persistPublishedMediaBindings(
      transaction,
      writeSet.mediaBindings.filter((binding) => binding.itemId === item.id),
      item,
      commandAt
    );
    await transaction.insert(astroDiaryDerivativeCommands).values({
      id: derivative.commandId,
      journalId: item.journalId,
      itemId: derivative.itemId,
      sourceRevision: derivative.sourceRevision,
      sourceDigest: derivative.sourceDigest,
      operation: derivative.operation,
      state: "pending",
      requestedAt: commandAt
    });
  }
  for (const draftEffect of writeSet.drafts) {
    if (draftEffect.beforeVersion === null) {
      throw new Error("AstroDiary follow-up draft deletion requires an existing draft version");
    }
    await transaction
      .delete(astroDiaryDraftAttachments)
      .where(eq(astroDiaryDraftAttachments.draftId, draftEffect.draftId));
    const deleted = await transaction
      .delete(astroDiaryDrafts)
      .where(
        and(
          eq(astroDiaryDrafts.id, draftEffect.draftId),
          eq(astroDiaryDrafts.version, draftEffect.beforeVersion)
        )
      )
      .returning({ id: astroDiaryDrafts.id });
    if (deleted.length !== 1) throw new Error("AstroDiary follow-up draft CAS changed under lock");
  }
  await persistEventsAndDeliveries(transaction, writeSet.events, commandAt);
}

async function persistConsumedOpeningAllowance(
  transaction: ClientSubscriptionTransaction,
  effect: AstroDiaryCommandWriteSet["allowances"][number]
): Promise<string> {
  if (!effect.after || effect.beforeVersion === null) {
    throw new Error("AstroDiary opening allowance effect is incomplete");
  }
  const receipt = effect.after.receipts.find(
    (candidate) =>
      candidate.resultVersion === effect.after?.version &&
      candidate.operation === "consume_available"
  );
  if (!receipt || receipt.command.operation !== "consume_available") {
    throw new Error("AstroDiary opening cycle requires one consumed available allowance receipt");
  }
  const command = receipt.command;
  const execution = await executeClientSubscriptionAllowanceCommandInTransaction(transaction, {
    periodId: effect.after.periodId,
    expectedVersion: effect.beforeVersion,
    idempotencyKey: receipt.idempotencyKey,
    requestHash: receipt.requestHash,
    command,
    decide: (current) =>
      consumeAvailableAllowance(current, {
        expectedVersion: effect.beforeVersion!,
        idempotencyKey: receipt.idempotencyKey,
        consumptionId: command.consumptionId,
        now: command.occurredAt
      })
  });
  if (
    execution.outcome !== "applied" ||
    stableJson(execution.allowance) !== stableJson(effect.after)
  ) {
    throw new Error("AstroDiary opening allowance persistence does not match its exact write-set");
  }
  return command.consumptionId;
}

async function persistReservedOpeningAllowance(
  transaction: ClientSubscriptionTransaction,
  effect: AstroDiaryCommandWriteSet["allowances"][number]
): Promise<string> {
  if (!effect.after || effect.beforeVersion === null) {
    throw new Error("AstroDiary prompt opening allowance effect is incomplete");
  }
  const receipt = effect.after.receipts.find(
    (candidate) =>
      candidate.resultVersion === effect.after?.version && candidate.operation === "reserve"
  );
  if (!receipt || receipt.command.operation !== "reserve") {
    throw new Error("AstroDiary prompt opening requires one reserved allowance receipt");
  }
  const command = receipt.command;
  const execution = await executeClientSubscriptionAllowanceCommandInTransaction(transaction, {
    periodId: effect.after.periodId,
    expectedVersion: effect.beforeVersion,
    idempotencyKey: receipt.idempotencyKey,
    requestHash: receipt.requestHash,
    command,
    decide: (current) =>
      reservePeriodAllowance(current, {
        expectedVersion: effect.beforeVersion!,
        idempotencyKey: receipt.idempotencyKey,
        reservationId: command.reservationId,
        now: command.occurredAt
      })
  });
  if (
    execution.outcome !== "applied" ||
    stableJson(execution.allowance) !== stableJson(effect.after)
  ) {
    throw new Error("AstroDiary prompt reservation persistence does not match its exact write-set");
  }
  return command.reservationId;
}

async function persistConsumedReservedOpeningAllowance(
  transaction: ClientSubscriptionTransaction,
  effect: AstroDiaryCommandWriteSet["allowances"][number]
): Promise<void> {
  if (!effect.after || effect.beforeVersion === null) {
    throw new Error("AstroDiary prompt acceptance allowance effect is incomplete");
  }
  const receipt = effect.after.receipts.find(
    (candidate) =>
      candidate.resultVersion === effect.after?.version &&
      candidate.operation === "consume_reserved"
  );
  if (!receipt || receipt.command.operation !== "consume_reserved") {
    throw new Error("AstroDiary prompt acceptance requires one consumed reservation receipt");
  }
  const command = receipt.command;
  const execution = await executeClientSubscriptionAllowanceCommandInTransaction(transaction, {
    periodId: effect.after.periodId,
    expectedVersion: effect.beforeVersion,
    idempotencyKey: receipt.idempotencyKey,
    requestHash: receipt.requestHash,
    command,
    decide: (current) =>
      consumeReservedAllowance(current, {
        expectedVersion: effect.beforeVersion!,
        idempotencyKey: receipt.idempotencyKey,
        reservationId: command.reservationId,
        now: command.occurredAt
      })
  });
  if (
    execution.outcome !== "applied" ||
    stableJson(execution.allowance) !== stableJson(effect.after)
  ) {
    throw new Error("AstroDiary prompt acceptance persistence does not match its exact write-set");
  }
}

async function persistReleasedOpeningAllowance(
  transaction: ClientSubscriptionTransaction,
  effect: AstroDiaryCommandWriteSet["allowances"][number]
): Promise<void> {
  if (!effect.after || effect.beforeVersion === null) {
    throw new Error("AstroDiary prompt decline allowance effect is incomplete");
  }
  const receipt = effect.after.receipts.find(
    (candidate) =>
      candidate.resultVersion === effect.after?.version &&
      candidate.operation === "release_reserved"
  );
  if (!receipt || receipt.command.operation !== "release_reserved") {
    throw new Error("AstroDiary prompt decline requires one released reservation receipt");
  }
  const command = receipt.command;
  const execution = await executeClientSubscriptionAllowanceCommandInTransaction(transaction, {
    periodId: effect.after.periodId,
    expectedVersion: effect.beforeVersion,
    idempotencyKey: receipt.idempotencyKey,
    requestHash: receipt.requestHash,
    command,
    decide: (current) =>
      releaseReservedAllowance(current, {
        expectedVersion: effect.beforeVersion!,
        idempotencyKey: receipt.idempotencyKey,
        reservationId: command.reservationId,
        now: command.occurredAt
      })
  });
  if (
    execution.outcome !== "applied" ||
    stableJson(execution.allowance) !== stableJson(effect.after)
  ) {
    throw new Error("AstroDiary prompt decline persistence does not match its exact write-set");
  }
}

function mapTimelineItem(
  item: Extract<
    AstroDiaryTimelineItem,
    { kind: "client_entry" | "astrologer_reply" | "reflection_prompt" }
  >
) {
  return {
    id: item.id,
    journalId: item.journalId,
    cycleId: item.cycleId,
    currentRevision: item.revision,
    cursor: item.cursor,
    kind: item.kind,
    originalKind: null,
    authorRole: item.authorRole,
    authorUserId: item.authorUserId,
    body: item.body,
    moodId: item.moodId,
    contextStatus: item.contextStatus,
    correctsItemId: null,
    tombstoneReason: null,
    editedAt: null,
    occurredAt: new Date(item.occurredAt)
  };
}

function mapTombstoneTimelineItem(item: Extract<AstroDiaryTimelineItem, { kind: "tombstone" }>) {
  return {
    id: item.id,
    journalId: item.journalId,
    cycleId: item.cycleId,
    currentRevision: item.revision,
    cursor: item.cursor,
    kind: item.kind,
    originalKind: item.originalKind,
    authorRole: item.authorRole,
    authorUserId: item.authorUserId,
    body: null,
    moodId: null,
    contextStatus: null,
    correctsItemId: null,
    tombstoneReason: item.reason,
    editedAt: null,
    occurredAt: new Date(item.occurredAt)
  };
}

function nullableDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

async function persistEventsAndDeliveries(
  transaction: ClientSubscriptionTransaction,
  events: AstroDiaryCommandWriteSet["events"],
  commandAt: Date
): Promise<void> {
  for (const event of events) {
    const data = event.data as Record<string, string>;
    const journalId = data.journalId;
    const journalEpochId = data.journalEpochId;
    if (!journalId || !journalEpochId) {
      throw new Error("AstroDiary canonical event lacks its journal authority");
    }
    const eventRow: typeof astroDiaryEvents.$inferInsert = {
      eventId: event.eventId,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      eventDigest: sha256CanonicalJson(event),
      journalId,
      journalEpochId,
      cycleId: data.cycleId ?? null,
      itemId: data.itemId ?? null,
      contextId: data.contextId ?? null,
      obligationId: data.obligationId ?? null,
      responseItemId: data.responseItemId ?? null,
      commandId: data.commandId ?? null,
      periodId: data.periodId ?? null,
      occurredAt: new Date(event.occurredAt)
    };
    await transaction.insert(astroDiaryEvents).values(eventRow);
    for (const consumer of consumersForEvent(event.eventType)) {
      const deliveryId = randomUUID();
      await transaction.insert(astroDiaryEventDeliveries).values({
        id: deliveryId,
        eventId: event.eventId,
        consumer,
        state: "pending",
        availableAt: commandAt,
        createdAt: commandAt,
        updatedAt: commandAt
      });
      await transaction.insert(outboxEvents).values({
        eventType: "astro_diary.event_delivery.dispatch_requested.v1",
        aggregateId: deliveryId,
        payload: {
          schemaVersion: "astro-diary-event-delivery-dispatch-request.v1",
          deliveryId
        },
        availableAt: commandAt,
        createdAt: commandAt,
        updatedAt: commandAt
      });
    }
  }
}

function consumersForEvent(eventType: AstroDiaryCommandWriteSet["events"][number]["eventType"]) {
  switch (eventType) {
    case "astro_diary.cycle_opened.v1":
    case "astro_diary.timeline_item_published.v1":
    case "astro_diary.response_obligation_created.v1":
    case "astro_diary.response_obligation_satisfied.v1":
      return ["realtime_projection", "notification"] as const;
    case "astro_diary.cycle_closed.v1":
      return ["realtime_projection"] as const;
    case "astro_diary.context_generation_requested.v1":
      return ["context_worker"] as const;
    case "astro_diary.derivative_generation_requested.v1":
      return ["derivative_worker"] as const;
    default:
      throw new Error(`AstroDiary command contains an unsupported event ${eventType}`);
  }
}

function mapDraftHead(draft: NonNullable<AstroDiaryCommandWriteSet["drafts"][number]["after"]>) {
  return {
    id: draft.id,
    journalId: draft.journalId,
    cycleId: draft.cycleId,
    authorUserId: draft.authorUserId,
    authorRole: draft.authorRole,
    kind: draft.kind,
    version: draft.version,
    body: draft.body,
    moodId: draft.moodId,
    correctsItemId: draft.correctsItemId,
    updatedAt: new Date(draft.updatedAt)
  };
}

async function persistReceipt(
  transaction: ClientSubscriptionTransaction,
  receipt: AstroDiaryCommandReceipt,
  createdAt: Date
): Promise<void> {
  const applied = receipt.result.outcome === "applied";
  await transaction.insert(astroDiaryCommandReceipts).values({
    journalId: receipt.journalId,
    idempotencyKey: receipt.idempotencyKey,
    requestHash: receipt.requestHash,
    outcome: receipt.result.outcome,
    rejectionCode: applied ? null : receipt.result.code,
    resultResourceType: applied ? (receipt.result.resource?.type ?? null) : null,
    resultResourceId: applied ? (receipt.result.resource?.draftId ?? null) : null,
    resultResourceVersion: applied ? (receipt.result.resource?.version ?? null) : null,
    createdAt
  });
  await transaction.insert(astroDiaryCommandPreconditions).values(
    receipt.preconditions.map((precondition) => ({
      journalId: receipt.journalId,
      idempotencyKey: receipt.idempotencyKey,
      aggregate: precondition.aggregate,
      aggregateId: precondition.id,
      expectedVersion: precondition.expectedVersion
    }))
  );
  if (applied && receipt.result.eventIds.length > 0) {
    await transaction.insert(astroDiaryCommandEventReceipts).values(
      receipt.result.eventIds.map((eventId, ordinal) => ({
        journalId: receipt.journalId,
        idempotencyKey: receipt.idempotencyKey,
        ordinal,
        eventId
      }))
    );
  }
}

async function readReceipt(
  transaction: ClientSubscriptionTransaction,
  journalId: string,
  idempotencyKey: string
): Promise<{ receipt: AstroDiaryCommandReceipt } | null> {
  const [row] = await transaction
    .select()
    .from(astroDiaryCommandReceipts)
    .where(
      and(
        eq(astroDiaryCommandReceipts.journalId, journalId),
        eq(astroDiaryCommandReceipts.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  if (!row) return null;
  const preconditions = await transaction
    .select()
    .from(astroDiaryCommandPreconditions)
    .where(
      and(
        eq(astroDiaryCommandPreconditions.journalId, journalId),
        eq(astroDiaryCommandPreconditions.idempotencyKey, idempotencyKey)
      )
    )
    .orderBy(
      asc(astroDiaryCommandPreconditions.aggregate),
      asc(astroDiaryCommandPreconditions.aggregateId)
    );
  const events = await transaction
    .select()
    .from(astroDiaryCommandEventReceipts)
    .where(
      and(
        eq(astroDiaryCommandEventReceipts.journalId, journalId),
        eq(astroDiaryCommandEventReceipts.idempotencyKey, idempotencyKey)
      )
    )
    .orderBy(asc(astroDiaryCommandEventReceipts.ordinal));
  if (row.outcome === "rejected") {
    if (!row.rejectionCode) throw new Error("Rejected AstroDiary receipt code is missing");
    return {
      receipt: {
        journalId,
        idempotencyKey,
        requestHash: digestSchema.parse(row.requestHash),
        preconditions: preconditions.map(mapPrecondition),
        result: { outcome: "rejected", code: row.rejectionCode }
      }
    };
  }
  if (row.outcome !== "applied") throw new Error("Unknown AstroDiary receipt outcome");
  const resource =
    row.resultResourceType === null
      ? null
      : row.resultResourceType === "draft" &&
          row.resultResourceId !== null &&
          row.resultResourceVersion !== null
        ? {
            type: "draft" as const,
            draftId: row.resultResourceId,
            version: row.resultResourceVersion
          }
        : (() => {
            throw new Error("Applied AstroDiary receipt resource is malformed");
          })();
  if (resource) {
    const [fact] = await transaction
      .select({ draftId: astroDiaryDraftVersionFacts.draftId })
      .from(astroDiaryDraftVersionFacts)
      .where(
        and(
          eq(astroDiaryDraftVersionFacts.draftId, resource.draftId),
          eq(astroDiaryDraftVersionFacts.version, resource.version),
          eq(astroDiaryDraftVersionFacts.journalId, journalId)
        )
      )
      .limit(1);
    if (!fact) throw new Error("AstroDiary receipt immutable result fact is missing");
  }
  return {
    receipt: {
      journalId,
      idempotencyKey,
      requestHash: digestSchema.parse(row.requestHash),
      preconditions: preconditions.map(mapPrecondition),
      result: { outcome: "applied", eventIds: events.map((event) => event.eventId), resource }
    }
  };
}

function mapPrecondition(
  row: typeof astroDiaryCommandPreconditions.$inferSelect
): AstroDiaryCommandReceipt["preconditions"][number] {
  return {
    aggregate: z
      .enum([
        "journal",
        "cycle",
        "draft",
        "timeline_item",
        "obligation",
        "allowance",
        "read_cursor"
      ])
      .parse(row.aggregate),
    id: row.aggregateId,
    expectedVersion: row.expectedVersion
  };
}
