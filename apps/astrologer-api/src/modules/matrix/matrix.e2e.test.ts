import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  matrixCalculationResponseSchema,
  matrixInterpretationResponseSchema,
  matrixNoteResponseSchema,
  matrixNotesResponseSchema,
  matrixPdfJobResponseSchema,
  matrixPreviewResponseSchema,
  matrixProjectionResponseSchema,
  matrixReportResponseSchema
} from "@elevenhouse/contracts";
import type {
  AstrologerProfileStore,
  AuthSessionAuthenticationStore,
  AuthSessionRevocationUnitOfWork,
  CalculationRecord,
  CalculationStore,
  ClientStore,
  MatrixNoteStore,
  CalculationPdfJobStore,
  MatrixReportStore,
  PasswordlessAuthUnitOfWork,
  PasswordlessCustomerAccountRegistrationSessionUnitOfWork
} from "@elevenhouse/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASTROLOGER_PROFILE_STORE } from "../astrologer-profile/astrologer-profile.tokens";
import { SystemClock } from "../clock/system-clock.service";
import { CALCULATION_STORE } from "../calculations/calculations.tokens";
import { CalculationsModule } from "../calculations/calculations.module";
import { CALCULATION_PDF_JOB_STORE } from "../calculations/pdf/calculation-pdf.tokens";
import { CLIENT_STORE } from "../clients/clients.tokens";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import {
  AUTH_SESSION_AUTHENTICATION_STORE,
  AUTH_SESSION_REVOCATION_UNIT_OF_WORK
} from "../identity/auth/identity-auth.tokens";
import { IdentityModule } from "../identity/identity.module";
import { ASTROLOGER_AUTH_CODE_GENERATOR } from "../identity/passwordless/identity-passwordless.handler";
import {
  PASSWORDLESS_AUTH_UNIT_OF_WORK,
  PASSWORDLESS_RATE_LIMITER
} from "../identity/passwordless/identity-passwordless.tokens";
import { ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK } from "../identity/registration/identity-registration.tokens";
import { createIdentityConfigServiceStub } from "../identity/testing/identity-config-service.stub";
import { TestPasswordlessRateLimiter } from "../identity/testing/test-passwordless-rate-limiter";
import { RedisRuntimeService } from "../redis/redis-runtime.service";
import { AstrologerCsrfTokenService } from "../security/csrf/astrologer-csrf-token.service";
import { MatrixModule } from "./matrix.module";
import { MATRIX_NOTE_STORE } from "./matrix-notes.tokens";
import { MATRIX_REPORT_STORE } from "./matrix-report.tokens";

const now = new Date("2026-07-14T00:00:00.000Z");
const sessionCookieName = "elevenhouse_astrologer_session";
const csrfCookieName = "elevenhouse_astrologer_csrf";
const csrfHeaderName = "x-csrf-token";
const sessionToken = "raw-session-token";
const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const clientId = "3ab63db1-4f78-4d59-9b75-c21fc3ec9f6e";
let currentCsrfToken = "";

const defaultPasswordlessRateLimits = {
  requestCodeIdentifier: { limit: 5, windowSeconds: 3600 },
  requestCodeIp: { limit: 30, windowSeconds: 3600 },
  requestCodeIdentifierIp: { limit: 3, windowSeconds: 3600 },
  verifyChallenge: { limit: 5, windowSeconds: 900 },
  verifyIp: { limit: 60, windowSeconds: 900 }
};

describe("Matrix HTTP routes", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let calculationStore: CalculationStore;
  let matrixNoteStore: MatrixNoteStore;
  let matrixReportStore: MatrixReportStore;
  let calculationPdfJobStore: CalculationPdfJobStore;

  beforeEach(async () => {
    calculationStore = createCalculationStore();
    matrixNoteStore = createMatrixNoteStore();
    matrixReportStore = createMatrixReportStore();
    calculationPdfJobStore = createCalculationPdfJobStore();
    const passwordlessAuth: PasswordlessAuthUnitOfWork = { transact: async () => raise() };
    const authSessionRevocation: AuthSessionRevocationUnitOfWork = {
      transact: async () => raise()
    };
    const astrologerRegistration: PasswordlessCustomerAccountRegistrationSessionUnitOfWork = {
      transact: async () => raise()
    };

    moduleRef = await Test.createTestingModule({
      imports: [IdentityModule, CalculationsModule, MatrixModule]
    })
      .overrideProvider(PostgresRuntimeService)
      .useValue({ database: {} })
      .overrideProvider(ConfigService)
      .useValue(
        createIdentityConfigServiceStub({
          sessionCookieName,
          csrfCookieName,
          csrfHeaderName,
          passwordlessRateLimits: defaultPasswordlessRateLimits
        })
      )
      .overrideProvider(PASSWORDLESS_AUTH_UNIT_OF_WORK)
      .useValue(passwordlessAuth)
      .overrideProvider(AUTH_SESSION_AUTHENTICATION_STORE)
      .useValue(createAuthStore())
      .overrideProvider(AUTH_SESSION_REVOCATION_UNIT_OF_WORK)
      .useValue(authSessionRevocation)
      .overrideProvider(ASTROLOGER_REGISTRATION_SESSION_UNIT_OF_WORK)
      .useValue(astrologerRegistration)
      .overrideProvider(PASSWORDLESS_RATE_LIMITER)
      .useValue(new TestPasswordlessRateLimiter(defaultPasswordlessRateLimits, () => now))
      .overrideProvider(RedisRuntimeService)
      .useValue({ eval: vi.fn(async () => 0), quit: vi.fn(async () => undefined) })
      .overrideProvider(ASTROLOGER_AUTH_CODE_GENERATOR)
      .useValue({ generateCode: vi.fn(() => "123456") })
      .overrideProvider(SystemClock)
      .useValue({ now: vi.fn(() => now) })
      .overrideProvider(CALCULATION_STORE)
      .useValue(calculationStore)
      .overrideProvider(CLIENT_STORE)
      .useValue(createClientStore())
      .overrideProvider(MATRIX_NOTE_STORE)
      .useValue(matrixNoteStore)
      .overrideProvider(MATRIX_REPORT_STORE)
      .useValue(matrixReportStore)
      .overrideProvider(CALCULATION_PDF_JOB_STORE)
      .useValue(calculationPdfJobStore)
      .overrideProvider(ASTROLOGER_PROFILE_STORE)
      .useValue(createProfileStore())
      .compile();

    currentCsrfToken = moduleRef.get(AstrologerCsrfTokenService).setCsrfCookie({
      response: { cookie: vi.fn() },
      sessionToken,
      sessionExpiresAt: "2026-07-20T00:00:00.000Z",
      now
    });
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("keeps preview read-only and CSRF-exempt while requiring authentication", async () => {
    const unauthenticated = await postJson("/matrix/preview", previewBody());
    const preview = await postJson("/matrix/preview", previewBody(), {
      cookie: sessionCookieHeader()
    });

    expect(unauthenticated.status).toBe(401);
    expect(preview.status).toBe(200);
    matrixPreviewResponseSchema.parse(preview.body);
    expect(calculationStore.findExact).not.toHaveBeenCalled();
    expect(calculationStore.create).not.toHaveBeenCalled();
  });

  it("requires CSRF for save/recalculate and keeps projection read-only", async () => {
    const missingCreateCsrf = await postJson("/matrix/calculations", persistBody(), {
      cookie: sessionCookieHeader()
    });
    const created = await postJson("/matrix/calculations", persistBody(), csrfHeaders());
    const parsedCreated = matrixCalculationResponseSchema.parse(created.body);
    const calculationId = parsedCreated.calculation.id;
    const missingRecalculateCsrf = await postJson(
      `/matrix/calculations/${calculationId}/recalculate`,
      {},
      { cookie: sessionCookieHeader() }
    );
    const recalculated = await postJson(
      `/matrix/calculations/${calculationId}/recalculate`,
      {},
      csrfHeaders()
    );
    const replaceCount = (calculationStore.replaceResult as ReturnType<typeof vi.fn>).mock.calls
      .length;
    const unauthenticatedProjection = await getJson(
      `/matrix/calculations/${calculationId}/projection?year=2026`
    );
    const projection = await getJson(`/matrix/calculations/${calculationId}/projection?year=2026`, {
      cookie: sessionCookieHeader()
    });

    expect(missingCreateCsrf.status).toBe(403);
    expect(created.status).toBe(201);
    expect(missingRecalculateCsrf.status).toBe(403);
    expect(recalculated.status).toBe(200);
    matrixCalculationResponseSchema.parse(recalculated.body);
    expect(unauthenticatedProjection.status).toBe(401);
    expect(projection.status).toBe(200);
    matrixProjectionResponseSchema.parse(projection.body);
    expect(calculationStore.replaceResult).toHaveBeenCalledTimes(replaceCount);
  });

  it("returns a structured unsupported-method error and exposes no Matrix publication route", async () => {
    const unsupported = await postJson(
      "/matrix/calculations",
      { ...persistBody(), methodCode: "custom" },
      csrfHeaders()
    );
    const publish = await postJson(
      "/matrix/calculations/00000000-0000-4000-8000-000000000001/publish",
      {},
      csrfHeaders()
    );

    expect(unsupported.status).toBe(422);
    expect(unsupported.body).toMatchObject({ code: "UNSUPPORTED_MATRIX_METHOD" });
    expect(publish.status).toBe(404);
  });

  it("keeps note reads CSRF-exempt and requires CSRF for every note mutation", async () => {
    const createdCalculation = await postJson("/matrix/calculations", persistBody(), csrfHeaders());
    const calculation = matrixCalculationResponseSchema.parse(createdCalculation.body).calculation;
    const calculationId = calculation.id;
    const expectedResultChecksum = calculation.resultChecksum;
    const unauthenticatedList = await getJson(`/matrix/calculations/${calculationId}/notes`);
    const emptyList = await getJson(`/matrix/calculations/${calculationId}/notes`, {
      cookie: sessionCookieHeader()
    });
    const missingCreateCsrf = await postJson(
      `/matrix/calculations/${calculationId}/notes`,
      { text: "Проверить границы.", expectedResultChecksum },
      { cookie: sessionCookieHeader() }
    );
    const createdNote = await postJson(
      `/matrix/calculations/${calculationId}/notes`,
      { text: "Проверить границы.", expectedResultChecksum },
      csrfHeaders()
    );
    const noteId = matrixNoteResponseSchema.parse(createdNote.body).note.id;
    const missingUpdateCsrf = await requestJson(
      "PUT",
      `/matrix/calculations/${calculationId}/notes/${noteId}`,
      { text: "Новый вывод.", expectedResultChecksum },
      { cookie: sessionCookieHeader() }
    );
    const updatedNote = await requestJson(
      "PUT",
      `/matrix/calculations/${calculationId}/notes/${noteId}`,
      { text: "Новый вывод.", expectedResultChecksum },
      csrfHeaders()
    );
    const missingDeleteCsrf = await requestJson(
      "DELETE",
      `/matrix/calculations/${calculationId}/notes/${noteId}`,
      undefined,
      { cookie: sessionCookieHeader() }
    );
    const deletedNote = await requestJson(
      "DELETE",
      `/matrix/calculations/${calculationId}/notes/${noteId}`,
      undefined,
      csrfHeaders()
    );

    expect(unauthenticatedList.status).toBe(401);
    expect(emptyList.status).toBe(200);
    matrixNotesResponseSchema.parse(emptyList.body);
    expect(missingCreateCsrf.status).toBe(403);
    expect(createdNote.status).toBe(201);
    expect(missingUpdateCsrf.status).toBe(403);
    expect(updatedNote.status).toBe(200);
    expect(missingDeleteCsrf.status).toBe(403);
    expect(deletedNote.status).toBe(204);
  });

  it("exposes the authenticated read-only catalog without storage access", async () => {
    const calculationReads = (calculationStore.findByOwnerAndId as ReturnType<typeof vi.fn>).mock
      .calls.length;
    const noteReads = (matrixNoteStore.listByCalculation as ReturnType<typeof vi.fn>).mock.calls
      .length;
    const unauthenticated = await getJson(
      "/matrix/interpretations?locale=ru&arcana=9&context=portrait"
    );
    const response = await getJson("/matrix/interpretations?locale=ru&arcana=9&context=portrait", {
      cookie: sessionCookieHeader()
    });

    expect(unauthenticated.status).toBe(401);
    expect(response.status).toBe(200);
    matrixInterpretationResponseSchema.parse(response.body);
    expect(calculationStore.findByOwnerAndId).toHaveBeenCalledTimes(calculationReads);
    expect(matrixNoteStore.listByCalculation).toHaveBeenCalledTimes(noteReads);
  });

  it("keeps report/PDF reads CSRF-exempt and requires CSRF for every mutation", async () => {
    const createdCalculation = await postJson("/matrix/calculations", persistBody(), csrfHeaders());
    const calculation = matrixCalculationResponseSchema.parse(createdCalculation.body).calculation;
    const reportPath = `/matrix/calculations/${calculation.id}/report`;
    const unauthenticated = await getJson(reportPath);
    const empty = await getJson(reportPath, { cookie: sessionCookieHeader() });
    const missingSaveCsrf = await requestJson(
      "PUT",
      reportPath,
      reportBody(calculation.resultChecksum),
      { cookie: sessionCookieHeader() }
    );
    const saved = await requestJson(
      "PUT",
      reportPath,
      reportBody(calculation.resultChecksum),
      csrfHeaders()
    );
    const missingPdfCsrf = await postJson(
      `${reportPath}/pdf`,
      { expectedResultChecksum: calculation.resultChecksum },
      { cookie: sessionCookieHeader() }
    );
    const enqueued = await postJson(
      `${reportPath}/pdf`,
      { expectedResultChecksum: calculation.resultChecksum },
      csrfHeaders()
    );
    const latest = await getJson(`${reportPath}/pdf`, { cookie: sessionCookieHeader() });

    expect(unauthenticated.status).toBe(401);
    expect(empty.status).toBe(200);
    expect(matrixReportResponseSchema.parse(empty.body).report).toBeNull();
    expect(missingSaveCsrf.status).toBe(403);
    expect(saved.status).toBe(200);
    expect(matrixReportResponseSchema.parse(saved.body).report?.status).toBe("ready");
    expect(missingPdfCsrf.status).toBe(403);
    expect(enqueued.status).toBe(202);
    expect(matrixPdfJobResponseSchema.parse(enqueued.body).job?.status).toBe("queued");
    expect(latest.status).toBe(200);
    matrixPdfJobResponseSchema.parse(latest.body);
  });

  async function postJson(
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  }

  async function getJson(
    path: string,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${baseUrl}${path}`, { headers });
    return { status: response.status, body: await response.json() };
  }

  async function requestJson(
    method: "PUT" | "DELETE",
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: unknown }> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
});

function createCalculationStore(): CalculationStore {
  const records: CalculationRecord[] = [];
  const withLinks = (
    record: CalculationRecord,
    clientIds: readonly string[],
    linkedAt: string
  ): CalculationRecord => ({
    ...record,
    status: clientIds.length > 0 ? "linked" : record.status,
    links: clientIds.map((linkedClientId) => ({
      clientId: linkedClientId,
      visibility: "private_to_astrologer" as const,
      linkedAt,
      publishedAt: null
    }))
  });
  return {
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
        interpretationMode: input.interpretationMode ?? null,
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
      const record = withLinks(base, input.linkClientIds, input.now);
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
        updatedAt: input.now
      };
      records[index] = updated;
      return { status: "updated" as const, calculation: updated };
    }),
    ensureClientLinks: vi.fn(
      async (input) =>
        records.find(
          (record) => record.ownerUserId === input.ownerUserId && record.id === input.calculationId
        ) ?? null
    ),
    linkClient: vi.fn(async () => null),
    publishClientLink: vi.fn(async () => null),
    saveInterpretation: vi.fn(async () => null),
    approveInterpretation: vi.fn(async () => null),
    archive: vi.fn(async () => null)
  };
}

function createClientStore(): ClientStore {
  return {
    createJoinIntent: vi.fn(async () => raise()),
    findJoinIntentByTokenHash: vi.fn(async () => null),
    markJoinIntentClaimed: vi.fn(async () => null),
    ensureRelationship: vi.fn(async () => raise()),
    upsertClientProfile: vi.fn(async () => undefined),
    upsertClientBirthData: vi.fn(async () => raise()),
    listClientBirthDataProfiles: vi.fn(async () => []),
    createClientBirthDataProfile: vi.fn(async () => raise()),
    updateClientBirthDataProfile: vi.fn(async () => raise()),
    listAstrologerClients: vi.fn(async () => ({ clients: [], total: 0 })),
    getAstrologerClient: vi.fn(async (input) =>
      input.clientUserId === clientId
        ? {
            clientUserId: clientId,
            displayName: "Марина Краснова",
            relationshipStatus: "active" as const,
            firstLinkedAt: now.toISOString(),
            lastLinkedAt: now.toISOString(),
            birthData: {
              id: "3ab63db1-4f78-4d59-9b75-c21fc3ec9f60",
              clientUserId: clientId,
              label: null,
              birthDate: "1990-03-14",
              birthTime: null,
              birthTimePrecision: "unknown" as const,
              birthPlaceText: null,
              birthCountryCode: null,
              birthCity: null,
              birthRegion: null,
              birthTimezone: null,
              birthTimeDstOccurrence: null,
              birthLatitude: null,
              birthLongitude: null,
              source: "manual" as const,
              isPrimary: true,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString()
            }
          }
        : null
    )
  };
}

function createMatrixNoteStore(): MatrixNoteStore {
  const notes: Array<{
    id: string;
    calculationId: string;
    ownerUserId: string;
    text: string;
    resultChecksum: string;
    createdAt: string;
    updatedAt: string;
  }> = [];
  return {
    listByCalculation: vi.fn(async (input) =>
      notes.filter(
        (note) =>
          note.ownerUserId === input.ownerUserId && note.calculationId === input.calculationId
      )
    ),
    create: vi.fn(async (input) => {
      const note = {
        id: input.id,
        calculationId: input.calculationId,
        ownerUserId: input.ownerUserId,
        text: input.text,
        resultChecksum: input.resultChecksum,
        createdAt: input.now,
        updatedAt: input.now
      };
      notes.push(note);
      return note;
    }),
    update: vi.fn(async (input) => {
      const index = notes.findIndex(
        (note) =>
          note.id === input.noteId &&
          note.calculationId === input.calculationId &&
          note.ownerUserId === input.ownerUserId
      );
      if (index < 0) return null;
      notes[index] = {
        ...notes[index]!,
        text: input.text,
        resultChecksum: input.resultChecksum,
        updatedAt: input.now
      };
      return notes[index]!;
    }),
    delete: vi.fn(async (input) => {
      const index = notes.findIndex(
        (note) =>
          note.id === input.noteId &&
          note.calculationId === input.calculationId &&
          note.ownerUserId === input.ownerUserId
      );
      if (index < 0) return false;
      notes.splice(index, 1);
      return true;
    })
  };
}

function createMatrixReportStore(): MatrixReportStore {
  let report: Awaited<ReturnType<MatrixReportStore["findByCalculation"]>> = null;
  return {
    findByCalculation: vi.fn(async () => report),
    upsert: vi.fn(async (input) => {
      report = {
        id: report?.id ?? input.id,
        calculationId: input.calculationId,
        ownerUserId: input.ownerUserId,
        source: input.source,
        status: input.status,
        locale: input.locale,
        content: input.content,
        plainText: input.plainText,
        resultChecksum: input.resultChecksum,
        revision: (report?.revision ?? 0) + 1,
        modelId: input.modelId,
        promptVersion: input.promptVersion,
        createdAt: report?.createdAt ?? input.now,
        updatedAt: input.now
      };
      return report;
    })
  };
}

function createCalculationPdfJobStore(): CalculationPdfJobStore {
  let job: Awaited<ReturnType<CalculationPdfJobStore["findLatestByCalculation"]>> = null;
  return {
    findLatestByCalculation: vi.fn(async () => job),
    findById: vi.fn(async () => job),
    findByJobId: vi.fn(async (input) => (job?.id === input.jobId ? job : null)),
    enqueue: vi.fn(async (input) => {
      job ??= {
        id: input.id,
        calculationId: input.calculationId,
        ownerUserId: input.ownerUserId,
        module: input.module,
        methodCode: input.methodCode,
        resultChecksum: input.resultChecksum,
        locale: input.locale,
        sourceLocator: input.sourceLocator,
        documentFingerprint: input.documentFingerprint,
        status: "queued",
        artifactId: input.artifactId,
        mediaAssetId: input.mediaAssetId,
        failureCode: null,
        failureReason: null,
        pageCount: null,
        createdAt: input.now,
        updatedAt: input.now
      };
      return job;
    }),
    claimForRendering: vi.fn(async () => null),
    complete: vi.fn(async () => null),
    fail: vi.fn(async () => null)
  };
}

function reportBody(expectedResultChecksum: string) {
  return {
    locale: "ru",
    status: "ready",
    expectedResultChecksum,
    content: {
      overview: "Общая картина",
      corePortrait: "Ядро личности",
      strengthsAndTalents: "Сильные стороны",
      growthAreas: "Зоны роста",
      moneyAndRealization: "Деньги и реализация",
      relationships: "Отношения",
      lineageThemes: "Родовые темы",
      purposes: "Предназначения",
      yearProjection: null,
      reflectionQuestions: ["Что хочется исследовать?"],
      practicalSteps: ["Выбрать один шаг."],
      disclaimer: "Матрица — инструмент рефлексии."
    }
  };
}

function createProfileStore(): AstrologerProfileStore {
  return {
    findByOwnerUserId: vi.fn(async () => ({
      ownerUserId,
      publicHandle: "anton",
      publicName: "Антон",
      headline: null,
      bio: null,
      timezone: "Europe/Moscow",
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

function createAuthStore(): AuthSessionAuthenticationStore {
  const tokenHash = hashSessionToken(sessionToken);
  return {
    findByTokenHash: vi.fn(async (candidateTokenHash: string) =>
      candidateTokenHash === tokenHash
        ? {
            session: {
              id: "8624104d-6f9b-4983-958e-9dbec6f0473c",
              userId: ownerUserId,
              tokenHash,
              status: "active" as const,
              createdAt: now.toISOString(),
              expiresAt: "2026-07-20T00:00:00.000Z"
            },
            user: {
              id: ownerUserId,
              status: "active" as const,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString()
            },
            roleAssignments: [
              {
                id: "f7e4d8ea-7d14-4e54-a19a-9412307b3e8d",
                userId: ownerUserId,
                role: "astrologer" as const,
                assignedAt: now.toISOString()
              }
            ]
          }
        : null
    )
  };
}

function previewBody(): Record<string, unknown> {
  return {
    mode: "individual",
    methodCode: "ladini_22",
    participants: [{ role: "subject", source: "crm_client", clientId }],
    projection: { kind: "none" }
  };
}

function persistBody(): Record<string, unknown> {
  const body = { ...previewBody() };
  delete body.projection;
  return body;
}

function sessionCookieHeader(): string {
  return `${sessionCookieName}=${sessionToken}`;
}

function csrfHeaders(): Record<string, string> {
  return {
    cookie: `${sessionCookieHeader()}; ${csrfCookieName}=${currentCsrfToken}`,
    origin: "http://localhost:3000",
    [csrfHeaderName]: currentCsrfToken
  };
}

function raise(): never {
  throw new Error("Unexpected dependency call");
}
