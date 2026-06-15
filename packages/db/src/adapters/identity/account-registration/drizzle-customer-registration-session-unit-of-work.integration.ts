import { randomUUID } from "node:crypto";
import { registerCustomerAccountWithSession } from "@elevenhouse/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDrizzleCustomerAccountRegistrationSessionUnitOfWork } from "./index";
import { assertDevelopmentDatabaseUrl } from "../../../connection";
import { createPostgresRuntime } from "../../../runtime";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);

describe("customer registration with initial session Drizzle/PostgreSQL integration", () => {
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

  it("rolls back account, identity and roles when initial session creation fails", async () => {
    const tokenHash = `integration-session-${randomUUID()}`;
    const firstEmail = `integration-${randomUUID()}@example.com`;
    const failedEmail = `integration-${randomUUID()}@example.com`;
    const createdAt = new Date("2026-06-15T10:00:00.000Z");
    const expiresAt = new Date("2026-06-22T10:00:00.000Z");

    const firstResult = await registerCustomerAccountWithSession({
      registration: createDrizzleCustomerAccountRegistrationSessionUnitOfWork(runtime.database),
      identity: {
        provider: "email",
        providerSubject: firstEmail,
        email: firstEmail,
        emailVerifiedAt: createdAt
      },
      roles: ["client"],
      session: {
        tokenHash,
        createdAt,
        expiresAt
      },
      securityEventType: "registration_succeeded"
    });
    createdUserIds.push(firstResult.user.id);

    await expect(
      registerCustomerAccountWithSession({
        registration: createDrizzleCustomerAccountRegistrationSessionUnitOfWork(runtime.database),
        identity: {
          provider: "email",
          providerSubject: failedEmail,
          email: failedEmail,
          emailVerifiedAt: createdAt
        },
        roles: ["client"],
        session: {
          tokenHash,
          createdAt,
          expiresAt
        },
        securityEventType: "registration_succeeded"
      })
    ).rejects.toThrow();

    const persistedFailedIdentity = await runtime.pool.query<{ id: string }>(
      "select id from auth_identities where email = $1",
      [failedEmail]
    );

    expect(persistedFailedIdentity.rows).toEqual([]);
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
