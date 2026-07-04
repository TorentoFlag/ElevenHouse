import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AstrologerProfileHandleConflictError,
  getAstrologerProfile,
  updateAstrologerProfile,
  upsertAstrologerProfile,
  type AstrologerProfileUpsertInput
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleAstrologerProfileStore } from "./index";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);

describe("astrologer profile Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({
    DATABASE_URL: databaseUrl
  });

  const ownerUserIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      await runtime.pool.query("delete from users where id = any($1)", [ownerUserIds]);
    } finally {
      await runtime.close();
    }
  });

  it("upserts, reads and partially updates owner-scoped astrologer profiles", async () => {
    const store = createDrizzleAstrologerProfileStore(runtime.database);
    const ownerUserId = await createUser();
    const otherOwnerUserId = await createUser();
    ownerUserIds.push(ownerUserId, otherOwnerUserId);

    const profile = await upsertAstrologerProfile({
      store,
      ownerUserId,
      input: {
        publicHandle: `astro-${randomUUID().slice(0, 8)}`,
        publicName: "Анна Вега",
        headline: "Натальная астрология",
        bio: "Описание практики",
        timezone: "Europe/Moscow",
        locale: "ru",
        avatarMediaId: null,
        coverMediaId: "cover-1",
        consultationLanguages: ["Русский", "English"],
        visibilityStatus: "paused",
        professionalExperienceYears: 9,
        professionalSchool: "Психологическая астрология",
        specializations: ["Натальная карта"],
        methods: ["Натальная астрология"],
        socialLinks: {
          telegram: "alisa_astro",
          instagram: null,
          whatsapp: null,
          website: "alisavega.ru"
        },
        ownBirthData: {
          date: "1990-07-14",
          time: "08:30",
          place: "Санкт-Петербург",
          showOnPublicPage: true
        }
      },
      now: new Date("2026-07-03T00:00:00.000Z")
    });

    expect(profile.ownerUserId).toBe(ownerUserId);
    await expect(getAstrologerProfile({ store, ownerUserId })).resolves.toMatchObject({
      ownerUserId,
      publicName: "Анна Вега",
      consultationLanguages: ["Русский", "English"],
      visibilityStatus: "paused",
      socialLinks: {
        telegram: "alisa_astro",
        instagram: null,
        whatsapp: null,
        website: "alisavega.ru"
      }
    });
    await expect(
      getAstrologerProfile({ store, ownerUserId: otherOwnerUserId })
    ).resolves.toBeNull();

    const updated = await updateAstrologerProfile({
      store,
      ownerUserId,
      patch: {
        headline: null,
        bio: "Новая редакция",
        consultationLanguages: ["English"],
        visibilityStatus: "published"
      },
      now: new Date("2026-07-03T00:10:00.000Z")
    });

    expect(updated).toMatchObject({
      ownerUserId,
      headline: null,
      bio: "Новая редакция",
      consultationLanguages: ["English"],
      visibilityStatus: "published",
      updatedAt: "2026-07-03T00:10:00.000Z"
    });
  });

  it("maps unique public handle collisions to a domain error", async () => {
    const store = createDrizzleAstrologerProfileStore(runtime.database);
    const firstOwnerUserId = await createUser();
    const secondOwnerUserId = await createUser();
    ownerUserIds.push(firstOwnerUserId, secondOwnerUserId);
    const publicHandle = `astro-${randomUUID().slice(0, 8)}`;

    await upsertAstrologerProfile({
      store,
      ownerUserId: firstOwnerUserId,
      input: createInput(publicHandle),
      now: new Date("2026-07-03T00:00:00.000Z")
    });

    await expect(
      upsertAstrologerProfile({
        store,
        ownerUserId: secondOwnerUserId,
        input: createInput(publicHandle),
        now: new Date("2026-07-03T00:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(AstrologerProfileHandleConflictError);
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );

    return result.rows[0]?.id ?? raise("Expected user insert to return id");
  }
});

function createInput(publicHandle: string): AstrologerProfileUpsertInput {
  return {
    publicHandle,
    publicName: "Анна Вега",
    headline: null,
    bio: null,
    timezone: "Europe/Moscow",
    locale: "ru",
    avatarMediaId: null,
    coverMediaId: null,
    consultationLanguages: ["Русский"],
    visibilityStatus: "draft",
    professionalExperienceYears: null,
    professionalSchool: null,
    specializations: [],
    methods: [],
    socialLinks: {
      telegram: null,
      instagram: null,
      whatsapp: null,
      website: null
    },
    ownBirthData: {
      date: null,
      time: null,
      place: null,
      showOnPublicPage: false
    }
  };
}

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  }

  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}
