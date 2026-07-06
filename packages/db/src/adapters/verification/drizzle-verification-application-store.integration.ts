import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getCurrentAstrologerVerification,
  submitAstrologerVerificationApplication
} from "@elevenhouse/domain";
import { assertDevelopmentDatabaseUrl } from "../../connection";
import { createPostgresRuntime } from "../../runtime";
import { createDrizzleVerificationApplicationStore } from "./index";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);

describe("verification Drizzle/PostgreSQL integration", () => {
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

  it("creates and reads the latest owner-scoped verification application", async () => {
    const store = createDrizzleVerificationApplicationStore(runtime.database);
    const ownerUserId = await createUser();
    const otherOwnerUserId = await createUser();
    ownerUserIds.push(ownerUserId, otherOwnerUserId);
    const identityMediaId = await createMediaAsset(ownerUserId, "verification_identity_document");
    const qualificationMediaId = await createMediaAsset(
      ownerUserId,
      "verification_qualification_document"
    );

    const application = await submitAstrologerVerificationApplication({
      store,
      ownerUserId,
      input: {
        identityDocumentMediaId: identityMediaId,
        qualificationDocumentMediaIds: [qualificationMediaId]
      },
      now: new Date("2026-07-06T10:00:00.000Z")
    });

    expect(application.status).toBe("pending");
    expect(application.documents).toMatchObject([
      {
        kind: "identity",
        mediaId: identityMediaId,
        originalFileName: "verification_identity_document.pdf"
      },
      {
        kind: "qualification",
        mediaId: qualificationMediaId,
        originalFileName: "verification_qualification_document.pdf"
      }
    ]);
    await expect(getCurrentAstrologerVerification({ store, ownerUserId })).resolves.toMatchObject({
      status: "pending",
      application: { id: application.id }
    });
    await expect(
      getCurrentAstrologerVerification({ store, ownerUserId: otherOwnerUserId })
    ).resolves.toEqual({
      status: "none",
      application: null
    });
  });

  async function createUser(): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      "insert into users (status) values ('active') returning id"
    );

    return result.rows[0]?.id ?? raise("Expected user insert to return id");
  }

  async function createMediaAsset(ownerUserId: string, purpose: string): Promise<string> {
    const result = await runtime.pool.query<{ id: string }>(
      `insert into media_assets (
        owner_user_id,
        purpose,
        status,
        visibility,
        storage_bucket,
        storage_key,
        original_file_name,
        mime_type,
        size_bytes
      ) values ($1, $2, 'ready', 'private', 'elevenhouse-media', $3, $4, 'application/pdf', 1000)
      returning id`,
      [ownerUserId, purpose, `${ownerUserId}/${purpose}/document.pdf`, `${purpose}.pdf`]
    );

    return result.rows[0]?.id ?? raise("Expected media insert to return id");
  }
});

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  }

  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}

function raise(message: string): never {
  throw new Error(message);
}
