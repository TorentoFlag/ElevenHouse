import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import {
  adminFiscalProfileDraftRequestSchema,
  adminFiscalProfileListResponseSchema,
  adminFiscalProfilePublishRequestSchema,
  adminFiscalProfileResponseSchema,
  adminFiscalProfileUpdateRequestSchema,
  type AdminFiscalProfileResponse
} from "@elevenhouse/contracts";
import {
  FiscalProfileAuthorityError,
  type FiscalProfileAuthorityStore,
  type FiscalProfileVersion
} from "@elevenhouse/domain/finance-core";
import {
  type AuditLogStore,
  assertFinanceOperationReady,
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  FinanceOperationNotReadyError,
  hashFinanceCommandPayload,
  type FinanceReadinessEvidenceReader
} from "@elevenhouse/domain";
import { FiscalProfileAuthorityPersistenceError } from "@elevenhouse/db/finance";

import { ADMIN_FISCAL_PROFILE_CLOCK, ADMIN_FISCAL_PROFILE_UNIT_OF_WORK } from "./fiscal-profiles.tokens";
import type { AdminFiscalProfileUnitOfWork } from "./fiscal-profiles.unit-of-work";

type Clock = Readonly<{ now: () => Date }>;

@Injectable()
export class FiscalProfilesService {
  constructor(
    @Inject(ADMIN_FISCAL_PROFILE_UNIT_OF_WORK) private readonly unitOfWork: AdminFiscalProfileUnitOfWork,
    @Inject(ADMIN_FISCAL_PROFILE_CLOCK) private readonly clock: Clock
  ) {}

  async listProfiles() {
    try {
      const profiles = await this.unitOfWork.execute(({ store }) => store.listVersions());
      return adminFiscalProfileListResponseSchema.parse({ profiles: profiles.map(toResponse) });
    } catch (error) {
      return mapFiscalProfileError(error);
    }
  }

  async createDraft(
    adminUserId: string,
    idempotencyKey: string,
    body: unknown
  ): Promise<AdminFiscalProfileResponse> {
    const request = parse(adminFiscalProfileDraftRequestSchema, body);
    return this.executeMutation({
      scope: "admin.fiscal_profile.create",
      action: "fiscal_profile.draft_created",
      adminUserId,
      idempotencyKey,
      request,
      mutate: ({ store }) => store.createDraft(request)
    });
  }

  async updateDraft(
    adminUserId: string,
    idempotencyKey: string,
    body: unknown
  ): Promise<AdminFiscalProfileResponse> {
    const request = parse(adminFiscalProfileUpdateRequestSchema, body);
    const { expectedDraftRevision, ...next } = request;
    return this.executeMutation({
      scope: "admin.fiscal_profile.update",
      action: "fiscal_profile.draft_updated",
      adminUserId,
      idempotencyKey,
      request,
      mutate: ({ store }) => store.updateDraft({
        profileSeriesId: request.profileSeriesId,
        version: request.version,
        expectedDraftRevision,
        next
      })
    });
  }

  async publishDraft(
    adminUserId: string,
    idempotencyKey: string,
    profileSeriesId: string,
    version: number,
    body: unknown
  ): Promise<AdminFiscalProfileResponse> {
    const request = parse(adminFiscalProfilePublishRequestSchema, body);
    return this.executeMutation({
      scope: "admin.fiscal_profile.publish",
      action: "fiscal_profile.published",
      adminUserId,
      idempotencyKey,
      request: { profileSeriesId, version, ...request },
      assertReady: async ({ store, readinessReader }) => {
        const current = await store.findVersionByIdentity({ profileSeriesId, version });
        if (!current) return;
        await assertFinanceOperationReady({
          context: {
            operationKind: "fiscal_policy_publish",
            transactionCategory: current.profile.transactionCategory
          },
          reader: readinessReader,
          now: this.clock.now().toISOString()
        });
      },
      mutate: ({ store }) => store.publishDraft({
        profileSeriesId,
        version,
        expectedDraftRevision: request.expectedDraftRevision
      })
    });
  }

  async retirePublished(
    adminUserId: string,
    idempotencyKey: string,
    profileSeriesId: string,
    version: number
  ): Promise<AdminFiscalProfileResponse> {
    return this.executeMutation({
      scope: "admin.fiscal_profile.retire",
      action: "fiscal_profile.retired",
      adminUserId,
      idempotencyKey,
      request: { profileSeriesId, version },
      mutate: ({ store }) => store.retirePublished({ profileSeriesId, version })
    });
  }

  private async executeMutation(input: Readonly<{
    scope: "admin.fiscal_profile.create" | "admin.fiscal_profile.update" |
      "admin.fiscal_profile.publish" | "admin.fiscal_profile.retire";
    action: "fiscal_profile.draft_created" | "fiscal_profile.draft_updated" |
      "fiscal_profile.published" | "fiscal_profile.retired";
    adminUserId: string;
    idempotencyKey: string;
    request: unknown;
    assertReady?: (context: {
      store: FiscalProfileAuthorityStore;
      readinessReader: FinanceReadinessEvidenceReader;
    }) => Promise<unknown>;
    mutate: (context: { store: FiscalProfileAuthorityStore }) => Promise<FiscalProfileVersion>;
  }>): Promise<AdminFiscalProfileResponse> {
    const now = this.clock.now();
    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: {
          scope: input.scope,
          idempotencyKey: input.idempotencyKey,
          actorUserId: input.adminUserId,
          requestHash: hashFinanceCommandPayload({
            actorUserId: input.adminUserId,
            operation: input.scope,
            request: input.request
          }),
          now: now.toISOString(),
          expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
        },
        create: async (context) => {
          await input.assertReady?.(context);
          const profile = await input.mutate(context);
          await writeAudit(context.auditLogStore, input.adminUserId, input.action, profile, now);
          return { result: replayRecord(profile), value: toResponse(profile) };
        },
        replay: async ({ store }, result) => replayResponse(store, result)
      });
      return result.value;
    } catch (error) {
      return mapFiscalProfileError(error);
    }
  }
}

function toResponse(version: FiscalProfileVersion): AdminFiscalProfileResponse {
  return adminFiscalProfileResponseSchema.parse({
    ...version.profile,
    draftRevision: version.draftRevision,
    lifecycle: version.lifecycle
  });
}

function parse<T>(schema: { parse(value: unknown): T }, body: unknown): T {
  try {
    return schema.parse(body);
  } catch {
    throw new BadRequestException("Invalid fiscal profile request");
  }
}

async function writeAudit(
  auditLogStore: AuditLogStore,
  actorUserId: string,
  action: "fiscal_profile.draft_created" | "fiscal_profile.draft_updated" |
    "fiscal_profile.published" | "fiscal_profile.retired",
  profile: FiscalProfileVersion,
  occurredAt: Date
): Promise<void> {
  await auditLogStore.createEntry({
    actorUserId,
    action,
    targetType: "fiscal_profile_version",
    targetId: `${profile.profile.profileSeriesId}:${profile.profile.version}`,
    occurredAt: occurredAt.toISOString(),
    metadata: {
      transactionCategory: profile.profile.transactionCategory,
      lifecycle: profile.lifecycle,
      draftRevision: profile.draftRevision,
      canonicalDigest: profile.profile.canonicalDigest
    }
  });
}

function replayRecord(profile: FiscalProfileVersion): Record<string, unknown> {
  return {
    profileSeriesId: profile.profile.profileSeriesId,
    version: profile.profile.version,
    canonicalDigest: profile.profile.canonicalDigest
  };
}

async function replayResponse(
  store: Pick<FiscalProfileAuthorityStore, "findVersion">,
  result: Record<string, unknown>
): Promise<AdminFiscalProfileResponse> {
  const { profileSeriesId, version, canonicalDigest } = result;
  if (
    typeof profileSeriesId !== "string" ||
    typeof version !== "number" || !Number.isSafeInteger(version) || typeof canonicalDigest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(canonicalDigest)
  ) {
    throw new FiscalProfileIdempotencyReplayMissingError();
  }
  const profile = await store.findVersion({
    profileSeriesId,
    version,
    canonicalDigest: canonicalDigest as `sha256:${string}`
  });
  if (!profile) throw new FiscalProfileIdempotencyReplayMissingError();
  return toResponse(profile);
}

function mapFiscalProfileError(error: unknown): never {
  if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
  if (error instanceof FiscalProfileIdempotencyReplayMissingError) {
    throw new ConflictException(error.code);
  }
  if (
    error instanceof FinanceIdempotencyConflictError ||
    error instanceof FinanceIdempotencyInProgressError ||
    error instanceof FinanceIdempotencyFailedError
  ) {
    throw new ConflictException(error.code);
  }
  if (error instanceof FinanceOperationNotReadyError) {
    throw new ConflictException(error.code);
  }
  if (error instanceof FiscalProfileAuthorityPersistenceError) {
    if (error.reason === "invalid_profile") throw new BadRequestException(error.reason);
    throw new ConflictException(error.reason);
  }
  if (error instanceof FiscalProfileAuthorityError) {
    if (error.reason === "invalid_profile") throw new BadRequestException(error.reason);
    throw new ConflictException(error.reason);
  }
  throw error;
}

class FiscalProfileIdempotencyReplayMissingError extends Error {
  readonly code = "fiscal_profile_idempotency_replay_missing";
}
