import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import {
  adminSavedCardDisclosureDraftRequestSchema,
  adminSavedCardDisclosureListResponseSchema,
  adminSavedCardDisclosurePublishRequestSchema,
  adminSavedCardDisclosureResponseSchema,
  adminSavedCardDisclosureUpdateRequestSchema,
  type AdminSavedCardDisclosureResponse
} from "@elevenhouse/contracts";
import {
  type SavedCardDisclosureAuthorityStore,
  type SavedCardDisclosureVersion
} from "@elevenhouse/domain/finance-core";
import {
  FinanceIdempotencyConflictError,
  FinanceIdempotencyFailedError,
  FinanceIdempotencyInProgressError,
  hashFinanceCommandPayload,
  type AuditLogStore
} from "@elevenhouse/domain";
import { SavedCardDisclosureAuthorityPersistenceError } from "@elevenhouse/db/finance";

import { ADMIN_SAVED_CARD_DISCLOSURE_CLOCK, ADMIN_SAVED_CARD_DISCLOSURE_UNIT_OF_WORK } from "./saved-card-disclosures.tokens";
import type { AdminSavedCardDisclosureUnitOfWork } from "./saved-card-disclosures.unit-of-work";

@Injectable()
export class SavedCardDisclosuresService {
  constructor(
    @Inject(ADMIN_SAVED_CARD_DISCLOSURE_UNIT_OF_WORK) private readonly unitOfWork: AdminSavedCardDisclosureUnitOfWork,
    @Inject(ADMIN_SAVED_CARD_DISCLOSURE_CLOCK) private readonly clock: { now: () => Date }
  ) {}

  async list() {
    return adminSavedCardDisclosureListResponseSchema.parse({
      disclosures: (await this.unitOfWork.execute(({ store }) => store.listVersions())).map(toResponse)
    });
  }

  createDraft(actorUserId: string, idempotencyKey: string, body: unknown) {
    const request = parse(adminSavedCardDisclosureDraftRequestSchema, body);
    return this.mutate({ scope: "admin.saved_card_disclosure.create", action: "saved_card_disclosure.draft_created", actorUserId, idempotencyKey, request, mutate: ({ store }) => store.createDraft(request) });
  }

  updateDraft(actorUserId: string, idempotencyKey: string, body: unknown) {
    const request = parse(adminSavedCardDisclosureUpdateRequestSchema, body);
    return this.mutate({
      scope: "admin.saved_card_disclosure.update", action: "saved_card_disclosure.draft_updated", actorUserId, idempotencyKey, request,
      mutate: ({ store }) => store.updateDraft({ disclosureSeriesId: request.disclosureSeriesId, version: request.version, locale: request.locale, expectedDraftRevision: request.expectedDraftRevision, next: { disclosureSeriesId: request.disclosureSeriesId, version: request.version, locale: request.locale, body: request.body } })
    });
  }

  publish(actorUserId: string, idempotencyKey: string, disclosureSeriesId: string, version: number, locale: "ru" | "en", body: unknown) {
    const request = parse(adminSavedCardDisclosurePublishRequestSchema, body);
    return this.mutate({ scope: "admin.saved_card_disclosure.publish", action: "saved_card_disclosure.published", actorUserId, idempotencyKey, request: { disclosureSeriesId, version, locale, ...request }, mutate: ({ store }) => store.publishDraft({ disclosureSeriesId, version, locale, expectedDraftRevision: request.expectedDraftRevision }) });
  }

  retire(actorUserId: string, idempotencyKey: string, disclosureSeriesId: string, version: number, locale: "ru" | "en") {
    return this.mutate({ scope: "admin.saved_card_disclosure.retire", action: "saved_card_disclosure.retired", actorUserId, idempotencyKey, request: { disclosureSeriesId, version, locale }, mutate: ({ store }) => store.retirePublished({ disclosureSeriesId, version, locale }) });
  }

  private async mutate(input: Readonly<{ scope: string; action: string; actorUserId: string; idempotencyKey: string; request: unknown; mutate: (context: { store: SavedCardDisclosureAuthorityStore }) => Promise<SavedCardDisclosureVersion> }>): Promise<AdminSavedCardDisclosureResponse> {
    const now = this.clock.now();
    try {
      const result = await this.unitOfWork.executeIdempotent({
        command: { scope: input.scope, idempotencyKey: input.idempotencyKey, actorUserId: input.actorUserId, requestHash: hashFinanceCommandPayload({ actorUserId: input.actorUserId, operation: input.scope, request: input.request }), now: now.toISOString(), expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1_000).toISOString() },
        create: async (context) => {
          const disclosure = await input.mutate(context);
          await audit(context.auditLogStore, input.actorUserId, input.action, disclosure, now);
          const value = toResponse(disclosure);
          return { result: { disclosureSeriesId: disclosure.disclosure.disclosureSeriesId, version: disclosure.disclosure.version, locale: disclosure.disclosure.locale, canonicalDigest: disclosure.disclosure.canonicalDigest }, value };
        },
        replay: async ({ store }, result) => {
          const row = await store.findVersion(result as never);
          return row ? toResponse(row) : null;
        }
      });
      return result.value;
    } catch (error) { throw map(error); }
  }
}

function toResponse(value: SavedCardDisclosureVersion): AdminSavedCardDisclosureResponse {
  return adminSavedCardDisclosureResponseSchema.parse({ ...value.disclosure, draftRevision: value.draftRevision, lifecycle: value.lifecycle });
}
function parse<T>(schema: { parse(value: unknown): T }, body: unknown): T { try { return schema.parse(body); } catch { throw new BadRequestException("Invalid saved-card disclosure request"); } }
async function audit(store: AuditLogStore, actorUserId: string, action: string, value: SavedCardDisclosureVersion, occurredAt: Date) { await store.createEntry({ actorUserId, action, targetType: "finance_saved_card_disclosure", targetId: `${value.disclosure.disclosureSeriesId}:${value.disclosure.version}:${value.disclosure.locale}`, occurredAt: occurredAt.toISOString(), metadata: { lifecycle: value.lifecycle, draftRevision: value.draftRevision, canonicalDigest: value.disclosure.canonicalDigest } }); }
function map(error: unknown): ConflictException { if (error instanceof BadRequestException || error instanceof ConflictException) throw error; if (error instanceof SavedCardDisclosureAuthorityPersistenceError) return new ConflictException(error.reason); if (error instanceof FinanceIdempotencyConflictError || error instanceof FinanceIdempotencyFailedError || error instanceof FinanceIdempotencyInProgressError) return new ConflictException(error.code); throw error; }
