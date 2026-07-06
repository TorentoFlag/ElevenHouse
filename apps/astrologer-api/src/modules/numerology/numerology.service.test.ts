import { describe, expect, it, vi } from "vitest";
import type { CalculationRecord, CalculationStore } from "@elevenhouse/domain";
import { numerologyCalculationResponseSchema } from "@elevenhouse/contracts";
import { NumerologyService } from "./numerology.service";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";

const now = new Date("2026-07-06T00:00:00.000Z");
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";

describe("NumerologyService", () => {
  it("creates a saved Pythagorean individual calculation response", async () => {
    const store = createCreateOnlyCalculationStore();
    const service = new NumerologyService(store, { now: () => now } as SystemClock);

    const response = await service.createCalculation(validIndividualBody(), request());

    numerologyCalculationResponseSchema.parse(response);
    expect(response.calculation).toMatchObject({
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      status: "calculated"
    });
    expect(response.currentVersion.resultChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(response.resultSnapshot).toMatchObject({
      methodCode: "pythagorean",
      keyNumbers: { lifePath: 9 }
    });
    expect(store.create).toHaveBeenCalledOnce();
  });
});

function createCreateOnlyCalculationStore(): CalculationStore {
  return {
    listByOwner: vi.fn(async () => ({ calculations: [], total: 0 })),
    findByOwnerAndId: vi.fn(async () => null),
    create: vi.fn(async (input) => {
      const record: CalculationRecord = {
        id: input.idGenerator(),
        ownerUserId: input.ownerUserId,
        module: input.module,
        mode: input.mode,
        methodCode: input.methodCode,
        currentMethodVersion: input.methodVersion,
        title: input.title,
        status: "calculated",
        participants: input.participants,
        versions: [
          {
            id: input.versionIdGenerator(),
            versionNumber: 1,
            methodVersion: input.methodVersion,
            settingsSnapshot: input.settingsSnapshot,
            inputSnapshot: input.inputSnapshot,
            resultSnapshot: input.resultSnapshot,
            resultSummary: input.resultSummary,
            resultChecksum: input.resultChecksum,
            createdAt: input.now
          }
        ],
        links: [],
        interpretations: [],
        artifacts: [],
        createdAt: input.now,
        updatedAt: input.now
      };
      return record;
    }),
    appendVersion: vi.fn(async () => null),
    linkClient: vi.fn(async () => null),
    publishClientLink: vi.fn(async () => null),
    saveInterpretation: vi.fn(async () => null),
    approveInterpretation: vi.fn(async () => null),
    archive: vi.fn(async () => null)
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

function validIndividualBody(): Record<string, unknown> {
  return {
    mode: "individual",
    methodCode: "pythagorean",
    title: "Мария, психоматрица",
    participants: [
      {
        role: "subject",
        source: "manual",
        clientId: null,
        fullName: "Мария Иванова",
        birthDate: "1990-03-14"
      }
    ],
    settings: {
      masterNumbers: { mode: "preserve_selected", values: [11, 22] },
      nameNormalization: { yoPolicy: "separate", shortIPolicy: "as_i" },
      includeNameNumbers: true,
      includePsychomatrix: true,
      includeStrengthLines: true
    }
  };
}
