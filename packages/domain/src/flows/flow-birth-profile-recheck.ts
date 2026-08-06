import type { ClientBirthProfileUpdatedEvent } from "../clients";

export type FlowBirthProfileRecheckOutcome = "ready" | "not_ready" | "stale";

export type FlowBirthProfileRecheckResult = {
  readonly sourceOutboxEventId: string;
  readonly profileHistoryId: string;
  readonly outcome: FlowBirthProfileRecheckOutcome;
  readonly replayed: boolean;
  readonly affectedRunCount: number;
};

/**
 * Consumes one redacted profile revision and rechecks only Flow runs already
 * waiting for that client's birth-data collection work item.
 */
export type FlowBirthProfileRecheckStore = {
  readonly recheck: (input: {
    readonly sourceOutboxEventId: string;
    readonly event: ClientBirthProfileUpdatedEvent;
  }) => Promise<FlowBirthProfileRecheckResult>;
};
