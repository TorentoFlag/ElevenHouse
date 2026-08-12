import type { CanonicalJson } from "../calculations/canonical-json";
import { authorizeAstroDiaryOperation } from "./astro-diary-access-policy";
import { validateAstroDiaryCommandAuthority } from "./astro-diary-commands";
import { astroDiaryEvent } from "./astro-diary-events";
import { completeWholeJournalErasure, requestWholeJournalErasure } from "./astro-diary-erasure";
import { completeAstroDiaryItemErasure, decideAstroDiaryItemErasure } from "./astro-diary-timeline";
import type {
  AstroDiaryCommandAuthority,
  AstroDiaryCommandDecision,
  AstroDiaryCommandExecution,
  AstroDiaryCommandPrecondition,
  AstroDiaryCommandUnitOfWork,
  AstroDiaryCommandWriteSet,
  AstroDiaryCascadeReceipt,
  AstroDiaryCascadeTarget,
  AstroDiaryCascadeTargetIdentity,
  AstroDiaryCascadeSubsystem
} from "./ports/astro-diary-command-unit-of-work";
import { executeAstroDiaryCommand } from "./ports/astro-diary-command-unit-of-work";

export type StartItemErasureCommand = Readonly<{
  actorUserId: string;
  actorRole: "client" | "astrologer";
  itemId: string;
  expectedRevision: number;
  erasureCommandId: string;
  derivativeRedactionCommandId: string;
  erasureRequestedEventId: string;
}>;

export type StartWholeJournalErasureCommand = Readonly<{
  actorUserId: string;
  expectedJournalVersion: number;
  subscriptionId: string;
  erasureRequestId: string;
  cascadeRequestId: string;
  erasureRequestedEventId: string;
  factIds: Readonly<{
    journalErasureRequested: string;
    subscriptionEndRequested: string;
    cycleClosed: readonly Readonly<{ cycleId: string; factId: string }>[];
    obligationClosed: readonly Readonly<{ obligationId: string; factId: string }>[];
  }>;
}>;

export type CompleteItemErasureCommand = Readonly<{
  actorUserId: string;
  commandId: string;
  itemId: string;
  expectedRevision: number;
}>;

export type CompleteWholeJournalErasureCommand = Readonly<{
  actorUserId: string;
  commandId: string;
  expectedJournalVersion: number;
}>;

export type AstroDiaryErasureCommand =
  | Readonly<{ type: "start_item"; command: StartItemErasureCommand }>
  | Readonly<{ type: "start_journal"; command: StartWholeJournalErasureCommand }>
  | Readonly<{ type: "complete_item"; command: CompleteItemErasureCommand }>
  | Readonly<{ type: "complete_journal"; command: CompleteWholeJournalErasureCommand }>;

const cascadeSubsystems = [
  "timeline_revision",
  "derivative",
  "transcript",
  "extraction",
  "embedding",
  "ai_draft",
  "export",
  "media"
] as const satisfies readonly AstroDiaryCascadeSubsystem[];

export function executeAstroDiaryErasureCommand(
  unitOfWork: AstroDiaryCommandUnitOfWork,
  input: Readonly<{
    journalId: string;
    expectedJournalVersion: number;
    idempotencyKey: string;
    request: AstroDiaryErasureCommand;
  }>
): Promise<AstroDiaryCommandExecution> {
  if (
    (input.request.type === "start_journal" || input.request.type === "complete_journal") &&
    input.request.command.expectedJournalVersion !== input.expectedJournalVersion
  ) {
    throw new TypeError("AstroDiary erasure journal version must match the outer precondition");
  }
  return executeAstroDiaryCommand(
    unitOfWork,
    {
      journalId: input.journalId,
      idempotencyKey: input.idempotencyKey,
      preconditions: erasurePreconditions(input),
      envelope: {
        operation: "erase",
        actorUserId: input.request.command.actorUserId,
        actorRole:
          input.request.type === "start_item"
            ? input.request.command.actorRole
            : input.request.type === "start_journal"
              ? "client"
              : "system",
        request: semanticErasureRequest(input.request)
      }
    },
    (authority) => decideErasureCommand(authority, input.request)
  );
}

export function decideStartItemErasureCommand(
  authority: AstroDiaryCommandAuthority,
  input: StartItemErasureCommand
): AstroDiaryCommandDecision {
  const rejection = validateErasureAuthority(authority);
  if (rejection) return rejected(rejection);
  const item = authority.timelineItems.find(({ id }) => id === input.itemId);
  if (!item) return rejected("authority_not_found");
  if (item.authorRole !== input.actorRole) return rejected("actor_role_mismatch");
  const started = decideAstroDiaryItemErasure(item, {
    actorUserId: input.actorUserId,
    expectedRevision: input.expectedRevision,
    erasureCommandId: input.erasureCommandId,
    derivativeRedactionCommandId: input.derivativeRedactionCommandId,
    occurredAt: authority.commandAt
  });
  if (started.outcome !== "erasure_started") return rejected(started.code);
  return applied({
    ...emptyWriteSet(),
    journals: [bumpJournal(authority)],
    itemReadAccessRevocations: [started.readAccessRevocation],
    mediaAccessRevocations: started.mediaAccessRevocations.map((mediaId) => ({
      mediaId,
      itemId: item.id
    })),
    erasureCommands: [
      {
        commandId: started.erasureCommand.id,
        targetType: "item",
        targetId: item.id,
        state: "pending",
        sourceVersion: item.revision,
        sourceDigest: started.erasureCommand.sourceDigest,
        derivativeCommandId: started.derivativeRedaction.commandId,
        cascadeRequestId: null,
        requestedAt: authority.commandAt
      }
    ],
    derivativeCommands: [
      {
        commandId: started.derivativeRedaction.commandId,
        itemId: item.id,
        sourceRevision: item.revision,
        sourceDigest: started.erasureCommand.sourceDigest,
        operation: "redact"
      }
    ],
    events: [
      astroDiaryEvent({
        eventId: input.erasureRequestedEventId,
        eventType: "astro_diary.erasure_requested.v1",
        occurredAt: authority.commandAt,
        data: {
          journalId: authority.journal.id,
          journalEpochId: authority.journal.journalEpochId,
          commandId: input.erasureCommandId
        }
      })
    ]
  });
}

export function decideStartWholeJournalErasureCommand(
  authority: AstroDiaryCommandAuthority,
  input: StartWholeJournalErasureCommand
): AstroDiaryCommandDecision {
  const rejection = validateErasureAuthority(authority);
  if (rejection) return rejected(rejection);
  if (authority.subscription.id !== input.subscriptionId)
    return rejected("authority_scope_conflict");
  if (authority.media.some(({ journalId }) => journalId !== authority.journal.id)) {
    return rejected("authority_scope_conflict");
  }
  const cascadeInventoryError = validateCascadeInventory(authority.erasureAuthority.cascadeInventory);
  if (cascadeInventoryError) return rejected(cascadeInventoryError);
  const mediaIds = authority.media.filter(({ status }) => status !== "deleted").map(({ id }) => id);
  const started = requestWholeJournalErasure(authority.journal, {
    actorUserId: input.actorUserId,
    expectedJournalVersion: input.expectedJournalVersion,
    subscriptionId: input.subscriptionId,
    erasureRequestId: input.erasureRequestId,
    cascadeRequestId: input.cascadeRequestId,
    occurredAt: authority.commandAt,
    cycles: authority.cycles,
    obligations: authority.obligations,
    mediaIds,
    facts: {
      journalErasureRequestedFactId: input.factIds.journalErasureRequested,
      subscriptionEndRequestedFactId: input.factIds.subscriptionEndRequested,
      cycleClosedFactIds: input.factIds.cycleClosed,
      obligationClosedFactIds: input.factIds.obligationClosed
    }
  });
  if (started.outcome !== "erasure_started") return rejected(started.code);
  return applied({
    ...emptyWriteSet(),
    journals: [{ beforeVersion: authority.journal.version, after: started.journal }],
    cycles: started.cycles.map((cycle) => ({
      beforeVersion:
        authority.cycles.find(({ id }) => id === cycle.id)?.version ?? cycle.version - 1,
      after: cycle
    })),
    obligations: started.obligations.map((obligation) => ({
      beforeVersion:
        authority.obligations.find(({ id }) => id === obligation.id)?.version ??
        obligation.version - 1,
      after: obligation
    })),
    journalMediaAccessRevocations: started.mediaAccessRevocations,
    erasureCommands: [
      {
        commandId: started.erasureCommand.id,
        targetType: "journal",
        targetId: authority.journal.id,
        state: "pending",
        sourceVersion: started.erasureCommand.sourceJournalVersion,
        sourceDigest: null,
        derivativeCommandId: null,
        cascadeRequestId: started.erasureCommand.cascadeRequestId,
        requestedAt: authority.commandAt
      }
    ],
    subscriptionTransitions: [started.subscriptionTransition],
    cascadeCommands: [{ ...started.cascade, state: "pending" }],
    cascadeTargets: authority.erasureAuthority.cascadeInventory.map((target) => ({
      ...target,
      cascadeRequestId: started.cascade.cascadeRequestId,
      journalId: authority.journal.id
    })),
    erasureFacts: started.facts,
    events: [
      astroDiaryEvent({
        eventId: input.erasureRequestedEventId,
        eventType: "astro_diary.erasure_requested.v1",
        occurredAt: authority.commandAt,
        data: {
          journalId: authority.journal.id,
          journalEpochId: authority.journal.journalEpochId,
          commandId: input.erasureRequestId
        }
      })
    ]
  });
}

export function decideCompleteItemErasureCommand(
  authority: AstroDiaryCommandAuthority,
  input: Omit<CompleteItemErasureCommand, "actorUserId" | "itemId"> &
    Partial<Pick<CompleteItemErasureCommand, "actorUserId" | "itemId">>
): AstroDiaryCommandDecision {
  const rejection = validateErasureAuthority(authority);
  if (rejection) return rejected(rejection);
  const command = authority.erasureAuthority.commands.find(
    (candidate) => candidate.commandId === input.commandId
  );
  if (
    !command ||
    command.targetType !== "item" ||
    command.state !== "pending" ||
    command.sourceDigest === null ||
    command.derivativeCommandId === null ||
    (input.itemId !== undefined && input.itemId !== command.targetId)
  ) {
    return rejected("erasure_authority_not_found");
  }
  const item = authority.timelineItems.find(({ id }) => id === command.targetId);
  if (!item || item.kind === "tombstone") return rejected("authority_not_found");
  const receipts = authority.erasureAuthority.redactionReceipts.filter(
    (receipt) => receipt.commandId === command.commandId
  );
  const sources = receipts.filter(({ target }) => target === "source");
  const derivatives = receipts.filter(({ target }) => target === "derivative");
  const mediaReceipts = receipts.filter(({ target }) => target === "media");
  if (
    sources.length !== 1 ||
    derivatives.length !== 1 ||
    sources[0]?.mediaId !== null ||
    derivatives[0]?.mediaId !== null ||
    mediaReceipts.some(({ mediaId }) => mediaId === null) ||
    receipts.length !== sources.length + derivatives.length + mediaReceipts.length
  ) {
    return rejected("redaction_evidence_conflict");
  }
  const source = sources[0];
  const derivative = derivatives[0];
  if (!source || !derivative) return rejected("redaction_evidence_incomplete");
  if (new Set(receipts.map(({ receiptId }) => receiptId)).size !== receipts.length) {
    return rejected("redaction_evidence_conflict");
  }
  const completed = completeAstroDiaryItemErasure(item, {
    expectedRevision: input.expectedRevision,
    erasureCommand: {
      commandId: command.commandId,
      itemId: command.targetId,
      sourceRevision: command.sourceVersion,
      sourceDigest: command.sourceDigest,
      state: "pending"
    },
    sourceRedactionReceiptId: source.receiptId,
    derivativeRedactionReceiptId: derivative.receiptId,
    mediaRedactionReceipts: mediaReceipts
      .filter(
        (receipt): receipt is typeof receipt & { readonly mediaId: string } =>
          receipt.target === "media" && receipt.mediaId !== null
      )
      .map(({ mediaId, receiptId }) => ({ mediaId, receiptId })),
    completedAt: authority.commandAt
  });
  if (completed.outcome !== "erasure_completed") return rejected(completed.code);
  return applied({
    ...emptyWriteSet(),
    journals: [bumpJournal(authority)],
    timelineItems: [{ beforeRevision: item.revision, after: completed.tombstone }],
    erasureCommands: [
      {
        ...command,
        state: "completed"
      }
    ]
  });
}

export function decideCompleteWholeJournalErasureCommand(
  authority: AstroDiaryCommandAuthority,
  input: Omit<CompleteWholeJournalErasureCommand, "actorUserId"> &
    Partial<Pick<CompleteWholeJournalErasureCommand, "actorUserId">>
): AstroDiaryCommandDecision {
  const rejection = validateErasureAuthority(authority);
  if (rejection) return rejected(rejection);
  const command = authority.erasureAuthority.commands.find(
    (candidate) => candidate.commandId === input.commandId
  );
  if (
    !command ||
    command.targetType !== "journal" ||
    command.targetId !== authority.journal.id ||
    command.state !== "pending" ||
    command.cascadeRequestId === null
  ) {
    return rejected("erasure_authority_not_found");
  }
  const cascadeEvidence = validateCascadeEvidence(
    authority.erasureAuthority.cascadeTargets.filter(
      ({ cascadeRequestId }) => cascadeRequestId === command.cascadeRequestId
    ),
    authority.erasureAuthority.cascadeReceipts.filter(
      ({ cascadeRequestId }) => cascadeRequestId === command.cascadeRequestId
    ),
    command.cascadeRequestId,
    authority.journal.id
  );
  if (cascadeEvidence.outcome === "rejected") return cascadeEvidence;
  const completed = completeWholeJournalErasure(authority.journal, {
    expectedJournalVersion: input.expectedJournalVersion,
    erasureCommand: {
      id: command.commandId,
      journalId: command.targetId,
      sourceJournalVersion: command.sourceVersion,
      cascadeRequestId: command.cascadeRequestId,
      requestedAt: command.requestedAt,
      state: "pending",
      completedAt: null
    },
    cascadeReceipt: {
      cascadeRequestId: command.cascadeRequestId,
      journalId: authority.journal.id,
      completedAt: cascadeEvidence.completedAt
    }
  });
  if (completed.outcome !== "erasure_completed") return rejected(completed.code);
  return applied({
    ...emptyWriteSet(),
    journals: [{ beforeVersion: authority.journal.version, after: completed.journal }],
    erasureCommands: [{ ...command, state: "completed" }],
    cascadeCommands: [
      {
        cascadeRequestId: command.cascadeRequestId,
        journalId: authority.journal.id,
        state: "completed"
      }
    ]
  });
}

function validateCascadeInventory(
  inventory: readonly AstroDiaryCascadeTargetIdentity[]
): "cascade_evidence_incomplete" | "cascade_evidence_conflict" | null {
  const keys = inventory.map(cascadeTargetKey);
  if (new Set(keys).size !== keys.length) return "cascade_evidence_conflict";
  if (cascadeSubsystems.some((subsystem) => !inventory.some((target) => target.subsystem === subsystem))) {
    return "cascade_evidence_incomplete";
  }
  if (
    inventory.some(
      ({ targetId, sourceVersion, sourceDigest }) =>
        targetId.trim().length === 0 ||
        !Number.isSafeInteger(sourceVersion) ||
        sourceVersion < 1 ||
        !/^sha256:[a-f0-9]{64}$/.test(sourceDigest)
    )
  ) {
    return "cascade_evidence_conflict";
  }
  return null;
}

function validateCascadeEvidence(
  targets: readonly AstroDiaryCascadeTarget[],
  receipts: readonly AstroDiaryCascadeReceipt[],
  cascadeRequestId: string,
  journalId: string
):
  | Readonly<{ outcome: "valid"; completedAt: string }>
  | Readonly<{ outcome: "rejected"; code: "cascade_evidence_incomplete" | "cascade_evidence_conflict" }> {
  const inventoryError = validateCascadeInventory(targets);
  if (inventoryError) return { outcome: "rejected", code: inventoryError };
  if (
    targets.some(
      (target) => target.cascadeRequestId !== cascadeRequestId || target.journalId !== journalId
    ) ||
    receipts.some(
      (receipt) =>
        receipt.cascadeRequestId !== cascadeRequestId || receipt.journalId !== journalId
    )
  ) {
    return { outcome: "rejected", code: "cascade_evidence_conflict" };
  }
  const targetByKey = new Map(targets.map((target) => [cascadeTargetKey(target), target]));
  const receiptKeys = receipts.map(cascadeTargetKey);
  if (new Set(receiptKeys).size !== receiptKeys.length)
    return { outcome: "rejected", code: "cascade_evidence_conflict" };
  if (receipts.length < targets.length)
    return { outcome: "rejected", code: "cascade_evidence_incomplete" };
  if (receipts.length > targets.length)
    return { outcome: "rejected", code: "cascade_evidence_conflict" };
  for (const receipt of receipts) {
    const target = targetByKey.get(cascadeTargetKey(receipt));
    if (
      !target ||
      target.sourceVersion !== receipt.sourceVersion ||
      target.sourceDigest !== receipt.sourceDigest
    ) {
      return { outcome: "rejected", code: "cascade_evidence_conflict" };
    }
  }
  return {
    outcome: "valid",
    completedAt: receipts.reduce(
      (latest, receipt) => (receipt.completedAt > latest ? receipt.completedAt : latest),
      receipts[0]!.completedAt
    )
  };
}

function cascadeTargetKey(target: AstroDiaryCascadeTargetIdentity): string {
  return `${target.subsystem}:${target.targetId}`;
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

function applied(writeSet: AstroDiaryCommandWriteSet): AstroDiaryCommandDecision {
  return { outcome: "applied", writeSet };
}

function rejected(code: string): AstroDiaryCommandDecision {
  return { outcome: "rejected", code };
}

function validateErasureAuthority(authority: AstroDiaryCommandAuthority): string | null {
  const coherence = validateAstroDiaryCommandAuthority(authority);
  if (coherence) return coherence;
  const access = authorizeAstroDiaryOperation(authority.access, "erase");
  return access.outcome === "denied" ? access.code : null;
}

function erasurePreconditions(
  input: Readonly<{
    journalId: string;
    expectedJournalVersion: number;
    request: AstroDiaryErasureCommand;
  }>
): readonly AstroDiaryCommandPrecondition[] {
  return [
    {
      aggregate: "journal",
      id: input.journalId,
      expectedVersion: input.expectedJournalVersion
    },
    ...(input.request.type === "start_item" || input.request.type === "complete_item"
      ? [
          {
            aggregate: "timeline_item" as const,
            id: input.request.command.itemId,
            expectedVersion: input.request.command.expectedRevision
          }
        ]
      : [])
  ];
}

function semanticErasureRequest(request: AstroDiaryErasureCommand): CanonicalJson {
  switch (request.type) {
    case "start_item":
      return {
        type: request.type,
        itemId: request.command.itemId,
        expectedRevision: request.command.expectedRevision
      };
    case "start_journal":
      return {
        type: request.type,
        subscriptionId: request.command.subscriptionId,
        expectedJournalVersion: request.command.expectedJournalVersion
      };
    case "complete_item":
      return {
        type: request.type,
        commandId: request.command.commandId,
        itemId: request.command.itemId,
        expectedRevision: request.command.expectedRevision
      };
    case "complete_journal":
      return {
        type: request.type,
        commandId: request.command.commandId,
        expectedJournalVersion: request.command.expectedJournalVersion
      };
  }
}

function decideErasureCommand(
  authority: AstroDiaryCommandAuthority,
  request: AstroDiaryErasureCommand
): AstroDiaryCommandDecision {
  switch (request.type) {
    case "start_item":
      return decideStartItemErasureCommand(authority, request.command);
    case "start_journal":
      return decideStartWholeJournalErasureCommand(authority, request.command);
    case "complete_item":
      return decideCompleteItemErasureCommand(authority, request.command);
    case "complete_journal":
      return decideCompleteWholeJournalErasureCommand(authority, request.command);
  }
}
