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
  resetDictionaryPlatformEntryOverride,
  type DictionaryAstrologerEntry,
  type DictionaryCategoryListResult,
  type DictionaryEntryListResult,
  type DictionaryStore
} from "@elevenhouse/domain";
import {
  createDictionaryCustomEntryRequestSchema,
  dictionaryEntriesQuerySchema,
  listDictionaryCategoriesQuerySchema,
  updateDictionaryPlatformEntryOverrideRequestSchema
} from "@elevenhouse/contracts";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { DICTIONARY_STORE } from "./dictionary.tokens";

@Injectable()
export class DictionaryService {
  constructor(@Inject(DICTIONARY_STORE) private readonly store: DictionaryStore) {}

  listCategories(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<DictionaryCategoryListResult> {
    const parsedQuery = parseContract(listDictionaryCategoriesQuerySchema, query);

    return listDictionaryCategories({
      store: this.store,
      ownerUserId: requireOwnerUserId(request),
      locale: parsedQuery.locale
    });
  }

  listEntries(
    query: unknown,
    request: AstrologerSessionRequest
  ): Promise<DictionaryEntryListResult> {
    const parsedQuery = parseContract(dictionaryEntriesQuerySchema, query);

    return listDictionaryEntries({
      store: this.store,
      ownerUserId: requireOwnerUserId(request),
      locale: parsedQuery.locale,
      categoryId: parsedQuery.categoryId,
      source: parsedQuery.source,
      search: parsedQuery.search,
      limit: parsedQuery.limit,
      offset: parsedQuery.offset
    });
  }

  createCustomEntry(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<DictionaryAstrologerEntry> {
    const parsedBody = parseContract(createDictionaryCustomEntryRequestSchema, body);

    return createDictionaryCustomEntry({
      store: this.store,
      ownerUserId: requireOwnerUserId(request),
      categoryId: parsedBody.categoryId,
      code: `custom_${randomUUID()}`,
      locale: parsedBody.locale,
      title: parsedBody.title,
      content: parsedBody.content,
      now: new Date()
    });
  }

  overridePlatformEntry(
    platformEntryId: string,
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<DictionaryAstrologerEntry> {
    const parsedBody = parseContract(updateDictionaryPlatformEntryOverrideRequestSchema, body);

    return mapDictionaryStoreErrors(() =>
      overrideDictionaryPlatformEntry({
        store: this.store,
        ownerUserId: requireOwnerUserId(request),
        platformEntryId,
        title: parsedBody.title,
        content: parsedBody.content,
        now: new Date()
      })
    );
  }

  deleteEntry(entryId: string, request: AstrologerSessionRequest): Promise<void> {
    return deleteDictionaryAstrologerEntry({
      store: this.store,
      ownerUserId: requireOwnerUserId(request),
      entryId
    });
  }

  resetPlatformEntryOverride(
    platformEntryId: string,
    request: AstrologerSessionRequest
  ): Promise<void> {
    return resetDictionaryPlatformEntryOverride({
      store: this.store,
      ownerUserId: requireOwnerUserId(request),
      platformEntryId
    });
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
    if (
      error instanceof Error &&
      error.message.startsWith("Dictionary platform entry not found:")
    ) {
      throw new NotFoundException("Dictionary platform entry not found");
    }

    throw error;
  }
}
