import { describe, expect, it } from "vitest";
import type { AstroDiaryJournal } from "@elevenhouse/contracts";
import { activeSubscription } from "../client-subscriptions/client-subscription-test-fixtures";
import {
  buildAstroDiaryCommandAppliedResult,
  executeAstroDiaryCommand,
  executeAstroDiaryDraftCreateCommand,
  type AstroDiaryCommandAuthority,
  type AstroDiaryCommandExecution,
  type AstroDiaryCommandPersistedResult,
  type AstroDiaryCommandUnitOfWork
} from "./ports/astro-diary-command-unit-of-work";

const id = (value: number): string =>
  `70000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const journal: AstroDiaryJournal = {
  id: id(1),
  relationshipId: id(2),
  journalEpochId: id(3),
  astrologerUserId: id(4),
  clientUserId: id(5),
  state: "active",
  version: 2,
  createdAt: "2026-08-12T09:00:00Z"
};
const subscription = activeSubscription();
const authority: AstroDiaryCommandAuthority = {
  access: {
    relationshipState: "active",
    entitlementState: "ended",
    financeDenied: false,
    journalState: "active",
    hasOpenCycle: true,
    hasOpenResponseObligation: true
  },
  subscription,
  contract: subscription.contract,
  activePeriod: subscription.paidPeriods[0]!,
  commandAt: "2026-02-01T10:00:00Z",
  journal,
  cycles: [],
  drafts: [],
  obligations: [],
  allowances: [],
  timelineItems: [],
  visibleMaxCursor: 0,
  media: [],
  erasureAuthority: {
    commands: [],
    redactionReceipts: [],
    cascadeInventory: [],
    cascadeTargets: [],
    cascadeReceipts: []
  }
};
const preconditions = [
  { aggregate: "journal", id: journal.id, expectedVersion: 2 },
  { aggregate: "cycle", id: id(6), expectedVersion: 3 }
] as const;
const input = {
  journalId: journal.id,
  preconditions,
  idempotencyKey: "publish-closing-reply",
  envelope: {
    operation: "close",
    actorUserId: journal.astrologerUserId,
    actorRole: "astrologer",
    request: { operation: "publish_closing_reply", itemId: id(7) }
  }
} as const;
const sortedPreconditions = [preconditions[1], preconditions[0]] as const;
const emptyWriteSet = {
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
} as const;

describe("AstroDiaryCommandUnitOfWork boundary", () => {
  it("decides from locked authority and replays an atomic body-free receipt", async () => {
    const port = new AtomicDiaryMemoryUnitOfWork();
    const applied = await executeAstroDiaryCommand(port, input, (locked, envelope) => {
      expect(locked).toBe(authority);
      expect(envelope).toBe(input.envelope);
      return { outcome: "applied", writeSet: emptyWriteSet };
    });
    if (applied.outcome !== "applied") throw new Error("expected applied command");
    expect(applied).toMatchObject({
      outcome: "applied",
      receipt: {
        journalId: journal.id,
        preconditions: sortedPreconditions,
        result: { outcome: "applied", eventIds: [] }
      }
    });
    expect(
      await executeAstroDiaryCommand(port, input, () => ({ outcome: "rejected", code: "x" }))
    ).toEqual({ outcome: "replayed", result: applied.receipt.result });
    expect(JSON.stringify(applied).includes("Первый вариант")).toBe(false);
  });

  it("binds an idempotency key to the complete CAS precondition set", async () => {
    const port = new AtomicDiaryMemoryUnitOfWork();
    await executeAstroDiaryCommand(port, input, () => ({
      outcome: "rejected",
      code: "cycle_state_mismatch"
    }));
    await expect(
      executeAstroDiaryCommand(
        port,
        {
          ...input,
          preconditions: [preconditions[0], { ...preconditions[1], expectedVersion: 4 }]
        },
        () => ({ outcome: "rejected", code: "cycle_state_mismatch" })
      )
    ).resolves.toEqual({ outcome: "idempotency_conflict" });
  });

  it("allocates a draft identity once inside the UOW and replays its body-free resource result", async () => {
    const port = new AtomicDiaryMemoryUnitOfWork();
    const draftBody = "Текст остаётся только в draft write-set";
    const createInput = {
      ...input,
      idempotencyKey: "create-client-draft",
      envelope: {
        operation: "edit" as const,
        actorUserId: journal.clientUserId,
        actorRole: "client" as const,
        request: { operation: "create_draft" }
      }
    };
    const applied = await executeAstroDiaryDraftCreateCommand(
      port,
      createInput,
      (_locked, _envelope, allocation) => ({
        outcome: "applied",
        writeSet: {
          ...emptyWriteSet,
          drafts: [
            {
              draftId: allocation.draftId,
              beforeVersion: null,
              after: {
                id: allocation.draftId,
                journalId: journal.id,
                cycleId: null,
                authorUserId: journal.clientUserId,
                authorRole: "client",
                kind: "client_entry",
                version: 1,
                body: draftBody,
                attachmentIds: [],
                moodId: null,
                correctsItemId: null,
                updatedAt: authority.commandAt
              }
            }
          ]
        }
      })
    );
    if (applied.outcome !== "applied") throw new Error("expected applied draft create");
    expect(applied.response).toEqual({
      outcome: "applied",
      eventIds: [],
      resource: { type: "draft", draftId: id(900), version: 1 }
    });
    expect(port.allocations).toBe(1);

    const replayed = await executeAstroDiaryDraftCreateCommand(port, createInput, () => {
      throw new Error("replay must not allocate or decide again");
    });
    expect(replayed).toEqual({ outcome: "replayed", result: applied.receipt.result });
    expect(port.allocations).toBe(1);
    expect(JSON.stringify(replayed).includes(draftBody)).toBe(false);
  });

  it("does not seal not-found or version-conflict transient outcomes", async () => {
    const port = new AtomicDiaryMemoryUnitOfWork();
    port.transient = { outcome: "not_found" };
    expect(
      await executeAstroDiaryCommand(port, input, () => ({ outcome: "rejected", code: "x" }))
    ).toEqual({ outcome: "not_found" });
    port.transient = {
      outcome: "version_conflict",
      aggregate: "cycle",
      id: id(6),
      expectedVersion: 3,
      currentVersion: 4
    };
    expect(
      await executeAstroDiaryCommand(port, input, () => ({ outcome: "rejected", code: "x" }))
    ).toEqual(port.transient);
  });
});

class AtomicDiaryMemoryUnitOfWork implements AstroDiaryCommandUnitOfWork {
  allocations = 0;
  transient:
    | { readonly outcome: "not_found" }
    | Extract<AstroDiaryCommandExecution, { outcome: "version_conflict" }>
    | null = null;
  private receipt: AstroDiaryCommandPersistedResult | null = null;

  async execute(
    command: Parameters<AstroDiaryCommandUnitOfWork["execute"]>[0]
  ): Promise<AstroDiaryCommandExecution> {
    if (this.receipt) {
      return this.receipt.receipt.requestHash === command.requestHash
        ? { outcome: "replayed", result: this.receipt.receipt.result }
        : { outcome: "idempotency_conflict" };
    }
    if (this.transient) return this.transient;
    const allocation =
      command.resourceAllocation === null
        ? null
        : { type: "draft" as const, draftId: id(900 + this.allocations++) };
    const decision =
      command.resourceAllocation === null
        ? command.decide(authority, command.envelope, null)
        : command.decide(authority, command.envelope, allocation!);
    if (decision.outcome === "applied") {
      const response = buildAstroDiaryCommandAppliedResult(decision.writeSet, allocation);
      const receipt = {
        journalId: command.journalId,
        idempotencyKey: command.idempotencyKey,
        requestHash: command.requestHash,
        preconditions: command.preconditions,
        result: response
      };
      const result = {
        outcome: "applied" as const,
        response,
        writeSet: decision.writeSet,
        receipt
      };
      this.receipt = result;
      return result;
    }
    const receipt = {
      journalId: command.journalId,
      idempotencyKey: command.idempotencyKey,
      requestHash: command.requestHash,
      preconditions: command.preconditions,
      result: decision
    };
    const result = { ...decision, receipt };
    this.receipt = result;
    return result;
  }
}
