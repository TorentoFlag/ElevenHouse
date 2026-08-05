import type {
  AuditLogStore,
  FinanceIdempotentCommand
} from "@elevenhouse/domain";
import {
  createFiscalProfileDraft,
  publishFiscalProfileDraft,
  type FiscalProfileAuthorityStore
} from "@elevenhouse/domain/finance-core";
import {
  FinanceIdempotencyConflictError,
  type FinanceReadinessEvidenceReader,
} from "@elevenhouse/domain";
import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { FiscalProfilesService } from "./fiscal-profiles.service";
import type { AdminFiscalProfileUnitOfWork } from "./fiscal-profiles.unit-of-work";

const profileBody = {
  profileSeriesId: "client-purchase-rub",
  version: 1,
  transactionCategory: "client_purchase",
  currency: "RUB",
  fiscalizationProvider: "arc_pay_embedded",
  merchantTaxId: "7701234567",
  buyerContactRequirement: "email_or_phone",
  lineTemplate: {
    vatRate: "no_vat",
    paymentObject: "service",
    paymentMethod: "full_payment",
    measure: "piece",
    itemCode: "consultation"
  }
};

describe("FiscalProfilesService", () => {
  it("creates an idempotent draft and records only the safe audit identity", async () => {
    const store = fiscalProfileStore();
    const auditLogStore = { createEntry: vi.fn(async () => undefined) } as unknown as AuditLogStore;
    const service = new FiscalProfilesService(unitOfWork(store, auditLogStore), {
      now: () => new Date("2026-08-04T15:00:00.000Z")
    });

    const created = await service.createDraft(
      "11111111-1111-4111-8111-111111111111",
      "fiscal-profile-create-0001",
      profileBody
    );
    const replay = await service.createDraft(
      "11111111-1111-4111-8111-111111111111",
      "fiscal-profile-create-0001",
      profileBody
    );

    expect(created).toMatchObject({ lifecycle: "draft", draftRevision: 1 });
    expect(replay).toEqual(created);
    expect(store.createDraft).toHaveBeenCalledTimes(1);
    expect(auditLogStore.createEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "fiscal_profile.draft_created",
      targetId: "client-purchase-rub:1"
    }));
  });

  it("rejects idempotency-key reuse with a different legal accounting request", async () => {
    const service = new FiscalProfilesService(
      unitOfWork(fiscalProfileStore(), { createEntry: vi.fn(async () => undefined) } as unknown as AuditLogStore),
      { now: () => new Date("2026-08-04T15:00:00.000Z") }
    );
    await service.createDraft("11111111-1111-4111-8111-111111111111", "fiscal-profile-create-0002", profileBody);
    await expect(service.createDraft(
      "11111111-1111-4111-8111-111111111111",
      "fiscal-profile-create-0002",
      { ...profileBody, merchantTaxId: "7701234568" }
    )).rejects.toEqual(expect.objectContaining<Partial<ConflictException>>({
      message: "finance_idempotency_key_reused_with_different_request"
    }));
  });

  it("publishes using the client-supplied optimistic revision", async () => {
    const store = fiscalProfileStore();
    const service = new FiscalProfilesService(
      unitOfWork(store, { createEntry: vi.fn(async () => undefined) } as unknown as AuditLogStore),
      { now: () => new Date("2026-08-04T15:00:00.000Z") }
    );
    await service.createDraft("11111111-1111-4111-8111-111111111111", "fiscal-profile-create-0003", profileBody);

    const published = await service.publishDraft(
      "11111111-1111-4111-8111-111111111111",
      "fiscal-profile-publish-0003",
      "client-purchase-rub",
      1,
      { expectedDraftRevision: 1 }
    );
    expect(published.lifecycle).toBe("published");
    expect(store.publishDraft).toHaveBeenCalledWith({
      profileSeriesId: "client-purchase-rub", version: 1, expectedDraftRevision: 1
    });
  });

  it("does not publish an accounting profile before legal evidence and step-up evidence exist", async () => {
    const store = fiscalProfileStore();
    const service = new FiscalProfilesService(
      unitOfWork(
        store,
        { createEntry: vi.fn(async () => undefined) } as unknown as AuditLogStore,
        { listFinanceReadinessEvidence: vi.fn(async () => []) }
      ),
      { now: () => new Date("2026-08-04T15:00:00.000Z") }
    );
    await service.createDraft("11111111-1111-4111-8111-111111111111", "fiscal-profile-create-0004", profileBody);

    await expect(service.publishDraft(
      "11111111-1111-4111-8111-111111111111",
      "fiscal-profile-publish-0004",
      "client-purchase-rub",
      1,
      { expectedDraftRevision: 1 }
    )).rejects.toEqual(expect.objectContaining<Partial<ConflictException>>({
      message: "FINANCE_OPERATION_NOT_READY"
    }));
    expect(store.publishDraft).not.toHaveBeenCalled();
  });

  it("uses the profile transaction category when resolving publication readiness", async () => {
    const store = fiscalProfileStore();
    const readinessReader = {
      listFinanceReadinessEvidence: vi.fn<FinanceReadinessEvidenceReader["listFinanceReadinessEvidence"]>(async (query) => query.requirementCodes.map((requirementCode, index) => ({
        id: `evidence-${index}`,
        version: 1,
        requirementCode,
        status: "active" as const,
        environment: null,
        transactionCategory: requirementCode.startsWith("legal_accounting_")
          ? query.transactionCategory : null,
        effectiveAt: "2026-08-01T00:00:00.000Z",
        expiresAt: null,
        safeDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })))
    } satisfies FinanceReadinessEvidenceReader;
    const service = new FiscalProfilesService(
      unitOfWork(store, { createEntry: vi.fn(async () => undefined) } as unknown as AuditLogStore, readinessReader),
      { now: () => new Date("2026-08-04T15:00:00.000Z") }
    );
    const subscriptionProfile = {
      ...profileBody,
      profileSeriesId: "subscription-rub",
      transactionCategory: "platform_subscription" as const
    };
    await service.createDraft(
      "11111111-1111-4111-8111-111111111111", "fiscal-profile-create-0005", subscriptionProfile
    );
    await service.publishDraft(
      "11111111-1111-4111-8111-111111111111", "fiscal-profile-publish-0005", "subscription-rub", 1,
      { expectedDraftRevision: 1 }
    );

    expect(readinessReader.listFinanceReadinessEvidence).toHaveBeenCalledWith(expect.objectContaining({
      operationKind: "fiscal_policy_publish",
      transactionCategory: "platform_subscription"
    }));
  });
});

function unitOfWork(
  store: FiscalProfileAuthorityStore,
  auditLogStore: AuditLogStore,
  readinessReader: FinanceReadinessEvidenceReader = {
    listFinanceReadinessEvidence: async (query) => query.requirementCodes.map((requirementCode, index) => ({
      id: `evidence-${index}`,
      version: 1,
      requirementCode,
      status: "active",
      environment: null,
      transactionCategory: requirementCode.startsWith("legal_accounting_")
        ? query.transactionCategory : null,
      effectiveAt: "2026-08-01T00:00:00.000Z",
      expiresAt: null,
      safeDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }))
  }
): AdminFiscalProfileUnitOfWork {
  const commands = new Map<string, { command: FinanceIdempotentCommand; result: Record<string, unknown> }>();
  const context = { store, auditLogStore, readinessReader };
  return {
    execute: (operation) => operation(context),
    executeIdempotent: async (input) => {
      const key = `${input.command.scope}:${input.command.idempotencyKey}`;
      const existing = commands.get(key);
      if (existing) {
        if (existing.command.requestHash !== input.command.requestHash) throw new FinanceIdempotencyConflictError();
        const replay = await input.replay(context, existing.result);
        if (!replay) throw new Error("idempotency replay result missing");
        return { kind: "replayed", value: replay };
      }
      const created = await input.create(context);
      commands.set(key, { command: input.command, result: created.result });
      return { kind: "created", value: created.value };
    }
  };
}

function fiscalProfileStore(): FiscalProfileAuthorityStore {
  let persisted = null as Awaited<ReturnType<FiscalProfileAuthorityStore["createDraft"]>> | null;
  return {
    listVersions: vi.fn(async () => persisted ? [persisted] : []),
    findVersion: vi.fn(async (input) =>
      persisted && persisted.profile.profileSeriesId === input.profileSeriesId &&
      persisted.profile.version === input.version && persisted.profile.canonicalDigest === input.canonicalDigest
        ? persisted : null
    ),
    findVersionByIdentity: vi.fn(async (input) =>
      persisted && persisted.profile.profileSeriesId === input.profileSeriesId &&
      persisted.profile.version === input.version ? persisted : null
    ),
    createDraft: vi.fn(async (input) => {
      persisted = createFiscalProfileDraft(input);
      return persisted;
    }),
    updateDraft: vi.fn(),
    publishDraft: vi.fn(async (input) => {
      if (!persisted || persisted.profile.profileSeriesId !== input.profileSeriesId ||
        persisted.profile.version !== input.version || persisted.draftRevision !== input.expectedDraftRevision) {
        throw new Error("draft revision mismatch");
      }
      persisted = publishFiscalProfileDraft(persisted);
      return persisted;
    }),
    retirePublished: vi.fn()
  };
}
