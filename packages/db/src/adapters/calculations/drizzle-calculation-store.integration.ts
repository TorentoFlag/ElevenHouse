import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveCalculationInterpretation,
  archiveCalculation,
  CALCULATION_PDF_DELETE_REQUESTED_EVENT,
  CalculationAlreadyExistsError,
  CalculationInterpretationModeUnavailableError,
  createCalculation,
  linkCalculationToClient,
  publishCalculationToClient,
  recalculateCalculation,
  saveCalculationInterpretation,
  type CalculationParticipant
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleCalculationPdfJobStore, createDrizzleCalculationStore } from "./index";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const digest = (character: string) => `sha256:${character.repeat(64)}`;

describe("calculations Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const ownerUserIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      await clearAuditFailureTrigger();
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

  it("persists, hydrates and replaces one current result transactionally", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    const otherOwnerUserId = await createUser();
    ownerUserIds.push(ownerUserId, otherOwnerUserId);
    const clientId = randomUUID();
    const partnerClientId = randomUUID();
    const participants = createParticipants(clientId, partnerClientId);

    const created = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "compatibility",
      methodCode: "pythagorean",
      title: "Compatibility matrix",
      participants,
      linkClientIds: [],
      requestFingerprint: digest("a"),
      inputData: { participants: [{ name: "Alice" }, { name: "Bob" }] },
      resultData: { pairNumber: 7 },
      resultSummary: { overall: "mixed" },
      resultChecksum: digest("b"),
      idGenerator: randomUUID,
      now: new Date("2026-07-06T10:00:00.000Z")
    });

    expect(created).toMatchObject({
      ownerUserId,
      methodCode: "pythagorean",
      requestFingerprint: digest("a"),
      resultData: { pairNumber: 7 },
      participants: [{ clientId }, { clientId: partnerClientId }]
    });
    expect(created).not.toHaveProperty("versions");
    await expect(
      store.findByOwnerAndId({ ownerUserId: otherOwnerUserId, calculationId: created.id })
    ).resolves.toBeNull();
    await expect(
      store.findExact({
        ownerUserId,
        module: "numerology",
        mode: "compatibility",
        methodCode: "pythagorean",
        requestFingerprint: digest("a")
      })
    ).resolves.toMatchObject({ id: created.id });

    await store.ensureClientLinks({
      ownerUserId,
      calculationId: created.id,
      clientIds: [clientId, partnerClientId, clientId],
      now: "2026-07-06T10:05:00.000Z"
    });
    await expect(
      saveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: created.id,
        expectedResultChecksum: digest("c"),
        source: "manual",
        text: "Stale interpretation",
        modelId: null,
        promptVersion: null,
        interpretationIdGenerator: randomUUID,
        now: new Date("2026-07-06T10:05:30.000Z")
      })
    ).rejects.toThrow("Calculation changed while interpretation was being saved");
    const draft = await saveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      expectedResultChecksum: created.resultChecksum,
      source: "manual",
      text: "Approved interpretation",
      modelId: null,
      promptVersion: null,
      interpretationIdGenerator: randomUUID,
      now: new Date("2026-07-06T10:06:00.000Z")
    });
    const interpretationId = draft.interpretations[0]?.id ?? raise("Expected interpretation");
    await approveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: created.id,
      interpretationId,
      now: new Date("2026-07-06T10:07:00.000Z")
    });
    const published = await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: created.id,
      clientId,
      expectedResultChecksum: created.resultChecksum,
      now: new Date("2026-07-06T10:08:00.000Z")
    });
    expect(linkByClient(published, clientId).visibility).toBe("visible_to_client");

    const replaced = await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      participants: participants.map((participant) => ({
        ...participant,
        displayName: `${participant.displayName} updated`
      })),
      requestFingerprint: digest("c"),
      inputData: { recalculated: true },
      resultData: { pairNumber: 8 },
      resultSummary: { overall: "attention" },
      resultChecksum: digest("d"),
      now: new Date("2026-07-06T10:10:00.000Z")
    });
    expect(replaced).toMatchObject({
      status: "linked",
      requestFingerprint: digest("c"),
      resultData: { pairNumber: 8 },
      interpretations: []
    });
    expect(replaced.links.every((link) => link.visibility === "private_to_astrologer")).toBe(true);
    expect(replaced.participants.map((participant) => participant.displayName)).toEqual([
      "Alice updated",
      "Bob updated"
    ]);

    const archived = await archiveCalculation({
      store,
      ownerUserId,
      calculationId: created.id,
      now: new Date("2026-07-06T10:20:00.000Z")
    });
    expect(archived.status).toBe("archived");
  });

  it("replays exact creates and rejects replacement collisions without mutation", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const clientId = randomUUID();
    const base = {
      store,
      ownerUserId,
      module: "numerology" as const,
      mode: "individual" as const,
      methodCode: "pythagorean",
      participants: createParticipants(clientId).slice(0, 1),
      linkClientIds: [],
      inputData: { name: "Alice" },
      resultData: { lifePath: 2 },
      resultSummary: { lifePath: 2 },
      resultChecksum: digest("f"),
      now: new Date("2026-07-06T11:00:00.000Z")
    };
    const [first, replay] = await Promise.all([
      createCalculation({
        ...base,
        title: "First",
        requestFingerprint: digest("e"),
        idGenerator: randomUUID
      }),
      createCalculation({
        ...base,
        title: "Replay",
        requestFingerprint: digest("e"),
        idGenerator: randomUUID
      })
    ]);
    expect(replay.id).toBe(first.id);

    const other = await createCalculation({
      ...base,
      title: "Other",
      requestFingerprint: digest("1"),
      resultChecksum: digest("2"),
      idGenerator: randomUUID
    });
    await expect(
      recalculateCalculation({
        store,
        ownerUserId,
        calculationId: first.id,
        participants: first.participants,
        requestFingerprint: other.requestFingerprint,
        inputData: { collision: true },
        resultData: { lifePath: 9 },
        resultSummary: {},
        resultChecksum: digest("3"),
        now: new Date("2026-07-06T11:10:00.000Z")
      })
    ).rejects.toBeInstanceOf(CalculationAlreadyExistsError);
    await expect(
      store.findByOwnerAndId({ ownerUserId, calculationId: first.id })
    ).resolves.toMatchObject({ requestFingerprint: digest("e"), resultData: { lifePath: 2 } });
  });

  it("atomically audits interpretation lifecycle and binds publication to the selected version", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const clientId = randomUUID();
    const resultChecksum = digest("a");
    const calculation = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      title: "Publication binding",
      participants: createParticipants(clientId).slice(0, 1),
      linkClientIds: [clientId],
      requestFingerprint: digest("b"),
      inputData: { name: "Private client name" },
      resultData: { lifePath: 7 },
      resultSummary: { lifePath: 7 },
      resultChecksum,
      idGenerator: randomUUID,
      now: new Date("2026-08-03T10:00:00.000Z")
    });
    const firstInterpretationId = "00000000-0000-4000-8000-0000000000a0";
    const secondInterpretationId = "00000000-0000-4000-8000-0000000000b0";

    await saveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: calculation.id,
      expectedResultChecksum: resultChecksum,
      source: "manual",
      text: "First private interpretation text",
      modelId: null,
      promptVersion: null,
      interpretationIdGenerator: () => firstInterpretationId,
      now: new Date("2026-08-03T10:01:00.000Z")
    });
    const firstApproval = await approveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: calculation.id,
      interpretationId: firstInterpretationId,
      now: new Date("2026-08-03T10:02:00.000Z")
    });
    const replayedApproval = await store.approveInterpretation({
      ownerUserId,
      calculationId: calculation.id,
      interpretationId: firstInterpretationId,
      now: "2026-08-03T10:03:00.000Z"
    });
    expect(replayedApproval).not.toBeNull();
    expect(
      replayedApproval?.interpretations.find(({ id }) => id === firstInterpretationId)?.approvedAt
    ).toBe("2026-08-03T10:02:00.000Z");
    expect(
      replayedApproval?.interpretations.find(({ id }) => id === firstInterpretationId)?.updatedAt
    ).toBe(firstApproval.interpretations.find(({ id }) => id === firstInterpretationId)?.updatedAt);
    expect(replayedApproval?.updatedAt).toBe(firstApproval.updatedAt);

    const firstPublication = await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: calculation.id,
      clientId,
      expectedResultChecksum: resultChecksum,
      now: new Date("2026-08-03T10:04:00.000Z")
    });
    const replayedPublication = await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: calculation.id,
      clientId,
      expectedResultChecksum: resultChecksum,
      now: new Date("2026-08-03T10:05:00.000Z")
    });
    expect(linkByClient(replayedPublication, clientId).publishedAt).toBe(
      linkByClient(firstPublication, clientId).publishedAt
    );
    expect(replayedPublication.updatedAt).toBe(firstPublication.updatedAt);

    await saveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: calculation.id,
      expectedResultChecksum: resultChecksum,
      source: "ai",
      text: "Second private AI interpretation text",
      modelId: "private-model-id",
      promptVersion: "private-prompt-version",
      interpretationIdGenerator: () => secondInterpretationId,
      now: new Date("2026-08-03T10:06:00.000Z")
    });
    await approveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: calculation.id,
      interpretationId: secondInterpretationId,
      now: new Date("2026-08-03T10:07:00.000Z")
    });

    const bindingBeforeRepublish = await publicationBinding(calculation.id, clientId);
    expect(bindingBeforeRepublish).toMatchObject({
      published_interpretation_id: firstInterpretationId,
      published_result_checksum: resultChecksum,
      published_at: new Date("2026-08-03T10:04:00.000Z")
    });

    await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: calculation.id,
      clientId,
      expectedResultChecksum: resultChecksum,
      now: new Date("2026-08-03T10:08:00.000Z")
    });
    await expect(publicationBinding(calculation.id, clientId)).resolves.toMatchObject({
      published_interpretation_id: secondInterpretationId,
      published_result_checksum: resultChecksum,
      published_at: new Date("2026-08-03T10:08:00.000Z")
    });

    const audit = await runtime.pool.query<{
      actor_user_id: string;
      action: string;
      target_type: string;
      target_id: string;
      metadata: Record<string, unknown>;
    }>(
      `select actor_user_id, action, target_type, target_id, metadata
       from audit_log_entries
       where target_type = 'calculation' and target_id = $1
       order by occurred_at, id`,
      [calculation.id]
    );
    expect(audit.rows).toEqual([
      {
        actor_user_id: ownerUserId,
        action: "calculation.interpretation.saved",
        target_type: "calculation",
        target_id: calculation.id,
        metadata: {
          interpretationId: firstInterpretationId,
          source: "manual",
          resultChecksum
        }
      },
      {
        actor_user_id: ownerUserId,
        action: "calculation.interpretation.approved",
        target_type: "calculation",
        target_id: calculation.id,
        metadata: { interpretationId: firstInterpretationId, resultChecksum }
      },
      {
        actor_user_id: ownerUserId,
        action: "calculation.published",
        target_type: "calculation",
        target_id: calculation.id,
        metadata: { interpretationId: firstInterpretationId, resultChecksum }
      },
      {
        actor_user_id: ownerUserId,
        action: "calculation.interpretation.saved",
        target_type: "calculation",
        target_id: calculation.id,
        metadata: { interpretationId: secondInterpretationId, source: "ai", resultChecksum }
      },
      {
        actor_user_id: ownerUserId,
        action: "calculation.interpretation.approved",
        target_type: "calculation",
        target_id: calculation.id,
        metadata: { interpretationId: secondInterpretationId, resultChecksum }
      },
      {
        actor_user_id: ownerUserId,
        action: "calculation.published",
        target_type: "calculation",
        target_id: calculation.id,
        metadata: { interpretationId: secondInterpretationId, resultChecksum }
      }
    ]);
    const serializedAudit = JSON.stringify(audit.rows);
    expect(serializedAudit).not.toContain("First private interpretation text");
    expect(serializedAudit).not.toContain("Second private AI interpretation text");
    expect(serializedAudit).not.toContain("Private client name");
    expect(serializedAudit).not.toContain("private-model-id");
    expect(serializedAudit).not.toContain("private-prompt-version");

    await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: calculation.id,
      participants: calculation.participants,
      requestFingerprint: digest("c"),
      inputData: { name: "Private client name", recalculated: true },
      resultData: { lifePath: 8 },
      resultSummary: { lifePath: 8 },
      resultChecksum: digest("d"),
      now: new Date("2026-08-03T10:09:00.000Z")
    });
    await expect(publicationBinding(calculation.id, clientId)).resolves.toEqual({
      visibility: "private_to_astrologer",
      published_at: null,
      published_interpretation_id: null,
      published_result_checksum: null
    });
    const remaining = await runtime.pool.query<{ count: string }>(
      "select count(*) from calculation_interpretations where calculation_id = $1",
      [calculation.id]
    );
    expect(remaining.rows[0]?.count).toBe("0");
  });

  it("selects the approved interpretation by approval time, update time and id", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const clientId = randomUUID();
    const resultChecksum = digest("5");
    const calculation = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      title: "Deterministic publication selection",
      participants: createParticipants(clientId).slice(0, 1),
      linkClientIds: [clientId],
      requestFingerprint: digest("6"),
      inputData: { name: "Selection" },
      resultData: { lifePath: 5 },
      resultSummary: { lifePath: 5 },
      resultChecksum,
      idGenerator: randomUUID,
      now: new Date("2026-08-03T10:20:00.000Z")
    });
    const selectedInterpretationId = "00000000-0000-4000-8000-0000000000d1";
    await runtime.pool.query(
      `insert into calculation_interpretations
         (id, calculation_id, source, status, text, approved_at, created_at, updated_at)
       values
         ('00000000-0000-4000-8000-0000000000a1', $1, 'manual', 'approved', 'older approval', $2, $2, $2),
         ('00000000-0000-4000-8000-0000000000b1', $1, 'manual', 'approved', 'older update', $3, $2, $3),
         ('00000000-0000-4000-8000-0000000000c1', $1, 'manual', 'approved', 'lower id', $3, $2, $4),
         ($5, $1, 'manual', 'approved', 'id tie winner', $3, $2, $4)`,
      [
        calculation.id,
        new Date("2026-08-03T10:21:00.000Z"),
        new Date("2026-08-03T10:22:00.000Z"),
        new Date("2026-08-03T10:22:30.000Z"),
        selectedInterpretationId
      ]
    );

    await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: calculation.id,
      clientId,
      expectedResultChecksum: resultChecksum,
      now: new Date("2026-08-03T10:23:00.000Z")
    });

    await expect(publicationBinding(calculation.id, clientId)).resolves.toMatchObject({
      published_interpretation_id: selectedInterpretationId,
      published_result_checksum: resultChecksum
    });
    const audit = await runtime.pool.query<{ metadata: Record<string, unknown> }>(
      `select metadata from audit_log_entries
       where target_type = 'calculation' and target_id = $1 and action = 'calculation.published'`,
      [calculation.id]
    );
    expect(audit.rows).toEqual([
      { metadata: { interpretationId: selectedInterpretationId, resultChecksum } }
    ]);
  });

  it("rolls back save, approval and publication when their audit append fails", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const clientId = randomUUID();
    const resultChecksum = digest("e");
    const calculation = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      title: "Audit rollback",
      participants: createParticipants(clientId).slice(0, 1),
      linkClientIds: [clientId],
      requestFingerprint: digest("f"),
      inputData: { name: "Rollback" },
      resultData: { lifePath: 9 },
      resultSummary: { lifePath: 9 },
      resultChecksum,
      idGenerator: randomUUID,
      now: new Date("2026-08-03T11:00:00.000Z")
    });
    const interpretationId = "00000000-0000-4000-8000-0000000000c0";

    try {
      await failAuditAction("calculation.interpretation.saved", calculation.id);
      await expectForcedAuditFailure(
        saveCalculationInterpretation({
          store,
          ownerUserId,
          calculationId: calculation.id,
          expectedResultChecksum: resultChecksum,
          source: "manual",
          text: "Must roll back",
          modelId: null,
          promptVersion: null,
          interpretationIdGenerator: () => interpretationId,
          now: new Date("2026-08-03T11:01:00.000Z")
        })
      );
      await expect(interpretationState(calculation.id, interpretationId)).resolves.toBeNull();
      await expect(calculationState(calculation.id)).resolves.toMatchObject({
        status: "linked",
        updated_at: new Date("2026-08-03T11:00:00.000Z")
      });

      await clearAuditFailureTrigger();
      await saveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: calculation.id,
        expectedResultChecksum: resultChecksum,
        source: "manual",
        text: "Persisted draft",
        modelId: null,
        promptVersion: null,
        interpretationIdGenerator: () => interpretationId,
        now: new Date("2026-08-03T11:02:00.000Z")
      });
      await failAuditAction("calculation.interpretation.approved", calculation.id);
      await expectForcedAuditFailure(
        approveCalculationInterpretation({
          store,
          ownerUserId,
          calculationId: calculation.id,
          interpretationId,
          now: new Date("2026-08-03T11:03:00.000Z")
        })
      );
      await expect(interpretationState(calculation.id, interpretationId)).resolves.toMatchObject({
        status: "draft",
        approved_at: null,
        updated_at: new Date("2026-08-03T11:02:00.000Z")
      });

      await clearAuditFailureTrigger();
      await approveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: calculation.id,
        interpretationId,
        now: new Date("2026-08-03T11:04:00.000Z")
      });
      await failAuditAction("calculation.published", calculation.id);
      await expectForcedAuditFailure(
        publishCalculationToClient({
          store,
          ownerUserId,
          calculationId: calculation.id,
          clientId,
          expectedResultChecksum: resultChecksum,
          now: new Date("2026-08-03T11:05:00.000Z")
        })
      );
      await expect(publicationBinding(calculation.id, clientId)).resolves.toEqual({
        visibility: "private_to_astrologer",
        published_at: null,
        published_interpretation_id: null,
        published_result_checksum: null
      });
      await expect(calculationState(calculation.id)).resolves.toMatchObject({
        status: "linked",
        updated_at: new Date("2026-08-03T11:04:00.000Z")
      });
    } finally {
      await clearAuditFailureTrigger();
    }
  });

  it("serializes approval against recalculation without leaving a stale publication binding", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const clientId = randomUUID();
    const calculation = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      title: "Approval recalculation race",
      participants: createParticipants(clientId).slice(0, 1),
      linkClientIds: [clientId],
      requestFingerprint: digest("1"),
      inputData: { name: "Concurrent" },
      resultData: { lifePath: 1 },
      resultSummary: { lifePath: 1 },
      resultChecksum: digest("2"),
      idGenerator: randomUUID,
      now: new Date("2026-08-03T12:00:00.000Z")
    });
    const firstInterpretationId = randomUUID();
    const nextInterpretationId = randomUUID();
    await saveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: calculation.id,
      expectedResultChecksum: calculation.resultChecksum,
      source: "manual",
      text: "Published version",
      modelId: null,
      promptVersion: null,
      interpretationIdGenerator: () => firstInterpretationId,
      now: new Date("2026-08-03T12:01:00.000Z")
    });
    await approveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: calculation.id,
      interpretationId: firstInterpretationId,
      now: new Date("2026-08-03T12:02:00.000Z")
    });
    await publishCalculationToClient({
      store,
      ownerUserId,
      calculationId: calculation.id,
      clientId,
      expectedResultChecksum: calculation.resultChecksum,
      now: new Date("2026-08-03T12:03:00.000Z")
    });
    await saveCalculationInterpretation({
      store,
      ownerUserId,
      calculationId: calculation.id,
      expectedResultChecksum: calculation.resultChecksum,
      source: "manual",
      text: "Racing version",
      modelId: null,
      promptVersion: null,
      interpretationIdGenerator: () => nextInterpretationId,
      now: new Date("2026-08-03T12:04:00.000Z")
    });

    const outcomes = await Promise.allSettled([
      approveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: calculation.id,
        interpretationId: nextInterpretationId,
        now: new Date("2026-08-03T12:05:00.000Z")
      }),
      recalculateCalculation({
        store,
        ownerUserId,
        calculationId: calculation.id,
        participants: calculation.participants,
        requestFingerprint: digest("3"),
        inputData: { name: "Concurrent", recalculated: true },
        resultData: { lifePath: 3 },
        resultSummary: { lifePath: 3 },
        resultChecksum: digest("4"),
        now: new Date("2026-08-03T12:06:00.000Z")
      })
    ]);
    expect(outcomes[1]?.status).toBe("fulfilled");
    const final = await store.findByOwnerAndId({
      ownerUserId,
      calculationId: calculation.id
    });
    expect(final).toMatchObject({
      status: "linked",
      resultChecksum: digest("4"),
      interpretations: []
    });
    await expect(publicationBinding(calculation.id, clientId)).resolves.toEqual({
      visibility: "private_to_astrologer",
      published_at: null,
      published_interpretation_id: null,
      published_result_checksum: null
    });
  });

  it("enforces adult natal publication mode again inside the locked database transaction", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);

    for (const [index, requestedMode] of (["child", null, "adult_natal"] as const).entries()) {
      const clientId = randomUUID();
      const requestFingerprint = digest(["5", "6", "7"][index] ?? raise("Expected fingerprint"));
      const resultChecksum = digest(["8", "9", "0"][index] ?? raise("Expected checksum"));
      const calculation = await createCalculation({
        store,
        ownerUserId,
        module: "chart",
        mode: "individual",
        interpretationMode: requestedMode,
        methodCode: "natal",
        title: `Natal ${requestedMode ?? "legacy"}`,
        participants: createParticipants(clientId).slice(0, 1),
        linkClientIds: [],
        requestFingerprint,
        inputData: { birthDate: "1990-07-15" },
        resultData: { schemaVersion: "chart-result.v2", method: "natal" },
        resultSummary: { method: "natal" },
        resultChecksum,
        idGenerator: randomUUID,
        now: new Date(`2026-08-03T13:0${index}:00.000Z`)
      });
      expect(calculation.interpretationMode).toBe(requestedMode ?? "legacy_unclassified");
      await store.linkClient({
        ownerUserId,
        calculationId: calculation.id,
        clientId,
        now: `2026-08-03T13:1${index}:00.000Z`
      });
      const draft = await saveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: calculation.id,
        expectedResultChecksum: resultChecksum,
        source: "manual",
        text: "Mode-scoped interpretation",
        modelId: null,
        promptVersion: null,
        interpretationIdGenerator: randomUUID,
        now: new Date(`2026-08-03T13:2${index}:00.000Z`)
      });
      await approveCalculationInterpretation({
        store,
        ownerUserId,
        calculationId: calculation.id,
        interpretationId: draft.interpretations.at(-1)?.id ?? raise("Expected interpretation"),
        now: new Date(`2026-08-03T13:3${index}:00.000Z`)
      });

      const publication = store.publishClientLink({
        ownerUserId,
        calculationId: calculation.id,
        clientId,
        expectedResultChecksum: resultChecksum,
        now: `2026-08-03T13:4${index}:00.000Z`
      });
      if (requestedMode !== "adult_natal") {
        await expect(publication).rejects.toBeInstanceOf(
          CalculationInterpretationModeUnavailableError
        );
        await expect(publicationBinding(calculation.id, clientId)).resolves.toEqual({
          visibility: "private_to_astrologer",
          published_at: null,
          published_interpretation_id: null,
          published_result_checksum: null
        });
        continue;
      }

      await expect(publication).resolves.toMatchObject({
        interpretationMode: "adult_natal",
        status: "published"
      });
      const recalculated = await recalculateCalculation({
        store,
        ownerUserId,
        calculationId: calculation.id,
        participants: calculation.participants,
        requestFingerprint: digest("d"),
        inputData: { birthDate: "1990-07-15", recalculated: true },
        resultData: { schemaVersion: "chart-result.v2", method: "natal", recalculated: true },
        resultSummary: { method: "natal" },
        resultChecksum: digest("e"),
        now: new Date("2026-08-03T13:50:00.000Z")
      });
      expect(recalculated.interpretationMode).toBe("adult_natal");
    }
  });

  it("excludes archived rows from exact reuse and permits a fresh active calculation", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const requestFingerprint = digest("7");
    const input = {
      store,
      ownerUserId,
      module: "chart" as const,
      mode: "individual" as const,
      methodCode: "natal",
      title: "Natal chart",
      participants: createParticipants(randomUUID()),
      linkClientIds: [] as string[],
      requestFingerprint,
      inputData: { birthDate: "1990-07-15" },
      resultData: { schemaVersion: "chart-result.v2" },
      resultSummary: { method: "natal" },
      resultChecksum: digest("8"),
      idGenerator: randomUUID,
      now: new Date("2026-08-03T08:00:00.000Z")
    };
    const archived = await createCalculation(input);
    await archiveCalculation({
      store,
      ownerUserId,
      calculationId: archived.id,
      now: new Date("2026-08-03T08:01:00.000Z")
    });

    await expect(
      store.findExact({
        ownerUserId,
        module: "chart",
        mode: "individual",
        methodCode: "natal",
        requestFingerprint
      })
    ).resolves.toBeNull();

    const fresh = await createCalculation({
      ...input,
      resultChecksum: digest("9"),
      now: new Date("2026-08-03T08:02:00.000Z")
    });
    expect(fresh.id).not.toBe(archived.id);
    expect(fresh.status).not.toBe("archived");
  });

  it("invalidates current PDFs and schedules delayed private object cleanup on recalculation", async () => {
    const store = createDrizzleCalculationStore(runtime.database);
    const pdfStore = createDrizzleCalculationPdfJobStore(runtime.database);
    const ownerUserId = await createUser();
    ownerUserIds.push(ownerUserId);
    const participant = createParticipants(randomUUID()).slice(0, 1);
    const calculation = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      title: "Current PDF cleanup",
      participants: participant,
      linkClientIds: [],
      requestFingerprint: digest("4"),
      inputData: { name: "Current" },
      resultData: { lifePath: 4 },
      resultSummary: { lifePath: 4 },
      resultChecksum: digest("5"),
      idGenerator: randomUUID,
      now: new Date("2026-07-15T12:00:00.000Z")
    });
    const unrelated = await createCalculation({
      store,
      ownerUserId,
      module: "numerology",
      mode: "individual",
      methodCode: "pythagorean",
      title: "Unrelated PDF",
      participants: participant,
      linkClientIds: [],
      requestFingerprint: digest("6"),
      inputData: { name: "Unrelated" },
      resultData: { lifePath: 6 },
      resultSummary: { lifePath: 6 },
      resultChecksum: digest("7"),
      idGenerator: randomUUID,
      now: new Date("2026-07-15T12:00:00.000Z")
    });

    const currentMediaIds: string[] = [];
    for (const [locale, fingerprint] of [
      ["ru", digest("8")],
      ["en", digest("9")]
    ] as const) {
      const ids = candidatePdfIds();
      currentMediaIds.push(ids.mediaAssetId);
      await pdfStore.enqueue({
        ...ids,
        ownerUserId,
        calculationId: calculation.id,
        module: "numerology",
        methodCode: "pythagorean",
        resultChecksum: calculation.resultChecksum,
        locale,
        sourceLocator: { kind: "approved_interpretation", interpretationId: null },
        documentFingerprint: fingerprint,
        privateStorageBucket: "calculation-pdfs",
        storageKey: `owners/${ownerUserId}/calculation-pdfs/${ids.id}.pdf`,
        originalFileName: "numerology.pdf",
        now: "2026-07-15T12:01:00.000Z"
      });
    }
    const unrelatedIds = candidatePdfIds();
    await pdfStore.enqueue({
      ...unrelatedIds,
      ownerUserId,
      calculationId: unrelated.id,
      module: "numerology",
      methodCode: "pythagorean",
      resultChecksum: unrelated.resultChecksum,
      locale: "ru",
      sourceLocator: { kind: "approved_interpretation", interpretationId: null },
      documentFingerprint: digest("0"),
      privateStorageBucket: "calculation-pdfs",
      storageKey: `owners/${ownerUserId}/calculation-pdfs/${unrelatedIds.id}.pdf`,
      originalFileName: "numerology.pdf",
      now: "2026-07-15T12:01:00.000Z"
    });

    await recalculateCalculation({
      store,
      ownerUserId,
      calculationId: calculation.id,
      participants: calculation.participants,
      requestFingerprint: digest("d"),
      inputData: { recalculated: true },
      resultData: { lifePath: 9 },
      resultSummary: { lifePath: 9 },
      resultChecksum: digest("e"),
      now: new Date("2026-07-15T12:10:00.000Z")
    });

    const state = await runtime.pool.query<{
      current_jobs: string;
      current_artifacts: string;
      current_media: string;
      unrelated_jobs: string;
    }>(
      `select
         (select count(*) from calculation_pdf_jobs where calculation_id = $1) as current_jobs,
         (select count(*) from calculation_artifacts where calculation_id = $1) as current_artifacts,
         (select count(*) from media_assets where id = any($2)) as current_media,
         (select count(*) from calculation_pdf_jobs where calculation_id = $3) as unrelated_jobs`,
      [calculation.id, currentMediaIds, unrelated.id]
    );
    expect(state.rows[0]).toEqual({
      current_jobs: "0",
      current_artifacts: "0",
      current_media: "2",
      unrelated_jobs: "1"
    });
    const cleanupEvents = await runtime.pool.query<{
      aggregate_id: string;
      payload: { mediaAssetId: string };
      available_at: Date;
    }>(
      `select aggregate_id, payload, available_at
       from outbox_events
       where event_type = $1 and aggregate_id = any($2)
       order by aggregate_id`,
      [CALCULATION_PDF_DELETE_REQUESTED_EVENT, currentMediaIds]
    );
    expect(cleanupEvents.rows).toHaveLength(2);
    expect(cleanupEvents.rows.map((event) => event.aggregate_id).sort()).toEqual(
      [...currentMediaIds].sort()
    );
    expect(cleanupEvents.rows.map((event) => event.payload.mediaAssetId).sort()).toEqual(
      [...currentMediaIds].sort()
    );
    expect(
      cleanupEvents.rows.every(
        (event) => event.available_at.toISOString() === "2026-07-15T13:10:00.000Z"
      )
    ).toBe(true);
  });

  async function publicationBinding(calculationId: string, clientId: string) {
    const result = await runtime.pool.query<{
      visibility: string;
      published_at: Date | null;
      published_interpretation_id: string | null;
      published_result_checksum: string | null;
    }>(
      `select visibility, published_at, published_interpretation_id, published_result_checksum
       from calculation_client_links
       where calculation_id = $1 and client_id = $2`,
      [calculationId, clientId]
    );
    return result.rows[0] ?? raise("Expected calculation client link");
  }

  async function calculationState(calculationId: string) {
    const result = await runtime.pool.query<{ status: string; updated_at: Date }>(
      "select status, updated_at from calculation_records where id = $1",
      [calculationId]
    );
    return result.rows[0] ?? raise("Expected calculation row");
  }

  async function interpretationState(calculationId: string, interpretationId: string) {
    const result = await runtime.pool.query<{
      status: string;
      approved_at: Date | null;
      updated_at: Date;
    }>(
      `select status, approved_at, updated_at
       from calculation_interpretations
       where calculation_id = $1 and id = $2`,
      [calculationId, interpretationId]
    );
    return result.rows[0] ?? null;
  }

  async function failAuditAction(
    action:
      | "calculation.interpretation.saved"
      | "calculation.interpretation.approved"
      | "calculation.published",
    calculationId: string
  ): Promise<void> {
    if (!/^[a-f0-9-]{36}$/.test(calculationId)) {
      throw new Error("Expected safe calculation id for audit failure trigger");
    }
    await clearAuditFailureTrigger();
    await runtime.pool.query(
      `create function elevenhouse_fail_calculation_audit_for_test()
       returns trigger
       language plpgsql
       as $function$
       begin
         raise exception 'forced calculation audit failure';
       end;
       $function$`
    );
    await runtime.pool.query(
      `create trigger elevenhouse_fail_calculation_audit_for_test_trigger
       before insert on audit_log_entries
       for each row when (new.action = '${action}' and new.target_id = '${calculationId}')
       execute function elevenhouse_fail_calculation_audit_for_test()`
    );
  }

  async function clearAuditFailureTrigger(): Promise<void> {
    await runtime.pool.query(
      "drop trigger if exists elevenhouse_fail_calculation_audit_for_test_trigger on audit_log_entries"
    );
    await runtime.pool.query(
      "drop function if exists elevenhouse_fail_calculation_audit_for_test()"
    );
  }

  async function expectForcedAuditFailure(promise: Promise<unknown>): Promise<void> {
    const error = await promise.catch((failure: unknown) => failure);
    let current: unknown = error;
    const visited = new Set<object>();
    while (typeof current === "object" && current !== null && !visited.has(current)) {
      visited.add(current);
      if (
        "code" in current &&
        current.code === "P0001" &&
        "message" in current &&
        current.message === "forced calculation audit failure"
      ) {
        return;
      }
      current = "cause" in current ? current.cause : null;
    }
    throw new Error("Expected forced PostgreSQL audit failure in error cause chain");
  }

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );
    return result.rows[0]?.id ?? raise("Expected user insert to return id");
  }
});

function createParticipants(
  clientId: string,
  partnerClientId = randomUUID()
): readonly CalculationParticipant[] {
  return [
    { role: "subject", source: "crm_client", clientId, displayName: "Alice" },
    { role: "partner", source: "crm_client", clientId: partnerClientId, displayName: "Bob" }
  ];
}

function linkByClient(
  record: Awaited<ReturnType<typeof linkCalculationToClient>>,
  clientId: string
) {
  return record.links.find((link) => link.clientId === clientId) ?? raise("Expected client link");
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}

function candidatePdfIds() {
  return {
    id: randomUUID(),
    mediaAssetId: randomUUID(),
    artifactId: randomUUID(),
    outboxEventId: randomUUID()
  };
}
