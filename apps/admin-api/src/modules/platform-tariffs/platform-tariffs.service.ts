import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import {
  adminTariffDraftRequestSchema,
  adminTariffListResponseSchema,
  adminTariffPublishRequestSchema,
  adminTariffResponseSchema,
  adminTariffUpdateRequestSchema,
  type AdminTariffResponse
} from "@elevenhouse/contracts";
import {
  type AuditLogStore,
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  hashFinanceCommandPayload,
  PlatformTariffAuthorityError,
  type PlatformTariffAuthorityStore,
  type PlatformTariffVersion
} from "@elevenhouse/domain";
import { PlatformTariffAuthorityPersistenceError } from "@elevenhouse/db/platform-billing";

import { ADMIN_TARIFF_CLOCK, ADMIN_TARIFF_UNIT_OF_WORK } from "./platform-tariffs.tokens";
import type { AdminTariffUnitOfWork } from "./platform-tariffs.unit-of-work";

type Clock = Readonly<{ now: () => Date }>;

@Injectable()
export class PlatformTariffsService {
  constructor(
    @Inject(ADMIN_TARIFF_UNIT_OF_WORK) private readonly unitOfWork: AdminTariffUnitOfWork,
    @Inject(ADMIN_TARIFF_CLOCK) private readonly clock: Clock
  ) {}

  async listTariffs() {
    try {
      const tariffs = await this.unitOfWork.execute(({ store }) => store.listTariffVersions());
      return adminTariffListResponseSchema.parse({ tariffs: tariffs.map(toResponse) });
    } catch (error) {
      return mapTariffError(error);
    }
  }

  async createDraft(
    adminUserId: string,
    idempotencyKey: string,
    body: unknown
  ): Promise<AdminTariffResponse> {
    const request = parse(adminTariffDraftRequestSchema, body);
    const now = this.clock.now();
    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: createTariffCommand({
          scope: "admin.tariff.create",
          idempotencyKey,
          adminUserId,
          request,
          now
        }),
        create: async ({ store, auditLogStore }) => {
          const tariff = await store.createDraft(request);
          await writeAudit(auditLogStore, adminUserId, "platform_tariff.draft_created", tariff, now);
          return { result: tariffReplayRecord(tariff), value: toResponse(tariff) };
        },
        replay: async ({ store }, result) => replayTariffResponse(store, result)
      });
      return result.value;
    } catch (error) {
      return mapTariffError(error);
    }
  }

  async updateDraft(
    adminUserId: string,
    idempotencyKey: string,
    body: unknown
  ): Promise<AdminTariffResponse> {
    const request = parse(adminTariffUpdateRequestSchema, body);
    const now = this.clock.now();
    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: createTariffCommand({
          scope: "admin.tariff.update",
          idempotencyKey,
          adminUserId,
          request,
          now
        }),
        create: async ({ store, auditLogStore }) => {
          const tariff = await store.updateDraft({
            tariffSeriesId: request.tariffSeriesId,
            version: request.version,
            expectedDraftRevision: request.expectedDraftRevision,
            next: editableTerms(request)
          });
          await writeAudit(auditLogStore, adminUserId, "platform_tariff.draft_updated", tariff, now);
          return { result: tariffReplayRecord(tariff), value: toResponse(tariff) };
        },
        replay: async ({ store }, result) => replayTariffResponse(store, result)
      });
      return result.value;
    } catch (error) {
      return mapTariffError(error);
    }
  }

  async publishDraft(
    adminUserId: string,
    idempotencyKey: string,
    tariffSeriesId: string,
    version: number,
    body: unknown
  ): Promise<AdminTariffResponse> {
    const request = parse(adminTariffPublishRequestSchema, body);
    const now = this.clock.now();
    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: createTariffCommand({
          scope: "admin.tariff.publish",
          idempotencyKey,
          adminUserId,
          request: { tariffSeriesId, version, ...request },
          now
        }),
        create: async ({ store, auditLogStore }) => {
          const tariff = await store.publishDraft({
            tariffSeriesId,
            version,
            expectedDraftRevision: request.expectedDraftRevision
          });
          await writeAudit(auditLogStore, adminUserId, "platform_tariff.published", tariff, now);
          return { result: tariffReplayRecord(tariff), value: toResponse(tariff) };
        },
        replay: async ({ store }, result) => replayTariffResponse(store, result)
      });
      return result.value;
    } catch (error) {
      return mapTariffError(error);
    }
  }
}

function editableTerms(input: ReturnType<typeof adminTariffUpdateRequestSchema.parse>) {
  const { expectedDraftRevision: _expectedDraftRevision, ...terms } = input;
  void _expectedDraftRevision;
  return terms;
}

async function writeAudit(
  auditLogStore: AuditLogStore,
  actorUserId: string,
  action: "platform_tariff.draft_created" | "platform_tariff.draft_updated" | "platform_tariff.published",
  tariff: PlatformTariffVersion,
  occurredAt: Date
): Promise<void> {
  await auditLogStore.createEntry({
    actorUserId,
    action,
    targetType: "platform_tariff_version",
    targetId: `${tariff.tariffSeriesId}:${tariff.version}`,
    occurredAt: occurredAt.toISOString(),
    metadata: {
      lifecycle: tariff.lifecycle,
      draftRevision: tariff.draftRevision,
      canonicalDigest: tariff.canonicalDigest,
      commissionBps: tariff.clientSaleCommissionBps
    }
  });
}

function toResponse(tariff: PlatformTariffVersion): AdminTariffResponse {
  return adminTariffResponseSchema.parse(tariff);
}

function createTariffCommand(input: {
  readonly scope: "admin.tariff.create" | "admin.tariff.update" | "admin.tariff.publish";
  readonly idempotencyKey: string;
  readonly adminUserId: string;
  readonly request: unknown;
  readonly now: Date;
}) {
  return {
    scope: input.scope,
    idempotencyKey: input.idempotencyKey,
    actorUserId: input.adminUserId,
    requestHash: hashFinanceCommandPayload({
      actorUserId: input.adminUserId,
      operation: input.scope,
      request: input.request
    }),
    now: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
  };
}

function tariffReplayRecord(tariff: PlatformTariffVersion): Record<string, unknown> {
  return {
    tariffSeriesId: tariff.tariffSeriesId,
    version: tariff.version,
    canonicalDigest: tariff.canonicalDigest
  };
}

async function replayTariffResponse(
  store: Pick<PlatformTariffAuthorityStore, "findTariffVersion">,
  result: Record<string, unknown>
): Promise<AdminTariffResponse> {
  const tariffSeriesId = result.tariffSeriesId;
  const version = result.version;
  const canonicalDigest = result.canonicalDigest;
  if (
    typeof tariffSeriesId !== "string" ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    typeof canonicalDigest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(canonicalDigest)
  ) {
    throw new TariffIdempotencyReplayMissingError();
  }
  const tariff = await store.findTariffVersion({
    tariffSeriesId,
    version,
    canonicalDigest: canonicalDigest as `sha256:${string}`
  });
  if (!tariff) throw new TariffIdempotencyReplayMissingError();
  return toResponse(tariff);
}

function parse<T>(schema: { parse(value: unknown): T }, body: unknown): T {
  try {
    return schema.parse(body);
  } catch {
    throw new BadRequestException("Invalid tariff request");
  }
}

function mapTariffError(error: unknown): never {
  if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
  if (error instanceof TariffIdempotencyReplayMissingError) {
    throw new ConflictException(error.code);
  }
  if (
    error instanceof FinanceIdempotencyConflictError ||
    error instanceof FinanceIdempotencyInProgressError ||
    error instanceof FinanceIdempotencyFailedError
  ) {
    throw new ConflictException(error.code);
  }
  if (error instanceof PlatformTariffAuthorityPersistenceError) {
    if (error.reason === "invalid_tariff") throw new BadRequestException(error.reason);
    throw new ConflictException(error.reason);
  }
  if (error instanceof PlatformTariffAuthorityError) {
    if (error.reason === "invalid_tariff") throw new BadRequestException(error.reason);
    throw new ConflictException(error.reason);
  }
  throw error;
}

class TariffIdempotencyReplayMissingError extends Error {
  readonly code = "platform_tariff_idempotency_replay_missing";

  constructor() {
    super("Completed tariff command is missing its durable tariff version");
    this.name = "TariffIdempotencyReplayMissingError";
  }
}
