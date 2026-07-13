import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type {
  AstrologerClientListItem,
  AstrologerProfileStore,
  CalculationRecord,
  CalculationStore,
  ClientStore
} from "@elevenhouse/domain";
import { numerologyCalculationResponseSchema } from "@elevenhouse/contracts";
import type { SystemClock } from "../clock/system-clock.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { NumerologyService } from "./numerology.service";

const now = new Date("2026-01-01T02:00:00.000Z");
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const clientId = "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e";
const partnerClientId = "cf616b16-40a5-48bf-a82f-d180b13f0976";

describe("NumerologyService", () => {
  it("previews from owner-scoped CRM data without writing a calculation", async () => {
    const store = createCalculationStore();
    const service = createService({ store });

    const response = await service.preview(crmIndividualBody(), request());

    expect(response.result).toMatchObject({
      mode: "individual",
      participant: {
        calculationName: "Голубев Антон",
        calculationNameSource: "crm_display_name",
        birthDate: "2000-08-19"
      },
      keyNumbers: { lifePath: 2, birthday: 1, expression: 6, soul: 6, personality: 9 }
    });
    expect(store.findExact).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it("resolves current year in the astrologer profile timezone", async () => {
    const moscow = await createService({ timezone: "Europe/Moscow" }).preview(
      currentYearManualBody(),
      request()
    );
    const newYork = await createService({ timezone: "America/New_York" }).preview(
      currentYearManualBody(),
      request()
    );

    expect(moscow.result.mode === "individual" && moscow.result.periods.personalYear?.year).toBe(
      2026
    );
    expect(newYork.result.mode === "individual" && newYork.result.periods.personalYear?.year).toBe(
      2025
    );
  });

  it("requires a valid astrologer timezone for current-year periods", async () => {
    const promise = createService({ timezone: "Invalid/Timezone" }).preview(
      currentYearManualBody(),
      request()
    );

    await expectHttpCode(promise, 409, "ASTROLOGER_TIMEZONE_REQUIRED");
  });

  it("persists once and returns the validated saved result on an exact replay", async () => {
    const store = createCalculationStore();
    const service = createService({ store });

    const first = await service.createCalculation(manualIndividualBody(), request());
    const replay = await service.createCalculation(manualIndividualBody(), request());

    numerologyCalculationResponseSchema.parse(first);
    expect(replay.calculation.id).toBe(first.calculation.id);
    expect(replay.result).toEqual(first.result);
    expect(store.create).toHaveBeenCalledOnce();
    expect(first.calculation.resultChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("uses one compatibility fingerprint regardless of participant order", async () => {
    const store = createCalculationStore();
    const service = createService({ store });

    const first = await service.createCalculation(compatibilityBody(clientId, partnerClientId), request());
    const reversed = await service.createCalculation(
      compatibilityBody(partnerClientId, clientId),
      request()
    );

    expect(reversed.calculation.id).toBe(first.calculation.id);
    expect(store.create).toHaveBeenCalledOnce();
  });

  it("rejects a saved result whose checksum no longer matches", async () => {
    const store = createCalculationStore();
    const service = createService({ store });
    await service.createCalculation(manualIndividualBody(), request());
    const existing = await store.findExact({
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      requestFingerprint: (store.create as ReturnType<typeof vi.fn>).mock.calls[0]![0]
        .requestFingerprint
    });
    if (!existing) throw new Error("Expected saved calculation");
    (store.findExact as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...existing,
      resultChecksum: `sha256:${"0".repeat(64)}`
    });

    await expectHttpCode(
      service.createCalculation(manualIndividualBody(), request()),
      500,
      "CALCULATION_RESULT_INTEGRITY_ERROR"
    );
  });

  it("returns a non-enumerating 404 for unrelated or incomplete CRM clients", async () => {
    const service = createService({ clients: [] });
    await expectHttpCode(
      service.preview(crmIndividualBody(), request()),
      404,
      "CLIENT_NOT_FOUND"
    );
  });
});

function createService(input: {
  readonly store?: CalculationStore;
  readonly timezone?: string;
  readonly clients?: readonly AstrologerClientListItem[];
} = {}): NumerologyService {
  return new NumerologyService(
    input.store ?? createCalculationStore(),
    createClientStore(input.clients ?? defaultClients()),
    createProfileStore(input.timezone ?? "Europe/Moscow"),
    { now: () => now } as SystemClock
  );
}

function createCalculationStore(): CalculationStore {
  const records: CalculationRecord[] = [];
  const hydrateLinks = (record: CalculationRecord, clientIds: readonly string[], linkedAt: string) => ({
    ...record,
    status: clientIds.length > 0 ? ("linked" as const) : record.status,
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
          (record) =>
            record.ownerUserId === input.ownerUserId && record.id === input.calculationId
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
    replaceResult: vi.fn(async () => ({ status: "not_found" as const })),
    ensureClientLinks: vi.fn(async (input) => {
      const index = records.findIndex(
        (record) =>
          record.ownerUserId === input.ownerUserId && record.id === input.calculationId
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
    client("Голубев Антон", clientId, "2000-08-19"),
    client("Кошкина Яна Владимировна", partnerClientId, "2002-03-16")
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
      birthLatitude: null,
      birthLongitude: null,
      source: "manual",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  };
}

function crmIndividualBody(): Record<string, unknown> {
  return {
    mode: "individual",
    methodCode: "pythagorean",
    participants: [{ role: "subject", source: "crm_client", clientId }],
    periodRequest: { kind: "explicit", personalYear: { year: 2026 } }
  };
}

function currentYearManualBody(): Record<string, unknown> {
  const { title: _title, ...preview } = manualIndividualBody();
  return { ...preview, periodRequest: { kind: "current_year" } };
}

function manualIndividualBody(): Record<string, unknown> {
  return {
    mode: "individual",
    methodCode: "pythagorean",
    title: "Голубев Антон",
    participants: [
      {
        role: "subject",
        source: "manual",
        clientId: null,
        displayName: "Голубев Антон",
        calculationName: "Голубев Антон",
        calculationNameSource: "manual_entry",
        birthDate: "2000-08-19"
      }
    ],
    periodRequest: { kind: "explicit", personalYear: { year: 2026 } }
  };
}

function compatibilityBody(subjectId: string, partnerId: string): Record<string, unknown> {
  return {
    mode: "compatibility",
    methodCode: "pythagorean",
    title: "Совместимость",
    participants: [
      { role: "subject", source: "crm_client", clientId: subjectId },
      { role: "partner", source: "crm_client", clientId: partnerId }
    ],
    periodRequest: { kind: "explicit", personalYear: { year: 2026 } }
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
