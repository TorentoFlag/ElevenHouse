import { describe, expect, it, vi } from "vitest";
import {
  AstrologerProfileHandleConflictError,
  AstrologerProfileValidationError,
  getAstrologerProfile,
  updateAstrologerProfile,
  upsertAstrologerProfile,
  type AstrologerProfile,
  type AstrologerProfileStore
} from "./index";

const now = new Date("2026-07-03T00:00:00.000Z");

const profile: AstrologerProfile = {
  ownerUserId: "owner-1",
  publicHandle: "astro-anna",
  publicName: "Анна Вега",
  headline: "Натальная астрология",
  bio: "Описание практики",
  timezone: "Europe/Moscow",
  locale: "ru",
  avatarMediaId: null,
  coverMediaId: "cover-1",
  consultationLanguages: ["ru", "en"],
  isPublicPageEnabled: false,
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z"
};

function createStore(overrides: Partial<AstrologerProfileStore> = {}): AstrologerProfileStore {
  return {
    findByOwnerUserId: vi.fn(async () => profile),
    upsert: vi.fn(async (input) => ({
      ...profile,
      ...input,
      createdAt: input.now,
      updatedAt: input.now
    })),
    update: vi.fn(async (input) => ({
      ...profile,
      ...input.patch,
      ownerUserId: input.ownerUserId,
      updatedAt: input.now
    })),
    ...overrides
  };
}

describe("astrologer profile domain", () => {
  it("reads the profile for the authenticated owner", async () => {
    const store = createStore();

    await expect(getAstrologerProfile({ store, ownerUserId: " owner-1 " })).resolves.toEqual(
      profile
    );

    expect(store.findByOwnerUserId).toHaveBeenCalledWith({ ownerUserId: "owner-1" });
  });

  it("normalizes profile input before upsert", async () => {
    const store = createStore();

    await upsertAstrologerProfile({
      store,
      ownerUserId: " owner-1 ",
      input: {
        publicHandle: " Astro-Anna ",
        publicName: " Анна Вега ",
        headline: "",
        bio: "  Работаю с картами  ",
        timezone: " Europe/Moscow ",
        locale: " RU ",
        avatarMediaId: "",
        coverMediaId: " cover-1 ",
        consultationLanguages: [" RU ", "en"],
        isPublicPageEnabled: true
      },
      now
    });

    expect(store.upsert).toHaveBeenCalledWith({
      ownerUserId: "owner-1",
      publicHandle: "astro-anna",
      publicName: "Анна Вега",
      headline: null,
      bio: "Работаю с картами",
      timezone: "Europe/Moscow",
      locale: "ru",
      avatarMediaId: null,
      coverMediaId: "cover-1",
      consultationLanguages: ["ru", "en"],
      isPublicPageEnabled: true,
      now: "2026-07-03T00:00:00.000Z"
    });
  });

  it("normalizes partial update patches and preserves omitted fields", async () => {
    const store = createStore();

    await updateAstrologerProfile({
      store,
      ownerUserId: "owner-1",
      patch: {
        headline: " ",
        consultationLanguages: [" EN "]
      },
      now
    });

    expect(store.update).toHaveBeenCalledWith({
      ownerUserId: "owner-1",
      patch: {
        headline: null,
        consultationLanguages: ["en"]
      },
      now: "2026-07-03T00:00:00.000Z"
    });
  });

  it("rejects duplicate consultation languages before persistence", async () => {
    const store = createStore();

    await expect(
      updateAstrologerProfile({
        store,
        ownerUserId: "owner-1",
        patch: { consultationLanguages: ["ru", " RU "] },
        now
      })
    ).rejects.toBeInstanceOf(AstrologerProfileValidationError);
  });

  it("propagates handle conflict errors from the store", async () => {
    const store = createStore({
      upsert: vi.fn(async () => {
        throw new AstrologerProfileHandleConflictError("astro-anna");
      })
    });

    await expect(
      upsertAstrologerProfile({
        store,
        ownerUserId: "owner-1",
        input: {
          publicHandle: "astro-anna",
          publicName: "Анна Вега",
          headline: null,
          bio: null,
          timezone: "Europe/Moscow",
          locale: "ru",
          avatarMediaId: null,
          coverMediaId: null,
          consultationLanguages: ["ru"],
          isPublicPageEnabled: false
        },
        now
      })
    ).rejects.toBeInstanceOf(AstrologerProfileHandleConflictError);
  });
});
