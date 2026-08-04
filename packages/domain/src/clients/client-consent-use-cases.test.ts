import { describe, expect, it } from "vitest";
import {
  ChartAiConsentRequiredError,
  ClientConsentIntegrityError,
  ClientConsentNotFoundError,
  ClientConsentRelationshipInactiveError,
  ClientConsentRelationshipRequiredError,
  ClientConsentValidationError
} from "./client-consent-errors";
import { canonicalChartAiConsentNoticeHashes } from "./client-consent-policy";
import type {
  ClientConsentAuthorizationEvidence,
  ClientConsentGrantAtomicInput,
  ClientConsentGrantAtomicResult,
  ClientConsentRelationshipEvidence,
  ClientConsentRevokeAtomicInput,
  ClientConsentRevokeAtomicResult,
  ClientConsentStore
} from "./client-consent-store";
import type { ClientDataConsentRecord } from "./client-consent-types";
import {
  authorizeChartAiParticipants,
  grantChartAiConsent,
  listClientDataConsents,
  revokeClientDataConsent
} from "./client-consent-use-cases";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const secondClientUserId = "66666666-6666-4666-8666-666666666666";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const consentId = "33333333-3333-4333-8333-333333333333";
const secondConsentId = "44444444-4444-4444-8444-444444444444";
const grantedAt = "2026-08-03T10:00:00.000Z";

describe("client consent use cases", () => {
  it("grants only the exact locale-bound policy through one atomic store operation", async () => {
    const store = new MemoryClientConsentStore([
      relationship({ clientUserId, astrologerUserId, status: "active" })
    ]);
    const ids = idGenerator([consentId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);

    await expect(
      grantChartAiConsent({
        store,
        clientUserId,
        astrologerUserId,
        request: {
          accepted: true,
          policyVersion: "chart-ai-external-processing.v1",
          locale: "ru",
          noticeSha256: canonicalChartAiConsentNoticeHashes.ru
        },
        now: new Date(grantedAt),
        idGenerator: ids
      })
    ).resolves.toMatchObject({
      id: consentId,
      clientUserId,
      astrologerUserId,
      purpose: "external_chart_ai_interpretation",
      policyVersion: "chart-ai-external-processing.v1",
      processorCode: "openai",
      noticeLocale: "ru",
      noticeSha256: canonicalChartAiConsentNoticeHashes.ru,
      grantedAt,
      revokedAt: null
    });

    expect(store.records).toHaveLength(1);
    expect(store.audit).toEqual([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        actorUserId: clientUserId,
        action: "client.consent.granted",
        targetId: consentId,
        occurredAt: grantedAt
      }
    ]);
  });

  it("rejects false, stale policy, invalid locale and a hash from the other locale before persistence", async () => {
    const invalidRequests = [
      {
        accepted: false,
        policyVersion: "chart-ai-external-processing.v1",
        locale: "ru",
        noticeSha256: canonicalChartAiConsentNoticeHashes.ru
      },
      {
        accepted: true,
        policyVersion: "chart-ai-external-processing.v0",
        locale: "ru",
        noticeSha256: canonicalChartAiConsentNoticeHashes.ru
      },
      {
        accepted: true,
        policyVersion: "chart-ai-external-processing.v1",
        locale: "de",
        noticeSha256: canonicalChartAiConsentNoticeHashes.ru
      },
      {
        accepted: true,
        policyVersion: "chart-ai-external-processing.v1",
        locale: "ru",
        noticeSha256: canonicalChartAiConsentNoticeHashes.en
      }
    ];

    for (const request of invalidRequests) {
      const store = new MemoryClientConsentStore([
        relationship({ clientUserId, astrologerUserId, status: "active" })
      ]);
      await expect(
        grantChartAiConsent({
          store,
          clientUserId,
          astrologerUserId,
          request,
          now: new Date(grantedAt)
        })
      ).rejects.toBeInstanceOf(ClientConsentValidationError);
      expect(store.records).toHaveLength(0);
      expect(store.audit).toHaveLength(0);
    }
  });

  it("fails closed for unrelated or inactive relationships", async () => {
    await expect(
      grantChartAiConsent({
        store: new MemoryClientConsentStore([]),
        clientUserId,
        astrologerUserId,
        request: validGrantRequest("ru"),
        now: new Date(grantedAt)
      })
    ).rejects.toBeInstanceOf(ClientConsentRelationshipRequiredError);

    for (const status of ["archived", "blocked"] as const) {
      await expect(
        grantChartAiConsent({
          store: new MemoryClientConsentStore([
            relationship({ clientUserId, astrologerUserId, status })
          ]),
          clientUserId,
          astrologerUserId,
          request: validGrantRequest("ru"),
          now: new Date(grantedAt)
        })
      ).rejects.toMatchObject({
        name: "ClientConsentRelationshipInactiveError",
        relationshipStatus: status
      });
    }
  });

  it("keeps exact grants idempotent and creates immutable history after revoke and re-grant", async () => {
    const store = new MemoryClientConsentStore([
      relationship({ clientUserId, astrologerUserId, status: "active" })
    ]);
    const first = await grantChartAiConsent({
      store,
      clientUserId,
      astrologerUserId,
      request: validGrantRequest("ru"),
      now: new Date(grantedAt),
      idGenerator: idGenerator([consentId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"])
    });
    const repeated = await grantChartAiConsent({
      store,
      clientUserId,
      astrologerUserId,
      request: validGrantRequest("ru"),
      now: new Date("2026-08-03T10:05:00.000Z"),
      idGenerator: idGenerator([
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
      ])
    });

    expect(repeated.id).toBe(first.id);
    expect(store.records).toHaveLength(1);
    expect(store.audit).toHaveLength(1);

    const revoked = await revokeClientDataConsent({
      store,
      clientUserId,
      consentId: first.id,
      now: new Date("2026-08-03T11:00:00.000Z"),
      idGenerator: idGenerator(["dddddddd-dddd-4ddd-8ddd-dddddddddddd"])
    });
    const repeatedRevoke = await revokeClientDataConsent({
      store,
      clientUserId,
      consentId: first.id,
      now: new Date("2026-08-03T11:05:00.000Z"),
      idGenerator: idGenerator(["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"])
    });

    expect(revoked.revokedAt).toBe("2026-08-03T11:00:00.000Z");
    expect(repeatedRevoke).toEqual(revoked);
    expect(store.audit.map(({ action }) => action)).toEqual([
      "client.consent.granted",
      "client.consent.revoked"
    ]);

    const regranted = await grantChartAiConsent({
      store,
      clientUserId,
      astrologerUserId,
      request: validGrantRequest("ru"),
      now: new Date("2026-08-03T12:00:00.000Z"),
      idGenerator: idGenerator([secondConsentId, "ffffffff-ffff-4fff-8fff-ffffffffffff"])
    });

    expect(regranted.id).toBe(secondConsentId);
    expect(store.records).toHaveLength(2);
    expect(store.records[0]).toEqual(revoked);
    expect(store.records[1]).toEqual(regranted);
    expect(store.audit.map(({ action }) => action)).toEqual([
      "client.consent.granted",
      "client.consent.revoked",
      "client.consent.granted"
    ]);
  });

  it("does not reveal whether another client's consent ID exists", async () => {
    const store = new MemoryClientConsentStore(
      [relationship({ clientUserId, astrologerUserId, status: "active" })],
      [currentConsent({ id: consentId, clientUserId: secondClientUserId })]
    );

    await expect(
      revokeClientDataConsent({
        store,
        clientUserId,
        consentId,
        now: new Date("2026-08-03T11:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(ClientConsentNotFoundError);
  });

  it("lists one safe state per explicit relationship using the requested notice locale", async () => {
    const relationships = [
      relationship({ clientUserId, astrologerUserId, status: "active" }),
      relationship({
        id: "99999999-9999-4999-8999-999999999991",
        clientUserId,
        astrologerUserId: "99999999-9999-4999-8999-999999999992",
        status: "active"
      }),
      relationship({
        id: "99999999-9999-4999-8999-999999999993",
        clientUserId,
        astrologerUserId: "99999999-9999-4999-8999-999999999994",
        status: "active"
      })
    ];
    const store = new MemoryClientConsentStore(relationships, [
      currentConsent(),
      currentConsent({
        id: secondConsentId,
        relationshipId: relationships[2]!.id,
        astrologerUserId: relationships[2]!.astrologerUserId,
        processorCode: "wrong-provider"
      })
    ]);

    const result = await listClientDataConsents({ store, clientUserId, locale: "en" });

    expect(result.policy).toEqual({
      purpose: "external_chart_ai_interpretation",
      policyVersion: "chart-ai-external-processing.v1",
      processorCode: "openai"
    });
    expect(result.notice.locale).toBe("en");
    expect(result.noticeSha256).toBe(canonicalChartAiConsentNoticeHashes.en);
    expect(result.consents).toEqual([
      {
        astrologerUserId,
        publicHandle: "alice-vega",
        publicName: "Alice Vega",
        relationshipStatus: "active",
        state: "granted",
        consentId,
        noticeLocale: "ru",
        grantedAt,
        revokedAt: null
      },
      {
        astrologerUserId: relationships[1]!.astrologerUserId,
        publicHandle: "alice-vega",
        publicName: "Alice Vega",
        relationshipStatus: "active",
        state: "missing",
        consentId: null,
        noticeLocale: null,
        grantedAt: null,
        revokedAt: null
      },
      {
        astrologerUserId: relationships[2]!.astrologerUserId,
        publicHandle: "alice-vega",
        publicName: "Alice Vega",
        relationshipStatus: "active",
        state: "stale",
        consentId: secondConsentId,
        noticeLocale: "ru",
        grantedAt,
        revokedAt: null
      }
    ]);
  });

  it("authorizes every ordered persisted participant only from active current stored consent", async () => {
    const relationships = [
      relationship({ clientUserId, astrologerUserId, status: "active" }),
      relationship({
        id: "55555555-5555-4555-8555-555555555556",
        clientUserId: secondClientUserId,
        astrologerUserId,
        status: "active"
      })
    ];
    const store = new MemoryClientConsentStore(relationships, [
      currentConsent(),
      currentConsent({
        id: secondConsentId,
        relationshipId: relationships[1]!.id,
        clientUserId: secondClientUserId,
        noticeLocale: "en",
        noticeSha256: canonicalChartAiConsentNoticeHashes.en
      })
    ]);

    await expect(
      authorizeChartAiParticipants({
        store,
        astrologerUserId,
        participants: [{ clientUserId: secondClientUserId }, { clientUserId }]
      })
    ).resolves.toEqual([
      { clientUserId: secondClientUserId, consentId: secondConsentId },
      { clientUserId, consentId }
    ]);
  });

  it("fails participant authorization for unrelated, inactive, missing, revoked or stale evidence", async () => {
    const scenarios: readonly {
      name: string;
      relationship?: ClientConsentRelationshipEvidence;
      consent?: ClientDataConsentRecord | null;
      error: new (...args: never[]) => Error;
      state?: string;
    }[] = [
      {
        name: "unrelated",
        error: ClientConsentRelationshipRequiredError
      },
      {
        name: "inactive",
        relationship: relationship({ clientUserId, astrologerUserId, status: "archived" }),
        consent: currentConsent(),
        error: ClientConsentRelationshipInactiveError
      },
      {
        name: "missing",
        relationship: relationship({ clientUserId, astrologerUserId, status: "active" }),
        consent: null,
        error: ChartAiConsentRequiredError,
        state: "missing"
      },
      {
        name: "revoked",
        relationship: relationship({ clientUserId, astrologerUserId, status: "active" }),
        consent: currentConsent({ revokedAt: "2026-08-03T11:00:00.000Z" }),
        error: ChartAiConsentRequiredError,
        state: "revoked"
      },
      ...[
        currentConsent({ purpose: "wrong-purpose" }),
        currentConsent({ policyVersion: "wrong-policy" }),
        currentConsent({ processorCode: "wrong-provider" }),
        currentConsent({ noticeSha256: `sha256:${"f".repeat(64)}` }),
        currentConsent({ noticeLocale: "en" }),
        currentConsent({ noticeLocale: "de" })
      ].map((record, index) => ({
        name: `stale-${index}`,
        relationship: relationship({ clientUserId, astrologerUserId, status: "active" }),
        consent: record,
        error: ChartAiConsentRequiredError,
        state: "stale"
      }))
    ];

    for (const scenario of scenarios) {
      const store = new MemoryClientConsentStore(
        scenario.relationship ? [scenario.relationship] : [],
        scenario.consent ? [scenario.consent] : []
      );
      const promise = authorizeChartAiParticipants({
        store,
        astrologerUserId,
        participants: [{ clientUserId }]
      });

      await expect(promise, scenario.name).rejects.toBeInstanceOf(scenario.error);
      if (scenario.state) {
        await expect(promise, scenario.name).rejects.toMatchObject({
          code: "CHART_AI_CONSENT_REQUIRED",
          consentState: scenario.state,
          clientUserId
        });
      }
    }
  });

  it("never accepts a browser boolean as participant authorization", async () => {
    const store = new MemoryClientConsentStore([
      relationship({ clientUserId, astrologerUserId, status: "active" })
    ]);
    const input = {
      store,
      astrologerUserId,
      participants: [{ clientUserId }],
      accepted: true,
      hasConsent: true
    };

    await expect(authorizeChartAiParticipants(input)).rejects.toMatchObject({
      code: "CHART_AI_CONSENT_REQUIRED",
      consentState: "missing"
    });
  });

  it("fails closed when the store returns evidence for the wrong owner", async () => {
    const store = new MemoryClientConsentStore([
      relationship({ clientUserId, astrologerUserId, status: "active" })
    ]);
    store.authorizationEvidenceOverride = [
      {
        relationship: relationship({
          clientUserId,
          astrologerUserId: "99999999-9999-4999-8999-999999999999",
          status: "active"
        }),
        consent: currentConsent()
      }
    ];

    await expect(
      authorizeChartAiParticipants({
        store,
        astrologerUserId,
        participants: [{ clientUserId }]
      })
    ).rejects.toBeInstanceOf(ClientConsentIntegrityError);
  });

  it("rejects atomic mutation results that do not match the issued command", async () => {
    const grantStore = new MemoryClientConsentStore([
      relationship({ clientUserId, astrologerUserId, status: "active" })
    ]);
    grantStore.grantResultOverride = {
      status: "granted",
      consent: currentConsent({ id: secondConsentId })
    };

    await expect(
      grantChartAiConsent({
        store: grantStore,
        clientUserId,
        astrologerUserId,
        request: validGrantRequest("ru"),
        now: new Date(grantedAt),
        idGenerator: idGenerator([consentId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"])
      })
    ).rejects.toBeInstanceOf(ClientConsentIntegrityError);

    const revokeStore = new MemoryClientConsentStore(
      [relationship({ clientUserId, astrologerUserId, status: "active" })],
      [currentConsent()]
    );
    revokeStore.revokeResultOverride = {
      status: "revoked",
      consent: currentConsent({ revokedAt: "2026-08-03T10:30:00.000Z" })
    };

    await expect(
      revokeClientDataConsent({
        store: revokeStore,
        clientUserId,
        consentId,
        now: new Date("2026-08-03T11:00:00.000Z"),
        idGenerator: idGenerator(["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"])
      })
    ).rejects.toBeInstanceOf(ClientConsentIntegrityError);
  });
});

type TestAuditRecord = {
  readonly id: string;
  readonly actorUserId: string;
  readonly action: "client.consent.granted" | "client.consent.revoked";
  readonly targetId: string;
  readonly occurredAt: string;
};

class MemoryClientConsentStore implements ClientConsentStore {
  readonly records: ClientDataConsentRecord[];
  readonly audit: TestAuditRecord[] = [];
  authorizationEvidenceOverride: readonly ClientConsentAuthorizationEvidence[] | null = null;
  grantResultOverride: ClientConsentGrantAtomicResult | null = null;
  revokeResultOverride: ClientConsentRevokeAtomicResult | null = null;

  constructor(
    readonly relationships: readonly ClientConsentRelationshipEvidence[],
    records: readonly ClientDataConsentRecord[] = []
  ) {
    this.records = [...records];
  }

  async listRelationshipConsentsForClient(input: { readonly clientUserId: string }) {
    return this.relationships
      .filter((item) => item.clientUserId === input.clientUserId)
      .map((item) => ({
        relationship: item,
        consent:
          [...this.records]
            .reverse()
            .find(
              (record) =>
                record.relationshipId === item.id && record.clientUserId === input.clientUserId
            ) ?? null
      }));
  }

  async grantConsentAtomically(
    input: ClientConsentGrantAtomicInput
  ): Promise<ClientConsentGrantAtomicResult> {
    if (this.grantResultOverride) return this.grantResultOverride;
    const relationship = this.relationships.find(
      (item) =>
        item.clientUserId === input.clientUserId && item.astrologerUserId === input.astrologerUserId
    );
    if (!relationship) return { status: "relationship_not_found" };
    if (relationship.status !== "active") {
      return { status: "relationship_inactive", relationshipStatus: relationship.status };
    }

    const current = [...this.records]
      .reverse()
      .find((record) => record.relationshipId === relationship.id && record.revokedAt === null);
    if (
      current &&
      current.purpose === input.purpose &&
      current.policyVersion === input.policyVersion &&
      current.processorCode === input.processorCode &&
      current.noticeLocale === input.noticeLocale &&
      current.noticeSha256 === input.noticeSha256
    ) {
      return { status: "already_current", consent: current };
    }
    if (current) {
      this.records[this.records.indexOf(current)] = { ...current, revokedAt: input.grantedAt };
    }

    const record: ClientDataConsentRecord = {
      id: input.consentId,
      relationshipId: relationship.id,
      clientUserId: input.clientUserId,
      astrologerUserId: input.astrologerUserId,
      purpose: input.purpose,
      policyVersion: input.policyVersion,
      processorCode: input.processorCode,
      noticeLocale: input.noticeLocale,
      noticeSha256: input.noticeSha256,
      grantedAt: input.grantedAt,
      revokedAt: null
    };
    this.records.push(record);
    this.audit.push({
      id: input.auditEntryId,
      actorUserId: input.clientUserId,
      action: "client.consent.granted",
      targetId: record.id,
      occurredAt: input.grantedAt
    });
    return { status: "granted", consent: record };
  }

  async revokeConsentAtomically(
    input: ClientConsentRevokeAtomicInput
  ): Promise<ClientConsentRevokeAtomicResult> {
    if (this.revokeResultOverride) return this.revokeResultOverride;
    const index = this.records.findIndex(
      (record) => record.id === input.consentId && record.clientUserId === input.clientUserId
    );
    if (index === -1) return { status: "not_found" };
    const current = this.records[index]!;
    if (current.revokedAt !== null) return { status: "already_revoked", consent: current };

    const revoked = { ...current, revokedAt: input.revokedAt };
    this.records[index] = revoked;
    this.audit.push({
      id: input.auditEntryId,
      actorUserId: input.clientUserId,
      action: "client.consent.revoked",
      targetId: current.id,
      occurredAt: input.revokedAt
    });
    return { status: "revoked", consent: revoked };
  }

  async findChartAiConsentEvidence(input: {
    readonly astrologerUserId: string;
    readonly clientUserIds: readonly string[];
  }): Promise<readonly ClientConsentAuthorizationEvidence[]> {
    if (this.authorizationEvidenceOverride) return this.authorizationEvidenceOverride;
    return input.clientUserIds.flatMap((requestedClientUserId) => {
      const relationship = this.relationships.find(
        (item) =>
          item.clientUserId === requestedClientUserId &&
          item.astrologerUserId === input.astrologerUserId
      );
      if (!relationship) return [];
      const consent =
        [...this.records]
          .reverse()
          .find(
            (record) =>
              record.relationshipId === relationship.id &&
              record.clientUserId === requestedClientUserId
          ) ?? null;
      return [{ relationship, consent }];
    });
  }
}

function relationship(
  overrides: Partial<ClientConsentRelationshipEvidence> &
    Pick<ClientConsentRelationshipEvidence, "clientUserId" | "astrologerUserId" | "status">
): ClientConsentRelationshipEvidence {
  return {
    id: overrides.id ?? "55555555-5555-4555-8555-555555555555",
    clientUserId: overrides.clientUserId,
    astrologerUserId: overrides.astrologerUserId,
    publicHandle: overrides.publicHandle ?? "alice-vega",
    publicName: overrides.publicName ?? "Alice Vega",
    status: overrides.status
  };
}

function currentConsent(overrides: Partial<ClientDataConsentRecord> = {}): ClientDataConsentRecord {
  return {
    id: consentId,
    relationshipId: "55555555-5555-4555-8555-555555555555",
    clientUserId,
    astrologerUserId,
    purpose: "external_chart_ai_interpretation",
    policyVersion: "chart-ai-external-processing.v1",
    processorCode: "openai",
    noticeLocale: "ru",
    noticeSha256: canonicalChartAiConsentNoticeHashes.ru,
    grantedAt,
    revokedAt: null,
    ...overrides
  };
}

function validGrantRequest(locale: "ru" | "en") {
  return {
    accepted: true,
    policyVersion: "chart-ai-external-processing.v1",
    locale,
    noticeSha256: canonicalChartAiConsentNoticeHashes[locale]
  } as const;
}

function idGenerator(values: readonly string[]): () => string {
  let index = 0;
  return () => {
    const value = values[index];
    if (!value) throw new Error("No test id left");
    index += 1;
    return value;
  };
}
