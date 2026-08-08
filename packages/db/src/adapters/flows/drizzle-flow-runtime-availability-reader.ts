import {
  deriveFlowRuntimeAvailability,
  type FlowRuntimeAvailabilityReader,
  type FlowWorkerReadinessLease
} from "@elevenhouse/domain";
import { and, eq, sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowRuntimeOwnerSubjects,
  flowWorkerReadinessLeases,
  flowWorkerRegistrations
} from "../../schema/flows";
import { parseFlowDatabaseEpochMilliseconds } from "./flow-database-clock";
import { readCurrentFlowRuntimeControl } from "./drizzle-flow-runtime-control-reader";

export function createDrizzleFlowRuntimeAvailabilityReader(
  database: ElevenHouseDatabase
): FlowRuntimeAvailabilityReader {
  return Object.freeze({
    readForOwner: (input) =>
      database.transaction(
        async (transaction) => {
          // A Drizzle transaction owns one PostgreSQL client. Querying it in
          // parallel triggers pg's concurrent-client warning and will be an
          // error in pg@9, while sequential reads retain this transaction's
          // repeatable-read snapshot.
          const policy = await readCurrentFlowRuntimeControl(transaction, { lockRows: false });
          const ownerSubject = await transaction
            .select({ ownerSubjectId: flowRuntimeOwnerSubjects.ownerSubjectId })
            .from(flowRuntimeOwnerSubjects)
            .where(
              and(
                eq(flowRuntimeOwnerSubjects.ownerUserId, input.ownerUserId),
                eq(flowRuntimeOwnerSubjects.state, "active")
              )
            )
            .limit(2);
          const workerLeases = await readWorkerLeases(transaction);
          const checkedAt = await readDatabaseInstant(transaction);
          if (ownerSubject.length > 1) {
            throw new Error("FLOW_RUNTIME_OWNER_SUBJECT_INTEGRITY_ERROR");
          }
          return deriveFlowRuntimeAvailability({
            policy,
            ownerSubjectId: ownerSubject[0]?.ownerSubjectId ?? null,
            workerLeases,
            checkedAt
          });
        },
        { isolationLevel: "repeatable read", accessMode: "read only" }
      )
  });
}

async function readWorkerLeases(
  transaction: Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0]
): Promise<readonly FlowWorkerReadinessLease[]> {
  const rows = await transaction
    .select({
      instanceId: flowWorkerReadinessLeases.instanceId,
      state: flowWorkerReadinessLeases.state,
      policyRevision: flowWorkerReadinessLeases.policyRevision,
      readyUntil: flowWorkerReadinessLeases.readyUntil,
      roles: flowWorkerRegistrations.roles,
      maxRuntimeMode: flowWorkerRegistrations.maxRuntimeMode,
      maxCanaryOwnerSubjectIds: flowWorkerRegistrations.maxCanaryOwnerSubjectIds,
      requirementKeys: flowWorkerRegistrations.requirementKeys
    })
    .from(flowWorkerReadinessLeases)
    .innerJoin(
      flowWorkerRegistrations,
      eq(flowWorkerRegistrations.sessionId, flowWorkerReadinessLeases.sessionId)
    );
  return rows.map((row) => ({
    schemaVersion: "flow-worker-readiness-lease.v1",
    instanceId: row.instanceId,
    state: row.state as FlowWorkerReadinessLease["state"],
    policyRevision: row.policyRevision,
    roles: row.roles as FlowWorkerReadinessLease["roles"],
    maxRuntimeMode: row.maxRuntimeMode as FlowWorkerReadinessLease["maxRuntimeMode"],
    maxCanaryOwnerSubjectIds: row.maxCanaryOwnerSubjectIds,
    requirementKeys: row.requirementKeys,
    readyUntil: toIsoInstant(row.readyUntil)
  }));
}

async function readDatabaseInstant(
  transaction: Parameters<Parameters<ElevenHouseDatabase["transaction"]>[0]>[0]
): Promise<string> {
  const result = await transaction.execute(
    sql<{ value: string }>`select (extract(epoch from clock_timestamp()) * 1000)::text as value`
  );
  const instant = parseFlowDatabaseEpochMilliseconds(result.rows[0]?.value);
  if (!instant) throw new Error("FLOW_RUNTIME_DATABASE_CLOCK_UNAVAILABLE");
  return instant.toISOString();
}

function toIsoInstant(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("FLOW_RUNTIME_DATABASE_CLOCK_INVALID");
  }
  return value.toISOString();
}
