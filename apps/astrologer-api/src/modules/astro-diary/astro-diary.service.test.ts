import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AstroDiaryJournalReader } from "@elevenhouse/domain";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { AstroDiaryService } from "./astro-diary.service";

const astrologerUserId = "11111111-1111-4111-8111-111111111111";
const journalId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-08-14T12:00:00.000Z");

describe("AstroDiaryService", () => {
  it("lists only journals for the current authenticated astrologer", async () => {
    const reader = createReader({
      listAstrologerJournals: vi.fn(async () => ({
        journals: [journalSummary()],
        total: 1
      }))
    });
    const service = new AstroDiaryService(reader, clock());

    const response = await service.listJournals(request());

    expect(reader.listAstrologerJournals).toHaveBeenCalledWith({
      astrologerUserId,
      limit: 100,
      now: now.toISOString()
    });
    expect(response.total).toBe(1);
    expect(response.journals[0]?.journal.id).toBe(journalId);
  });

  it("requires an astrologer session", async () => {
    const service = new AstroDiaryService(createReader(), clock());

    await expect(
      service.listJournals({ currentAstrologerAccount: undefined })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function createReader(overrides: Partial<AstroDiaryJournalReader> = {}): AstroDiaryJournalReader {
  return {
    listAstrologerJournals: vi.fn(async () => ({ journals: [], total: 0 })),
    ...overrides
  };
}

function clock(): Pick<SystemClock, "now"> {
  return {
    now: () => now
  };
}

function request(): Pick<AstrologerSessionRequest, "currentAstrologerAccount"> {
  return {
    currentAstrologerAccount: {
      account: {
        id: astrologerUserId,
        status: "active",
        roles: ["astrologer"]
      }
    }
  };
}

function journalSummary() {
  return {
    journal: {
      id: journalId,
      relationshipId: "33333333-3333-4333-8333-333333333333",
      journalEpochId: "44444444-4444-4444-8444-444444444444",
      astrologerUserId,
      clientUserId: "55555555-5555-4555-8555-555555555555",
      state: "active",
      version: 1,
      createdAt: "2026-08-12T09:00:00Z"
    },
    currentCycle: null,
    currentObligation: null,
    access: {
      mode: "read_only",
      subscriptionId: "66666666-6666-4666-8666-666666666666",
      subscriptionState: "ended",
      currentPeriod: null,
      allowance: null
    },
    unreadCount: 0,
    visibleMaxCursor: 0
  } as const;
}
