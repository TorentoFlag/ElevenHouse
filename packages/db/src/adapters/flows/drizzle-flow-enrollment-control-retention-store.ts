import { FlowEnrollmentAuthorityIntegrityError } from "@elevenhouse/domain";
import { sql } from "drizzle-orm";

import type { ElevenHouseDatabase } from "../../runtime";
import {
  flowEnrollmentCommandOutcomes,
  flowEnrollmentCommands
} from "../../schema/flows";

type PurgedOutcomeRow = { readonly commandId: string };

export type FlowEnrollmentControlOutcomeRetentionResult = {
  readonly purged: number;
};

export async function runFlowEnrollmentControlOutcomeRetention(
  database: ElevenHouseDatabase,
  input: { readonly batchSize: number }
): Promise<FlowEnrollmentControlOutcomeRetentionResult> {
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 500) {
    throw new FlowEnrollmentAuthorityIntegrityError();
  }

  return database.transaction(async (transaction) => {
    const result = await transaction.execute(sql<PurgedOutcomeRow>`
      with candidates as (
        select outcome.command_id
          from ${flowEnrollmentCommandOutcomes} outcome
          join ${flowEnrollmentCommands} command on command.id = outcome.command_id
         where command.replay_until <= clock_timestamp()
         order by command.replay_until, outcome.command_id
         limit ${input.batchSize}
         for update of outcome skip locked
      )
      delete from ${flowEnrollmentCommandOutcomes} outcome
       using candidates
       where outcome.command_id = candidates.command_id
      returning outcome.command_id as "commandId"
    `);
    return { purged: result.rows.length };
  });
}
