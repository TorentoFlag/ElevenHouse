import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import type { ZodType } from "@elevenhouse/validation";
import {
  createDictionaryCustomEntry,
  deleteDictionaryAstrologerEntry,
  listDictionaryCategories,
  listDictionaryEntries,
  overrideDictionaryPlatformEntry,
  resetDictionaryAstrologerEntries,
  resetDictionaryPlatformEntryOverride,
  DictionaryCategoryNotFoundError,
  DictionaryPlatformEntryNotFoundError,
  type DictionaryStore
} from "@elevenhouse/domain";
import {
  createDictionaryCustomEntryRequestSchema,
  dictionaryAstrologerEntryIdParamSchema,
  dictionaryAstrologerEntryResponseSchema,
  dictionaryEntriesQuerySchema,
  dictionaryEntriesResponseSchema,
  dictionaryPlatformEntryIdParamSchema,
  dictionaryCategoriesResponseSchema,
  listDictionaryCategoriesQuerySchema,
  type DictionaryAstrologerEntryResponse,
  type DictionaryCategoriesResponse,
  type DictionaryEntriesResponse,
  updateDictionaryPlatformEntryOverrideRequestSchema
} from "@elevenhouse/contracts";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { SystemClock } from "../clock/system-clock.service";
import { DICTIONARY_STORE } from "./dictionary.tokens";

@Injectable()
export class DictionaryService {
  constructor(
    @Inject(DICTIONARY_STORE) private readonly store: DictionaryStore,
    private readonly clock: SystemClock
  ) {}

  listCategories(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<DictionaryCategoriesResponse> {
    const parsedQuery = parseContract(listDictionaryCategoriesQuerySchema, query);

    return mapDictionaryStoreErrors(async () =>
      dictionaryCategoriesResponseSchema.parse(
        await listDictionaryCategories({
          store: this.store,
          ownerUserId: requireOwnerUserId(request),
          locale: parsedQuery.locale
        })
      )
    );
  }

  listEntries(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<DictionaryEntriesResponse> {
    const parsedQuery = parseContract(dictionaryEntriesQuerySchema, query);

    return mapDictionaryStoreErrors(async () =>
      dictionaryEntriesResponseSchema.parse(
        await listDictionaryEntries({
          store: this.store,
          ownerUserId: requireOwnerUserId(request),
          locale: parsedQuery.locale,
          categoryId: parsedQuery.categoryId,
          source: parsedQuery.source,
          search: parsedQuery.search,
          limit: parsedQuery.limit,
          offset: parsedQuery.offset
        })
      )
    );
  }

  createCustomEntry(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<DictionaryAstrologerEntryResponse> {
    const parsedBody = parseContract(createDictionaryCustomEntryRequestSchema, body);

    return mapDictionaryStoreErrors(async () =>
      dictionaryAstrologerEntryResponseSchema.parse(
        await createDictionaryCustomEntry({
          store: this.store,
          ownerUserId: requireOwnerUserId(request),
          categoryId: parsedBody.categoryId,
          code: `custom_${randomUUID()}`,
          locale: parsedBody.locale,
          title: parsedBody.title,
          content: parsedBody.content,
          now: this.clock.now()
        })
      )
    );
  }

  overridePlatformEntry(
    platformEntryId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<DictionaryAstrologerEntryResponse> {
    const parsedParams = parseContract(dictionaryPlatformEntryIdParamSchema, {
      platformEntryId
    });
    const parsedBody = parseContract(updateDictionaryPlatformEntryOverrideRequestSchema, body);

    return mapDictionaryStoreErrors(async () =>
      dictionaryAstrologerEntryResponseSchema.parse(
        await overrideDictionaryPlatformEntry({
          store: this.store,
          ownerUserId: requireOwnerUserId(request),
          platformEntryId: parsedParams.platformEntryId,
          title: parsedBody.title,
          content: parsedBody.content,
          now: this.clock.now()
        })
      )
    );
  }

  deleteEntry(entryId: string, request: AstrologerSessionRequest): Promise<void> {
    const parsedParams = parseContract(dictionaryAstrologerEntryIdParamSchema, { entryId });

    return mapDictionaryStoreErrors(() =>
      deleteDictionaryAstrologerEntry({
        store: this.store,
        ownerUserId: requireOwnerUserId(request),
        entryId: parsedParams.entryId
      })
    );
  }

  resetEntries(request: AstrologerSessionRequest): Promise<void> {
    return mapDictionaryStoreErrors(() =>
      resetDictionaryAstrologerEntries({
        store: this.store,
        ownerUserId: requireOwnerUserId(request)
      })
    );
  }

  resetPlatformEntryOverride(
    platformEntryId: string,
    request: AstrologerSessionRequest
  ): Promise<void> {
    const parsedParams = parseContract(dictionaryPlatformEntryIdParamSchema, {
      platformEntryId
    });

    return mapDictionaryStoreErrors(() =>
      resetDictionaryPlatformEntryOverride({
        store: this.store,
        ownerUserId: requireOwnerUserId(request),
        platformEntryId: parsedParams.platformEntryId
      })
    );
  }
}

function requireOwnerUserId(request: AstrologerSessionRequest): string {
  const ownerUserId = request.currentAstrologerAccount?.account.id;
  if (!ownerUserId) {
    throw new UnauthorizedException("Valid astrologer session is required");
  }

  return ownerUserId;
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException("Invalid dictionary request");
  }

  return result.data;
}

async function mapDictionaryStoreErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DictionaryPlatformEntryNotFoundError) {
      throw new NotFoundException("Dictionary platform entry not found");
    }

    if (error instanceof DictionaryCategoryNotFoundError) {
      throw new NotFoundException("Dictionary category not found");
    }

    throw error;
  }
}
