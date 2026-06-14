import { randomUUID } from "node:crypto";
import { registerCustomerAccount } from "@elevenhouse/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDrizzleAccountRegistrationUnitOfWork } from "./index";
import { assertDevelopmentDatabaseUrl } from "../../../connection";
import { createPostgresRuntime } from "../../../runtime";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const integrationPasswordHash = "argon2$integration";

describe("account registration Drizzle/PostgreSQL integration", () => {
  const runtime = createPostgresRuntime({
    DATABASE_URL: databaseUrl
  });

  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
  });

  afterAll(async () => {
    try {
      for (const userId of createdUserIds) {
        await runtime.pool.query("delete from users where id = $1", [userId]);
      }
    } finally {
      await runtime.close();
    }
  });

  it("persists account, auth identity and roles through real Drizzle returning rows", async () => {
    const uniqueEmail = `integration-${randomUUID()}@example.com`;
    const result = await registerCustomerAccount({
      accountRegistration: createDrizzleAccountRegistrationUnitOfWork(runtime.database),
      identity: {
        provider: "email",
        providerSubject: uniqueEmail,
        email: uniqueEmail,
        passwordHash: integrationPasswordHash
      },
      roles: ["client", "astrologer"]
    });

    createdUserIds.push(result.user.id);

    const persistedUsers = await runtime.pool.query<{ id: string; status: string }>(
      "select id, status from users where id = $1",
      [result.user.id]
    );
    const persistedIdentities = await runtime.pool.query<{
      user_id: string;
      provider: string;
      provider_subject: string;
      email: string | null;
      has_password_hash: boolean;
    }>(
      `select user_id, provider, provider_subject, email, password_hash is not null as has_password_hash
       from auth_identities
       where user_id = $1`,
      [result.user.id]
    );
    const persistedRoles = await runtime.pool.query<{ role: string }>(
      "select role from user_role_assignments where user_id = $1",
      [result.user.id]
    );

    expect(persistedUsers.rows).toEqual([{ id: result.user.id, status: "active" }]);
    expect(persistedIdentities.rows).toEqual([
      {
        user_id: result.user.id,
        provider: "email",
        provider_subject: uniqueEmail,
        email: uniqueEmail,
        has_password_hash: true
      }
    ]);
    expect(persistedRoles.rows.map(({ role }) => role).sort()).toEqual(["astrologer", "client"]);
  });
});

function getIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  }

  return assertDevelopmentDatabaseUrl(
    value,
    process.env.NODE_ENV,
    "run integration tests against"
  );
}
