import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import type { DictionaryStore } from "@elevenhouse/domain";
import { describe, expect, it, vi } from "vitest";
import type { AiGenerationService } from "../ai/ai-generation.service";
import type { AstrologerSessionRequest } from "../identity/session/identity-current-session.service";
import { DictionaryAiService } from "./dictionary-ai.service";

const ownerUserId = "8e14390f-3db1-4d1c-9344-55679c778427";
const categoryId = "27f4dd55-1da2-4e58-90a1-ce10c2566b36";

describe("DictionaryAiService", () => {
  it("generates a draft through the shared AI generation service", async () => {
    const store = createStore();
    const aiGeneration = createAiGeneration();
    const service = createService(store, aiGeneration);

    await expect(
      service.createDraft(
        { categoryId, locale: "ru", title: "  Солнце в Овне  " },
        createAuthenticatedRequest()
      )
    ).resolves.toMatchObject({
      content: "Generated content",
      provider: "openai",
      model: "gpt-5.4-mini",
      promptId: "dictionary.entryDraft",
      promptVersion: 1,
      finishReason: "completed",
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3
      }
    });

    expect(store.listCategories).toHaveBeenCalledWith({
      ownerUserId,
      locale: "ru"
    });
    expect(aiGeneration.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        feature: "dictionary.aiDraft",
        input: {
          categoryId,
          categoryName: "Планеты в знаках",
          locale: "ru",
          title: "Солнце в Овне"
        }
      })
    );
  });

  it("rejects requests without an astrologer account", async () => {
    const service = createService(createStore(), createAiGeneration());

    await expect(
      service.createDraft({ categoryId, locale: "ru", title: "Солнце в Овне" }, { headers: {} })
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejects categories unavailable to the owner", async () => {
    const service = createService(
      createStore({
        listCategories: vi.fn(async () => ({ categories: [], total: 0 }))
      }),
      createAiGeneration()
    );

    await expect(
      service.createDraft(
        { categoryId, locale: "ru", title: "Солнце в Овне" },
        createAuthenticatedRequest()
      )
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects invalid request bodies with a bad request exception", async () => {
    const service = createService(createStore(), createAiGeneration());

    await expect(
      service.createDraft(
        { categoryId, locale: "de", title: "Солнце в Овне" },
        createAuthenticatedRequest()
      )
    ).rejects.toThrow(BadRequestException);
  });
});

function createService(
  store: DictionaryStore,
  aiGeneration: ReturnType<typeof createAiGeneration>
): DictionaryAiService {
  return new DictionaryAiService(store, aiGeneration as unknown as AiGenerationService);
}

function createStore(overrides: Partial<DictionaryStore> = {}): DictionaryStore {
  return {
    listCategories: vi.fn(async () => ({
      categories: [
        {
          id: categoryId,
          code: "planets_in_signs",
          name: "Планеты в знаках",
          order: 10,
          count: 4,
          createdAt: "2026-07-02T09:00:00.000Z",
          updatedAt: "2026-07-02T09:00:00.000Z"
        }
      ],
      total: 1
    })),
    listEntries: vi.fn(async () => ({
      entries: [],
      total: 0,
      counts: {
        sources: {
          all: 0,
          platform: 0,
          modified: 0,
          custom: 0
        }
      }
    })),
    createCustomEntry: vi.fn(async () => raise("Unexpected create custom entry call")),
    updateCustomEntry: vi.fn(async () => raise("Unexpected update custom entry call")),
    upsertPlatformEntryOverride: vi.fn(async () => raise("Unexpected override call")),
    deleteAstrologerEntry: vi.fn(async () => raise("Unexpected delete call")),
    resetAstrologerEntries: vi.fn(async () => raise("Unexpected reset astrologer entries call")),
    resetPlatformEntryOverride: vi.fn(async () => raise("Unexpected reset override call")),
    ...overrides
  };
}

function createAiGeneration() {
  return {
    generate: vi.fn(async () => ({
      output: { content: "Generated content" },
      provider: "openai",
      model: "gpt-5.4-mini",
      finishReason: "completed",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
    }))
  };
}

function createAuthenticatedRequest(): AstrologerSessionRequest {
  return {
    headers: {},
    currentAstrologerAccount: {
      account: {
        id: ownerUserId,
        status: "active",
        roles: ["astrologer"]
      }
    }
  };
}

function raise(message: string): never {
  throw new Error(message);
}
