import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chartMethodVersions,
  chartResultSchema,
  type ChartExecutionProfile,
  type ReproducibleChartResult
} from "@elevenhouse/contracts";
import {
  approveCalculationInterpretation,
  buildChartResultReproducibilityFingerprint,
  CALCULATION_PDF_DELETE_REQUESTED_EVENT,
  createCalculation,
  publishCalculationToClient,
  saveCalculationInterpretation,
  sha256CanonicalJson,
  type CanonicalJson,
  type CalculationParticipant
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import {
  createDrizzleCalculationPdfJobStore,
  createDrizzleCalculationStore
} from "../calculations";
import { replaceCalculationResultWithInvalidation } from "./chart-calculation-replacement";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const digest = (character: string) => `sha256:${character.repeat(64)}`;
const executionProfile: ChartExecutionProfile = {
  provider: "kerykeion",
  kerykeionVersion: "5.12.9",
  pyswissephVersion: "2.10.3.2",
  expectedEphemeris: "moshier",
  expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
  expectedEphemerisDataRevision: null
};
type NatalChartResultV2 = Extract<ReproducibleChartResult, { readonly method: "natal" }>;
type CompositeChartResultV2 = Extract<ReproducibleChartResult, { readonly method: "composite" }>;

describe("chart calculation replacement Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const ownerUserIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      if (ownerUserIds.length > 0) {
        await runtime.pool.query(
          `delete from audit_log_entries
           where actor_user_id = any($1)
              or (
                target_type = 'calculation'
                and target_id in (
                  select id::text from calculation_records where owner_user_id = any($1)
                )
              )`,
          [ownerUserIds]
        );
        await runtime.pool.query("delete from calculation_records where owner_user_id = any($1)", [
          ownerUserIds
        ]);
        await runtime.pool.query("delete from users where id = any($1)", [ownerUserIds]);
      }
    } finally {
      await runtime.close();
    }
  });

  it("replaces the same calculation and invalidates interpretations, publication and PDFs atomically", async () => {
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const clientId = randomUUID();
    const participant = chartParticipant(clientId);
    const calculationStore = createDrizzleCalculationStore(runtime.database);
    const pdfStore = createDrizzleCalculationPdfJobStore(runtime.database);
    const initialResult = currentNatalResult();
    const calculation = await createCalculation({
      store: calculationStore,
      ownerUserId,
      module: "chart",
      mode: "individual",
      interpretationMode: "adult_natal",
      methodCode: "natal",
      title: "Saved natal",
      participants: [participant],
      linkClientIds: [clientId],
      requestFingerprint: digest("a"),
      inputData: chartInputData(initialResult),
      resultData: initialResult,
      resultSummary: { previous: true },
      resultChecksum: chartChecksum(initialResult),
      expectedChartExecutionProfile: executionProfile,
      idGenerator: randomUUID,
      now: new Date("2026-08-03T10:00:00.000Z")
    });
    const draft = await saveCalculationInterpretation({
      store: calculationStore,
      ownerUserId,
      calculationId: calculation.id,
      expectedResultChecksum: calculation.resultChecksum,
      source: "manual",
      text: "Approved old interpretation",
      modelId: null,
      promptVersion: null,
      interpretationIdGenerator: randomUUID,
      now: new Date("2026-08-03T10:01:00.000Z")
    });
    const interpretationId = draft.interpretations[0]?.id ?? raise("Expected interpretation");
    await approveCalculationInterpretation({
      store: calculationStore,
      ownerUserId,
      calculationId: calculation.id,
      interpretationId,
      now: new Date("2026-08-03T10:02:00.000Z")
    });
    await publishCalculationToClient({
      store: calculationStore,
      ownerUserId,
      calculationId: calculation.id,
      clientId,
      expectedResultChecksum: calculation.resultChecksum,
      expectedChartExecutionProfile: executionProfile,
      now: new Date("2026-08-03T10:03:00.000Z")
    });
    const pdfIds = candidatePdfIds();
    const pdf = await pdfStore.enqueue({
      ...pdfIds,
      ownerUserId,
      calculationId: calculation.id,
      module: "chart",
      methodCode: "natal",
      resultChecksum: calculation.resultChecksum,
      locale: "ru",
      sourceLocator: { kind: "approved_interpretation", interpretationId },
      documentFingerprint: digest("c"),
      privateStorageBucket: "calculation-pdfs",
      storageKey: `owners/${ownerUserId}/calculation-pdfs/${pdfIds.id}.pdf`,
      originalFileName: "natal.pdf",
      now: "2026-08-03T10:04:00.000Z"
    });
    expect(pdf).not.toBeNull();

    const replacementResult = currentNatalResult();
    const replacementChecksum = chartChecksum(replacementResult);
    const outcome = await runtime.database.transaction((transaction) =>
      replaceCalculationResultWithInvalidation(transaction, {
        ownerUserId,
        calculationId: calculation.id,
        expectedModule: "chart",
        replacementMode: "individual",
        expectedMethodCode: "natal",
        expectedSourceChecksum: calculation.resultChecksum,
        participants: [{ ...participant, displayName: "Current subject name" }],
        requestFingerprint: digest("d"),
        inputData: chartInputData(replacementResult),
        resultData: replacementResult,
        resultSummary: { current: true },
        resultChecksum: replacementChecksum,
        expectedExecutionProfile: executionProfile,
        now: new Date("2026-08-03T10:10:00.000Z")
      })
    );

    expect(outcome).toMatchObject({ kind: "replaced", calculationId: calculation.id });
    const current = await calculationStore.findByOwnerAndId({
      ownerUserId,
      calculationId: calculation.id
    });
    expect(current).toMatchObject({
      id: calculation.id,
      status: "linked",
      interpretationMode: "adult_natal",
      requestFingerprint: digest("d"),
      resultChecksum: replacementChecksum,
      inputData: chartInputData(replacementResult),
      resultData: { schemaVersion: "chart-result.v2" },
      interpretations: [],
      artifacts: [],
      participants: [{ clientId, displayName: "Current subject name" }],
      links: [{ clientId, visibility: "private_to_astrologer", publishedAt: null }]
    });
    const [publicationBinding] = (
      await runtime.pool.query<{
        published_interpretation_id: string | null;
        published_result_checksum: string | null;
      }>(
        `select published_interpretation_id, published_result_checksum
         from calculation_client_links
         where calculation_id = $1 and client_id = $2`,
        [calculation.id, clientId]
      )
    ).rows;
    expect(publicationBinding).toEqual({
      published_interpretation_id: null,
      published_result_checksum: null
    });

    const state = await runtime.pool.query<{
      pdf_jobs: string;
      artifacts: string;
      media_assets: string;
      cleanup_events: string;
      cleanup_payload: { mediaAssetId: string } | null;
    }>(
      `select
         (select count(*) from calculation_pdf_jobs where calculation_id = $1) as pdf_jobs,
         (select count(*) from calculation_artifacts where calculation_id = $1) as artifacts,
         (select count(*) from media_assets where id = $2) as media_assets,
         count(*) filter (where event_type = $3 and aggregate_id = $2) as cleanup_events,
         max(payload::text) filter (where event_type = $3 and aggregate_id = $2)::jsonb as cleanup_payload
       from outbox_events`,
      [calculation.id, pdfIds.mediaAssetId, CALCULATION_PDF_DELETE_REQUESTED_EVENT]
    );
    expect(state.rows[0]).toEqual({
      pdf_jobs: "0",
      artifacts: "0",
      media_assets: "1",
      cleanup_events: "1",
      cleanup_payload: { mediaAssetId: pdfIds.mediaAssetId }
    });
  });

  it("repairs the precise legacy relationship mode and missing partner row under the same ID", async () => {
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const subjectClientId = randomUUID();
    const partnerClientId = randomUUID();
    const subject = chartParticipant(subjectClientId);
    const partner: CalculationParticipant = {
      role: "partner",
      source: "crm_client",
      clientId: partnerClientId,
      displayName: "Current partner"
    };
    const store = createDrizzleCalculationStore(runtime.database);
    const legacySource = legacyCompositeSource(
      subjectClientId.toUpperCase(),
      partnerClientId.toUpperCase()
    );
    const calculation = await createCalculation({
      store,
      ownerUserId,
      module: "chart",
      mode: "individual",
      methodCode: "composite",
      title: "Legacy composite",
      participants: [subject],
      linkClientIds: [],
      requestFingerprint: digest("6"),
      inputData: legacySource.inputData,
      resultData: legacySource.resultData,
      resultSummary: { legacy: true },
      resultChecksum: digest("7"),
      idGenerator: randomUUID,
      now: new Date("2026-08-03T10:20:00.000Z")
    });

    const replacementResult = currentCompositeResult();
    const replacementInputData = {
      inputSnapshot: {
        inputSnapshot: replacementResult.inputSnapshot,
        partnerInputSnapshot: replacementResult.partnerInputSnapshot
      },
      settings: replacementResult.settings
    };
    const replacementChecksum = sha256CanonicalJson(replacementResult as unknown as CanonicalJson);
    const outcome = await runtime.database.transaction((transaction) =>
      replaceCalculationResultWithInvalidation(transaction, {
        ownerUserId,
        calculationId: calculation.id,
        expectedModule: "chart",
        replacementMode: "compatibility",
        expectedMethodCode: "composite",
        expectedSourceChecksum: calculation.resultChecksum,
        participants: [{ ...subject, displayName: "Current subject" }, partner],
        requestFingerprint: digest("8"),
        inputData: replacementInputData,
        resultData: replacementResult,
        resultSummary: { legacy: false },
        resultChecksum: replacementChecksum,
        expectedExecutionProfile: executionProfile,
        now: new Date("2026-08-03T10:30:00.000Z")
      })
    );

    expect(outcome).toEqual({ kind: "replaced", calculationId: calculation.id });
    await expect(
      store.findByOwnerAndId({ ownerUserId, calculationId: calculation.id })
    ).resolves.toMatchObject({
      id: calculation.id,
      mode: "compatibility",
      methodCode: "composite",
      participants: [
        { role: "subject", clientId: subjectClientId, displayName: "Current subject" },
        { role: "partner", clientId: partnerClientId, displayName: "Current partner" }
      ],
      resultChecksum: replacementChecksum
    });
  });

  it("rejects stale checksum, target drift and participant drift without mutation", async () => {
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const clientId = randomUUID();
    const participant = chartParticipant(clientId);
    const store = createDrizzleCalculationStore(runtime.database);
    const calculation = await createCalculation({
      store,
      ownerUserId,
      module: "chart",
      mode: "individual",
      methodCode: "natal",
      title: "Protected target",
      participants: [participant],
      linkClientIds: [],
      requestFingerprint: digest("1"),
      inputData: { original: true },
      resultData: { original: true },
      resultSummary: { original: true },
      resultChecksum: digest("2"),
      idGenerator: randomUUID,
      now: new Date("2026-08-03T11:00:00.000Z")
    });
    const replacement = {
      ownerUserId,
      calculationId: calculation.id,
      expectedModule: "chart" as const,
      replacementMode: "individual" as const,
      expectedMethodCode: "natal",
      expectedSourceChecksum: calculation.resultChecksum,
      participants: [participant],
      requestFingerprint: digest("3"),
      inputData: { replacement: true },
      resultData: { replacement: true },
      resultSummary: { replacement: true },
      resultChecksum: digest("4"),
      expectedExecutionProfile: executionProfile,
      now: new Date("2026-08-03T11:10:00.000Z")
    };

    await expect(
      runtime.database.transaction((transaction) =>
        replaceCalculationResultWithInvalidation(transaction, {
          ...replacement,
          expectedSourceChecksum: digest("f")
        })
      )
    ).resolves.toEqual({ kind: "source_changed" });
    await expect(
      runtime.database.transaction((transaction) =>
        replaceCalculationResultWithInvalidation(transaction, {
          ...replacement,
          expectedMethodCode: "transit"
        })
      )
    ).resolves.toEqual({ kind: "target_mismatch" });
    await expect(
      runtime.database.transaction((transaction) =>
        replaceCalculationResultWithInvalidation(transaction, {
          ...replacement,
          participants: [chartParticipant(randomUUID())]
        })
      )
    ).resolves.toEqual({ kind: "participant_mismatch" });

    await expect(
      store.findByOwnerAndId({ ownerUserId, calculationId: calculation.id })
    ).resolves.toMatchObject({
      requestFingerprint: digest("1"),
      inputData: { original: true },
      resultData: { original: true },
      resultChecksum: digest("2")
    });
  });

  it("revalidates canonical v2 evidence inside the replacement transaction before mutation", async () => {
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const participant = chartParticipant(randomUUID());
    const store = createDrizzleCalculationStore(runtime.database);
    const calculation = await createCalculation({
      store,
      ownerUserId,
      module: "chart",
      mode: "individual",
      methodCode: "natal",
      title: "Integrity protected target",
      participants: [participant],
      linkClientIds: [],
      requestFingerprint: digest("1"),
      inputData: { original: true },
      resultData: { original: true },
      resultSummary: { original: true },
      resultChecksum: digest("2"),
      idGenerator: randomUUID,
      now: new Date("2026-08-03T11:12:00.000Z")
    });
    const valid = currentNatalResult();
    const corrupted = {
      ...valid,
      result: {
        ...valid.result,
        points: [{ ...valid.result.points[0]!, longitude: 42 }, ...valid.result.points.slice(1)]
      }
    };

    await expect(
      runtime.database.transaction((transaction) =>
        replaceCalculationResultWithInvalidation(transaction, {
          ownerUserId,
          calculationId: calculation.id,
          expectedModule: "chart",
          replacementMode: "individual",
          expectedMethodCode: "natal",
          expectedSourceChecksum: calculation.resultChecksum,
          participants: [participant],
          requestFingerprint: digest("3"),
          inputData: chartInputData(valid),
          resultData: corrupted,
          resultSummary: { replacement: true },
          resultChecksum: chartChecksum(valid),
          expectedExecutionProfile: executionProfile,
          now: new Date("2026-08-03T11:13:00.000Z")
        })
      )
    ).rejects.toMatchObject({
      name: "ChartCalculationReplacementError",
      code: "CHART_REPLACEMENT_RESULT_INTEGRITY_INVALID"
    });
    await expect(
      store.findByOwnerAndId({ ownerUserId, calculationId: calculation.id })
    ).resolves.toMatchObject({
      requestFingerprint: digest("1"),
      inputData: { original: true },
      resultData: { original: true },
      resultChecksum: digest("2")
    });
  });

  it.each(["non_v1", "relationship_mismatch"] as const)(
    "rejects an inexact legacy relationship defect: %s",
    async (corruption) => {
      const ownerUserId = await createUser();
      ownerUserIds.push(ownerUserId);
      const subjectClientId = randomUUID();
      const partnerClientId = randomUUID();
      const subject = chartParticipant(subjectClientId);
      const partner: CalculationParticipant = {
        role: "partner",
        source: "crm_client",
        clientId: partnerClientId,
        displayName: "Current partner"
      };
      const source = legacyCompositeSource(subjectClientId, partnerClientId);
      const resultData =
        corruption === "non_v1"
          ? { ...source.resultData, schemaVersion: "chart-result.v2" }
          : source.resultData;
      const inputData =
        corruption === "relationship_mismatch"
          ? {
              ...source.inputData,
              inputSnapshot: {
                ...source.inputData.inputSnapshot,
                relationshipSnapshot: {
                  ...source.inputData.inputSnapshot.relationshipSnapshot,
                  partnerClientId: randomUUID()
                }
              }
            }
          : source.inputData;
      const store = createDrizzleCalculationStore(runtime.database);
      const calculation = await createCalculation({
        store,
        ownerUserId,
        module: "chart",
        mode: "individual",
        methodCode: "composite",
        title: "Inexact legacy composite",
        participants: [subject],
        linkClientIds: [],
        requestFingerprint: digest("a"),
        inputData,
        resultData,
        resultSummary: { legacy: true },
        resultChecksum: digest("b"),
        idGenerator: randomUUID,
        now: new Date("2026-08-03T11:20:00.000Z")
      });

      const outcome = await runtime.database.transaction((transaction) =>
        replaceCalculationResultWithInvalidation(transaction, {
          ownerUserId,
          calculationId: calculation.id,
          expectedModule: "chart",
          replacementMode: "compatibility",
          expectedMethodCode: "composite",
          expectedSourceChecksum: calculation.resultChecksum,
          participants: [{ ...subject, displayName: "Current subject" }, partner],
          requestFingerprint: digest("c"),
          inputData: { current: true },
          resultData: { schemaVersion: "chart-result.v2", method: "composite" },
          resultSummary: { legacy: false },
          resultChecksum: digest("d"),
          expectedExecutionProfile: executionProfile,
          now: new Date("2026-08-03T11:30:00.000Z")
        })
      );

      expect(outcome).toEqual({ kind: "target_mismatch" });
      await expect(
        store.findByOwnerAndId({ ownerUserId, calculationId: calculation.id })
      ).resolves.toMatchObject({
        mode: "individual",
        requestFingerprint: digest("a"),
        resultChecksum: digest("b"),
        participants: [{ role: "subject", clientId: subjectClientId }]
      });
    }
  );

  it("serializes concurrent replacements for one exact calculation key", async () => {
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const firstParticipant = chartParticipant(randomUUID());
    const secondParticipant = chartParticipant(randomUUID());
    const store = createDrizzleCalculationStore(runtime.database);
    const calculations = await Promise.all(
      [
        { participant: firstParticipant, fingerprint: digest("1"), checksum: digest("2") },
        { participant: secondParticipant, fingerprint: digest("3"), checksum: digest("4") }
      ].map((candidate, index) =>
        createCalculation({
          store,
          ownerUserId,
          module: "chart",
          mode: "individual",
          methodCode: "natal",
          title: `Concurrent target ${index + 1}`,
          participants: [candidate.participant],
          linkClientIds: [],
          requestFingerprint: candidate.fingerprint,
          inputData: { source: index + 1 },
          resultData: { source: index + 1 },
          resultSummary: { source: index + 1 },
          resultChecksum: candidate.checksum,
          idGenerator: randomUUID,
          now: new Date("2026-08-03T12:00:00.000Z")
        })
      )
    );
    const first = calculations[0] ?? raise("Expected first concurrent target");
    const second = calculations[1] ?? raise("Expected second concurrent target");
    const requestFingerprint = digest("5");
    const replacementResult = currentNatalResult();
    const replace = (calculation: typeof first, participant: CalculationParticipant) =>
      runtime.database.transaction((transaction) =>
        replaceCalculationResultWithInvalidation(transaction, {
          ownerUserId,
          calculationId: calculation.id,
          expectedModule: "chart",
          replacementMode: "individual",
          expectedMethodCode: "natal",
          expectedSourceChecksum: calculation.resultChecksum,
          participants: [participant],
          requestFingerprint,
          inputData: chartInputData(replacementResult),
          resultData: replacementResult,
          resultSummary: { replacement: calculation.id },
          resultChecksum: chartChecksum(replacementResult),
          expectedExecutionProfile: executionProfile,
          now: new Date("2026-08-03T12:10:00.000Z")
        })
      );

    const outcomes = await Promise.all([
      replace(first, firstParticipant),
      replace(second, secondParticipant)
    ]);

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual([
      "exact_key_conflict",
      "replaced"
    ]);
    const rows = await runtime.pool.query<{ id: string }>(
      `select id from calculation_records
       where owner_user_id = $1 and module = 'chart' and mode = 'individual'
         and method_code = 'natal' and request_fingerprint = $2 and status <> 'archived'`,
      [ownerUserId, requestFingerprint]
    );
    expect(rows.rows).toHaveLength(1);
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user id");
  }
});

function chartParticipant(clientId: string): CalculationParticipant {
  return {
    role: "subject",
    source: "crm_client",
    clientId,
    displayName: "Saved subject"
  };
}

function candidatePdfIds() {
  return {
    id: randomUUID(),
    mediaAssetId: randomUUID(),
    artifactId: randomUUID(),
    outboxEventId: randomUUID()
  };
}

function legacyCompositeSource(subjectClientId: string, partnerClientId: string) {
  const inputSnapshot = legacyBirthSnapshot("1990-07-15", "10:30", 41.9028, 12.4964);
  const partnerInputSnapshot = legacyBirthSnapshot("1992-08-11", "22:15", 55.7558, 37.6173);
  const relationshipSnapshot = {
    primaryClientId: subjectClientId,
    partnerClientId
  };
  const settings = chartSettings();
  const resultData = chartResultSchema.parse({
    schemaVersion: "chart-result.v1",
    method: "composite",
    provider: { name: "kerykeion", version: "5.12.9", ephemeris: "swiss-ephemeris" },
    settings,
    inputSnapshot,
    partnerInputSnapshot,
    relationshipSnapshot,
    result: legacyRenderResult()
  });
  if (resultData.schemaVersion !== "chart-result.v1" || resultData.method !== "composite") {
    throw new Error("Expected legacy composite fixture");
  }
  return {
    inputData: {
      inputSnapshot: { inputSnapshot, partnerInputSnapshot, relationshipSnapshot },
      settings
    },
    resultData
  };
}

function currentNatalResult(): NatalChartResultV2 {
  const candidate = chartResultSchema.parse({
    schemaVersion: "chart-result.v2",
    method: "natal",
    methodVersion: chartMethodVersions.natal,
    provider: {
      name: "kerykeion",
      version: "5.12.9",
      pyswissephVersion: "2.10.3.2",
      ephemeris: "moshier",
      ephemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
      ephemerisDataRevision: null
    },
    reproducibilityFingerprint: digest("0"),
    settings: chartSettings(),
    inputSnapshot: legacyBirthSnapshot("1990-07-15", "10:30", 41.9028, 12.4964),
    result: legacyRenderResult()
  });
  if (candidate.schemaVersion !== "chart-result.v2" || candidate.method !== "natal") {
    throw new Error("Expected current natal fixture");
  }
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  } as NatalChartResultV2;
}

function currentCompositeResult(): CompositeChartResultV2 {
  const candidate = chartResultSchema.parse({
    schemaVersion: "chart-result.v2",
    method: "composite",
    methodVersion: chartMethodVersions.composite,
    provider: {
      name: "kerykeion",
      version: executionProfile.kerykeionVersion,
      pyswissephVersion: executionProfile.pyswissephVersion,
      ephemeris: executionProfile.expectedEphemeris,
      ephemerisFlags: executionProfile.expectedEphemerisFlags,
      ephemerisDataRevision: executionProfile.expectedEphemerisDataRevision
    },
    reproducibilityFingerprint: digest("0"),
    settings: chartSettings(),
    inputSnapshot: legacyBirthSnapshot("1990-07-15", "10:30", 41.9028, 12.4964),
    partnerInputSnapshot: legacyBirthSnapshot("1992-08-11", "22:15", 55.7558, 37.6173),
    result: legacyRenderResult()
  });
  if (candidate.schemaVersion !== "chart-result.v2" || candidate.method !== "composite") {
    throw new Error("Expected current composite fixture");
  }
  return {
    ...candidate,
    reproducibilityFingerprint: buildChartResultReproducibilityFingerprint(candidate)
  } as CompositeChartResultV2;
}

function chartInputData(result: ReturnType<typeof currentNatalResult>) {
  return { inputSnapshot: result.inputSnapshot, settings: result.settings };
}

function chartChecksum(result: ReturnType<typeof currentNatalResult>) {
  return sha256CanonicalJson(result as unknown as CanonicalJson);
}

function chartSettings() {
  return {
    zodiac: "tropical" as const,
    houseSystem: "placidus" as const,
    nodeType: "true" as const,
    aspectPreset: "major" as const,
    orbMultiplier: 1
  };
}

function legacyBirthSnapshot(
  birthDate: string,
  birthTime: string,
  latitude: number,
  longitude: number
) {
  return {
    birthDate,
    birthTime,
    timezone: "Europe/Moscow",
    latitude,
    longitude,
    birthTimePrecision: "exact" as const
  };
}

function legacyRenderResult() {
  return {
    points: [
      "sun",
      "moon",
      "mercury",
      "venus",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
      "pluto",
      "ascendant",
      "midheaven",
      "north_node",
      "south_node"
    ].map((id, index) => ({
      id,
      label: id,
      longitude: index * 20,
      sign: "aries",
      signDegree: index % 29,
      house: index < 12 ? index + 1 : null,
      retrograde: false
    })),
    houses: Array.from({ length: 12 }, (_, index) => ({
      number: index + 1,
      longitude: index * 30,
      sign: "aries",
      signDegree: 0
    })),
    aspects: [],
    distributions: {
      elements: { fire: 3, earth: 3, air: 2, water: 2 },
      modalities: { cardinal: 4, fixed: 3, mutable: 3 },
      polarity: { masculine: 5, feminine: 5 }
    },
    warnings: []
  };
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}
