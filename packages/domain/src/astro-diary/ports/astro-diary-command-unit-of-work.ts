import type {
  AstroDiaryCycle,
  AstroDiaryContextSnapshot,
  AstroDiaryDraft,
  AstroDiaryEvent,
  AstroDiaryJournal,
  AstroDiaryResponseObligation,
  AstroDiaryTimelineItem,
  ClientSubscriptionContract
} from "@elevenhouse/contracts";
import { sha256CanonicalJson, type CanonicalJson } from "../../calculations/canonical-json";
import type { ClientSubscriptionPeriodAllowance } from "../../client-subscriptions";
import type { ClientSubscription, ClientSubscriptionPeriod } from "../../client-subscriptions";
import type { AstroDiaryAccessAuthority, AstroDiaryOperation } from "../astro-diary-access-policy";
import type { AstroDiaryMediaAuthority } from "../astro-diary-drafts";
import type { AstroDiaryErasureDecisionFact } from "../astro-diary-erasure";

export type AstroDiaryCommandPrecondition =
  | Readonly<{
      aggregate: "journal" | "cycle" | "draft" | "timeline_item" | "obligation" | "allowance";
      id: string;
      expectedVersion: number;
    }>
  /** `null` is the explicit, receipt-bound CAS precondition for the first participant cursor. */
  | Readonly<{
      aggregate: "read_cursor";
      id: string;
      expectedVersion: number | null;
    }>;

export type AstroDiaryCascadeSubsystem =
  | "timeline_revision"
  | "derivative"
  | "transcript"
  | "extraction"
  | "embedding"
  | "ai_draft"
  | "export"
  | "media";

export type AstroDiaryCascadeTargetIdentity = Readonly<{
  subsystem: AstroDiaryCascadeSubsystem;
  targetId: string;
  sourceVersion: number;
  sourceDigest: `sha256:${string}`;
}>;

export type AstroDiaryCascadeTarget = AstroDiaryCascadeTargetIdentity &
  Readonly<{ cascadeRequestId: string; journalId: string }>;

export type AstroDiaryCascadeReceipt = AstroDiaryCascadeTarget &
  Readonly<{ receiptId: string; completedAt: string }>;

export type AstroDiaryCommandAuthority = Readonly<{
  access: AstroDiaryAccessAuthority;
  subscription: ClientSubscription;
  contract: ClientSubscriptionContract;
  activePeriod: ClientSubscriptionPeriod | null;
  commandAt: string;
  journal: AstroDiaryJournal;
  cycles: readonly AstroDiaryCycle[];
  drafts: readonly AstroDiaryDraft[];
  obligations: readonly AstroDiaryResponseObligation[];
  allowances: readonly ClientSubscriptionPeriodAllowance[];
  timelineItems: readonly AstroDiaryTimelineItem[];
  visibleMaxCursor: number;
  /** Locked per-participant cursor heads; omitted only in pure fixtures that do not decide reads. */
  readCursors?: readonly Readonly<{
    journalId: string;
    participantUserId: string;
    lastReadCursor: number;
    version: number;
    updatedAt: string;
  }>[];
  media: readonly AstroDiaryMediaAuthority[];
  erasureAuthority: Readonly<{
    commands: readonly Readonly<{
      commandId: string;
      targetType: "item" | "journal";
      targetId: string;
      state: "pending" | "completed";
      sourceVersion: number;
      sourceDigest: `sha256:${string}` | null;
      derivativeCommandId: string | null;
      cascadeRequestId: string | null;
      requestedAt: string;
    }>[];
    redactionReceipts: readonly Readonly<{
      receiptId: string;
      commandId: string;
      target: "source" | "derivative" | "media";
      mediaId: string | null;
    }>[];
    cascadeInventory: readonly AstroDiaryCascadeTargetIdentity[];
    cascadeTargets: readonly AstroDiaryCascadeTarget[];
    cascadeReceipts: readonly AstroDiaryCascadeReceipt[];
  }>;
}>;

export type AstroDiaryVersionedEffect<Value> = Readonly<{
  beforeVersion: number | null;
  after: Value | null;
}>;

export type AstroDiaryDraftEffect =
  | Readonly<{ draftId: string; beforeVersion: number | null; after: AstroDiaryDraft }>
  | Readonly<{ draftId: string; beforeVersion: number; after: null }>;

export type AstroDiaryCommandWriteSet = Readonly<{
  journals: readonly AstroDiaryVersionedEffect<AstroDiaryJournal>[];
  cycles: readonly AstroDiaryVersionedEffect<AstroDiaryCycle>[];
  drafts: readonly AstroDiaryDraftEffect[];
  obligations: readonly AstroDiaryVersionedEffect<AstroDiaryResponseObligation>[];
  allowances: readonly AstroDiaryVersionedEffect<ClientSubscriptionPeriodAllowance>[];
  timelineItems: readonly Readonly<{
    beforeRevision: number | null;
    after: AstroDiaryTimelineItem;
  }>[];
  mediaBindings: readonly Readonly<{ mediaId: string; itemId: string }>[];
  mediaReleases: readonly Readonly<{ mediaId: string; itemId: string }>[];
  mediaAccessRevocations: readonly Readonly<{ mediaId: string; itemId: string }>[];
  journalMediaAccessRevocations: readonly Readonly<{
    mediaId: string;
    journalId: string;
  }>[];
  itemReadAccessRevocations: readonly Readonly<{
    itemId: string;
    sourceRevision: number;
  }>[];
  contextSnapshots: readonly AstroDiaryVersionedEffect<AstroDiaryContextSnapshot>[];
  contextInvalidations: readonly Readonly<{
    itemId: string;
    previousRevision: number;
    nextRevision: number;
  }>[];
  derivativeCommands: readonly Readonly<{
    commandId: string;
    itemId: string;
    sourceRevision: number;
    sourceDigest: `sha256:${string}`;
    operation: "generate" | "redact";
  }>[];
  erasureCommands: readonly Readonly<{
    commandId: string;
    targetType: "item" | "journal";
    targetId: string;
    state: "pending" | "completed";
    sourceVersion: number;
    sourceDigest: `sha256:${string}` | null;
    derivativeCommandId: string | null;
    cascadeRequestId: string | null;
    requestedAt: string;
  }>[];
  subscriptionTransitions: readonly Readonly<{
    subscriptionId: string;
    kind: "schedule_end_no_renewal";
  }>[];
  cascadeCommands: readonly Readonly<{
    cascadeRequestId: string;
    journalId: string;
    state: "pending" | "completed";
  }>[];
  cascadeTargets: readonly AstroDiaryCascadeTarget[];
  erasureFacts: readonly AstroDiaryErasureDecisionFact[];
  readCursors: readonly AstroDiaryVersionedEffect<
    Readonly<{
      journalId: string;
      participantUserId: string;
      lastReadCursor: number;
      version: number;
      updatedAt: string;
    }>
  >[];
  events: readonly AstroDiaryEvent[];
}>;

export type AstroDiaryCommandDecision =
  | Readonly<{ outcome: "applied"; writeSet: AstroDiaryCommandWriteSet }>
  | Readonly<{ outcome: "rejected"; code: string }>;

export type AstroDiaryCommandAllocatedResource = Readonly<{
  type: "draft";
  draftId: string;
}>;

export type AstroDiaryCommandResultResource = AstroDiaryCommandAllocatedResource &
  Readonly<{ version: number }>;

export type AstroDiaryCommandReceipt = Readonly<{
  journalId: string;
  idempotencyKey: string;
  requestHash: `sha256:${string}`;
  preconditions: readonly AstroDiaryCommandPrecondition[];
  result:
    | Readonly<{
        outcome: "applied";
        eventIds: readonly string[];
        resource: AstroDiaryCommandResultResource | null;
      }>
    | Readonly<{ outcome: "rejected"; code: string }>;
}>;

export type AstroDiaryCommandStableResult = AstroDiaryCommandReceipt["result"];

export type AstroDiaryCommandPersistedResult =
  | Readonly<{
      outcome: "applied";
      response: Extract<AstroDiaryCommandStableResult, { outcome: "applied" }>;
      writeSet: AstroDiaryCommandWriteSet;
      receipt: AstroDiaryCommandReceipt;
    }>
  | Readonly<{ outcome: "rejected"; code: string; receipt: AstroDiaryCommandReceipt }>;

export type AstroDiaryCommandExecution =
  | AstroDiaryCommandPersistedResult
  | Readonly<{ outcome: "replayed"; result: AstroDiaryCommandStableResult }>
  | Readonly<{
      outcome: "version_conflict";
      aggregate: AstroDiaryCommandPrecondition["aggregate"];
      id: string;
      expectedVersion: number | null;
      currentVersion: number;
    }>
  | Readonly<{ outcome: "idempotency_conflict" | "not_found" }>;

export type AstroDiaryCommandPrivateResourceScope = Readonly<{
  ownerUserId: string;
  ownerRole: "client" | "astrologer";
  draftIds: readonly string[];
  mediaIds: readonly string[];
}>;

type AstroDiaryCommandUnitOfWorkBaseInput = Readonly<{
  journalId: string;
  envelope: AstroDiaryCommandEnvelope;
  preconditions: readonly AstroDiaryCommandPrecondition[];
  idempotencyKey: string;
  requestHash: `sha256:${string}`;
  privateResourceScope: AstroDiaryCommandPrivateResourceScope | null;
  resultResource?: Readonly<{ type: "draft"; draftId: string }> | null;
}>;

export type AstroDiaryCommandUnitOfWorkInput =
  | (AstroDiaryCommandUnitOfWorkBaseInput &
      Readonly<{
        resourceAllocation: null;
        decide: (
          authority: AstroDiaryCommandAuthority,
          envelope: AstroDiaryCommandEnvelope,
          allocation: null
        ) => AstroDiaryCommandDecision;
      }>)
  | (AstroDiaryCommandUnitOfWorkBaseInput &
      Readonly<{
        resourceAllocation: Readonly<{ type: "draft" }>;
        decide: (
          authority: AstroDiaryCommandAuthority,
          envelope: AstroDiaryCommandEnvelope,
          allocation: AstroDiaryCommandAllocatedResource
        ) => AstroDiaryCommandDecision;
      }>);

export type AstroDiaryCommandUnitOfWork = Readonly<{
  /**
   * Locks by journal/key and resolves an immutable receipt first. Without a receipt it rehydrates
   * authority, conceals out-of-scope private resources before CAS, invokes the pure decision, then
   * atomically persists its exact write-set, IDs-only outbox events and body-free receipt.
   * Transient lookup/CAS failures are not sealed.
   */
  execute(input: AstroDiaryCommandUnitOfWorkInput): Promise<AstroDiaryCommandExecution>;
}>;

export type AstroDiaryCommandEnvelope = Readonly<{
  operation: AstroDiaryOperation;
  actorUserId: string;
  actorRole: "client" | "astrologer" | "system";
  request: CanonicalJson;
}>;

export function executeAstroDiaryCommand(
  unitOfWork: AstroDiaryCommandUnitOfWork,
  input: {
    readonly journalId: string;
    readonly envelope: AstroDiaryCommandEnvelope;
    readonly preconditions: readonly AstroDiaryCommandPrecondition[];
    readonly idempotencyKey: string;
    readonly privateResourceScope?: AstroDiaryCommandPrivateResourceScope | null;
  },
  decide: (
    authority: AstroDiaryCommandAuthority,
    envelope: AstroDiaryCommandEnvelope
  ) => AstroDiaryCommandDecision
): Promise<AstroDiaryCommandExecution> {
  const preconditions = [...input.preconditions].sort((left, right) =>
    `${left.aggregate}:${left.id}`.localeCompare(`${right.aggregate}:${right.id}`)
  );
  const unique = new Set(preconditions.map(({ aggregate, id }) => `${aggregate}:${id}`));
  if (unique.size !== preconditions.length) {
    throw new TypeError("AstroDiary command preconditions must be unique by aggregate and ID");
  }
  const journalPreconditions = preconditions.filter(
    ({ aggregate, id }) => aggregate === "journal" && id === input.journalId
  );
  if (journalPreconditions.length !== 1) {
    throw new TypeError("AstroDiary commands require the target journal CAS precondition");
  }
  return unitOfWork.execute({
    journalId: input.journalId,
    envelope: input.envelope,
    preconditions,
    idempotencyKey: input.idempotencyKey,
    resourceAllocation: null,
    privateResourceScope: input.privateResourceScope ?? null,
    resultResource: null,
    requestHash: hashAstroDiaryCommandIntent(input.journalId, input.envelope),
    decide: (authority, envelope) => decide(authority, envelope)
  });
}

export function executeAstroDiaryDraftCreateCommand(
  unitOfWork: AstroDiaryCommandUnitOfWork,
  input: {
    readonly journalId: string;
    readonly envelope: AstroDiaryCommandEnvelope;
    readonly preconditions: readonly AstroDiaryCommandPrecondition[];
    readonly idempotencyKey: string;
    readonly privateResourceScope?: AstroDiaryCommandPrivateResourceScope | null;
  },
  decide: (
    authority: AstroDiaryCommandAuthority,
    envelope: AstroDiaryCommandEnvelope,
    allocation: AstroDiaryCommandAllocatedResource
  ) => AstroDiaryCommandDecision
): Promise<AstroDiaryCommandExecution> {
  const preconditions = normalizeAstroDiaryCommandPreconditions(
    input.journalId,
    input.preconditions
  );
  return unitOfWork.execute({
    journalId: input.journalId,
    envelope: input.envelope,
    preconditions,
    idempotencyKey: input.idempotencyKey,
    requestHash: hashAstroDiaryCommandIntent(input.journalId, input.envelope),
    resourceAllocation: { type: "draft" },
    privateResourceScope: input.privateResourceScope ?? null,
    resultResource: null,
    decide
  });
}

export function executeAstroDiaryDraftMutationCommand(
  unitOfWork: AstroDiaryCommandUnitOfWork,
  input: {
    readonly journalId: string;
    readonly draftId: string;
    readonly envelope: AstroDiaryCommandEnvelope;
    readonly preconditions: readonly AstroDiaryCommandPrecondition[];
    readonly idempotencyKey: string;
    readonly privateResourceScope?: AstroDiaryCommandPrivateResourceScope | null;
  },
  decide: (
    authority: AstroDiaryCommandAuthority,
    envelope: AstroDiaryCommandEnvelope
  ) => AstroDiaryCommandDecision
): Promise<AstroDiaryCommandExecution> {
  const preconditions = normalizeAstroDiaryCommandPreconditions(
    input.journalId,
    input.preconditions
  );
  return unitOfWork.execute({
    journalId: input.journalId,
    envelope: input.envelope,
    preconditions,
    idempotencyKey: input.idempotencyKey,
    requestHash: hashAstroDiaryCommandIntent(input.journalId, input.envelope),
    resourceAllocation: null,
    privateResourceScope: input.privateResourceScope ?? null,
    resultResource: { type: "draft", draftId: input.draftId },
    decide: (authority, envelope) => decide(authority, envelope)
  });
}

export function buildAstroDiaryCommandAppliedResult(
  writeSet: AstroDiaryCommandWriteSet,
  allocation: AstroDiaryCommandAllocatedResource | null,
  requestedResult: Readonly<{ type: "draft"; draftId: string }> | null = null
): Extract<AstroDiaryCommandStableResult, { outcome: "applied" }> {
  const createdDrafts = writeSet.drafts.filter(
    (
      effect
    ): effect is AstroDiaryDraftEffect & {
      readonly draftId: string;
      readonly beforeVersion: null;
      readonly after: AstroDiaryDraft;
    } => effect.beforeVersion === null && effect.after !== null
  );
  if (allocation === null && requestedResult === null) {
    if (createdDrafts.length > 0) {
      throw new TypeError("AstroDiary draft creation requires a server resource allocation");
    }
    return {
      outcome: "applied",
      eventIds: writeSet.events.map(({ eventId }) => eventId),
      resource: null
    };
  }
  if (allocation === null) {
    const effect = writeSet.drafts.find(
      (candidate) =>
        (candidate.after?.id ?? ("draftId" in candidate ? candidate.draftId : null)) ===
        requestedResult!.draftId
    );
    const version = effect?.after?.version ?? effect?.beforeVersion ?? null;
    if (!effect || version === null) {
      throw new TypeError("AstroDiary draft mutation result lacks its exact version effect");
    }
    return {
      outcome: "applied",
      eventIds: writeSet.events.map(({ eventId }) => eventId),
      resource: { ...requestedResult!, version }
    };
  }
  const created = createdDrafts.find(({ after }) => after.id === allocation.draftId);
  if (createdDrafts.length !== 1 || !created || created.after.version !== 1) {
    throw new TypeError(
      "AstroDiary server draft allocation must bind exactly one version-1 draft creation"
    );
  }
  return {
    outcome: "applied",
    eventIds: writeSet.events.map(({ eventId }) => eventId),
    resource: { ...allocation, version: created.after.version }
  };
}

function normalizeAstroDiaryCommandPreconditions(
  journalId: string,
  input: readonly AstroDiaryCommandPrecondition[]
): readonly AstroDiaryCommandPrecondition[] {
  const preconditions = [...input].sort((left, right) =>
    `${left.aggregate}:${left.id}`.localeCompare(`${right.aggregate}:${right.id}`)
  );
  const unique = new Set(preconditions.map(({ aggregate, id }) => `${aggregate}:${id}`));
  if (unique.size !== preconditions.length) {
    throw new TypeError("AstroDiary command preconditions must be unique by aggregate and ID");
  }
  const journalPreconditions = preconditions.filter(
    ({ aggregate, id }) => aggregate === "journal" && id === journalId
  );
  if (journalPreconditions.length !== 1) {
    throw new TypeError("AstroDiary commands require the target journal CAS precondition");
  }
  return preconditions;
}

function hashAstroDiaryCommandIntent(
  journalId: string,
  envelope: AstroDiaryCommandEnvelope
): `sha256:${string}` {
  return sha256CanonicalJson({ journalId, envelope });
}
