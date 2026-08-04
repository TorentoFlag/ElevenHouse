import { describe, expect, it, vi } from "vitest";
import type { CalculationRecord, CalculationStore } from "@elevenhouse/domain";
import type { SystemClock } from "../clock/system-clock.service";
import type { ChartExecutionProfileProvider } from "../charts/chart-execution-profile.provider";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { CalculationsService } from "./calculations.service";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const calculationId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "66666666-6666-4666-8666-666666666666";
const checksum = `sha256:${"a".repeat(64)}`;

describe("CalculationsService manual interpretation idempotency", () => {
  it("uses the validated resource UUID as the interpretation id", async () => {
    const record = calculation();
    const store = createStore(record);
    (store.saveInterpretation as ReturnType<typeof vi.fn>).mockImplementation(async (input) => {
      expect(input.interpretationIdGenerator()).toBe(idempotencyKey);
      return record;
    });

    await createService(store).saveManualInterpretation(
      calculationId,
      { text: "Проверено", expectedResultChecksum: checksum },
      request(),
      idempotencyKey
    );

    expect(store.saveInterpretation).toHaveBeenCalledOnce();
  });

  it("maps a durable resource-key mismatch to a typed HTTP conflict", async () => {
    const record = calculation();
    const store = createStore(record);
    (store.saveInterpretation as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: "idempotency_conflict"
    });

    await expect(
      createService(store).saveManualInterpretation(
        calculationId,
        { text: "Другой текст", expectedResultChecksum: checksum },
        request(),
        idempotencyKey
      )
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: "CALCULATION_INTERPRETATION_IDEMPOTENCY_CONFLICT"
      })
    });
  });

  it("rejects a syntactically allowed but non-UUID resource key before persistence", async () => {
    const store = createStore(calculation());

    await expect(
      createService(store).saveManualInterpretation(
        calculationId,
        { text: "Проверено", expectedResultChecksum: checksum },
        request(),
        "manual-save:request-1"
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(store.saveInterpretation).not.toHaveBeenCalled();
  });
});

function createService(store: CalculationStore): CalculationsService {
  return new CalculationsService(
    store,
    { now: () => new Date("2026-08-03T10:00:00.000Z") } as SystemClock,
    { getProfile: () => ({}) } as ChartExecutionProfileProvider
  );
}

function createStore(record: CalculationRecord): CalculationStore {
  return {
    listByOwner: vi.fn(async () => ({ calculations: [record], total: 1 })),
    findByOwnerAndId: vi.fn(async (input) =>
      input.ownerUserId === ownerUserId && input.calculationId === calculationId ? record : null
    ),
    findExact: vi.fn(async () => null),
    create: vi.fn(),
    replaceResult: vi.fn(),
    ensureClientLinks: vi.fn(),
    linkClient: vi.fn(),
    publishClientLink: vi.fn(),
    saveInterpretation: vi.fn(),
    approveInterpretation: vi.fn(),
    archive: vi.fn()
  } as unknown as CalculationStore;
}

function calculation(): CalculationRecord {
  return {
    id: calculationId,
    ownerUserId,
    module: "numerology",
    mode: "individual",
    interpretationMode: null,
    methodCode: "pythagorean",
    title: "Calculation",
    status: "calculated",
    requestFingerprint: `sha256:${"b".repeat(64)}`,
    inputData: {},
    resultData: {},
    resultSummary: {},
    resultChecksum: checksum,
    participants: [{ role: "subject", source: "manual", clientId: null, displayName: "Мария" }],
    links: [],
    interpretations: [],
    artifacts: [],
    createdAt: "2026-08-03T10:00:00.000Z",
    updatedAt: "2026-08-03T10:00:00.000Z"
  };
}

function request(): AstrologerSessionRequest {
  return {
    currentAstrologerAccount: { account: { id: ownerUserId } }
  } as AstrologerSessionRequest;
}
