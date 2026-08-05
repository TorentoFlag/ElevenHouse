import { ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { FinancePrivateObjectStoragePort } from "@elevenhouse/domain/finance-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveBankEvidenceCashPool: vi.fn(),
  executeIdempotentFinanceExternalEffect: vi.fn(),
  registerSealedArtifactInTransaction: vi.fn(),
  createDrizzleAuditLogStore: vi.fn()
}));

vi.mock("@elevenhouse/db/finance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@elevenhouse/db/finance")>()),
  findActiveBankEvidenceCashPool: mocks.findActiveBankEvidenceCashPool,
  executeIdempotentFinanceExternalEffect: mocks.executeIdempotentFinanceExternalEffect,
  registerSealedArtifactInTransaction: mocks.registerSealedArtifactInTransaction
}));

vi.mock("@elevenhouse/db/audit-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@elevenhouse/db/audit-log")>()),
  createDrizzleAuditLogStore: mocks.createDrizzleAuditLogStore
}));

import { PayoutEvidenceService } from "./payout-evidence.service";
import { SystemClock } from "../../common/system-clock.js";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { PAYOUT_EVIDENCE_PRIVATE_STORAGE } from "./payout-evidence.tokens";

const now = new Date("2026-08-05T12:00:00.000Z");
const fingerprint = `sha256:${"a".repeat(64)}` as const;
const receipt = {
  privateObjectKey: "finance/artifacts/payout-bank-evidence.json",
  privateObjectVersion: "version-1",
  envelopeKeyVersion: "kms-key-1",
  sha256Digest: `sha256:${"b".repeat(64)}` as const,
  byteLength: 5,
  contentType: "application/pdf"
};

describe("PayoutEvidenceService", () => {
  const storage: FinancePrivateObjectStoragePort = {
    writeImmutable: vi.fn(async () => receipt),
    readImmutable: vi.fn(),
    deleteImmutable: vi.fn()
  };
  const transaction = {};
  const audit = { createEntry: vi.fn(async () => ({})) };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findActiveBankEvidenceCashPool.mockResolvedValue({
      bankCashPoolId: "elevenhouse-rub-cash-pool",
      currency: "RUB",
      statementSourceFingerprint: fingerprint
    });
    mocks.registerSealedArtifactInTransaction.mockImplementation(async (_transaction, input) => ({
      artifactId: input.artifact.artifactId,
      sha256Digest: input.artifact.sha256Digest,
      byteLength: input.artifact.byteLength,
      bankCashPoolId: input.artifact.bankCashPoolId
    }));
    mocks.createDrizzleAuditLogStore.mockReturnValue(audit);
    mocks.executeIdempotentFinanceExternalEffect.mockImplementation(async (input) => {
      const effect = await input.performExternalEffect();
      const result = await input.finalize(transaction, effect);
      return { kind: "created", value: result.value };
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("rejects non-permitted MIME and bytes above the configured cap before storage or database work", async () => {
    const service = createService(storage, 5);

    await expect(
      service.ingest({
        adminUserId: "admin-1",
        idempotencyKey: "evidence-invalid-type",
        contentType: "text/plain",
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
      })
    ).rejects.toMatchObject({
      code: "payout_evidence_content_type_invalid"
    });
    await expect(
      service.ingest({
        adminUserId: "admin-1",
        idempotencyKey: "evidence-oversize",
        contentType: "application/pdf",
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x20])
      })
    ).rejects.toMatchObject({
      code: "payout_evidence_payload_too_large"
    });
    expect(storage.writeImmutable).not.toHaveBeenCalled();
    expect(mocks.findActiveBankEvidenceCashPool).not.toHaveBeenCalled();
  });

  it("seals a valid document then registers its trusted server-derived receipt and audit record", async () => {
    const service = createService(storage);
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

    await expect(
      service.ingest({
        adminUserId: "admin-1",
        idempotencyKey: "evidence-happy",
        contentType: "application/pdf",
        bytes
      })
    ).resolves.toMatchObject({ byteLength: 5, contentType: "application/pdf" });

    expect(storage.writeImmutable).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: expect.stringMatching(/^payout-bank-evidence:[a-f0-9]{64}$/),
        bytes,
        contentType: "application/pdf",
        expectedSha256Digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
      })
    );
    expect(mocks.registerSealedArtifactInTransaction).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        artifactClass: "bank_transfer_evidence",
        binding: { kind: "bank_cash_pool", bankCashPoolId: "elevenhouse-rub-cash-pool", currency: "RUB" }
      })
    );
    expect(audit.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payout_bank_evidence.ingested", actorUserId: "admin-1" })
    );
  });

  it("returns the persisted receipt on an identical idempotent retry without writing a second object", async () => {
    let persisted: Record<string, unknown> | null = null;
    mocks.executeIdempotentFinanceExternalEffect.mockImplementation(async (input) => {
      if (persisted) return { kind: "replayed", value: await input.replay(persisted) };
      const effect = await input.performExternalEffect();
      const result = await input.finalize(transaction, effect);
      persisted = result.result;
      return { kind: "created", value: result.value };
    });
    const service = createService(storage);
    const input = {
      adminUserId: "admin-1",
      idempotencyKey: "evidence-retry",
      contentType: "application/pdf",
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    } as const;

    const first = await service.ingest(input);
    const retry = await service.ingest(input);

    expect(retry).toEqual(first);
    expect(storage.writeImmutable).toHaveBeenCalledTimes(1);
    expect(mocks.registerSealedArtifactInTransaction).toHaveBeenCalledTimes(1);
    expect(audit.createEntry).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the configured cash pool is not active", async () => {
    mocks.findActiveBankEvidenceCashPool.mockResolvedValueOnce(null);
    const service = createService(storage);

    await expect(
      service.ingest({
        adminUserId: "admin-1",
        idempotencyKey: "evidence-no-pool",
        contentType: "application/pdf",
        bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(storage.writeImmutable).not.toHaveBeenCalled();
  });

  it("is resolvable by Nest without design-metadata inference for the runtime dependency", async () => {
    expect(Reflect.getMetadata("self:paramtypes", PayoutEvidenceService)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, param: PostgresRuntimeService })
      ])
    );
    const module = await Test.createTestingModule({
      providers: [
        PayoutEvidenceService,
        { provide: PostgresRuntimeService, useValue: { database: {} } },
        { provide: SystemClock, useValue: { now: () => now } },
        { provide: PAYOUT_EVIDENCE_PRIVATE_STORAGE, useValue: null },
        { provide: "ADMIN_API_RUNTIME_CONFIG", useValue: { financePayoutEvidence: null } }
      ]
    }).compile();

    expect(module.get(PayoutEvidenceService).maximumFileBytes).toBe(10 * 1024 * 1024);
    await module.close();
  });
});

function createService(storage: FinancePrivateObjectStoragePort, maxBytes = 1024) {
  return new PayoutEvidenceService(
    { database: {} } as never,
    { now: () => now } as never,
    storage,
    {
      financePayoutEvidence: {
        artifactStorage: {
          endpoint: "https://s3.example.test",
          region: "ru-1",
          bucket: "elevenhouse-private",
          accessKeyId: "not-used-in-unit-test",
          secretAccessKey: "not-used-in-unit-test",
          forcePathStyle: true,
          kmsKeyArn: "arn:aws:kms:ru-1:000000000000:key/00000000-0000-4000-8000-000000000000"
        },
        bankCashPoolId: "elevenhouse-rub-cash-pool",
        statementSourceFingerprint: fingerprint,
        retentionPolicy: { policyId: "bank-transfer-evidence", policyVersion: "1" },
        maxBytes
      }
    } as never
  );
}
