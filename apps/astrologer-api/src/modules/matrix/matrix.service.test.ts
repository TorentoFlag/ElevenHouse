import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type {
  AstrologerClientListItem,
  AstrologerProfileStore,
  CalculationRecord,
  CalculationStore,
  ClientStore
} from "@elevenhouse/domain";
import {
  matrixCalculationResponseSchema,
  matrixPreviewResponseSchema,
  matrixProjectionResponseSchema
} from "@elevenhouse/contracts";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { MatrixService } from "./matrix.service";

const now = new Date("2026-03-13T20:00:00.000Z");
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const clientId = "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e";
const partnerClientId = "cf616b16-40a5-48bf-a82f-d180b13f0976";

describe("MatrixService", () => {
  it("hydrates an active CRM client and previews without touching calculation storage", async () => {
    const store = createCalculationStore();
    const response = await createService({ store }).preview(individualPreviewBody(), request());

    matrixPreviewResponseSchema.parse(response);
    expect(response.result).toMatchObject({
      mode: "individual",
      participant: { displayName: "Марина Краснова", birthDate: "1990-03-14" },
      matrix: { points: { E: 9 } }
    });
    expect(response.projection).toBeNull();
    expect(store.findExact).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it("derives preview projection in the astrologer timezone without writing", async () => {
    const store = createCalculationStore();
    const response = await createService({ store }).preview(
      { ...individualPreviewBody(), projection: { kind: "current_year" } },
      request()
    );

    expect(response.projection).toMatchObject({
      timezone: "Europe/Moscow",
      currentDate: "2026-03-13",
      ageCycle: { age: 35, pointCode: "tr" },
      yearForecast: { year: 2026, personalYear: 9 }
    });
    expect(store.create).not.toHaveBeenCalled();
  });

  it("rejects missing birth data and non-active relationships", async () => {
    const missingBirth = defaultClients().map((item) =>
      item.clientUserId === clientId ? { ...item, birthData: null } : item
    );
    await expectHttpCode(
      createService({ clients: missingBirth }).preview(individualPreviewBody(), request()),
      409,
      "MATRIX_CLIENT_BIRTH_DATE_REQUIRED"
    );

    const archived = defaultClients().map((item) =>
      item.clientUserId === clientId ? { ...item, relationshipStatus: "archived" as const } : item
    );
    await expectHttpCode(
      createService({ clients: archived }).preview(individualPreviewBody(), request()),
      404,
      "MATRIX_CLIENT_NOT_AVAILABLE"
    );
  });

  it("creates one linked individual record with server-owned snapshots", async () => {
    const store = createCalculationStore();
    const response = await createService({ store }).createCalculation(
      individualPersistBody(),
      request()
    );

    matrixCalculationResponseSchema.parse(response);
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        module: "matrix",
        mode: "individual",
        methodCode: "ladini_22",
        linkClientIds: [clientId],
        title: "Марина Краснова — Матрица судьбы",
        inputData: expect.objectContaining({
          engineRevision: 1,
          participants: [
            expect.objectContaining({
              clientId,
              displayName: "Марина Краснова",
              birthDate: "1990-03-14"
            })
          ]
        })
      })
    );
    expect(response.calculation.status).toBe("linked");
    expect(response.calculation.links.map((link) => link.clientId)).toEqual([clientId]);
  });

  it("links both compatibility clients and deduplicates independent of request order", async () => {
    const store = createCalculationStore();
    const service = createService({ store });
    const first = await service.createCalculation(
      compatibilityPersistBody(clientId, partnerClientId),
      request()
    );
    const replay = await service.createCalculation(
      compatibilityPersistBody(partnerClientId, clientId),
      request()
    );

    expect(replay.calculation.id).toBe(first.calculation.id);
    expect(first.calculation.links.map((link) => link.clientId).sort()).toEqual(
      [clientId, partnerClientId].sort()
    );
    expect(store.findExact).toHaveBeenCalledTimes(2);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("recalculates existing participants without accepting replacement client ids", async () => {
    const store = createCalculationStore();
    const service = createService({ store });
    const saved = await service.createCalculation(individualPersistBody(), request());
    const recalculated = await service.recalculate(saved.calculation.id, {}, request());

    expect(store.replaceResult).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        calculationId: saved.calculation.id,
        participants: [expect.objectContaining({ clientId })]
      })
    );
    expect(recalculated.calculation.id).toBe(saved.calculation.id);
    await expectHttpCode(
      service.recalculate(
        saved.calculation.id,
        { participants: [{ clientId: partnerClientId }] },
        request()
      ),
      400,
      "MATRIX_VALIDATION_FAILED"
    );
  });

  it("derives a projection from the saved snapshot without changing saved state", async () => {
    const store = createCalculationStore();
    const service = createService({ store });
    const saved = await service.createCalculation(individualPersistBody(), request());
    const replaceCalls = (store.replaceResult as ReturnType<typeof vi.fn>).mock.calls.length;
    const response = await service.projection(saved.calculation.id, { year: "2026" }, request());

    matrixProjectionResponseSchema.parse(response);
    expect(response.resultChecksum).toBe(saved.calculation.resultChecksum);
    expect(response.projection).toMatchObject({
      participant: { displayName: "Марина Краснова", birthDate: "1990-03-14" },
      yearForecast: { year: 2026 }
    });
    expect(store.replaceResult).toHaveBeenCalledTimes(replaceCalls);
    const current = await store.findByOwnerAndId({
      ownerUserId,
      calculationId: saved.calculation.id
    });
    expect(current?.resultChecksum).toBe(saved.calculation.resultChecksum);
  });

  it("requires a valid timezone for derived projections", async () => {
    const service = createService({ timezone: "Invalid/Timezone" });
    await expectHttpCode(
      service.preview(
        { ...individualPreviewBody(), projection: { kind: "explicit_year", year: 2026 } },
        request()
      ),
      409,
      "ASTROLOGER_TIMEZONE_REQUIRED"
    );
  });
});

function createService(
  input: {
    readonly store?: CalculationStore;
    readonly timezone?: string;
    readonly clients?: readonly AstrologerClientListItem[];
  } = {}
): MatrixService {
  return new MatrixService(
    input.store ?? createCalculationStore(),
    createClientStore(input.clients ?? defaultClients()),
    createProfileStore(input.timezone ?? "Europe/Moscow"),
    { now: () => now } as SystemClock
  );
}

function createCalculationStore(): CalculationStore {
  const records: CalculationRecord[] = [];
  const hydrateLinks = (
    record: CalculationRecord,
    clientIds: readonly string[],
    linkedAt: string
  ): CalculationRecord => ({
    ...record,
    status: clientIds.length > 0 ? "linked" : record.status,
    links: [
      ...record.links,
      ...clientIds
        .filter((id) => !record.links.some((link) => link.clientId === id))
        .map((id) => ({
          clientId: id,
          visibility: "private_to_astrologer" as const,
          linkedAt,
          publishedAt: null
        }))
    ],
    updatedAt: linkedAt
  });
  const store: CalculationStore = {
    listByOwner: vi.fn(async () => ({ calculations: records, total: records.length })),
    findByOwnerAndId: vi.fn(
      async (input) =>
        records.find(
          (record) => record.ownerUserId === input.ownerUserId && record.id === input.calculationId
        ) ?? null
    ),
    findExact: vi.fn(
      async (input) =>
        records.find(
          (record) =>
            record.ownerUserId === input.ownerUserId &&
            record.module === input.module &&
            record.mode === input.mode &&
            record.methodCode === input.methodCode &&
            record.requestFingerprint === input.requestFingerprint
        ) ?? null
    ),
    create: vi.fn(async (input) => {
      const base: CalculationRecord = {
        id: input.idGenerator(),
        ownerUserId: input.ownerUserId,
        module: input.module,
        mode: input.mode,
        methodCode: input.methodCode,
        title: input.title,
        status: "calculated",
        participants: input.participants,
        requestFingerprint: input.requestFingerprint,
        inputData: input.inputData,
        resultData: input.resultData,
        resultSummary: input.resultSummary,
        resultChecksum: input.resultChecksum,
        links: [],
        interpretations: [],
        artifacts: [],
        createdAt: input.now,
        updatedAt: input.now
      };
      const record = hydrateLinks(base, input.linkClientIds, input.now);
      records.push(record);
      return record;
    }),
    replaceResult: vi.fn(async (input) => {
      const index = records.findIndex(
        (record) => record.ownerUserId === input.ownerUserId && record.id === input.calculationId
      );
      if (index < 0) return { status: "not_found" as const };
      const current = records[index]!;
      const updated: CalculationRecord = {
        ...current,
        participants: input.participants,
        requestFingerprint: input.requestFingerprint,
        inputData: input.inputData,
        resultData: input.resultData,
        resultSummary: input.resultSummary,
        resultChecksum: input.resultChecksum,
        interpretations: [],
        artifacts: [],
        updatedAt: input.now
      };
      records[index] = updated;
      return { status: "updated" as const, calculation: updated };
    }),
    ensureClientLinks: vi.fn(async (input) => {
      const index = records.findIndex(
        (record) => record.ownerUserId === input.ownerUserId && record.id === input.calculationId
      );
      if (index < 0) return null;
      records[index] = hydrateLinks(records[index]!, input.clientIds, input.now);
      return records[index]!;
    }),
    linkClient: vi.fn(async () => null),
    publishClientLink: vi.fn(async () => null),
    saveInterpretation: vi.fn(async () => null),
    approveInterpretation: vi.fn(async () => null),
    archive: vi.fn(async () => null)
  };
  return store;
}

function createClientStore(clients: readonly AstrologerClientListItem[]): ClientStore {
  return {
    createJoinIntent: vi.fn(async () => raise()),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(async () => raise()),
    upsertClientProfile: vi.fn(async () => undefined),
    upsertClientBirthData: vi.fn(async () => raise()),
    listAstrologerClients: vi.fn(async () => ({ clients, total: clients.length })),
    getAstrologerClient: vi.fn(
      async (input) => clients.find((client) => client.clientUserId === input.clientUserId) ?? null
    )
  };
}

function createProfileStore(timezone: string): AstrologerProfileStore {
  return {
    findByOwnerUserId: vi.fn(async () => ({
      ownerUserId,
      publicHandle: "anton",
      publicName: "Антон",
      headline: null,
      bio: null,
      timezone,
      locale: "ru",
      avatarMediaId: null,
      coverMediaId: null,
      consultationLanguages: ["ru"],
      visibilityStatus: "draft" as const,
      professionalExperienceYears: null,
      professionalSchool: null,
      specializations: [],
      methods: [],
      socialLinks: { telegram: null, instagram: null, whatsapp: null, website: null },
      ownBirthData: { date: null, time: null, place: null, showOnPublicPage: false },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })),
    upsert: vi.fn(async () => raise())
  };
}

function defaultClients(): readonly AstrologerClientListItem[] {
  return [
    client("Марина Краснова", clientId, "1990-03-14"),
    client("Иван Петров", partnerClientId, "2000-01-01")
  ];
}

function client(displayName: string, id: string, birthDate: string): AstrologerClientListItem {
  return {
    clientUserId: id,
    displayName,
    relationshipStatus: "active",
    firstLinkedAt: now.toISOString(),
    lastLinkedAt: now.toISOString(),
    birthData: {
      id: `${id.slice(0, -1)}0`,
      clientUserId: id,
      label: null,
      birthDate,
      birthTime: null,
      birthTimePrecision: "unknown",
      birthPlaceText: null,
      birthCountryCode: null,
      birthCity: null,
      birthRegion: null,
      birthTimezone: null,
      birthTimeDstOccurrence: null,
      birthLatitude: null,
      birthLongitude: null,
      source: "manual",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  };
}

function individualPreviewBody(): Record<string, unknown> {
  return {
    mode: "individual",
    methodCode: "ladini_22",
    participants: [{ role: "subject", source: "crm_client", clientId }]
  };
}

function individualPersistBody(): Record<string, unknown> {
  return individualPreviewBody();
}

function compatibilityPersistBody(
  subjectClientId: string,
  partnerId: string
): Record<string, unknown> {
  return {
    mode: "compatibility",
    methodCode: "ladini_22",
    participants: [
      { role: "subject", source: "crm_client", clientId: subjectClientId },
      { role: "partner", source: "crm_client", clientId: partnerId }
    ]
  };
}

function request(): AstrologerSessionRequest {
  return { currentAstrologerAccount: { account: { id: ownerUserId } } } as AstrologerSessionRequest;
}

async function expectHttpCode(
  promise: Promise<unknown>,
  status: number,
  code: string
): Promise<void> {
  try {
    await promise;
    throw new Error("Expected request to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const exception = error as HttpException;
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({ code });
  }
}

function raise(): never {
  throw new Error("Unexpected store call");
}
