import { and, eq, inArray, lte, or, sql } from "drizzle-orm";

import { FlowRuntimeControlIntegrityError } from "@elevenhouse/domain";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowWorkerReadinessLeases,
  flowWorkerRegistrations,
  flowWorkerRegistrationTombstones
} from "../../schema/flows";

type RetiredRow = { readonly sessionId: string };
type PurgeCandidateRow = { readonly sessionId: string };

export type FlowWorkerRegistrationRetentionResult = {
  readonly retired: number;
  readonly purged: number;
};

export async function runFlowWorkerRegistrationRetention(
  database: ElevenHouseDatabase,
  input: { readonly batchSize: number }
): Promise<FlowWorkerRegistrationRetentionResult> {
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 500) {
    throw new FlowRuntimeControlIntegrityError();
  }

  return database.transaction(async (transaction) => {
    const retiredResult = await transaction.execute(sql<RetiredRow>`
      with candidates as (
        select registration.session_id, registration.registration_digest
          from ${flowWorkerReadinessLeases} readiness
          join ${flowWorkerRegistrations} registration
            on registration.session_id = readiness.session_id
          left join ${flowWorkerRegistrationTombstones} tombstone
            on tombstone.session_id = readiness.session_id
         where tombstone.session_id is null
           and readiness.state = 'ready'
           and readiness.ready_until <= clock_timestamp() - interval '24 hours'
         order by readiness.ready_until, readiness.session_id
         limit ${input.batchSize}
         for update of readiness skip locked
      )
      insert into ${flowWorkerRegistrationTombstones} (
        session_id, schema_version, registration_digest, retirement_reason,
        retired_at, purge_after
      )
      select session_id, 'flow-worker-registration-tombstone.v1', registration_digest,
             'stale_expired', clock_timestamp(), clock_timestamp() + interval '30 days'
        from candidates
      on conflict (session_id) do nothing
      returning session_id as "sessionId"
    `);
    const retired = retiredResult.rows.length;
    const remaining = input.batchSize - retired;
    if (remaining === 0) return { retired, purged: 0 };

    const candidatesResult = await transaction.execute(sql<PurgeCandidateRow>`
      select registration.session_id as "sessionId"
        from ${flowWorkerRegistrations} registration
        join ${flowWorkerRegistrationTombstones} tombstone
          on tombstone.session_id = registration.session_id
        left join ${flowWorkerReadinessLeases} readiness
          on readiness.session_id = registration.session_id
       where tombstone.purge_after <= clock_timestamp()
         and (
           readiness.session_id is null
           or readiness.state = 'draining'
           or readiness.ready_until <= clock_timestamp()
         )
       order by tombstone.purge_after, registration.session_id
       limit ${remaining}
       for update of registration skip locked
    `);
    const sessionIds = (candidatesResult.rows as unknown as readonly PurgeCandidateRow[]).map(
      (row) => row.sessionId
    );
    if (sessionIds.length === 0) return { retired, purged: 0 };

    await transaction
      .delete(flowWorkerReadinessLeases)
      .where(
        and(
          inArray(flowWorkerReadinessLeases.sessionId, sessionIds),
          or(
            eq(flowWorkerReadinessLeases.state, "draining"),
            lte(flowWorkerReadinessLeases.readyUntil, sql`clock_timestamp()`)
          )
        )
      );
    const purgedRows = await transaction
      .delete(flowWorkerRegistrations)
      .where(inArray(flowWorkerRegistrations.sessionId, sessionIds))
      .returning({ sessionId: flowWorkerRegistrations.sessionId });
    if (purgedRows.length !== sessionIds.length) {
      throw new FlowRuntimeControlIntegrityError();
    }
    return { retired, purged: purgedRows.length };
  });
}
