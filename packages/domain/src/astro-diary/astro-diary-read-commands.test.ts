import { describe, expect, it } from "vitest";

import {
  activeSubscription,
  runtimeId
} from "../client-subscriptions/client-subscription-test-fixtures";

import { decideMarkAstroDiaryReadCommand } from "./astro-diary-read-commands";
import type { AstroDiaryCommandAuthority } from "./ports/astro-diary-command-unit-of-work";

const journalId = runtimeId(700);

function commandAuthority(
  overrides: Omit<Partial<AstroDiaryCommandAuthority>, "access"> & {
    access?: Partial<AstroDiaryCommandAuthority["access"]>;
  } = {}
): AstroDiaryCommandAuthority {
  const subscription = activeSubscription();
  return {
    access: {
      relationshipState: "active",
      entitlementState: "active",
      financeDenied: false,
      journalState: "active",
      hasOpenCycle: false,
      hasOpenResponseObligation: false,
      ...overrides.access
    },
    subscription,
    contract: subscription.contract,
    activePeriod: subscription.paidPeriods[0]!,
    commandAt: overrides.commandAt ?? "2026-02-01T10:00:00Z",
    journal: {
      id: journalId,
      relationshipId: subscription.contract.relationshipId,
      journalEpochId: subscription.journalEpochId,
      astrologerUserId: subscription.contract.astrologerUserId,
      clientUserId: subscription.contract.clientUserId,
      state: "active",
      version: 2,
      createdAt: "2026-02-01T09:00:00Z"
    },
    cycles: [],
    drafts: [],
    obligations: [],
    allowances: [],
    timelineItems: [],
    visibleMaxCursor: overrides.visibleMaxCursor ?? 0,
    readCursors: overrides.readCursors,
    media: [],
    erasureAuthority: {
      commands: [],
      redactionReceipts: [],
      cascadeInventory: [],
      cascadeTargets: [],
      cascadeReceipts: []
    }
  };
}

describe("AstroDiary mark-read command", () => {
  it("creates the first participant cursor only from the explicit absent-head CAS", () => {
    const authority = commandAuthority({ visibleMaxCursor: 7 });

    expect(
      decideMarkAstroDiaryReadCommand(authority, {
        actorUserId: authority.journal.clientUserId,
        actorRole: "client",
        expectedCursorVersion: null
      })
    ).toMatchObject({
      outcome: "applied",
      writeSet: {
        readCursors: [
          {
            beforeVersion: null,
            after: {
              journalId: authority.journal.id,
              participantUserId: authority.journal.clientUserId,
              lastReadCursor: 7,
              version: 1
            }
          }
        ]
      }
    });
  });

  it("uses the locked visible watermark and cursor CAS without creating visible events", () => {
    const base = commandAuthority({ visibleMaxCursor: 7 });
    const authority = {
      ...base,
      readCursors: [
        {
          journalId,
          participantUserId: base.journal.clientUserId,
          lastReadCursor: 3,
          version: 1,
          updatedAt: "2026-08-12T09:00:00Z"
        }
      ]
    };

    expect(
      decideMarkAstroDiaryReadCommand(authority, {
        actorUserId: authority.journal.clientUserId,
        actorRole: "client",
        expectedCursorVersion: 1
      })
    ).toMatchObject({
      outcome: "applied",
      writeSet: {
        journals: [],
        readCursors: [
          {
            beforeVersion: 1,
            after: {
              participantUserId: authority.journal.clientUserId,
              lastReadCursor: 7,
              version: 2
            }
          }
        ],
        events: []
      }
    });
  });

  it("fails closed for a missing cursor snapshot, stale CAS, or foreign participant", () => {
    const authority = commandAuthority({ visibleMaxCursor: 7 });
    expect(
      decideMarkAstroDiaryReadCommand(authority, {
        actorUserId: authority.journal.clientUserId,
        actorRole: "client",
        expectedCursorVersion: 1
      })
    ).toEqual({ outcome: "rejected", code: "authority_not_found" });

    const withCursor = {
      ...authority,
      readCursors: [
        {
          journalId: authority.journal.id,
          participantUserId: authority.journal.clientUserId,
          lastReadCursor: 3,
          version: 2,
          updatedAt: authority.commandAt
        }
      ]
    };
    expect(
      decideMarkAstroDiaryReadCommand(withCursor, {
        actorUserId: authority.journal.clientUserId,
        actorRole: "client",
        expectedCursorVersion: 1
      })
    ).toEqual({ outcome: "rejected", code: "version_conflict" });
    expect(
      decideMarkAstroDiaryReadCommand(withCursor, {
        actorUserId: "10000000-0000-4000-8000-000000000099",
        actorRole: "client",
        expectedCursorVersion: 2
      })
    ).toEqual({ outcome: "rejected", code: "actor_scope_conflict" });
  });
});
