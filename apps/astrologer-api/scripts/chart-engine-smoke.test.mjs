/* global Buffer, URL, process, setTimeout */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { createPostgresRuntime } from "@elevenhouse/db/runtime";
import { createClient as createRedisClient } from "redis";
import {
  collectSmokeResidue,
  createSmokeConfig,
  createSmokeRunContext,
  deleteOwnedStorageObjects,
  executeSmokeLifecycle,
  formatCliFailure,
  formatFailure,
  preserveSmokeFailure
} from "./chart-engine-smoke.mjs";

const localEnvironment = readLocalEnvironment();
const databaseUrl = requireLocalPostgresUrl(
  localEnvironment.INTEGRATION_DATABASE_URL ?? localEnvironment.DATABASE_URL
);
const storageEndpoint = requireLocalHttpUrl(
  localEnvironment.ASTROLOGER_MEDIA_STORAGE_ENDPOINT ?? "http://localhost:9000",
  "ASTROLOGER_MEDIA_STORAGE_ENDPOINT"
);
const config = createSmokeConfig({
  ...localEnvironment,
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl,
  CHART_SMOKE_EXPECTED_DATABASE_HOST: new URL(databaseUrl).hostname,
  CHART_SMOKE_EXPECTED_DATABASE_NAME: databaseName(databaseUrl),
  ASTROLOGER_MEDIA_STORAGE_ENDPOINT: storageEndpoint
});
const s3 = new S3Client({
  endpoint: config.objectStorage.endpoint,
  region: config.objectStorage.region,
  forcePathStyle: config.objectStorage.forcePathStyle,
  credentials: {
    accessKeyId: config.objectStorage.accessKeyId,
    secretAccessKey: config.objectStorage.secretAccessKey
  }
});

after(() => s3.destroy());

test("real PostgreSQL cleanup removes every exact chart-smoke resource and private object", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  const resourceIds = createResourceIds();
  const storageKey = `${context.astrologerUserId}/calculation_report_pdf/${resourceIds.pdfJobId}/report.pdf`;

  try {
    const result = await executeSmokeLifecycle({
      runtime,
      config,
      context,
      runScenario: async () => {
        await insertOwnedResourceGraph(runtime.pool, {
          context,
          resourceIds,
          storageKey,
          privateBucket: config.objectStorage.privateBucket
        });
        await s3.send(
          new PutObjectCommand({
            Bucket: config.objectStorage.privateBucket,
            Key: storageKey,
            Body: Buffer.from("chart smoke cleanup proof", "utf8"),
            ContentType: "application/pdf"
          })
        );
        return { status: "database-resource-graph-created" };
      }
    });

    assert.deepEqual(result, { status: "database-resource-graph-created" });
    assertAllResidueCountsZero(await collectSmokeResidue(runtime.pool, context));
    await assertObjectMissing(config.objectStorage.privateBucket, storageKey);
  } finally {
    await runtime.close();
  }
});

test("intermediate full-resource failure still removes database and object-storage residue", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  const resourceIds = createResourceIds();
  const storageKey = `${context.astrologerUserId}/calculation_report_pdf/${resourceIds.pdfJobId}/failure.pdf`;
  const injectedFailure = new Error("CHART_SMOKE_TEST_INTERMEDIATE_FAILURE");

  try {
    await assert.rejects(
      executeSmokeLifecycle({
        runtime,
        config,
        context,
        runScenario: async () => {
          await insertOwnedResourceGraph(runtime.pool, {
            context,
            resourceIds,
            storageKey,
            privateBucket: config.objectStorage.privateBucket
          });
          await s3.send(
            new PutObjectCommand({
              Bucket: config.objectStorage.privateBucket,
              Key: storageKey,
              Body: Buffer.from("chart smoke failure cleanup proof", "utf8"),
              ContentType: "application/pdf"
            })
          );
          throw injectedFailure;
        }
      }),
      (error) => error === injectedFailure
    );
    assertAllResidueCountsZero(await collectSmokeResidue(runtime.pool, context));
    await assertObjectMissing(config.objectStorage.privateBucket, storageKey);
  } finally {
    await runtime.close();
  }
});

test("explicit after_seed failure still removes real PostgreSQL seed data", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  let scenarioCalled = false;

  try {
    await assert.rejects(
      executeSmokeLifecycle({
        runtime,
        config,
        context,
        injectFailureStage: "after_seed",
        runScenario: async () => {
          scenarioCalled = true;
        }
      }),
      /CHART_SMOKE_INJECTED_FAILURE_AFTER_SEED/u
    );
    assert.equal(scenarioCalled, false);
    assert.ok(Number.isSafeInteger(config.databaseConnectTimeoutMs));
    assert.equal(runtime.pool.options.connectionTimeoutMillis, config.databaseConnectTimeoutMs);
    assert.equal(runtime.pool.options.statement_timeout, config.requestTimeoutMs);
    assert.equal(runtime.pool.options.query_timeout, config.requestTimeoutMs);
    assertAllResidueCountsZero(await collectSmokeResidue(runtime.pool, context));
  } finally {
    await runtime.close();
  }
});

test("failure after seed commit but before namespace verification still removes real seed data", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  let scenarioCalled = false;

  try {
    await assert.rejects(
      executeSmokeLifecycle({
        runtime,
        config,
        context,
        injectFailureStage: "after_seed_commit",
        runScenario: async () => {
          scenarioCalled = true;
        }
      }),
      /CHART_SMOKE_INJECTED_FAILURE_AFTER_SEED_COMMIT/u
    );
    assert.equal(scenarioCalled, false);
    assertAllResidueCountsZero(await collectSmokeResidue(runtime.pool, context));
  } finally {
    await runtime.close();
  }
});

test("seed UUID collision never deletes a pre-existing row it did not create", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  let scenarioCalled = false;
  await runtime.pool.query(
    `insert into users (id, status, created_at, updated_at) values ($1, 'active', $2, $2)`,
    [context.astrologerUserId, context.startedAt]
  );

  try {
    await assert.rejects(
      executeSmokeLifecycle({
        runtime,
        config,
        context,
        runScenario: async () => {
          scenarioCalled = true;
        }
      })
    );
    assert.equal(scenarioCalled, false);
    const collision = await runtime.pool.query(`select id, status from users where id = $1`, [
      context.astrologerUserId
    ]);
    assert.deepEqual(collision.rows, [{ id: context.astrologerUserId, status: "active" }]);
    const residue = await collectSmokeResidue(runtime.pool, context);
    assert.equal(residue.users, 1);
    assertAllResidueCountsZero({ ...residue, users: 0 });
  } finally {
    await runtime.pool.query(`delete from users where id = any($1::uuid[])`, [
      [context.astrologerUserId, context.clientUserId]
    ]);
    await runtime.close();
  }
});

test("cleanup removes only the exact retained BullMQ chart delivery and its event residue", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  const resourceIds = createResourceIds();
  const redis = createRedisClient({
    url: config.redisUrl,
    socket: { connectTimeout: config.requestTimeoutMs },
    disableOfflineQueue: true
  });
  redis.on("error", () => undefined);
  const queuePrefix = "bull:chart.calculation:";
  const deliveryId = `chart-calculation-${resourceIds.chartJobId}-delivery-0`;
  const unrelatedDeliveryId = `chart-calculation-${randomUUID()}-delivery-0`;
  const eventIds = [];

  try {
    await redis.connect();
    await redis.hSet(`${queuePrefix}${unrelatedDeliveryId}`, {
      name: "calculate-natal-chart",
      data: JSON.stringify({ jobId: randomUUID() })
    });
    await redis.zAdd(`${queuePrefix}completed`, {
      score: Date.now(),
      value: unrelatedDeliveryId
    });

    await executeSmokeLifecycle({
      runtime,
      config,
      context,
      runScenario: async () => {
        await insertOwnedResourceGraph(runtime.pool, {
          context,
          resourceIds,
          storageKey: `${context.astrologerUserId}/calculation_report_pdf/${resourceIds.pdfJobId}/redis-proof.pdf`,
          privateBucket: config.objectStorage.privateBucket
        });
        await redis.hSet(`${queuePrefix}${deliveryId}`, {
          name: "calculate-natal-chart",
          data: JSON.stringify({ jobId: resourceIds.chartJobId })
        });
        await redis.zAdd(`${queuePrefix}completed`, { score: Date.now(), value: deliveryId });
        eventIds.push(
          await redis.xAdd(`${queuePrefix}events`, "*", {
            event: "completed",
            jobId: deliveryId
          })
        );
        return { status: "retained-delivery-created" };
      }
    });

    assert.equal(await redis.exists(`${queuePrefix}${deliveryId}`), 0);
    assert.equal(await redis.zScore(`${queuePrefix}completed`, deliveryId), null);
    const events = await redis.xRange(`${queuePrefix}events`, "-", "+");
    assert.equal(
      events.some((event) => event.message.jobId === deliveryId),
      false
    );
    assert.equal(await redis.exists(`${queuePrefix}${unrelatedDeliveryId}`), 1);
    assert.notEqual(await redis.zScore(`${queuePrefix}completed`, unrelatedDeliveryId), null);
  } finally {
    if (redis.isOpen) {
      await redis.del([
        `${queuePrefix}${deliveryId}`,
        `${queuePrefix}${deliveryId}:logs`,
        `${queuePrefix}${deliveryId}:dependencies`,
        `${queuePrefix}${deliveryId}:processed`,
        `${queuePrefix}${deliveryId}:failed`,
        `${queuePrefix}${deliveryId}:unsuccessful`,
        `${queuePrefix}${unrelatedDeliveryId}`
      ]);
      await redis.zRem(`${queuePrefix}completed`, [deliveryId, unrelatedDeliveryId]);
      if (eventIds.length > 0) await redis.xDel(`${queuePrefix}events`, eventIds);
      redis.destroy();
    }
    await runtime.close();
  }
});

test("cleanup removes only the exact retained calculation-PDF BullMQ delivery", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  const resourceIds = createResourceIds();
  const redis = createRedisClient({
    url: config.redisUrl,
    socket: { connectTimeout: config.requestTimeoutMs },
    disableOfflineQueue: true
  });
  redis.on("error", () => undefined);
  const queuePrefix = "bull:calculation.pdf:";
  const deliveryId = `calculation-pdf-render-${resourceIds.pdfJobId}`;
  const unrelatedDeliveryId = `calculation-pdf-render-${randomUUID()}`;
  const eventIds = [];

  try {
    await redis.connect();
    await redis.hSet(`${queuePrefix}${unrelatedDeliveryId}`, {
      name: "render-calculation-pdf",
      data: JSON.stringify({ jobId: randomUUID() })
    });
    await redis.zAdd(`${queuePrefix}completed`, {
      score: Date.now(),
      value: unrelatedDeliveryId
    });

    await executeSmokeLifecycle({
      runtime,
      config,
      context,
      runScenario: async () => {
        await insertOwnedResourceGraph(runtime.pool, {
          context,
          resourceIds,
          storageKey: `${context.astrologerUserId}/calculation_report_pdf/${resourceIds.pdfJobId}/pdf-queue-proof.pdf`,
          privateBucket: config.objectStorage.privateBucket
        });
        await redis.hSet(`${queuePrefix}${deliveryId}`, {
          name: "render-calculation-pdf",
          data: JSON.stringify({ jobId: resourceIds.pdfJobId })
        });
        await redis.zAdd(`${queuePrefix}completed`, { score: Date.now(), value: deliveryId });
        eventIds.push(
          await redis.xAdd(`${queuePrefix}events`, "*", {
            event: "completed",
            jobId: deliveryId
          })
        );
      }
    });

    assert.equal(await redis.exists(`${queuePrefix}${deliveryId}`), 0);
    assert.equal(await redis.zScore(`${queuePrefix}completed`, deliveryId), null);
    const events = await redis.xRange(`${queuePrefix}events`, "-", "+");
    assert.equal(
      events.some((event) => event.message.jobId === deliveryId),
      false
    );
    assert.equal(await redis.exists(`${queuePrefix}${unrelatedDeliveryId}`), 1);
    assert.notEqual(await redis.zScore(`${queuePrefix}completed`, unrelatedDeliveryId), null);
  } finally {
    if (redis.isOpen) {
      await redis.del([`${queuePrefix}${deliveryId}`, `${queuePrefix}${unrelatedDeliveryId}`]);
      await redis.zRem(`${queuePrefix}completed`, [deliveryId, unrelatedDeliveryId]);
      if (eventIds.length > 0) await redis.xDel(`${queuePrefix}events`, eventIds);
      redis.destroy();
    }
    await runtime.close();
  }
});

test("cleanup fails closed without deleting an exact active or locked BullMQ delivery", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  const resourceIds = createResourceIds();
  const redis = createRedisClient({
    url: config.redisUrl,
    socket: { connectTimeout: config.requestTimeoutMs },
    disableOfflineQueue: true
  });
  redis.on("error", () => undefined);
  const queuePrefix = "bull:chart.calculation:";
  const deliveryId = `chart-calculation-${resourceIds.chartJobId}-delivery-0`;

  try {
    await redis.connect();
    await assert.rejects(
      executeSmokeLifecycle({
        runtime,
        config: { ...config, cleanupSettleTimeoutMs: 150 },
        context,
        runScenario: async () => {
          await insertOwnedResourceGraph(runtime.pool, {
            context,
            resourceIds,
            storageKey: `${context.astrologerUserId}/calculation_report_pdf/${resourceIds.pdfJobId}/active-proof.pdf`,
            privateBucket: config.objectStorage.privateBucket
          });
          await redis.hSet(`${queuePrefix}${deliveryId}`, {
            name: "calculate-natal-chart",
            data: JSON.stringify({ jobId: resourceIds.chartJobId })
          });
          await redis.rPush(`${queuePrefix}active`, deliveryId);
          await redis.set(`${queuePrefix}${deliveryId}:lock`, "smoke-active-lock");
        }
      }),
      (error) => {
        assert.deepEqual(formatFailure(error), {
          code: "CHART_SMOKE_QUEUE_CLEANUP_SETTLE_TIMEOUT"
        });
        return true;
      }
    );

    assert.equal(await redis.exists(`${queuePrefix}${deliveryId}`), 1);
    assert.notEqual(await redis.lPos(`${queuePrefix}active`, deliveryId), null);
    assert.equal(await redis.exists(`${queuePrefix}${deliveryId}:lock`), 1);
    assertAllResidueCountsZero(await collectSmokeResidue(runtime.pool, context));
  } finally {
    if (redis.isOpen) {
      await redis.lRem(`${queuePrefix}active`, 0, deliveryId);
      await redis.del([`${queuePrefix}${deliveryId}`, `${queuePrefix}${deliveryId}:lock`]);
      redis.destroy();
    }
    await runtime.close();
  }
});

test("calculation-PDF cleanup also fails closed on its exact active lock", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  const resourceIds = createResourceIds();
  const redis = createRedisClient({ url: config.redisUrl, disableOfflineQueue: true });
  redis.on("error", () => undefined);
  const queuePrefix = "bull:calculation.pdf:";
  const deliveryId = `calculation-pdf-render-${resourceIds.pdfJobId}`;

  try {
    await redis.connect();
    await assert.rejects(
      executeSmokeLifecycle({
        runtime,
        config: { ...config, cleanupSettleTimeoutMs: 150 },
        context,
        runScenario: async () => {
          await insertOwnedResourceGraph(runtime.pool, {
            context,
            resourceIds,
            storageKey: `${context.astrologerUserId}/calculation_report_pdf/${resourceIds.pdfJobId}/pdf-active.pdf`,
            privateBucket: config.objectStorage.privateBucket
          });
          await redis.hSet(`${queuePrefix}${deliveryId}`, {
            name: "render-calculation-pdf",
            data: JSON.stringify({ jobId: resourceIds.pdfJobId })
          });
          await redis.rPush(`${queuePrefix}active`, deliveryId);
          await redis.set(`${queuePrefix}${deliveryId}:lock`, "pdf-smoke-active-lock");
        }
      }),
      (error) => {
        assert.deepEqual(formatFailure(error), {
          code: "CHART_SMOKE_QUEUE_CLEANUP_SETTLE_TIMEOUT"
        });
        return true;
      }
    );
    assert.equal(await redis.exists(`${queuePrefix}${deliveryId}`), 1);
    assert.notEqual(await redis.lPos(`${queuePrefix}active`, deliveryId), null);
    assert.equal(await redis.exists(`${queuePrefix}${deliveryId}:lock`), 1);
    assertAllResidueCountsZero(await collectSmokeResidue(runtime.pool, context));
  } finally {
    if (redis.isOpen) {
      await redis.lRem(`${queuePrefix}active`, 0, deliveryId);
      await redis.del([`${queuePrefix}${deliveryId}`, `${queuePrefix}${deliveryId}:lock`]);
      redis.destroy();
    }
    await runtime.close();
  }
});

test("cleanup fences an owned publishing outbox relay before exact Redis deletion", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  const resourceIds = createResourceIds();
  const redis = createRedisClient({
    url: config.redisUrl,
    socket: { connectTimeout: config.requestTimeoutMs },
    disableOfflineQueue: true
  });
  redis.on("error", () => undefined);
  const queuePrefix = "bull:chart.calculation:";
  const deliveryId = `chart-calculation-${resourceIds.chartJobId}-delivery-0`;
  const eventIds = [];
  let publisher = Promise.resolve();

  try {
    await redis.connect();
    const result = await executeSmokeLifecycle({
      runtime,
      config: { ...config, cleanupSettleTimeoutMs: 2_000 },
      context,
      runScenario: async () => {
        await insertOwnedResourceGraph(runtime.pool, {
          context,
          resourceIds,
          storageKey: `${context.astrologerUserId}/calculation_report_pdf/${resourceIds.pdfJobId}/outbox-race.pdf`,
          privateBucket: config.objectStorage.privateBucket
        });
        await runtime.pool.query(
          `
            update outbox_events
            set status = 'publishing', locked_at = $2, updated_at = $2
            where id = $1
          `,
          [resourceIds.chartOutboxId, new Date()]
        );
        publisher = new Promise((resolvePublisher, rejectPublisher) => {
          setTimeout(() => {
            (async () => {
              await redis.hSet(`${queuePrefix}${deliveryId}`, {
                name: "calculate-natal-chart",
                data: JSON.stringify({ jobId: resourceIds.chartJobId })
              });
              await redis.zAdd(`${queuePrefix}completed`, {
                score: Date.now(),
                value: deliveryId
              });
              eventIds.push(
                await redis.xAdd(`${queuePrefix}events`, "*", {
                  event: "completed",
                  jobId: deliveryId
                })
              );
              await runtime.pool.query(
                `
                  update outbox_events
                  set status = 'published', locked_at = null, published_at = $2, updated_at = $2
                  where id = $1 and status = 'publishing'
                `,
                [resourceIds.chartOutboxId, new Date()]
              );
            })().then(resolvePublisher, rejectPublisher);
          }, 150);
        });
        return { status: "publishing-relay-scheduled" };
      }
    });
    await publisher;

    assert.deepEqual(result, { status: "publishing-relay-scheduled" });
    assert.equal(await redis.exists(`${queuePrefix}${deliveryId}`), 0);
    assert.equal(await redis.zScore(`${queuePrefix}completed`, deliveryId), null);
    const events = await redis.xRange(`${queuePrefix}events`, "-", "+");
    assert.equal(
      events.some((entry) => entry.message.jobId === deliveryId),
      false
    );
  } finally {
    await publisher.catch(() => undefined);
    if (redis.isOpen) {
      await redis.del(`${queuePrefix}${deliveryId}`);
      await redis.zRem(`${queuePrefix}completed`, deliveryId);
      if (eventIds.length > 0) await redis.xDel(`${queuePrefix}events`, eventIds);
      redis.destroy();
    }
    await runtime.close();
  }
});

test("cleanup fences a publishing calculation-PDF relay before exact Redis deletion", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  const resourceIds = createResourceIds();
  const redis = createRedisClient({ url: config.redisUrl, disableOfflineQueue: true });
  redis.on("error", () => undefined);
  const queuePrefix = "bull:calculation.pdf:";
  const deliveryId = `calculation-pdf-render-${resourceIds.pdfJobId}`;
  let publisher = Promise.resolve();

  try {
    await redis.connect();
    await executeSmokeLifecycle({
      runtime,
      config: { ...config, cleanupSettleTimeoutMs: 2_000 },
      context,
      runScenario: async () => {
        await insertOwnedResourceGraph(runtime.pool, {
          context,
          resourceIds,
          storageKey: `${context.astrologerUserId}/calculation_report_pdf/${resourceIds.pdfJobId}/pdf-outbox-race.pdf`,
          privateBucket: config.objectStorage.privateBucket
        });
        await runtime.pool.query(
          `
            update outbox_events
            set status = 'publishing', locked_at = $2, updated_at = $2
            where id = $1
          `,
          [resourceIds.pdfOutboxId, new Date()]
        );
        publisher = new Promise((resolvePublisher, rejectPublisher) => {
          setTimeout(() => {
            (async () => {
              await redis.hSet(`${queuePrefix}${deliveryId}`, {
                name: "render-calculation-pdf",
                data: JSON.stringify({ jobId: resourceIds.pdfJobId })
              });
              await redis.zAdd(`${queuePrefix}completed`, {
                score: Date.now(),
                value: deliveryId
              });
              await runtime.pool.query(
                `
                  update outbox_events
                  set status = 'published', locked_at = null, published_at = $2, updated_at = $2
                  where id = $1 and status = 'publishing'
                `,
                [resourceIds.pdfOutboxId, new Date()]
              );
            })().then(resolvePublisher, rejectPublisher);
          }, 150);
        });
      }
    });
    await publisher;
    assert.equal(await redis.exists(`${queuePrefix}${deliveryId}`), 0);
    assert.equal(await redis.zScore(`${queuePrefix}completed`, deliveryId), null);
  } finally {
    await publisher.catch(() => undefined);
    if (redis.isOpen) {
      await redis.del(`${queuePrefix}${deliveryId}`);
      await redis.zRem(`${queuePrefix}completed`, deliveryId);
      redis.destroy();
    }
    await runtime.close();
  }
});

test("cleanup waits for an in-flight exact chart job before removing the namespace", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  const chartJobId = randomUUID();
  let terminalTransition = Promise.resolve();

  try {
    const result = await executeSmokeLifecycle({
      runtime,
      config: { ...config, cleanupSettleTimeoutMs: 2_000 },
      context,
      runScenario: async () => {
        await insertProcessingChartJob(runtime.pool, context, chartJobId);
        terminalTransition = new Promise((resolveTransition, rejectTransition) => {
          setTimeout(() => {
            runtime.pool
              .query(
                `
                  update chart_calculation_jobs
                  set status = 'failed', locked_by = null, locked_until = null,
                      finished_at = $2, last_error_code = 'SMOKE_INJECTED_FAILURE',
                      last_error_message = 'Smoke job terminal transition', updated_at = $2
                  where id = $1 and status = 'processing'
                `,
                [chartJobId, new Date()]
              )
              .then(resolveTransition, rejectTransition);
          }, 150);
        });
        return { status: "processing-job-inserted" };
      }
    });

    assert.deepEqual(result, { status: "processing-job-inserted" });
    await terminalTransition;
    assertAllResidueCountsZero(await collectSmokeResidue(runtime.pool, context));
  } finally {
    await terminalTransition;
    await recoverExactProcessingFixture(runtime.pool, context, chartJobId);
    await runtime.close();
  }
});

test("cleanup settle timeout remains bounded while the exact job row is locked", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  const chartJobId = randomUUID();
  let lockClient;
  let execution;

  try {
    const startedAt = Date.now();
    execution = executeSmokeLifecycle({
      runtime,
      config: { ...config, cleanupSettleTimeoutMs: 150 },
      context,
      runScenario: async () => {
        await insertProcessingChartJob(runtime.pool, context, chartJobId);
        lockClient = await runtime.pool.connect();
        await lockClient.query("begin");
        await lockClient.query(`select id from chart_calculation_jobs where id = $1 for update`, [
          chartJobId
        ]);
        return { status: "locked-processing-job-inserted" };
      }
    });
    const observed = await Promise.race([
      execution.then(
        (value) => ({ status: "resolved", value }),
        (error) => ({ status: "rejected", error })
      ),
      new Promise((resolveTimeout) =>
        setTimeout(() => resolveTimeout({ status: "unbounded" }), 750)
      )
    ]);

    assert.notEqual(observed.status, "unbounded");
    assert.equal(observed.status, "rejected");
    assert.deepEqual(formatFailure(observed.error), {
      code: "CHART_SMOKE_CLEANUP_SETTLE_TIMEOUT"
    });
    assert.ok(Date.now() - startedAt < 750, "Cleanup row-lock wait exceeded its bound");
  } finally {
    if (lockClient) {
      await lockClient.query("rollback");
      lockClient.release();
    }
    await execution?.catch(() => undefined);
    await recoverExactProcessingFixture(runtime.pool, context, chartJobId);
    await runtime.close();
  }
});

test("validated database connection timeout bounds exhausted-pool acquisition", async () => {
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  const context = createSmokeRunContext({ config, now: new Date() });
  const heldClients = [];
  let execution;

  try {
    for (let index = 0; index < runtime.pool.options.max; index += 1) {
      heldClients.push(await runtime.pool.connect());
    }
    const startedAt = Date.now();
    execution = executeSmokeLifecycle({
      runtime,
      config: { ...config, databaseConnectTimeoutMs: 100 },
      context,
      runScenario: async () => ({ status: "must-not-run" })
    });
    const observed = await Promise.race([
      execution.then(
        (value) => ({ status: "resolved", value }),
        (error) => ({ status: "rejected", error })
      ),
      new Promise((resolveTimeout) =>
        setTimeout(() => resolveTimeout({ status: "unbounded" }), 750)
      )
    ]);

    assert.equal(observed.status, "rejected");
    assert.deepEqual(formatFailure(observed.error), {
      code: "CHART_SMOKE_INTERNAL_FAILURE"
    });
    assert.ok(Date.now() - startedAt < 750, "PostgreSQL pool acquisition exceeded its bound");
  } finally {
    for (const client of heldClients) client.release();
    await execution?.catch(() => undefined);
    await runtime.close();
  }
});

test("cleanup failure preserves the original smoke failure as the cause", () => {
  const original = new Error("original chart smoke failure");
  const cleanup = new Error("cleanup failure");
  const combined = preserveSmokeFailure(original, cleanup);

  assert.ok(combined instanceof AggregateError);
  assert.equal(combined.cause, original);
  assert.deepEqual(combined.errors, [original, cleanup]);
  assert.match(combined.message, /cleanup also failed/u);
});

test("production config refuses implicit storage and Redis safety boundaries", () => {
  const productionEnvironment = {
    NODE_ENV: "production",
    DATABASE_URL: config.databaseUrl,
    CHART_SMOKE_EXPECTED_DATABASE_HOST: config.expectedDatabaseHost,
    CHART_SMOKE_EXPECTED_DATABASE_NAME: config.expectedDatabaseName,
    CHART_SMOKE_ALLOW_PRODUCTION: "true",
    ASTROLOGER_API_CSRF_SECRET: "chart-smoke-production-test-secret",
    ASTROLOGER_MEDIA_STORAGE_ENDPOINT: config.objectStorage.endpoint,
    ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET: config.objectStorage.privateBucket,
    ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID: config.objectStorage.accessKeyId,
    ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY: config.objectStorage.secretAccessKey,
    REDIS_URL: config.redisUrl
  };

  for (const name of [
    "ASTROLOGER_MEDIA_STORAGE_ENDPOINT",
    "ASTROLOGER_MEDIA_PRIVATE_STORAGE_BUCKET",
    "ASTROLOGER_MEDIA_STORAGE_ACCESS_KEY_ID",
    "ASTROLOGER_MEDIA_STORAGE_SECRET_ACCESS_KEY",
    "REDIS_URL"
  ]) {
    const incomplete = { ...productionEnvironment };
    delete incomplete[name];
    assert.throws(() => createSmokeConfig(incomplete), new RegExp(name, "u"));
  }

  assert.equal(
    createSmokeConfig(productionEnvironment).objectStorage.privateBucket,
    config.objectStorage.privateBucket
  );
});

test("failure formatter emits only safe codes and omits sensitive chart payload sentinels", async () => {
  const sentinels = [
    "SENTINEL_HORARY_QUESTION",
    "SENTINEL_BIRTH_DATE_1991_02_03",
    "SENTINEL_LATITUDE_55_7558",
    "SENTINEL_LONGITUDE_37_6173"
  ];
  const failure = new Error(
    JSON.stringify({
      body: sentinels,
      question: sentinels[0],
      birthDate: sentinels[1],
      coordinates: sentinels.slice(2)
    })
  );
  failure.code = `PROVIDER_${sentinels[0]}`;
  failure.httpStatus = 422;

  const formatted = formatFailure(failure);
  const stderr = formatCliFailure(failure);

  assert.deepEqual(formatted, { code: "CHART_SMOKE_INTERNAL_FAILURE" });
  for (const sentinel of sentinels) {
    assert.doesNotMatch(stderr, new RegExp(sentinel, "u"));
  }
});

test("real object-storage cleanup is bounded by the configured abort timeout", async () => {
  const context = createSmokeRunContext({ config, now: new Date() });
  const storageKey = `${context.astrologerUserId}/calculation_report_pdf/${randomUUID()}/timeout.pdf`;
  await s3.send(
    new PutObjectCommand({
      Bucket: config.objectStorage.privateBucket,
      Key: storageKey,
      Body: Buffer.from("chart smoke timeout proof", "utf8"),
      ContentType: "application/pdf"
    })
  );

  const startedAt = Date.now();
  try {
    await assert.rejects(
      deleteOwnedStorageObjects({ ...config, requestTimeoutMs: 1 }, context, [
        {
          purpose: "calculation_report_pdf",
          storageBucket: config.objectStorage.privateBucket,
          storageKey
        }
      ]),
      (error) => error?.name === "TimeoutError" || error?.name === "AbortError"
    );
    assert.ok(Date.now() - startedAt < 1_000, "Object-storage cleanup exceeded its bound");
  } finally {
    await s3.send(
      new DeleteObjectCommand({ Bucket: config.objectStorage.privateBucket, Key: storageKey })
    );
    await assertObjectMissing(config.objectStorage.privateBucket, storageKey);
  }
});

test("CLI exits nonzero, reports both failures, and leaves zero residue when cleanup fails", async () => {
  const execution = await runSmokeCli({
    ...localEnvironment,
    NODE_ENV: "test",
    DATABASE_URL: config.databaseUrl,
    CHART_SMOKE_EXPECTED_DATABASE_HOST: config.expectedDatabaseHost,
    CHART_SMOKE_EXPECTED_DATABASE_NAME: config.expectedDatabaseName,
    CHART_SMOKE_INJECT_FAILURE_STAGE: "after_seed",
    CHART_SMOKE_INJECT_CLEANUP_FAILURE: "after_zero_residue",
    ASTROLOGER_MEDIA_STORAGE_ENDPOINT: config.objectStorage.endpoint
  });

  assert.notEqual(execution.exitCode, 0);
  assert.match(execution.stderr, /CHART_SMOKE_INJECTED_FAILURE_AFTER_SEED/u);
  assert.match(execution.stderr, /CHART_SMOKE_INJECTED_CLEANUP_FAILURE_AFTER_ZERO_RESIDUE/u);
  const started = JSON.parse(execution.stdout.trim().split(/\r?\n/u)[0]);
  const runtime = createPostgresRuntime({ DATABASE_URL: config.databaseUrl });
  try {
    assertAllResidueCountsZero(
      await collectSmokeResidue(runtime.pool, {
        namespace: started.namespace,
        runId: started.namespace.replace(/^eh-chart-smoke:/u, ""),
        astrologerUserId: started.astrologerUserId,
        clientUserId: started.clientUserId,
        relationshipId: randomUUID(),
        ownedResourceIds: new Set([started.astrologerUserId, started.clientUserId])
      })
    );
  } finally {
    await runtime.close();
  }
});

async function insertOwnedResourceGraph(pool, input) {
  const { context, resourceIds } = input;
  const now = context.startedAt;
  const resultChecksum = digest("2");
  const executionProfile = {
    provider: "kerykeion",
    kerykeionVersion: "5.12.9",
    pyswissephVersion: "2.10.3.2",
    expectedEphemeris: "moshier",
    expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
    expectedEphemerisDataRevision: null
  };

  const client = await pool.connect();
  await client.query("begin");
  try {
    await client.query(
      `
        insert into calculation_records (
          id, owner_user_id, module, mode, interpretation_mode, method_code, title,
          status, request_fingerprint, input_data, result_data, result_summary,
          result_checksum, created_at, updated_at
        ) values ($1, $2, 'chart', 'individual', 'adult_natal', 'natal', $3,
                  'calculated', $4, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
                  $5, $6, $6)
      `,
      [
        resourceIds.calculationId,
        context.astrologerUserId,
        `${context.namespace}:calculation`,
        digest("1"),
        resultChecksum,
        now
      ]
    );
    await client.query(
      `
        insert into calculation_participants (
          id, calculation_id, role, source, client_id, display_name, "order", created_at, updated_at
        ) values ($1, $2, 'subject', 'crm_client', $3, $4, 0, $5, $5)
      `,
      [
        resourceIds.participantId,
        resourceIds.calculationId,
        context.clientUserId,
        `${context.namespace}:client`,
        now
      ]
    );
    await client.query(
      `
        insert into calculation_interpretations (
          id, calculation_id, source, status, text, created_at, updated_at
        ) values ($1, $2, 'manual', 'draft', $3, $4, $4)
      `,
      [
        resourceIds.interpretationId,
        resourceIds.calculationId,
        `${context.namespace}:interpretation`,
        now
      ]
    );
    await client.query(
      `
        insert into calculation_client_links (
          id, calculation_id, client_id, visibility, linked_at, created_at, updated_at
        ) values ($1, $2, $3, 'private_to_astrologer', $4, $4, $4)
      `,
      [resourceIds.clientLinkId, resourceIds.calculationId, context.clientUserId, now]
    );
    await client.query(
      `
        insert into chart_calculation_jobs (
          id, owner_user_id, client_id, result_calculation_id, method,
          interpretation_mode, method_version, status, input_fingerprint,
          input_snapshot, settings_snapshot, participant_snapshot, provider,
          schema_version, execution_profile, attempts, max_attempts, lease_generation,
          result_checksum, result_reproducibility_fingerprint, started_at, finished_at,
          created_at, updated_at
        ) values (
          $1, $2, $3, $4, 'natal', 'adult_natal',
          'chart.natal.kerykeion-5.12.v2', 'succeeded', $5,
          '{}'::jsonb, '{}'::jsonb, $6::jsonb, 'kerykeion',
          'chart-result.v2', $7::jsonb, 1, 3, 1, $8, $9, $10, $10, $10, $10
        )
      `,
      [
        resourceIds.chartJobId,
        context.astrologerUserId,
        context.clientUserId,
        resourceIds.calculationId,
        digest("4"),
        JSON.stringify([{ role: "subject", clientId: context.clientUserId }]),
        JSON.stringify(executionProfile),
        resultChecksum,
        digest("5"),
        now
      ]
    );
    await client.query(
      `
        insert into ai_usage_records (
          id, status, feature, prompt_id, prompt_version, provider, owner_safety_id,
          resource_type, resource_id, source_checksum,
          model, finish_reason, duration_ms, started_at, completed_at
        ) values ($1, 'started', 'chart_interpretation', 'chart-interpretation-draft', 1,
                  'openai', $2, 'chart_calculation', $3, $4, null, null, null, $5, null)
      `,
      [
        resourceIds.aiUsageId,
        `eh_${"a".repeat(61)}`,
        resourceIds.calculationId,
        resultChecksum,
        now
      ]
    );
    await client.query(
      `
        update ai_usage_records
        set status = 'succeeded', model = 'gpt-test', finish_reason = 'stop',
            duration_ms = 1, completed_at = $2
        where id = $1
      `,
      [resourceIds.aiUsageId, now]
    );
    await client.query(
      `
        insert into media_assets (
          id, owner_user_id, purpose, status, visibility, storage_bucket, storage_key,
          original_file_name, mime_type, size_bytes, created_at, updated_at
        ) values ($1, $2, 'calculation_report_pdf', 'processing', 'private', $3, $4,
                  'chart-smoke.pdf', 'application/pdf', 0, $5, $5)
      `,
      [
        resourceIds.mediaAssetId,
        context.astrologerUserId,
        input.privateBucket,
        input.storageKey,
        now
      ]
    );
    await client.query(
      `
        insert into calculation_artifacts (
          id, calculation_id, media_asset_id, artifact_type, status, created_at, updated_at
        ) values ($1, $2, $3, 'pdf', 'generating', $4, $4)
      `,
      [resourceIds.artifactId, resourceIds.calculationId, resourceIds.mediaAssetId, now]
    );
    await client.query(
      `
        insert into calculation_pdf_jobs (
          id, calculation_id, owner_user_id, module, method_code, result_checksum,
          locale, source_locator, document_fingerprint, status, artifact_id,
          media_asset_id, created_at, updated_at
        ) values ($1, $2, $3, 'chart', 'natal', $4, 'ru', '{}'::jsonb, $5,
                  'queued', $6, $7, $8, $8)
      `,
      [
        resourceIds.pdfJobId,
        resourceIds.calculationId,
        context.astrologerUserId,
        resultChecksum,
        digest("6"),
        resourceIds.artifactId,
        resourceIds.mediaAssetId,
        now
      ]
    );
    await client.query(
      `
        insert into outbox_events (
          id, event_type, aggregate_id, payload, status, attempts, available_at,
          created_at, updated_at
        ) values
          ($1, 'chart.calculation.requested.v1', $2, jsonb_build_object('jobId', $2::uuid),
           'pending', 0, $3, $3, $3),
          ($4, 'calculation.pdf.requested.v1', $5, jsonb_build_object('jobId', $5::uuid),
           'pending', 0, $3, $3, $3)
      `,
      [
        resourceIds.chartOutboxId,
        resourceIds.chartJobId,
        now,
        resourceIds.pdfOutboxId,
        resourceIds.pdfJobId
      ]
    );
    await client.query(
      `
        insert into audit_log_entries (
          id, actor_user_id, action, target_type, target_id, occurred_at, metadata
        ) values ($1, $2, 'chart_smoke.test', 'calculation', $3, $4,
                  jsonb_build_object('namespace', $5::text))
      `,
      [
        resourceIds.auditId,
        context.astrologerUserId,
        resourceIds.calculationId,
        now,
        context.namespace
      ]
    );
    await client.query(
      `
        insert into idempotency_commands (
          id, api_surface, actor_user_id, command_scope, key, request_hash, state,
          result, expires_at, created_at, updated_at
        ) values ($1, 'astrologer-api', $2, 'chart.ai-draft', $3, $4, 'completed',
                  '{}'::jsonb, $5::timestamptz + interval '1 day', $5, $5)
      `,
      [
        resourceIds.idempotencyCommandId,
        context.astrologerUserId,
        `${context.namespace}:idempotency`,
        digest("7"),
        now
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function insertProcessingChartJob(pool, context, chartJobId) {
  const executionProfile = {
    provider: "kerykeion",
    kerykeionVersion: "5.12.9",
    pyswissephVersion: "2.10.3.2",
    expectedEphemeris: "moshier",
    expectedEphemerisFlags: ["FLG_MOSEPH", "FLG_SPEED"],
    expectedEphemerisDataRevision: null
  };
  await pool.query(
    `
      insert into chart_calculation_jobs (
        id, owner_user_id, client_id, method, interpretation_mode, method_version,
        status, input_fingerprint, input_snapshot, settings_snapshot,
        participant_snapshot, provider, schema_version, execution_profile, attempts,
        max_attempts, locked_by, locked_until, lease_generation, started_at,
        created_at, updated_at
      ) values (
        $1, $2, $3, 'natal', 'adult_natal', 'chart.natal.kerykeion-5.12.v2',
        'processing', $4, '{}'::jsonb, '{}'::jsonb, $5::jsonb, 'kerykeion',
        'chart-result.v2', $6::jsonb, 1, 3, 'chart-smoke-worker',
        $7::timestamptz + interval '1 minute', 1, $7, $7, $7
      )
    `,
    [
      chartJobId,
      context.astrologerUserId,
      context.clientUserId,
      digest("8"),
      JSON.stringify([{ role: "subject", clientId: context.clientUserId }]),
      JSON.stringify(executionProfile),
      context.startedAt
    ]
  );
}

async function recoverExactProcessingFixture(pool, context, chartJobId) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from outbox_events where aggregate_id = $1`, [chartJobId]);
    await client.query(
      `
        delete from chart_calculation_jobs
        where id = $1 and owner_user_id = $2 and client_id = $3
      `,
      [chartJobId, context.astrologerUserId, context.clientUserId]
    );
    await client.query(`delete from users where id = any($1::uuid[])`, [
      [context.astrologerUserId, context.clientUserId]
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function createResourceIds() {
  return {
    calculationId: randomUUID(),
    participantId: randomUUID(),
    interpretationId: randomUUID(),
    clientLinkId: randomUUID(),
    chartJobId: randomUUID(),
    aiUsageId: randomUUID(),
    mediaAssetId: randomUUID(),
    artifactId: randomUUID(),
    pdfJobId: randomUUID(),
    chartOutboxId: randomUUID(),
    pdfOutboxId: randomUUID(),
    auditId: randomUUID(),
    idempotencyCommandId: randomUUID()
  };
}

function assertAllResidueCountsZero(residue) {
  assert.ok(Object.keys(residue).length > 0);
  assert.deepEqual(
    Object.fromEntries(Object.entries(residue).filter(([, count]) => count !== 0)),
    {}
  );
}

async function assertObjectMissing(bucket, storageKey) {
  await assert.rejects(
    s3.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey })),
    (error) => error?.$metadata?.httpStatusCode === 404
  );
}

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}

function readLocalEnvironment() {
  const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
  const parsed = Object.fromEntries(
    readFileSync(envFile, "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const name = line.slice(0, separator).trim();
        const rawValue = line.slice(separator + 1).trim();
        return [name, rawValue.replace(/^(['"])(.*)\1$/u, "$2")];
      })
  );
  return { ...parsed, ...process.env };
}

function requireLocalPostgresUrl(value) {
  assert.ok(value, "A local DATABASE_URL is required for chart smoke cleanup integration tests");
  const url = new URL(value);
  assert.equal(url.protocol, "postgresql:");
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname),
    "Chart smoke cleanup tests refuse non-local PostgreSQL"
  );
  assert.equal(databaseName(value), "elevenhouse");
  return value;
}

function requireLocalHttpUrl(value, name) {
  const url = new URL(value);
  assert.ok(
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname),
    `${name} must be local in chart smoke cleanup tests`
  );
  return url.toString().replace(/\/$/u, "");
}

function databaseName(value) {
  return decodeURIComponent(new URL(value).pathname.replace(/^\//u, ""));
}

function runSmokeCli(environment) {
  return new Promise((resolveExecution, rejectExecution) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("./chart-engine-smoke.mjs", import.meta.url))],
      {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        env: environment,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", rejectExecution);
    child.once("close", (exitCode, signal) => {
      resolveExecution({ exitCode, signal, stdout, stderr });
    });
  });
}
