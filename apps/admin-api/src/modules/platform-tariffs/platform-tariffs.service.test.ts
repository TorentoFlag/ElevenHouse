import type {
  AuditLogStore,
  FinanceIdempotentCommand,
  PlatformTariffAuthorityStore
} from "@elevenhouse/domain";
import { FinanceIdempotencyConflictError } from "@elevenhouse/domain";
import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { PlatformTariffsService } from "./platform-tariffs.service";
import type { AdminTariffUnitOfWork } from "./platform-tariffs.unit-of-work";

const tariffBody = {
  tariffSeriesId: "pro",
  version: 1,
  name: "Pro",
  tagline: "For active practice",
  monthlyPriceMinor: 2_500,
  yearlyPriceMinor: 25_000,
  monthlyRecurringFrequencyDays: 31,
  yearlyRecurringFrequencyDays: 365,
  clientSaleCommissionBps: 800,
  seatsLimit: 1,
  bookingsLimit: null,
  aiRequestsLimit: null,
  automationLimit: null,
  isPopular: false,
  displayOrder: 0,
  features: []
};

describe("PlatformTariffsService", () => {
  it("creates a server-sealed tariff draft and records the internal audit event", async () => {
    const store = tariffStore();
    const auditLogStore = { createEntry: vi.fn(async () => undefined) } as unknown as AuditLogStore;
    const service = new PlatformTariffsService(unitOfWork(store, auditLogStore), {
      now: () => new Date("2026-08-04T12:00:00.000Z")
    });

    const result = await service.createDraft(
      "11111111-1111-4111-8111-111111111111",
      "tariff-create-0001",
      tariffBody
    );

    expect(result).toMatchObject({
      tariffSeriesId: "pro",
      lifecycle: "draft",
      draftRevision: 1,
      canonicalDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
    expect(auditLogStore.createEntry).toHaveBeenCalledWith(expect.objectContaining({
      action: "platform_tariff.draft_created",
      targetId: "pro:1"
    }));
  });

  it("replays the same persisted idempotency command without creating another tariff or audit row", async () => {
    const store = tariffStore();
    const auditLogStore = { createEntry: vi.fn(async () => undefined) } as unknown as AuditLogStore;
    const service = new PlatformTariffsService(unitOfWork(store, auditLogStore), {
      now: () => new Date("2026-08-04T12:00:00.000Z")
    });

    const first = await service.createDraft(
      "11111111-1111-4111-8111-111111111111",
      "tariff-create-0002",
      tariffBody
    );
    const replay = await service.createDraft(
      "11111111-1111-4111-8111-111111111111",
      "tariff-create-0002",
      tariffBody
    );

    expect(replay).toEqual(first);
    expect(store.createDraft).toHaveBeenCalledTimes(1);
    expect(auditLogStore.createEntry).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of an idempotency key with a different tariff request", async () => {
    const store = tariffStore();
    const auditLogStore = { createEntry: vi.fn(async () => undefined) } as unknown as AuditLogStore;
    const service = new PlatformTariffsService(unitOfWork(store, auditLogStore), {
      now: () => new Date("2026-08-04T12:00:00.000Z")
    });

    await service.createDraft(
      "11111111-1111-4111-8111-111111111111",
      "tariff-create-0003",
      tariffBody
    );

    await expect(
      service.createDraft("11111111-1111-4111-8111-111111111111", "tariff-create-0003", {
        ...tariffBody,
        name: "Changed"
      })
    ).rejects.toEqual(expect.objectContaining<Partial<ConflictException>>({
      message: "finance_idempotency_key_reused_with_different_request"
    }));
    expect(store.createDraft).toHaveBeenCalledTimes(1);
  });
});

function unitOfWork(
  store: PlatformTariffAuthorityStore,
  auditLogStore: AuditLogStore
): AdminTariffUnitOfWork {
  const commands = new Map<string, { command: FinanceIdempotentCommand; result: Record<string, unknown> }>();
  const context = { store, auditLogStore };
  return {
    execute: (operation) => operation(context),
    executeIdempotent: async (input) => {
      const key = `${input.command.scope}:${input.command.idempotencyKey}`;
      const existing = commands.get(key);
      if (existing) {
        if (existing.command.requestHash !== input.command.requestHash) {
          throw new FinanceIdempotencyConflictError();
        }
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

function tariffStore(): PlatformTariffAuthorityStore {
  let persistedTariff: Awaited<ReturnType<PlatformTariffAuthorityStore["createDraft"]>> | null = null;
  return {
    listTariffVersions: vi.fn(async () => []),
    createDraft: vi.fn(async (input) => {
      const tariff = {
        ...input,
        lifecycle: "draft" as const,
        draftRevision: 1,
        canonicalDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
      };
      persistedTariff = tariff;
      return tariff;
    }),
    updateDraft: vi.fn(),
    publishDraft: vi.fn(),
    findTariffVersion: vi.fn(async (input) => {
      const tariff = persistedTariff;
      if (
        !tariff ||
        tariff.tariffSeriesId !== input.tariffSeriesId ||
        tariff.version !== input.version ||
        tariff.canonicalDigest !== input.canonicalDigest
      ) {
        return null;
      }
      return tariff;
    }),
    findPublishedTariffVersion: vi.fn(async () => null),
    beginSubscriptionPurchase: vi.fn(),
    findActiveOrPendingSubscription: vi.fn(),
    findCurrentSubscription: vi.fn(),
    listRecentCapturedInvoices: vi.fn(async () => []),
    markInvoicePaymentPending: vi.fn(),
    applyVerifiedInvoiceCapture: vi.fn()
  };
}
