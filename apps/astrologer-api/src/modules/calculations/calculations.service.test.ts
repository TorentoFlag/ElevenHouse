import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { CalculationRecord, CalculationStore } from "@elevenhouse/domain";
import { CalculationsService } from "./calculations.service";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";

const now = new Date("2026-07-06T00:00:00.000Z");
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const calculationId = "6e83d5f9-2cd1-4d09-b7f4-3162c29ed05b";
const clientId = "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e";

describe("CalculationsService", () => {
  it("rejects linking a manual-only calculation to a client", async () => {
    const store = createStore([manualCalculation()]);
    const service = new CalculationsService(store, { now: () => now } as SystemClock);

    await expect(
      service.linkClient(calculationId, { clientId }, request())
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.linkClient).not.toHaveBeenCalled();
  });
});

function createStore(records: readonly CalculationRecord[]): CalculationStore {
  return {
    listByOwner: vi.fn(async () => ({ calculations: records, total: records.length })),
    findByOwnerAndId: vi.fn(
      async (input) =>
        records.find(
          (record) =>
            record.ownerUserId === input.ownerUserId && record.id === input.calculationId
        ) ?? null
    ),
    create: vi.fn(async () => raise("Unexpected create call")),
    appendVersion: vi.fn(async () => raise("Unexpected append call")),
    linkClient: vi.fn(async () => raise("Unexpected link call")),
    publishClientLink: vi.fn(async () => raise("Unexpected publish call")),
    saveInterpretation: vi.fn(async () => raise("Unexpected save interpretation call")),
    approveInterpretation: vi.fn(async () => raise("Unexpected approve interpretation call")),
    archive: vi.fn(async () => raise("Unexpected archive call"))
  };
}

function manualCalculation(): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "numerology",
    mode: "individual",
    methodCode: "pythagorean",
    currentMethodVersion: "1.0.0",
    title: "Manual calculation",
    status: "calculated",
    participants: [
      {
        role: "subject",
        source: "manual",
        clientId: null,
        displayName: "Мария Иванова",
        birthDate: "1990-03-14",
        inputSnapshot: {},
        manuallyOverridden: false
      }
    ],
    versions: [
      {
        id: "ba5ed13f-f2f4-4249-bfdd-03932b9001a0",
        versionNumber: 1,
        methodVersion: "1.0.0",
        settingsSnapshot: {},
        inputSnapshot: {},
        resultSnapshot: { methodCode: "pythagorean" },
        resultSummary: {},
        resultChecksum: "checksum",
        createdAt: now.toISOString()
      }
    ],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function request(): AstrologerSessionRequest {
  return {
    currentAstrologerAccount: {
      account: {
        id: ownerUserId
      }
    }
  } as AstrologerSessionRequest;
}

function raise(message: string): never {
  throw new Error(message);
}
