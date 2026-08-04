import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { hashSessionToken } from "@elevenhouse/auth";
import {
  canonicalChartAiConsentNotices,
  chartAiConsentNoticeSha256ByLocale,
  clientDataConsentListResponseSchema,
  currentChartAiConsentPolicy,
  grantChartAiConsentResponseSchema,
  revokeClientDataConsentResponseSchema
} from "@elevenhouse/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SystemClock } from "../../common/system-clock.js";
import { PublicSessionAuthGuard } from "../identity/auth/identity-auth.guard";
import { AUTH_SESSION_AUTHENTICATION_STORE } from "../identity/auth/identity-auth.tokens";
import { IdentityCurrentSessionService } from "../identity/session/identity-current-session.service";
import { CsrfGuard } from "../security/csrf/csrf.guard";
import { PublicCsrfTokenService } from "../security/csrf/public-csrf-token.service";
import { assertDevelopmentDatabaseUrl } from "../../../../../packages/db/src/connection/index.js";
import { createDrizzleAuthSessionAuthenticationStore } from "../../../../../packages/db/src/adapters/identity/auth-sessions/index.js";
import { createDrizzleClientConsentStore } from "../../../../../packages/db/src/adapters/clients/drizzle-client-consent-store.js";
import { createPostgresRuntime } from "../../../../../packages/db/src/runtime/index.js";
import { ClientConsentsController } from "./client-consents.controller.js";
import { ClientConsentsService } from "./client-consents.service.js";
import { CLIENT_CONSENT_ID_GENERATOR, CLIENT_CONSENT_STORE } from "./client-consents.tokens.js";

const databaseUrl = requireIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const sessionCookieName = "elevenhouse_public_session";
const csrfCookieName = "elevenhouse_public_csrf";
const csrfHeaderName = "x-csrf-token";
const trustedOrigin = "http://localhost:3000";
const csrfSecret = "client-consent-e2e-csrf-secret-with-enough-entropy";

type AuthenticatedClient = {
  readonly userId: string;
  readonly sessionToken: string;
  readonly sessionExpiresAt: string;
};

type HttpResponse = {
  readonly status: number;
  readonly body: unknown;
};

describe("client consent real HTTP/PostgreSQL acceptance", () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: databaseUrl });
  const createdUserIds = new Set<string>();
  let app: INestApplication | undefined;
  let moduleRef: TestingModule | undefined;
  let baseUrl = "";
  let csrfTokenService: PublicCsrfTokenService;

  beforeAll(async () => {
    await runtime.pool.query("select 1");
    const configService = new ConfigService({
      publicApi: {
        sessionCookieName,
        csrfCookieName,
        csrfHeaderName,
        csrfSecret,
        csrfTokenTtlSeconds: 3_600,
        sessionCookieSecure: false,
        allowedOrigins: [trustedOrigin]
      }
    });
    moduleRef = await Test.createTestingModule({
      controllers: [ClientConsentsController],
      providers: [
        ClientConsentsService,
        PublicSessionAuthGuard,
        IdentityCurrentSessionService,
        CsrfGuard,
        PublicCsrfTokenService,
        SystemClock,
        { provide: ConfigService, useValue: configService },
        {
          provide: AUTH_SESSION_AUTHENTICATION_STORE,
          useValue: createDrizzleAuthSessionAuthenticationStore(runtime.database)
        },
        {
          provide: CLIENT_CONSENT_STORE,
          useValue: createDrizzleClientConsentStore(runtime.database)
        },
        { provide: CLIENT_CONSENT_ID_GENERATOR, useValue: randomUUID }
      ]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
    csrfTokenService = moduleRef.get(PublicCsrfTokenService);
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      if (moduleRef) await moduleRef.close();
      const userIds = [...createdUserIds];
      if (userIds.length > 0) {
        await runtime.pool.query(
          "delete from audit_log_entries where actor_user_id = any($1::uuid[]) and action in ('client.consent.granted', 'client.consent.revoked')",
          [userIds]
        );
        await runtime.pool.query(
          "delete from client_data_consents where client_user_id = any($1::uuid[]) or astrologer_user_id = any($1::uuid[])",
          [userIds]
        );
        await runtime.pool.query(
          "delete from client_astrologer_relationships where client_user_id = any($1::uuid[]) or astrologer_user_id = any($1::uuid[])",
          [userIds]
        );
        await runtime.pool.query("delete from users where id = any($1::uuid[])", [userIds]);
      }
    } finally {
      await runtime.close();
    }
  });

  it("authenticates the owner and lists only that client's canonical relationship evidence", async () => {
    const owner = await createAuthenticatedClient();
    const otherClient = await createAuthenticatedClient();
    const astrologerUserId = await createUser("astrologer");
    await createRelationship(owner.userId, astrologerUserId, "active");
    await createRelationship(otherClient.userId, astrologerUserId, "active");

    await expect(request("GET", "/me/consents?locale=ru")).resolves.toMatchObject({
      status: 401
    });

    const response = await request("GET", "/me/consents?locale=ru", {
      cookie: authCookie(owner)
    });

    expect(response.status).toBe(200);
    expect(clientDataConsentListResponseSchema.parse(response.body)).toEqual({
      policy: currentChartAiConsentPolicy,
      notice: canonicalChartAiConsentNotices.ru,
      noticeSha256: chartAiConsentNoticeSha256ByLocale.ru,
      consents: [
        {
          astrologerUserId,
          publicHandle: publicHandle(astrologerUserId),
          publicName: "Consent E2E Astrologer",
          relationshipStatus: "active",
          state: "missing",
          consentId: null,
          noticeLocale: null,
          grantedAt: null,
          revokedAt: null
        }
      ]
    });
  });

  it("enforces signed CSRF and strict version/hash/body evidence before an idempotent grant", async () => {
    const owner = await createAuthenticatedClient();
    const astrologerUserId = await createUser("astrologer");
    const relationshipId = await createRelationship(owner.userId, astrologerUserId, "active");
    const validRequest = {
      accepted: true,
      policyVersion: currentChartAiConsentPolicy.policyVersion,
      noticeSha256: chartAiConsentNoticeSha256ByLocale.en,
      locale: "en"
    } as const;
    const csrf = csrfHeaders(owner);

    await expect(
      request("PUT", `/me/consents/${astrologerUserId}/chart-ai`, {
        cookie: authCookie(owner),
        origin: trustedOrigin,
        body: validRequest
      })
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      request("PUT", `/me/consents/${astrologerUserId}/chart-ai`, {
        ...csrf,
        origin: "https://untrusted.example",
        body: validRequest
      })
    ).resolves.toMatchObject({ status: 403 });

    const invalidRequests: readonly unknown[] = [
      { ...validRequest, unexpected: true },
      { ...validRequest, accepted: false },
      { ...validRequest, policyVersion: "chart-ai-external-processing.v0" },
      { ...validRequest, noticeSha256: `sha256:${"0".repeat(64)}` },
      {
        ...validRequest,
        locale: "ru",
        noticeSha256: chartAiConsentNoticeSha256ByLocale.en
      }
    ];
    for (const body of invalidRequests) {
      const response = await request("PUT", `/me/consents/${astrologerUserId}/chart-ai`, {
        ...csrf,
        origin: trustedOrigin,
        body
      });
      expect(response.status).toBe(400);
    }
    const beforeGrant = await runtime.pool.query<{ count: string }>(
      "select count(*)::text as count from client_data_consents where relationship_id = $1",
      [relationshipId]
    );
    expect(beforeGrant.rows).toEqual([{ count: "0" }]);

    const granted = await request("PUT", `/me/consents/${astrologerUserId}/chart-ai`, {
      ...csrf,
      origin: trustedOrigin,
      body: validRequest
    });
    expect(granted.status).toBe(200);
    const parsedGrant = grantChartAiConsentResponseSchema.parse(granted.body);
    expect(parsedGrant).toEqual({
      state: "granted",
      consent: {
        id: expect.any(String),
        clientUserId: owner.userId,
        astrologerUserId,
        purpose: currentChartAiConsentPolicy.purpose,
        policyVersion: currentChartAiConsentPolicy.policyVersion,
        processorCode: currentChartAiConsentPolicy.processorCode,
        noticeLocale: "en",
        noticeSha256: chartAiConsentNoticeSha256ByLocale.en,
        grantedAt: expect.any(String)
      }
    });

    const repeated = await request("PUT", `/me/consents/${astrologerUserId}/chart-ai`, {
      ...csrf,
      origin: trustedOrigin,
      body: validRequest
    });
    expect(repeated.status).toBe(200);
    expect(grantChartAiConsentResponseSchema.parse(repeated.body)).toEqual(parsedGrant);
    const persisted = await runtime.pool.query<{
      id: string;
      client_user_id: string;
      astrologer_user_id: string;
      purpose: string;
      policy_version: string;
      processor_code: string;
      notice_locale: string;
      notice_sha256: string;
    }>(
      `select id, client_user_id, astrologer_user_id, purpose, policy_version,
              processor_code, notice_locale, notice_sha256
       from client_data_consents
       where relationship_id = $1`,
      [relationshipId]
    );
    expect(persisted.rows).toEqual([
      {
        id: parsedGrant.consent.id,
        client_user_id: owner.userId,
        astrologer_user_id: astrologerUserId,
        purpose: currentChartAiConsentPolicy.purpose,
        policy_version: currentChartAiConsentPolicy.policyVersion,
        processor_code: currentChartAiConsentPolicy.processorCode,
        notice_locale: "en",
        notice_sha256: chartAiConsentNoticeSha256ByLocale.en
      }
    ]);
    const grants = await runtime.pool.query<{ count: string }>(
      "select count(*)::text as count from audit_log_entries where action = 'client.consent.granted' and target_id = $1",
      [parsedGrant.consent.id]
    );
    expect(grants.rows).toEqual([{ count: "1" }]);
  });

  it("keeps inactive history revocable/idempotent and prevents cross-owner reads or writes", async () => {
    const owner = await createAuthenticatedClient();
    const otherClient = await createAuthenticatedClient();
    const astrologerUserId = await createUser("astrologer");
    const relationshipId = await createRelationship(owner.userId, astrologerUserId, "active");
    const ownerCsrf = csrfHeaders(owner);
    const otherCsrf = csrfHeaders(otherClient);
    const grant = await request("PUT", `/me/consents/${astrologerUserId}/chart-ai`, {
      ...ownerCsrf,
      origin: trustedOrigin,
      body: {
        accepted: true,
        policyVersion: currentChartAiConsentPolicy.policyVersion,
        noticeSha256: chartAiConsentNoticeSha256ByLocale.ru,
        locale: "ru"
      }
    });
    expect(grant.status).toBe(200);
    const consentId = grantChartAiConsentResponseSchema.parse(grant.body).consent.id;
    await runtime.pool.query(
      "update client_astrologer_relationships set status = 'archived', archived_at = now(), updated_at = now() where id = $1",
      [relationshipId]
    );

    const inactive = await request("GET", "/me/consents?locale=ru", {
      cookie: authCookie(owner)
    });
    const inactiveList = clientDataConsentListResponseSchema.parse(inactive.body);
    expect(inactive.status).toBe(200);
    expect(inactiveList.consents).toEqual([
      expect.objectContaining({
        astrologerUserId,
        relationshipStatus: "archived",
        state: "stale",
        consentId,
        revokedAt: null
      })
    ]);

    const otherList = await request("GET", "/me/consents?locale=ru", {
      cookie: authCookie(otherClient)
    });
    expect(otherList.status).toBe(200);
    expect(clientDataConsentListResponseSchema.parse(otherList.body).consents).toEqual([]);
    await expect(
      request("DELETE", `/me/consents/${consentId}`, {
        ...otherCsrf,
        origin: trustedOrigin,
        body: {}
      })
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      request("PUT", `/me/consents/${astrologerUserId}/chart-ai`, {
        ...otherCsrf,
        origin: trustedOrigin,
        body: {
          accepted: true,
          policyVersion: currentChartAiConsentPolicy.policyVersion,
          noticeSha256: chartAiConsentNoticeSha256ByLocale.ru,
          locale: "ru"
        }
      })
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      request("DELETE", `/me/consents/${consentId}`, {
        cookie: authCookie(owner),
        origin: trustedOrigin,
        body: {}
      })
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      request("DELETE", `/me/consents/${consentId}`, {
        ...ownerCsrf,
        origin: trustedOrigin,
        body: { unexpected: true }
      })
    ).resolves.toMatchObject({ status: 400 });

    const revoked = await request("DELETE", `/me/consents/${consentId}`, {
      ...ownerCsrf,
      origin: trustedOrigin,
      body: {}
    });
    expect(revoked.status).toBe(200);
    const parsedRevocation = revokeClientDataConsentResponseSchema.parse(revoked.body);
    const repeated = await request("DELETE", `/me/consents/${consentId}`, {
      ...ownerCsrf,
      origin: trustedOrigin,
      body: {}
    });
    expect(repeated.status).toBe(200);
    expect(revokeClientDataConsentResponseSchema.parse(repeated.body)).toEqual(parsedRevocation);
    const revokeAudits = await runtime.pool.query<{ count: string }>(
      "select count(*)::text as count from audit_log_entries where action = 'client.consent.revoked' and target_id = $1",
      [consentId]
    );
    expect(revokeAudits.rows).toEqual([{ count: "1" }]);

    const revokedHistory = await request("GET", "/me/consents?locale=en", {
      cookie: authCookie(owner)
    });
    const revokedList = clientDataConsentListResponseSchema.parse(revokedHistory.body);
    expect(revokedHistory.status).toBe(200);
    expect(revokedList.notice).toEqual(canonicalChartAiConsentNotices.en);
    expect(revokedList.consents).toEqual([
      expect.objectContaining({
        astrologerUserId,
        relationshipStatus: "archived",
        state: "revoked",
        consentId,
        revokedAt: parsedRevocation.revokedAt
      })
    ]);
  });

  async function createAuthenticatedClient(): Promise<AuthenticatedClient> {
    const userId = await createUser("client");
    const sessionToken = `consent-e2e-${randomUUID()}`;
    const now = new Date();
    const sessionExpiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    await runtime.pool.query(
      `insert into user_sessions
         (id, user_id, token_hash, status, created_at, expires_at, user_agent, ip_address)
       values ($1, $2, $3, 'active', $4, $5, 'client-consent-e2e', '127.0.0.1')`,
      [randomUUID(), userId, hashSessionToken(sessionToken), now, sessionExpiresAt]
    );
    return { userId, sessionToken, sessionExpiresAt };
  }

  async function createUser(role: "client" | "astrologer"): Promise<string> {
    const userId = randomUUID();
    createdUserIds.add(userId);
    await runtime.pool.query("insert into users (id, status) values ($1, 'active')", [userId]);
    await runtime.pool.query("insert into user_role_assignments (user_id, role) values ($1, $2)", [
      userId,
      role
    ]);
    if (role === "astrologer") {
      await runtime.pool.query(
        `insert into astrologer_profiles
           (owner_user_id, public_handle, public_name, timezone, locale, consultation_languages)
         values ($1, $2, 'Consent E2E Astrologer', 'UTC', 'en', '["en"]'::jsonb)`,
        [userId, publicHandle(userId)]
      );
    }
    return userId;
  }

  async function createRelationship(
    clientUserId: string,
    astrologerUserId: string,
    status: "active" | "archived"
  ): Promise<string> {
    const relationshipId = randomUUID();
    await runtime.pool.query(
      `insert into client_astrologer_relationships
         (id, client_user_id, astrologer_user_id, source, status, first_linked_at,
          last_linked_at, archived_at, created_at, updated_at)
       values ($1, $2, $3, 'direct_link', $4, now(), now(),
               case when $4 = 'archived' then now() else null end, now(), now())`,
      [relationshipId, clientUserId, astrologerUserId, status]
    );
    return relationshipId;
  }

  function csrfHeaders(client: AuthenticatedClient): {
    readonly cookie: string;
    readonly headers: Record<string, string>;
  } {
    let cookieToken: string | undefined;
    const token = csrfTokenService.setCsrfCookie({
      response: {
        cookie: (name, value) => {
          if (name === csrfCookieName) cookieToken = value;
        }
      },
      sessionToken: client.sessionToken,
      sessionExpiresAt: client.sessionExpiresAt
    });
    if (cookieToken !== token) throw new Error("CSRF service did not emit its signed cookie");
    return {
      cookie: `${authCookie(client)}; ${csrfCookieName}=${token}`,
      headers: { [csrfHeaderName]: token }
    };
  }

  function authCookie(client: AuthenticatedClient): string {
    return `${sessionCookieName}=${client.sessionToken}`;
  }

  async function request(
    method: "GET" | "PUT" | "DELETE",
    path: string,
    input: {
      readonly cookie?: string;
      readonly origin?: string;
      readonly headers?: Record<string, string>;
      readonly body?: unknown;
    } = {}
  ): Promise<HttpResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        ...(input.cookie ? { cookie: input.cookie } : {}),
        ...(input.origin ? { origin: input.origin } : {}),
        ...input.headers
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) })
    });
    const responseText = await response.text();
    return {
      status: response.status,
      body: responseText ? JSON.parse(responseText) : null
    };
  }
});

function publicHandle(userId: string): string {
  return `consent-${userId}`;
}

function requireIntegrationDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  return assertDevelopmentDatabaseUrl(value, process.env.NODE_ENV, "run integration tests against");
}
