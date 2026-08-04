import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  canonicalChartAiConsentNoticeHashes,
  chartAiConsentPolicyVersion,
  type ClientConsentStore,
  type ClientDataConsentRecord
} from "@elevenhouse/domain";
import { ClientConsentsService } from "./client-consents.service";

const clientUserId = "11111111-1111-4111-8111-111111111111";
const astrologerUserId = "22222222-2222-4222-8222-222222222222";
const relationshipId = "33333333-3333-4333-8333-333333333333";
const consentId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-08-03T12:00:00.000Z");

describe("ClientConsentsService", () => {
  it("lists, grants and revokes only server-owned consent identity", async () => {
    const store = new MemoryConsentStore();
    const service = new ClientConsentsService(store, { now: () => now }, () => consentId);

    await expect(service.list(clientUserId, { locale: "ru" })).resolves.toMatchObject({
      noticeSha256: canonicalChartAiConsentNoticeHashes.ru,
      consents: [{ astrologerUserId, state: "missing" }]
    });
    await expect(
      service.grant(clientUserId, astrologerUserId, {
        accepted: true,
        policyVersion: chartAiConsentPolicyVersion,
        noticeSha256: canonicalChartAiConsentNoticeHashes.ru,
        locale: "ru"
      })
    ).resolves.toMatchObject({
      state: "granted",
      consent: { id: consentId, clientUserId, astrologerUserId }
    });
    await expect(service.revoke(clientUserId, consentId, {})).resolves.toMatchObject({
      state: "revoked",
      consentId,
      revokedAt: now.toISOString()
    });
  });

  it.each([null, [], "", 0, { accepted: true }])(
    "rejects non-object or non-empty revoke payload %j",
    async (body) => {
      const service = new ClientConsentsService(
        new MemoryConsentStore(),
        { now: () => now },
        () => consentId
      );

      await expect(service.revoke(clientUserId, consentId, body)).rejects.toBeInstanceOf(
        BadRequestException
      );
    }
  );
});

class MemoryConsentStore implements ClientConsentStore {
  private consent: ClientDataConsentRecord | null = null;

  async listRelationshipConsentsForClient() {
    return [
      {
        relationship: {
          id: relationshipId,
          clientUserId,
          astrologerUserId,
          publicHandle: "alice-vega",
          publicName: "Alice Vega",
          status: "active" as const
        },
        consent: this.consent
      }
    ];
  }

  async grantConsentAtomically(input: Parameters<ClientConsentStore["grantConsentAtomically"]>[0]) {
    this.consent = {
      id: input.consentId,
      relationshipId,
      clientUserId,
      astrologerUserId,
      purpose: input.purpose,
      policyVersion: input.policyVersion,
      processorCode: input.processorCode,
      noticeLocale: input.noticeLocale,
      noticeSha256: input.noticeSha256,
      grantedAt: input.grantedAt,
      revokedAt: null
    };
    return { status: "granted" as const, consent: this.consent };
  }

  async revokeConsentAtomically(
    input: Parameters<ClientConsentStore["revokeConsentAtomically"]>[0]
  ) {
    if (!this.consent) return { status: "not_found" as const };
    this.consent = { ...this.consent, revokedAt: input.revokedAt };
    return { status: "revoked" as const, consent: this.consent };
  }

  async findChartAiConsentEvidence() {
    return [];
  }
}
