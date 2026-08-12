import { authorizeAstroDiaryOperation } from "./astro-diary-access-policy";
import { advanceAstroDiaryReadCursor } from "./astro-diary-read-state";
import { validateAstroDiaryCommandAuthority } from "./astro-diary-commands";
import { Temporal } from "@js-temporal/polyfill";
import type {
  AstroDiaryCommandAuthority,
  AstroDiaryCommandDecision,
  AstroDiaryCommandExecution,
  AstroDiaryCommandUnitOfWork,
  AstroDiaryCommandWriteSet
} from "./ports/astro-diary-command-unit-of-work";
import { executeAstroDiaryCommand } from "./ports/astro-diary-command-unit-of-work";

export type MarkAstroDiaryReadCommand = Readonly<{
  actorUserId: string;
  actorRole: "client" | "astrologer";
  expectedCursorVersion: number | null;
}>;

export function executeMarkAstroDiaryReadCommand(
  unitOfWork: AstroDiaryCommandUnitOfWork,
  input: MarkAstroDiaryReadCommand &
    Readonly<{
      journalId: string;
      expectedJournalVersion: number;
      idempotencyKey: string;
    }>
): Promise<AstroDiaryCommandExecution> {
  const command: MarkAstroDiaryReadCommand = {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    expectedCursorVersion: input.expectedCursorVersion
  };
  return executeAstroDiaryCommand(
    unitOfWork,
    {
      journalId: input.journalId,
      envelope: {
        operation: "read",
        actorUserId: command.actorUserId,
        actorRole: command.actorRole,
        request: {
          command: "mark_read",
          expectedJournalVersion: input.expectedJournalVersion,
          expectedCursorVersion: command.expectedCursorVersion
        }
      },
      preconditions: [
        {
          aggregate: "journal",
          id: input.journalId,
          expectedVersion: input.expectedJournalVersion
        },
        {
          aggregate: "read_cursor",
          id: command.actorUserId,
          expectedVersion: command.expectedCursorVersion
        }
      ],
      idempotencyKey: input.idempotencyKey
    },
    (authority) => decideMarkAstroDiaryReadCommand(authority, command)
  );
}

/**
 * Advances to the server-locked visible watermark only. The browser neither chooses a cursor nor
 * receives a visible event; replay is owned by the command receipt around this pure decision.
 */
export function decideMarkAstroDiaryReadCommand(
  authority: AstroDiaryCommandAuthority,
  command: MarkAstroDiaryReadCommand
): AstroDiaryCommandDecision {
  const coherence = validateAstroDiaryCommandAuthority(authority);
  if (coherence) return rejected(coherence);
  const access = authorizeAstroDiaryOperation(authority.access, "read");
  if (access.outcome === "denied") return rejected(access.code);
  if (
    command.actorUserId !== authority.journal.clientUserId &&
    command.actorUserId !== authority.journal.astrologerUserId
  ) {
    return rejected("actor_scope_conflict");
  }
  const cursor = authority.readCursors?.find(
    (candidate) =>
      candidate.journalId === authority.journal.id &&
      candidate.participantUserId === command.actorUserId
  );
  if (!cursor) {
    if (command.expectedCursorVersion !== null) return rejected("authority_not_found");
    return applied({
      ...emptyWriteSet(),
      readCursors: [
        {
          beforeVersion: null,
          after: {
            journalId: authority.journal.id,
            participantUserId: command.actorUserId,
            lastReadCursor: authority.visibleMaxCursor,
            version: 1,
            updatedAt: Temporal.Instant.from(authority.commandAt).toString()
          }
        }
      ]
    });
  }
  if (command.expectedCursorVersion === null) return rejected("version_conflict");
  const advanced = advanceAstroDiaryReadCursor(cursor, {
    expectedVersion: command.expectedCursorVersion,
    nextReadCursor: authority.visibleMaxCursor,
    visibleMaxCursor: authority.visibleMaxCursor,
    updatedAt: authority.commandAt
  });
  if (advanced.outcome === "version_conflict") return rejected("version_conflict");
  if (advanced.outcome !== "applied") {
    if (advanced.outcome === "idempotent") return applied(emptyWriteSet());
    return rejected(advanced.outcome);
  }
  return applied({
    ...emptyWriteSet(),
    readCursors: [{ beforeVersion: cursor.version, after: advanced.cursor }]
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
