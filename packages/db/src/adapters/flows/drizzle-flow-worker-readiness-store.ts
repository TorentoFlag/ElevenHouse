import { isDeepStrictEqual } from "node:util";

import {
  FlowRuntimeControlIntegrityError,
  FlowWorkerReadinessLeaseLostError,
  FlowWorkerReadinessSessionBusyError,
  FlowWorkerRuntimeModeCeilingError,
  createFlowWorkerRegistration,
  createFlowWorkerRegistrationDigest,
  parseFlowWorkerReadinessAuthority,
  type FlowWorkerReadinessAuthority,
  type FlowWorkerReadinessStore,
  type FlowWorkerRegistration
} from "@elevenhouse/domain";
import { and, eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowWorkerReadinessLeases,
  flowWorkerRegistrations,
  flowWorkerRegistrationTombstones
} from "../../schema/flows";

type FlowTransaction = Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0];
type ReadinessExecutor = Pick<ElevenHouseDatabase, "select"> | FlowTransaction;

export function createDrizzleFlowWorkerReadinessStore(
  database: ElevenHouseDatabase
): FlowWorkerReadinessStore {
  return Object.freeze({
    register: async (input) => {
      const registration = createFlowWorkerRegistration(input);
      try {
        return await database.transaction((transaction) =>
          registerInTransaction(transaction, registration)
        );
      } catch (error) {
        throw mapPersistenceError(error);
      }
    },
    heartbeat: async (identity) => {
      try {
        const [row] = await database
          .update(flowWorkerReadinessLeases)
          .set({ state: "ready" })
          .where(
            and(
              eq(flowWorkerReadinessLeases.instanceId, identity.instanceId),
              eq(flowWorkerReadinessLeases.sessionId, identity.sessionId)
            )
          )
          .returning();
        if (!row) throw new FlowWorkerReadinessLeaseLostError();
        return mapReadiness(row);
      } catch (error) {
        throw mapPersistenceError(error);
      }
    },
    beginDrain: async (identity) => {
      try {
        return await database.transaction(async (transaction) => {
          const [current] = await transaction
            .select()
            .from(flowWorkerReadinessLeases)
            .where(
              and(
                eq(flowWorkerReadinessLeases.instanceId, identity.instanceId),
                eq(flowWorkerReadinessLeases.sessionId, identity.sessionId)
              )
            )
            .limit(1)
            .for("update");
          if (!current) throw new FlowWorkerReadinessLeaseLostError();
          if (current.state === "draining") {
            await retireRegistration(transaction, identity.sessionId, "explicit_drain");
            return mapReadiness(current);
          }

          const [drained] = await transaction
            .update(flowWorkerReadinessLeases)
            .set({ state: "draining" })
            .where(
              and(
                eq(flowWorkerReadinessLeases.instanceId, identity.instanceId),
                eq(flowWorkerReadinessLeases.sessionId, identity.sessionId)
              )
            )
            .returning();
          if (!drained) throw new FlowWorkerReadinessLeaseLostError();
          await retireRegistration(transaction, identity.sessionId, "explicit_drain");
          return mapReadiness(drained);
        });
      } catch (error) {
        throw mapPersistenceError(error);
      }
    }
  });
}

async function registerInTransaction(
  transaction: FlowTransaction,
  registration: FlowWorkerRegistration
): Promise<FlowWorkerReadinessAuthority> {
  const [retired] = await transaction
    .select({ sessionId: flowWorkerRegistrationTombstones.sessionId })
    .from(flowWorkerRegistrationTombstones)
    .where(eq(flowWorkerRegistrationTombstones.sessionId, registration.sessionId))
    .limit(1);
  if (retired) throw new FlowWorkerReadinessLeaseLostError();

  const registrationDigest = createFlowWorkerRegistrationDigest(registration);
  const [inserted] = await transaction
    .insert(flowWorkerRegistrations)
    .values({
      sessionId: registration.sessionId,
      instanceId: registration.instanceId,
      roles: [...registration.roles],
      maxRuntimeMode: registration.maxRuntimeMode,
      maxCanaryOwnerSubjectIds: [...registration.maxCanaryOwnerSubjectIds],
      requirementKeys: [...registration.requirementKeys],
      deploymentId: registration.deploymentId,
      buildId: registration.buildId,
      protocolVersion: "flow-worker-runtime.v2",
      registrationDigest
    })
    .onConflictDoNothing({ target: flowWorkerRegistrations.sessionId })
    .returning({ sessionId: flowWorkerRegistrations.sessionId });

  if (!inserted) {
    const existing = await readRegistration(transaction, registration.sessionId);
    if (!existing || !sameRegistration(existing, registration)) {
      throw new FlowRuntimeControlIntegrityError();
    }
    const current = await readCurrentReadiness(transaction, registration.instanceId);
    if (!current || current.sessionId !== registration.sessionId) {
      throw new FlowWorkerReadinessLeaseLostError();
    }
    return current;
  }

  const previous = await readCurrentReadinessForUpdate(transaction, registration.instanceId);
  const [readiness] = await transaction
    .insert(flowWorkerReadinessLeases)
    .values({
      instanceId: registration.instanceId,
      sessionId: registration.sessionId,
      state: "ready",
      policyRevision: 1,
      heartbeatSequence: 1,
      heartbeatAt: sql`clock_timestamp()`,
      readyUntil: sql`clock_timestamp() + interval '5 seconds'`,
      drainingAt: null
    })
    .onConflictDoUpdate({
      target: flowWorkerReadinessLeases.instanceId,
      set: {
        sessionId: registration.sessionId,
        state: "ready",
        policyRevision: 1,
        heartbeatSequence: 1,
        heartbeatAt: sql`clock_timestamp()`,
        readyUntil: sql`clock_timestamp() + interval '5 seconds'`,
        drainingAt: null
      }
    })
    .returning();
  if (!readiness) throw new FlowRuntimeControlIntegrityError();
  if (previous && previous.sessionId !== registration.sessionId) {
    await retireRegistration(transaction, previous.sessionId, "replaced");
  }
  return mapReadiness(readiness);
}

async function readCurrentReadinessForUpdate(
  transaction: FlowTransaction,
  instanceId: string
) {
  const [row] = await transaction
    .select()
    .from(flowWorkerReadinessLeases)
    .where(eq(flowWorkerReadinessLeases.instanceId, instanceId))
    .limit(1)
    .for("update");
  return row;
}

async function retireRegistration(
  transaction: FlowTransaction,
  sessionId: string,
  retirementReason: "explicit_drain" | "replaced"
): Promise<void> {
  const registration = await readRegistration(transaction, sessionId);
  if (!registration) throw new FlowRuntimeControlIntegrityError();
  await transaction
    .insert(flowWorkerRegistrationTombstones)
    .values({
      sessionId,
      registrationDigest: registration.registrationDigest,
      retirementReason,
      retiredAt: sql`clock_timestamp()`,
      purgeAfter: sql`clock_timestamp() + interval '30 days'`
    })
    .onConflictDoNothing({ target: flowWorkerRegistrationTombstones.sessionId });
}

async function readRegistration(transaction: FlowTransaction, sessionId: string) {
  const [row] = await transaction
    .select()
    .from(flowWorkerRegistrations)
    .where(eq(flowWorkerRegistrations.sessionId, sessionId))
    .limit(1);
  return row;
}

async function readCurrentReadiness(
  executor: ReadinessExecutor,
  instanceId: string
): Promise<FlowWorkerReadinessAuthority | null> {
  const [row] = await executor
    .select()
    .from(flowWorkerReadinessLeases)
    .where(eq(flowWorkerReadinessLeases.instanceId, instanceId))
    .limit(1);
  return row ? mapReadiness(row) : null;
}

function sameRegistration(
  row: typeof flowWorkerRegistrations.$inferSelect,
  expected: FlowWorkerRegistration
): boolean {
  return isDeepStrictEqual(
    {
      sessionId: row.sessionId,
      instanceId: row.instanceId,
      roles: row.roles,
      maxRuntimeMode: row.maxRuntimeMode,
      maxCanaryOwnerSubjectIds: row.maxCanaryOwnerSubjectIds,
      requirementKeys: row.requirementKeys,
      deploymentId: row.deploymentId,
      buildId: row.buildId,
      protocolVersion: row.protocolVersion,
      registrationDigest: row.registrationDigest
    },
    {
      sessionId: expected.sessionId,
      instanceId: expected.instanceId,
      roles: expected.roles,
      maxRuntimeMode: expected.maxRuntimeMode,
      maxCanaryOwnerSubjectIds: expected.maxCanaryOwnerSubjectIds,
      requirementKeys: expected.requirementKeys,
      deploymentId: expected.deploymentId,
      buildId: expected.buildId,
      protocolVersion: "flow-worker-runtime.v2",
      registrationDigest: createFlowWorkerRegistrationDigest(expected)
    }
  );
}

function mapReadiness(
  row: typeof flowWorkerReadinessLeases.$inferSelect
): FlowWorkerReadinessAuthority {
  return parseFlowWorkerReadinessAuthority({
    schemaVersion: "flow-worker-readiness-authority.v1",
    instanceId: row.instanceId,
    sessionId: row.sessionId,
    state: row.state as FlowWorkerReadinessAuthority["state"],
    policyRevision: row.policyRevision,
    heartbeatSequence: row.heartbeatSequence,
    heartbeatAt: toIsoInstant(row.heartbeatAt),
    readyUntil: toIsoInstant(row.readyUntil),
    drainingAt: row.drainingAt ? toIsoInstant(row.drainingAt) : null
  });
}

function toIsoInstant(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new FlowRuntimeControlIntegrityError();
  }
  return value.toISOString();
}

function mapPersistenceError(error: unknown): Error {
  if (
    error instanceof Error &&
    (error instanceof FlowRuntimeControlIntegrityError ||
      error instanceof FlowWorkerReadinessLeaseLostError ||
      error instanceof FlowWorkerReadinessSessionBusyError ||
      error instanceof FlowWorkerRuntimeModeCeilingError)
  ) {
    return error;
  }
  const postgres = findPostgresError(error);
  if (postgres?.code === "55P03") return new FlowWorkerReadinessSessionBusyError();
  if (
    postgres?.code === "55000" &&
    postgres.message.includes("policy exceeds worker deployment ceiling")
  ) {
    return new FlowWorkerRuntimeModeCeilingError();
  }
  if (
    postgres?.code === "40001" &&
    (postgres.message.includes("drained flow worker session") ||
      postgres.message.includes("permanently retired"))
  ) {
    return new FlowWorkerReadinessLeaseLostError();
  }
  if (postgres && ["23503", "23505", "23514", "55000"].includes(postgres.code)) {
    return new FlowRuntimeControlIntegrityError();
  }
  return error instanceof Error ? error : new FlowRuntimeControlIntegrityError();
}

function findPostgresError(
  error: unknown
): { readonly code: string; readonly message: string } | null {
  let candidate: unknown = error;
  for (let depth = 0; depth < 4 && candidate && typeof candidate === "object"; depth += 1) {
    const record = candidate as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof record.code === "string" && typeof record.message === "string") {
      return { code: record.code, message: record.message };
    }
    candidate = record.cause;
  }
  return null;
}
