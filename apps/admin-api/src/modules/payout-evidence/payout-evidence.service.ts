import { createHash } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  createDrizzleAuditLogStore
} from "@elevenhouse/db/audit-log";
import {
  FinanceArtifactRegistryError,
  executeIdempotentFinanceExternalEffect,
  findActiveBankEvidenceCashPool,
  registerSealedArtifactInTransaction
} from "@elevenhouse/db/finance";
import type { FinanceTransaction } from "@elevenhouse/db/finance";
import type { PayoutBankEvidenceUploadResponse } from "@elevenhouse/contracts";
import { payoutBankEvidenceUploadResponseSchema } from "@elevenhouse/contracts";
import { FinancePrivateObjectStorageError } from "@elevenhouse/finance-infrastructure";
import {
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  hashFinanceCommandPayload
} from "@elevenhouse/domain";
import type { FinancePrivateObjectStoragePort } from "@elevenhouse/domain/finance-core";
import type { AdminApiRuntimeConfig } from "../../config/runtime-config.js";
import { SystemClock } from "../../common/system-clock.js";
import { PostgresRuntimeService } from "../database/postgres-runtime.service";
import { PAYOUT_EVIDENCE_PRIVATE_STORAGE } from "./payout-evidence.tokens";

const permittedContentTypes = ["application/pdf", "image/png", "image/jpeg"] as const;
type PermittedContentType = (typeof permittedContentTypes)[number];

export class PayoutEvidenceUploadInputError extends Error {
  constructor(
    readonly code:
      | "payout_evidence_content_length_invalid"
      | "payout_evidence_payload_too_large"
      | "payout_evidence_content_type_invalid"
      | "payout_evidence_content_invalid"
  ) {
    super("Payout evidence upload is invalid");
  }
}

@Injectable()
export class PayoutEvidenceService {
  constructor(
    @Inject(PostgresRuntimeService)
    private readonly postgresRuntime: PostgresRuntimeService,
    @Inject(SystemClock) private readonly clock: SystemClock,
    @Inject(PAYOUT_EVIDENCE_PRIVATE_STORAGE)
    private readonly privateStorage: FinancePrivateObjectStoragePort | null,
    @Inject("ADMIN_API_RUNTIME_CONFIG") private readonly runtimeConfig: AdminApiRuntimeConfig
  ) {}

  get maximumFileBytes(): number {
    return this.runtimeConfig.financePayoutEvidence?.maxBytes ?? 10 * 1024 * 1024;
  }

  async ingest(input: {
    readonly adminUserId: string;
    readonly idempotencyKey: string;
    readonly contentType: string | undefined;
    readonly bytes: Uint8Array;
  }): Promise<PayoutBankEvidenceUploadResponse> {
    const configuration = this.runtimeConfig.financePayoutEvidence;
    if (!configuration || !this.privateStorage) {
      throw new ServiceUnavailableException("payout_evidence_ingestion_unavailable");
    }
    const contentType = parseContentType(input.contentType);
    assertEvidenceBytes(contentType, input.bytes, configuration.maxBytes);

    const preflightPool = await findActiveBankEvidenceCashPool(this.postgresRuntime.database, {
      bankCashPoolId: configuration.bankCashPoolId,
      currency: "RUB",
      statementSourceFingerprint: configuration.statementSourceFingerprint
    });
    if (!preflightPool) {
      throw new ServiceUnavailableException("payout_evidence_cash_pool_not_ready");
    }

    const sha256Digest = digest(input.bytes);
    const artifactId = `payout-bank-evidence:${sha256Digest.slice("sha256:".length)}`;
    const now = this.clock.now();
    const command = {
      scope: "admin.finance.payout-evidence-upload.v1",
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.adminUserId,
      requestHash: hashFinanceCommandPayload({
        artifactId,
        bankCashPoolId: configuration.bankCashPoolId,
        contentType,
        byteLength: input.bytes.length,
        sha256Digest,
        statementSourceFingerprint: configuration.statementSourceFingerprint
      }),
      now: now.toISOString(),
      expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
    } as const;

    try {
      const result = await executeIdempotentFinanceExternalEffect({
        database: this.postgresRuntime.database,
        command,
        performExternalEffect: async () =>
          this.privateStorage!.writeImmutable({
            artifactId,
            contentType,
            bytes: input.bytes,
            expectedSha256Digest: sha256Digest
          }),
        finalize: async (transaction, privateObject) =>
          this.finalizeInTransaction({
            transaction,
            adminUserId: input.adminUserId,
            artifactId,
            contentType,
            sha256Digest,
            bytes: input.bytes,
            privateObject,
            configuration,
            now: now.toISOString()
          }),
        replay: async (persisted) => replayUploadResponse(persisted)
      });
      return result.value;
    } catch (error) {
      if (error instanceof FinanceIdempotencyConflictError || error instanceof FinanceIdempotencyFailedError) {
        throw new ConflictException(error.code);
      }
      if (
        error instanceof PayoutEvidenceConfigurationError ||
        error instanceof FinancePrivateObjectStorageError ||
        error instanceof FinanceArtifactRegistryError
      ) {
        throw new ServiceUnavailableException("payout_evidence_ingestion_unavailable");
      }
      throw error;
    }
  }

  private async finalizeInTransaction(input: {
    readonly transaction: FinanceTransaction;
    readonly adminUserId: string;
    readonly artifactId: string;
    readonly contentType: PermittedContentType;
    readonly sha256Digest: `sha256:${string}`;
    readonly bytes: Uint8Array;
    readonly privateObject: Awaited<ReturnType<FinancePrivateObjectStoragePort["writeImmutable"]>>;
    readonly configuration: NonNullable<AdminApiRuntimeConfig["financePayoutEvidence"]>;
    readonly now: string;
  }) {
    const activePool = await findActiveBankEvidenceCashPool(input.transaction, {
      bankCashPoolId: input.configuration.bankCashPoolId,
      currency: "RUB",
      statementSourceFingerprint: input.configuration.statementSourceFingerprint
    });
    if (!activePool) {
      throw new PayoutEvidenceConfigurationError("payout_evidence_cash_pool_not_ready");
    }
    const artifact = await registerSealedArtifactInTransaction(input.transaction, {
      artifact: {
        artifactId: input.artifactId,
        sha256Digest: input.sha256Digest,
        byteLength: input.bytes.length,
        bankCashPoolId: activePool.bankCashPoolId,
        statementSourceFingerprint: activePool.statementSourceFingerprint
      },
      artifactClass: "bank_transfer_evidence",
      binding: {
        kind: "bank_cash_pool",
        bankCashPoolId: activePool.bankCashPoolId,
        currency: "RUB"
      },
      contentType: input.contentType,
      privateObject: input.privateObject,
      retentionPolicyId: input.configuration.retentionPolicy.policyId,
      retentionPolicyVersion: input.configuration.retentionPolicy.policyVersion
    });
    if (!("bankCashPoolId" in artifact)) {
      throw new PayoutEvidenceConfigurationError("payout_evidence_artifact_binding_invalid");
    }
    const response = payoutBankEvidenceUploadResponseSchema.parse({
      artifactId: artifact.artifactId,
      sha256Digest: artifact.sha256Digest,
      byteLength: artifact.byteLength,
      contentType: input.contentType
    });
    await createDrizzleAuditLogStore(input.transaction).createEntry({
      actorUserId: input.adminUserId,
      action: "payout_bank_evidence.ingested",
      targetType: "finance_artifact",
      targetId: response.artifactId,
      occurredAt: input.now,
      metadata: {
        artifactClass: "bank_transfer_evidence",
        bankCashPoolId: activePool.bankCashPoolId,
        byteLength: response.byteLength,
        contentType: response.contentType,
        sha256Digest: response.sha256Digest
      }
    });
    return { result: response, value: response };
  }
}

class PayoutEvidenceConfigurationError extends Error {
  constructor(readonly code: string) {
    super("Payout evidence ingestion is not configured safely");
  }
}

function parseContentType(value: string | undefined): PermittedContentType {
  if (!value || !permittedContentTypes.includes(value as PermittedContentType)) {
    throw new PayoutEvidenceUploadInputError("payout_evidence_content_type_invalid");
  }
  return value as PermittedContentType;
}

function assertEvidenceBytes(
  contentType: PermittedContentType,
  bytes: Uint8Array,
  maximumFileBytes: number
): void {
  if (bytes.length < 1) throw new PayoutEvidenceUploadInputError("payout_evidence_content_length_invalid");
  if (bytes.length > maximumFileBytes) {
    throw new PayoutEvidenceUploadInputError("payout_evidence_payload_too_large");
  }
  const valid =
    (contentType === "application/pdf" && startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) ||
    (contentType === "image/png" && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (contentType === "image/jpeg" && startsWith(bytes, [0xff, 0xd8, 0xff]));
  if (!valid) throw new PayoutEvidenceUploadInputError("payout_evidence_content_invalid");
}

function startsWith(bytes: Uint8Array, expected: readonly number[]): boolean {
  return bytes.length >= expected.length && expected.every((value, index) => bytes[index] === value);
}

function digest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function replayUploadResponse(value: Record<string, unknown>): PayoutBankEvidenceUploadResponse | null {
  const parsed = payoutBankEvidenceUploadResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
