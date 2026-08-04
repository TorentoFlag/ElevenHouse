import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { CalculationRecord, CalculationStore } from "@elevenhouse/domain";
import type { SystemClock } from "../clock/system-clock.service";
import type { ChartExecutionProfileProvider } from "../charts/chart-execution-profile.provider";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { CalculationsService } from "./calculations.service";

const now = new Date("2026-07-06T00:00:00.000Z");
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const calculationId = "6e83d5f9-2cd1-4d09-b7f4-3162c29ed05b";
const clientId = "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e";
const checksum = `sha256:${"a".repeat(64)}`;

describe("CalculationsService", () => {
  it("rejects linking a manual-only calculation to a client", async () => {
    const store = createStore(manualCalculation());
    const service = createService(store);

    await expect(service.linkClient(calculationId, { clientId }, request())).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(store.linkClient).not.toHaveBeenCalled();
  });

  it("binds publication to the expected current result checksum", async () => {
    const record = publishableCalculation();
    const store = createStore(record);
    (store.publishClientLink as ReturnType<typeof vi.fn>).mockResolvedValue(record);
    const service = createService(store);

    await service.publish(calculationId, { clientId, expectedResultChecksum: checksum }, request());

    expect(store.publishClientLink).toHaveBeenCalledWith(
      expect.objectContaining({ calculationId, clientId, expectedResultChecksum: checksum })
    );
  });

  it("maps child chart publication policy to a typed conflict before persistence", async () => {
    const record = {
      ...publishableCalculation(),
      module: "chart" as const,
      methodCode: "natal",
      interpretationMode: "child" as const
    };
    const store = createStore(record);
    const service = createService(store);

    await expect(
      service.publish(calculationId, { clientId, expectedResultChecksum: checksum }, request())
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: "CHART_INTERPRETATION_MODE_UNAVAILABLE" })
    });
    expect(store.publishClientLink).not.toHaveBeenCalled();
  });

  it("saves an interpretation against the expected current result without a version id", async () => {
    const record = manualCalculation();
    const store = createStore(record);
    (store.saveInterpretation as ReturnType<typeof vi.fn>).mockResolvedValue(record);
    const service = createService(store);

    await service.saveManualInterpretation(
      calculationId,
      { text: "Проверено", expectedResultChecksum: checksum },
      request(),
      "66666666-6666-4666-8666-666666666666"
    );

    expect(store.saveInterpretation).toHaveBeenCalledWith(
      expect.objectContaining({ expectedResultChecksum: checksum })
    );
    expect(store.saveInterpretation).toHaveBeenCalledWith(
      expect.not.objectContaining({ versionId: expect.anything() })
    );
  });

  it("fails closed when the generic read surface reaches a corrupt stored chart result", async () => {
    const store = createStore(
      baseCalculation({
        module: "chart",
        methodCode: "natal",
        inputData: {},
        resultData: {}
      })
    );
    const service = createService(store);

    await expect(service.getCalculation(calculationId, request())).rejects.toBeInstanceOf(
      ConflictException
    );
  });
});

function createService(store: CalculationStore): CalculationsService {
  return new CalculationsService(
    store,
    { now: () => now } as SystemClock,
    {
      getProfile: () => ({
        provider: "kerykeion",
        kerykeionVersion: "5.12.9",
        pyswissephVersion: "2.10.3.2",
        expectedEphemeris: "moshier",
        expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
        expectedEphemerisDataRevision: null
      })
    } as ChartExecutionProfileProvider
  );
}

function createStore(record: CalculationRecord): CalculationStore {
  return {
    listByOwner: vi.fn(async () => ({ calculations: [record], total: 1 })),
    findByOwnerAndId: vi.fn(async (input) =>
      input.ownerUserId === record.ownerUserId && input.calculationId === record.id ? record : null
    ),
    findExact: vi.fn(async () => null),
    create: vi.fn(async () => raise()),
    replaceResult: vi.fn(async () => raise()),
    ensureClientLinks: vi.fn(async () => raise()),
    linkClient: vi.fn(async () => raise()),
    publishClientLink: vi.fn(async () => raise()),
    saveInterpretation: vi.fn(async () => raise()),
    approveInterpretation: vi.fn(async () => raise()),
    archive: vi.fn(async () => raise())
  };
}

function manualCalculation(): CalculationRecord {
  return baseCalculation({
    participants: [
      {
        role: "subject",
        source: "manual",
        clientId: null,
        displayName: "Мария Иванова"
      }
    ]
  });
}

function publishableCalculation(): CalculationRecord {
  return baseCalculation({
    status: "linked",
    participants: [
      {
        role: "subject",
        source: "crm_client",
        clientId,
        displayName: "Мария Иванова"
      }
    ],
    links: [
      {
        clientId,
        visibility: "private_to_astrologer",
        linkedAt: now.toISOString(),
        publishedAt: null
      }
    ],
    interpretations: [
      {
        id: "ba5ed13f-f2f4-4249-bfdd-03932b9001a0",
        source: "manual",
        status: "approved",
        text: "Проверено",
        modelId: null,
        promptVersion: null,
        approvedAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
    ]
  });
}

function baseCalculation(overrides: Partial<CalculationRecord> = {}): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "numerology",
    mode: "individual",
    interpretationMode: null,
    methodCode: "pythagorean",
    title: "Manual calculation",
    status: "calculated",
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: checksum,
    participants: [],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function request(): AstrologerSessionRequest {
  return {
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as AstrologerSessionRequest;
}

function raise(): never {
  throw new Error("Unexpected store call");
}
