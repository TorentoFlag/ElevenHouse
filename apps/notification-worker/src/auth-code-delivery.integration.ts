import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { requestPasswordlessCode } from "@elevenhouse/domain";
import { createDrizzlePasswordlessAuthUnitOfWork } from "@elevenhouse/db/passwordless-auth";
import { createDrizzleOutboxRelayStore } from "@elevenhouse/db/outbox";
import { createDrizzleAuthCodeDeliveryProcessingStore } from "@elevenhouse/db/notifications";
import { assertDevelopmentDatabaseUrl } from "@elevenhouse/db/connection";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ChannelAuthCodeDeliveryProvider,
  EmailAuthCodeDeliveryProvider,
  SmsAuthCodeDeliveryProvider
} from "./auth-code-delivery.provider";
import {
  authCodeDeliveryQueueName,
  createAuthCodeDeliveryQueue,
  createAuthCodeDeliveryWorker,
  type AuthCodeDeliveryWorker
} from "./auth-code-delivery.queue";
import { processAuthCodeDeliveryJob } from "./auth-code-delivery.processor";
import { relayPendingOutboxEvents } from "./outbox-relay";

const databaseUrl = getIntegrationDatabaseUrl(process.env.INTEGRATION_DATABASE_URL);
const redisUrl = getIntegrationRedisUrl(process.env.INTEGRATION_REDIS_URL);
const integrationQueueName = `${authCodeDeliveryQueueName}.integration.${process.pid}`;

describe("auth code delivery outbox and BullMQ integration", () => {
  const runtime = createPostgresRuntime({
    DATABASE_URL: databaseUrl
  });
  const queue = createAuthCodeDeliveryQueue(redisUrl, integrationQueueName);
  const httpRequests: unknown[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    httpRequests.push(await readJsonBody(request));
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify({ messageId: "email-message-1" }));
  });

  let createdChallengeId: string | undefined;
  let worker: AuthCodeDeliveryWorker | undefined;
  const workerEvents: string[] = [];

  beforeAll(async () => {
    await runtime.pool.query("select 1");
    const existingRows = await runtime.pool.query<{ count: string }>(
      "select count(*) from outbox_events"
    );
    if (existingRows.rows[0]?.count !== "0") {
      throw new Error("auth code delivery integration test requires a clean outbox_events table");
    }
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    await queue.waitUntilReady();
    await queue.obliterate({ force: true });
    worker = createAuthCodeDeliveryWorker(
      redisUrl,
      (job) =>
        processAuthCodeDeliveryJob({
          job,
          store: createDrizzleAuthCodeDeliveryProcessingStore(runtime.database),
          delivery: new ChannelAuthCodeDeliveryProvider(
            new EmailAuthCodeDeliveryProvider({
              endpointUrl: httpEndpoint("/email"),
              bearerToken: "email-token",
              from: "auth@elevenhouse.test"
            }),
            new SmsAuthCodeDeliveryProvider({
              endpointUrl: httpEndpoint("/sms"),
              bearerToken: "sms-token",
              from: "ElevenHouse"
            })
          ),
          now: new Date()
        }),
      integrationQueueName
    );
    worker.on("completed", (job) => {
      workerEvents.push(`completed:${job.id}`);
    });
    worker.on("failed", (job, error) => {
      workerEvents.push(`failed:${job?.id}:${error.message}`);
    });
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    try {
      await queue.obliterate({ force: true });
      if (createdChallengeId) {
        await runtime.pool.query("delete from outbox_events where payload->>'challengeId' = $1", [
          createdChallengeId
        ]);
        await runtime.pool.query("delete from auth_challenges where id = $1", [createdChallengeId]);
      }
    } finally {
      await worker?.close();
      await queue.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await runtime.close();
    }
  });

  it("publishes passwordless auth delivery outbox events to BullMQ and sends through the worker", async () => {
    const requestedAt = new Date();
    const expectedExpiresAt = new Date(requestedAt.getTime() + 600_000).toISOString();
    const response = await createDrizzlePasswordlessAuthUnitOfWork(runtime.database).transact(
      (store) =>
        requestPasswordlessCode({
          store,
          channel: "email",
          identifier: "queue-integration@example.com",
          roles: ["client"],
          code: "123456",
          codeSecret: "test-secret",
          now: requestedAt,
          ttlSeconds: 600,
          resendCooldownSeconds: 60,
          maxAttempts: 5
        })
    );
    createdChallengeId = response.challengeId;

    const queuedDelivery = await runtime.pool.query<{
      id: string;
      status: string;
    }>("select id, status from auth_challenge_deliveries where challenge_id = $1", [
      response.challengeId
    ]);
    expect(queuedDelivery.rows).toEqual([
      {
        id: expect.any(String),
        status: "queued"
      }
    ]);

    await expect(
      relayPendingOutboxEvents({
        store: createDrizzleOutboxRelayStore(runtime.database),
        queue,
        now: new Date(),
        batchSize: 10,
        publishingLockTimeoutMs: 60_000,
        queueOptions: {
          attempts: 3,
          backoffMs: 100
        }
      })
    ).resolves.toBe(1);

    await waitFor(async () => {
      const delivered = await runtime.pool.query<{
        provider: string | null;
        status: string;
        provider_message_id: string | null;
      }>(
        `select provider, status, provider_message_id
         from auth_challenge_deliveries
         where challenge_id = $1`,
        [response.challengeId]
      );

      expect(delivered.rows).toEqual([
        {
          provider: "email",
          status: "sent",
          provider_message_id: "email-message-1"
        }
      ]);
    }, 5000, async () => ({
      workerEvents,
      counts: await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
      outbox: (
        await runtime.pool.query(
          "select event_type, status, attempts, last_error from outbox_events"
        )
      ).rows
    }));

    expect(httpRequests).toEqual([
      expect.objectContaining({
        kind: "passwordless_auth_code",
        channel: "email",
        challengeId: response.challengeId,
        deliveryId: queuedDelivery.rows[0]?.id,
        outboxEventId: expect.any(String),
        to: "queue-integration@example.com",
        from: "auth@elevenhouse.test",
        code: "123456",
        expiresAt: expectedExpiresAt
      })
    ]);
    await waitFor(async () => {
      const redactedOutbox = await runtime.pool.query<{ payload: Record<string, unknown> }>(
        "select payload from outbox_events where payload->>'challengeId' = $1",
        [response.challengeId]
      );
      expect(redactedOutbox.rows[0]?.payload).toMatchObject({
        challengeId: response.challengeId,
        deliveryId: queuedDelivery.rows[0]?.id,
        codeRedactedAt: expect.any(String)
      });
      expect(redactedOutbox.rows[0]?.payload).not.toHaveProperty("code");
    });
  });

  function httpEndpoint(path: string): string {
    const address = server.address() as AddressInfo | null;

    return `http://127.0.0.1:${address?.port ?? 0}${path}`;
  }
});

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function waitFor(
  assertion: () => Promise<void>,
  timeoutMs = 5000,
  describeFailure: () => Promise<unknown> = async () => ({})
): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw new Error(`${String(lastError)}\n${JSON.stringify(await describeFailure())}`);
}

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

function getIntegrationRedisUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("INTEGRATION_REDIS_URL is required for integration tests");
  }

  return value;
}
