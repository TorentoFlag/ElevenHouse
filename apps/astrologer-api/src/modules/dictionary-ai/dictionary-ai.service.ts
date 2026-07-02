import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { dictionaryEntryDraftPromptV1 } from "@elevenhouse/ai";
import {
  createDictionaryAiDraftRequestSchema,
  createDictionaryAiDraftResponseSchema,
  type CreateDictionaryAiDraftRequest,
  type CreateDictionaryAiDraftResponse
} from "@elevenhouse/contracts";
import type { DictionaryStore } from "@elevenhouse/domain";
import type { ZodType } from "@elevenhouse/validation";
import { AiGenerationService } from "../ai/ai-generation.service";
import { DICTIONARY_STORE } from "../dictionary/dictionary.tokens";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";

@Injectable()
export class DictionaryAiService {
  constructor(
    @Inject(DICTIONARY_STORE) private readonly dictionaryStore: DictionaryStore,
    private readonly aiGeneration: AiGenerationService
  ) {}

  async createDraft(
    body: unknown,
    request: AstrologerSessionRequest
  ): Promise<CreateDictionaryAiDraftResponse> {
    const input = parseContract(createDictionaryAiDraftRequestSchema, body);
    const ownerUserId = request.currentAstrologerAccount?.account.id;

    if (!ownerUserId) {
      throw new UnauthorizedException("Valid astrologer session is required");
    }

    const category = await this.findCategory({ input, ownerUserId });
    const result = await this.aiGeneration.generate({
      prompt: dictionaryEntryDraftPromptV1,
      ownerUserId,
      feature: "dictionary.aiDraft",
      input: {
        categoryId: input.categoryId,
        categoryName: category.name,
        locale: input.locale,
        title: input.title
      }
    });

    return createDictionaryAiDraftResponseSchema.parse({
      content: result.output.content,
      provider: result.provider,
      model: result.model,
      promptId: dictionaryEntryDraftPromptV1.id,
      promptVersion: dictionaryEntryDraftPromptV1.version,
      finishReason: result.finishReason,
      usage: result.usage
    });
  }

  private async findCategory({
    input,
    ownerUserId
  }: {
    readonly input: CreateDictionaryAiDraftRequest;
    readonly ownerUserId: string;
  }) {
    const result = await this.dictionaryStore.listCategories({
      ownerUserId,
      locale: input.locale
    });
    const category = result.categories.find((candidate) => candidate.id === input.categoryId);

    if (!category) {
      throw new NotFoundException("Dictionary category not found");
    }

    return category;
  }
}

function parseContract<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException("Invalid dictionary AI draft request");
  }

  return result.data;
}
