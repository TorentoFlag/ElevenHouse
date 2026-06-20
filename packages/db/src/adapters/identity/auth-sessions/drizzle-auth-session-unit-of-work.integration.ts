import { randomUUID } from "node:crypto";
import {
  createAuthenticatedSession,
  registerCustomerAccount,
  resolveAuthenticatedSession
} from "@elevenhouse/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDrizzleAccountRegistrationUnitOfWork } from "../account-registration";
import {
  createDrizzleAuthSessionAuthenticationStore,
  createDrizzleAuthSessionCreationUnitOfWork
} from "./index";
import { assertDevelopmentDatabaseUrl } from "../../../connection";
import { createPostgresRuntime } from "../../../runtime";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);

describe("auth session Drizzle/PostgreSQL integration", () => {
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

  it("persists and resolves an auth session with a security event", async () => {
    const uniqueEmail = `session-${randomUUID()}@example.com`;
    const account = await registerCustomerAccount({
      accountRegistration: createDrizzleAccountRegistrationUnitOfWork(runtime.database),
      identity: {
        provider: "email",
        providerSubject: uniqueEmail,
        email: uniqueEmail,
        emailVerifiedAt: new Date("2026-06-14T10:00:00.000Z")
      },
      displayName: "Integration Client",
      roles: ["client"]
    });
    createdUserIds.push(account.user.id);

    const createdAt = new Date("2026-06-14T10:00:00.000Z");
    const expiresAt = new Date("2026-06-21T10:00:00.000Z");
    const sessionResult = await createAuthenticatedSession({
      sessionCreation: createDrizzleAuthSessionCreationUnitOfWork(runtime.database),
      userId: account.user.id,
      tokenHash: `hash-${randomUUID()}`,
      createdAt,
      expiresAt,
      securityEventType: "registration_succeeded",
      ipAddress: "127.0.0.1",
      userAgent: "integration-test"
    });

    const resolved = await resolveAuthenticatedSession({
      store: createDrizzleAuthSessionAuthenticationStore(runtime.database),
      tokenHash: sessionResult.session.tokenHash,
      now: new Date("2026-06-15T10:00:00.000Z")
    });

    expect(resolved).toEqual({
      session: sessionResult.session,
      user: account.user,
      roleAssignments: account.roleAssignments
    });

    const persistedEvents = await runtime.pool.query<{
      user_id: string | null;
      session_id: string | null;
      event_type: string;
    }>(
      `select user_id, session_id, event_type
       from auth_security_events
       where session_id = $1`,
      [sessionResult.session.id]
    );

    expect(persistedEvents.rows).toEqual([
      {
        user_id: account.user.id,
        session_id: sessionResult.session.id,
        event_type: "registration_succeeded"
      }
    ]);
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
